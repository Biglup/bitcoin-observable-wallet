import { MaestroBitcoinDataProvider } from './providers';
import { BitcoinSigner, BitcoinWallet, buildTx, signTx } from './wallet';
import {
  AddressType,
  BitcoinWalletInfo,
  deriveAccountRootKeyPair, deriveChildKeyPair, getExtendedPubKeys,
  Network,
  toUint8Array, tweakTaprootPrivateKey
} from './common';
import { emip3decrypt, emip3encrypt } from './crypto';
import * as bip39 from 'bip39';

// Convert the password to Uint8Array
const walletInfo: BitcoinWalletInfo = {
  walletName: 'Bitcoin Wallet 1',
  accountIndex: 0,
  encryptedSecrets: {
    mnemonics: '',
    seed: ''
  },
  extendedAccountPublicKeys: {
    mainnet: {
      legacy: '',
      segWit: '',
      nativeSegWit: '',
      taproot: '',
      electrumNativeSegWit: '',
    },
    testnet: {
      legacy: '',
      segWit: '',
      nativeSegWit: '',
      taproot: '',
      electrumNativeSegWit: ''
    }
  }
};

(async () => {
  // Initialize provider and wallet
  const provider = new MaestroBitcoinDataProvider('', Network.Testnet);
  const mnemonic = ''; // Insert your mnemonic here

  // Create Wallet
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const extendedAccountPublicKeys = getExtendedPubKeys(seed, 0);

  walletInfo.walletName = 'Bitcoin Wallet 1';
  walletInfo.accountIndex = 0;
  walletInfo.encryptedSecrets = {
    mnemonics: Buffer.from(await emip3encrypt(new Uint8Array(Buffer.from(mnemonic, 'utf-8')), toUint8Array('password'))).toString('hex'),
    seed: Buffer.from(await emip3encrypt(new Uint8Array(seed), toUint8Array('password'))).toString('hex')
  };
  walletInfo.extendedAccountPublicKeys = extendedAccountPublicKeys;

  console.log(JSON.stringify(walletInfo, null, 2));
  const wallet = new BitcoinWallet(provider, 30000, 20, walletInfo, Network.Testnet);

  // Target transaction parameters
  const recipientAddress = 'tb1qwj666s6uktl2q5am0uej008usfsg93fgrwjuuf';
  const amountToSend = 1700n; // satoshis

  console.log('Wallet is starting to listen...');

  let hasSentTransaction = false;

// tb1qwj666s6uktl2q5am0uej008usfsg93fgrwjuuf

  console.log(`Address ${wallet.address.address}:, Type: ${wallet.address.addressType}, Index: ${wallet.address.index}`);

  wallet.balance$.subscribe(async (balance) => {
    console.log(`\nWallet Balance Updated: ${balance} satoshis`);

    // Check balance and ensure we only send once
    if (balance > 0n && !hasSentTransaction) {
      console.log('\nBalance is sufficient. Preparing to send transaction...');
      hasSentTransaction = true;

      const feeMarket = await wallet.getCurrentFeeMarket();
      const tx = buildTx(recipientAddress, recipientAddress, amountToSend, feeMarket.slow.feeRate, wallet.utxos$.value, Network.Testnet, [wallet.address]);

      const encryptedPrivateKey = Buffer.from(wallet.info.encryptedSecrets.seed, 'hex');
      const rootPrivateKey = Buffer.from(await emip3decrypt(new Uint8Array(encryptedPrivateKey), toUint8Array('password')));

      const signingKeys = tx.signers;
      const signers = [];

      for (const signingKey of signingKeys) {
        const rootKeyPair = deriveAccountRootKeyPair(
          rootPrivateKey,
          signingKey.addressType,
          signingKey.network,
          signingKey.account
        );

        const keyPair = deriveChildKeyPair(
          rootKeyPair.pair.privateKey,
          signingKey.chain,
          signingKey.index
        );

        let finalKeyPair = keyPair.pair;

        if (signingKey.addressType === AddressType.Taproot) {
          // Extract the internal x‑only public key (remove first byte of compressed pubkey)
          const internalXOnlyPubKey = keyPair.pair.publicKey.slice(1);
          const tweakedPrivateKey = tweakTaprootPrivateKey(keyPair.pair.privateKey, internalXOnlyPubKey);

          finalKeyPair = {
            publicKey: keyPair.pair.publicKey,
            privateKey: Buffer.from(tweakedPrivateKey)
          };
        }

        const signer = new BitcoinSigner(finalKeyPair);
        signers.push(signer);
      }

      const signedTx = signTx(tx, signers);

      for (const signer of signers) {
        signer.clearSecrets();
      }
      rootPrivateKey.fill(0);

      console.log(`submit tx:\n ${signedTx.hex}`);

      //const id = await wallet.submitTransaction(signedTx.hex);
      //console.log(`Transaction submitted. TxId: ${id}`);
    }
  });

  // Listen for updates
  wallet.transactionHistory$.subscribe((txHistory) => {
    console.log('\nTransaction History Updated:');
    txHistory.forEach((tx, index) => {
      console.log(
        `Tx ${index + 1}: Hash: ${tx.transactionHash}, Confirmations: ${tx.confirmations}, Status: ${tx.status}, Inputs: ${tx.inputs}, Outputs: ${tx.outputs}`
      );
    });
  });

  wallet.utxos$.subscribe((utxos) => {
    console.log('\nUTxOs Updated:');
    utxos.forEach((utxo, index) => {
      console.log(
        `UTxO ${index + 1}: TxId: ${utxo.txId}, Index: ${utxo.index}, Amount: ${utxo.satoshis}, Address: ${utxo.address}`
      );
    });
  });
})();

process.stdin.resume();
