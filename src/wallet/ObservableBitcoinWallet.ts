import { BlockchainDataProvider, BlockInfo, TransactionHistoryEntry, UTxO } from './../providers';
import { BehaviorSubject, interval, lastValueFrom, of, startWith } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import {
  AddressType,
  ChainType,
  deriveAddressByType,
  DerivedAddress,
  deriveElectrumSeed,
  deriveKeyPair,
  derivePublicKey,
  KeyPair
} from '../common';
import * as bitcoin from 'bitcoinjs-lib';
import { payments, Psbt, Signer } from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

bitcoin.initEccLib(ecc);

export class CustomSigner implements Signer {
  publicKey: Buffer;

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
}

export class ObservableBitcoinWallet {
  private lastKnownBlock: BlockInfo | null = null;
  private transactionHistory: TransactionHistoryEntry[] = [];
  private readonly pollInterval: number;
  private readonly reorgSafeDepth: number;
  private provider: BlockchainDataProvider;
  private mnemonics: string;
  private network: bitcoin.networks.Network;

  public transactionHistory$: BehaviorSubject<TransactionHistoryEntry[]> = new BehaviorSubject(new Array<TransactionHistoryEntry>());
  public addresses$: BehaviorSubject<DerivedAddress[]> = new BehaviorSubject(new Array<DerivedAddress>());
  public utxos$: BehaviorSubject<UTxO[]> = new BehaviorSubject(new Array<UTxO>());
  public balance$: BehaviorSubject<bigint> = new BehaviorSubject(0n);
  public syncProgress$: BehaviorSubject<number> = new BehaviorSubject(0);

  constructor(
    provider: BlockchainDataProvider,
    pollInterval: number = 300000,
    reorgSafeDepth: number = 20,
    mnemonics: string,
    network: bitcoin.networks.Network = bitcoin.networks.testnet
  ) {
    this.network = network;

    this.pollInterval = pollInterval;
    this.reorgSafeDepth = reorgSafeDepth;
    this.provider = provider;
    this.mnemonics = mnemonics;

    const seed = deriveElectrumSeed(mnemonics);
    const publicKey = derivePublicKey(seed, AddressType.ElectrumNativeSegWit, ChainType.External, 0);
    const address = deriveAddressByType(publicKey, AddressType.ElectrumNativeSegWit, network);

    this.addresses$.next([
      {
        address,
        addressType: AddressType.ElectrumNativeSegWit,
        derivationPath: 'm/0\'/0/0'
      }
    ]);

    this.startPolling([address]);

    this.utxos$
      .pipe(
        map((utxos) => utxos.reduce((total, utxo) => total + utxo.amount, 0n))
      )
      .subscribe((balance) => {
        this.balance$.next(balance);
      });
  }

  async send(toAddress: string, amount: bigint): Promise<string> {
    const fixedFee = 500n; // Fixed fee in satoshis. Replace with actual fee estimation logic.

    try {
      // Fetch available UTXOs
      const utxos = await this.utxos$.value;

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

      const seed = deriveElectrumSeed(this.mnemonics);
      const keyPair = deriveKeyPair(seed, AddressType.ElectrumNativeSegWit, ChainType.External, 0);

      const psbt = new Psbt({ network: this.network });

      selectedUTxOs.forEach((utxo) => {
        psbt.addInput({
          hash: utxo.txId,
          index: utxo.index,
          witnessUtxo: {
            script: payments.p2wpkh({ pubkey: keyPair.publicKey, network: this.network }).output!,
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
          address: payments.p2wpkh({ pubkey: keyPair.publicKey, network: this.network }).address!,
          value: Number(change)
        });
      }

      psbt.signAllInputs(new CustomSigner(keyPair));
      psbt.finalizeAllInputs();

      const rawTransaction = psbt.extractTransaction().toHex();

      return await lastValueFrom(this.provider.submitTransaction(rawTransaction));
    } catch (error) {
      console.error('Failed to send transaction:', error.message);
      throw error; // Rethrow to propagate the error to the caller
    }
  }

  /**
   * Starts polling for new blocks and updating wallet state.
   */
  private startPolling(addresses: string[]) {
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
          await this.updateState(addresses, latestBlockInfo);
        }
      });
  }

  /**
   * Updates the wallet state by fetching new transactions and UTxOs.
   */
  private async updateState(addresses: string[], latestBlockInfo: BlockInfo): Promise<void> {
    this.lastKnownBlock = latestBlockInfo;

    const startHeight = Math.max(
      0,
      this.lastKnownBlock.height - this.reorgSafeDepth
    );

    for (const address of addresses) {
      /*
      Blockstream provider does not support fetching transactions by block height.
      this.transactionHistory = this.transactionHistory.filter(
        (tx) => tx.blockHeight <= startHeight
      );
      this.transactionHistory.push(...newTransactions);
      */

      this.transactionHistory = await this.fetchRecentTransactions(address, startHeight, latestBlockInfo.height);
      this.transactionHistory$.next(this.transactionHistory);

      this.provider.getUTxOs(address).subscribe({
        next: (utxos) => {
          this.utxos$.next(utxos);
        },
        error: (err) => {
          console.error(`Error fetching UTxOs for address ${address}:`, err);
          this.utxos$.next([]);
        }
      });
    }

    this.lastKnownBlock = latestBlockInfo;
    this.syncProgress$.next(100); // Dummy sync progress. Replace with actual progress tracking.
  }

  /**
   * Fetches recent transactions for an address.
   */
  private async fetchRecentTransactions(
    address: string,
    startHeight: number,
    endHeight: number
  ): Promise<TransactionHistoryEntry[]> {
    const limit = 50;
    let offset = 0;
    const transactions: TransactionHistoryEntry[] = [];

    while (true) {
      const page = await this.provider
        .getTransactions(address, startHeight, limit, offset)
        .toPromise();

      const safePage = page ?? [];

      transactions.push(...safePage);

      if (safePage.length < limit) {
        break;
      }

      offset += limit;
    }

    console.log(endHeight);
    return transactions;
  }
}
