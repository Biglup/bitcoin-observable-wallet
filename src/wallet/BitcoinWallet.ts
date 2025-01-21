import { BlockchainDataProvider, BlockInfo, TransactionHistoryEntry, UTxO } from './../providers';
import { BehaviorSubject, interval, of, startWith } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import {
  AddressType, BitcoinWalletInfo,
  deriveAddressByType,
  DerivedAddress,
  KeyPair, Network, toUint8Array
} from '../common';
import * as bitcoin from 'bitcoinjs-lib';
import { payments, Psbt, Signer } from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { emip3decrypt } from '../crypto';

bitcoin.initEccLib(ecc);

export class CustomSigner implements Signer {
  publicKey: Buffer;

  /**
   * Creates a new CustomSigner instance.
   * @param keyPair - The key pair to use for signing.
   */
  constructor(private keyPair: KeyPair) {
    if (!keyPair.privateKey) {
      throw new Error('Private key is required to sign transactions.');
    }
    this.publicKey = keyPair.publicKey;
  }

  /**
   * Signs a hash using tiny-secp256k1's sign function.
   * @param {Buffer} hash - The hash to sign (must be 32 bytes).
   * @param {boolean} _lowR - Optional flag for lowR signatures (ignored here).
   * @returns {Buffer} The signature as a buffer.
   */
  sign(hash: Buffer, _lowR: boolean = false): Buffer {
    if (hash.length !== 32) {
      throw new Error('Hash must be 32 bytes.');
    }

    const signature = ecc.sign(new Uint8Array(hash), new Uint8Array(this.keyPair.privateKey));
    return Buffer.from(signature);
  }

  /**
   * Returns the public key.
   * @returns {Buffer} The public key as a buffer.
   */
  getPublicKey(): Buffer {
    return this.publicKey;
  }

  /**
   * Clears the private key from memory.
   *
   * This is a security measure to prevent the private key from being exposed in memory.
   */
  clearSecrets() {
    this.keyPair.privateKey.fill(0);
  }
}

export class BitcoinWallet {
  private lastKnownBlock: BlockInfo | null = null;
  private transactionHistory: TransactionHistoryEntry[] = [];
  private readonly pollInterval: number;
  private readonly historyDepth: number;
  private provider: BlockchainDataProvider;
  private info: BitcoinWalletInfo;
  private network: bitcoin.networks.Network;

  public transactionHistory$: BehaviorSubject<TransactionHistoryEntry[]> = new BehaviorSubject(new Array<TransactionHistoryEntry>());
  public address: DerivedAddress;
  public utxos$: BehaviorSubject<UTxO[]> = new BehaviorSubject(new Array<UTxO>());
  public balance$: BehaviorSubject<bigint> = new BehaviorSubject(0n);

  constructor(
    provider: BlockchainDataProvider,
    pollInterval: number = 300000,
    historyDepth: number = 20,
    info: BitcoinWalletInfo,
    network: Network = Network.Testnet
  ) {
    this.network = network === Network.Mainnet ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;

    this.pollInterval = pollInterval;
    this.historyDepth = historyDepth;
    this.provider = provider;
    this.info = info;

    const pubKey = Buffer.from(info.publicKeyHex, 'hex');
    const address = deriveAddressByType(pubKey, AddressType.NativeSegWit, this.network);

    this.address =
      {
        address,
        addressType: AddressType.NativeSegWit,
        derivationPath: info.derivationPath
      };

    this.startPolling();

    this.utxos$
      .pipe(
        map((utxos) => utxos.reduce((total, utxo) => total + utxo.amount, 0n))
      )
      .subscribe((balance) => {
        this.balance$.next(balance);
      });
  }

  /**
   * Sends a transaction to the specified address.
   *
   * @param toAddress The recipient's address.
   * @param amount The amount to send in satoshis.
   */
  async send(toAddress: string, amount: bigint): Promise<string> {
    const fixedFee = 500n;

    try {
      const utxos = this.utxos$.value;

      if (!utxos || utxos.length === 0) {
        throw new Error('No UTXOs available to fund the transaction.');
      }

      let inputSum = BigInt(0);
      const selectedUTxOs: UTxO[] = [];

      for (const utxo of utxos) {
        selectedUTxOs.push(utxo);
        inputSum += utxo.amount;
        if (inputSum >= amount + fixedFee) break;
      }

      if (inputSum < amount + fixedFee) {
        throw new Error('Insufficient funds to cover the transaction and fees.');
      }

      const publicKey = Buffer.from(this.info.publicKeyHex, 'hex');
      const encryptedPrivateKey = Buffer.from(this.info.encryptedPrivateKeyHex, 'hex');
      const privateKey = Buffer.from(await emip3decrypt(new Uint8Array(encryptedPrivateKey), toUint8Array('password')));

      const keyPair = { publicKey, privateKey };

      const psbt = new Psbt({ network: this.network });

      selectedUTxOs.forEach((utxo) => {
        psbt.addInput({
          hash: utxo.txId,
          index: utxo.index,
          witnessUtxo: {
            script: payments.p2wpkh({ pubkey: publicKey, network: this.network }).output!,
            value: Number(utxo.amount)
          }
        });
      });

      psbt.addOutput({
        address: toAddress,
        value: Number(amount)
      });

      const change = inputSum - amount - fixedFee;

      if (change > 0n) {
        psbt.addOutput({
          address: this.address.address,
          value: Number(change)
        });
      }

      psbt.signAllInputs(new CustomSigner(keyPair));

      psbt.finalizeAllInputs();

      // clear secrets from memory
      keyPair.privateKey.fill(0);

      return psbt.extractTransaction().toHex();
    } catch (error) {
      console.error('Failed to send transaction:', error);
      throw error;
    }
  }

  /**
   * Submits a raw transaction to the blockchain for inclusion in a block.
   *
   * @param rawTransaction - The raw transaction data to be broadcast to the network.
   */
  public async submitTransaction(rawTransaction: string): Promise<string> {
    try {
      return await this.provider.submitTransaction(rawTransaction);
    } catch (error) {
      console.error('Failed to submit transaction:', error);
      throw error;
    }
  }

  /**
   * Starts polling for new blocks and updating wallet state.
   */
  private startPolling() {
    interval(this.pollInterval)
      .pipe(
        startWith(0),
        switchMap(() => this.provider.getLastKnownBlock()),
        catchError((error) => {
          console.error('Failed to fetch blockchain info during polling:', error);
          return of(null);
        })
      )
      .subscribe(async (latestBlockInfo: BlockInfo | null) => {
        if (!latestBlockInfo) return;

        if (!this.lastKnownBlock || this.lastKnownBlock.hash !== latestBlockInfo.hash) {
          await this.updateState(latestBlockInfo);
        }
      });
  }

  /**
   * Updates the wallet state by fetching new transactions and UTxOs.
   */
  private async updateState(latestBlockInfo: BlockInfo): Promise<void> {
    this.lastKnownBlock = latestBlockInfo;

    this.transactionHistory = await this.provider.getTransactions(this.address.address, 0, this.historyDepth, 0);
    this.transactionHistory$.next(this.transactionHistory);

    const utxos = await this.provider.getUTxOs(this.address.address);
    this.utxos$.next(utxos);
    this.lastKnownBlock = latestBlockInfo;
  }
}
