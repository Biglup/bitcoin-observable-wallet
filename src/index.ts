import { MaestroBitcoinDataProvider } from './providers';
import { BitcoinWallet } from './wallet';
import { AddressType, BitcoinWalletInfo, ChainType, deriveKeyPair, Network, toUint8Array } from './common';
import { emip3encrypt } from './crypto';
import * as bip39 from 'bip39';

// Convert the password to Uint8Array
const walletInfo: BitcoinWalletInfo = {
  walletName: 'Bitcoin Wallet 1',
  publicKeyHex: '',
  encryptedPrivateKeyHex: '',
  encryptedMnemonicsHex: '',
  derivationPath: ''
};

(async () => {
// Initialize provider and wallet
  const provider = new MaestroBitcoinDataProvider('x', Network.Testnet);
  const mnemonic = 'x'; // Insert your mnemonic here

// Create Wallet
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const keyPair = deriveKeyPair(seed, AddressType.NativeSegWit, ChainType.External, 0);

  walletInfo.walletName = 'Bitcoin Wallet 1';
  walletInfo.publicKeyHex = keyPair.pair.publicKey.toString('hex');
  walletInfo.encryptedPrivateKeyHex = Buffer.from(await emip3encrypt(new Uint8Array(keyPair.pair.privateKey), toUint8Array('password'))).toString('hex');
  walletInfo.encryptedMnemonicsHex = Buffer.from(await emip3encrypt(new Uint8Array(Buffer.from(mnemonic, 'utf-8')), toUint8Array('password'))).toString('hex');
  walletInfo.derivationPath = keyPair.path;

// Clear secrets from memory
  keyPair.pair.privateKey.fill(0);
  keyPair.pair.publicKey.fill(0);

  const wallet = new BitcoinWallet(provider, 30000, 20, walletInfo, Network.Testnet);

// Target transaction parameters
  const recipientAddress = 'tb1qwj666s6uktl2q5am0uej008usfsg93fgrwjuuf';
  const amountToSend = 1700n; // satoshis

  console.log('Wallet is starting to listen...');

  let hasSentTransaction = false;

// tb1qwj666s6uktl2q5am0uej008usfsg93fgrwjuuf

  console.log(`Address ${wallet.address.address}:, Type: ${wallet.address.addressType}, Path: ${wallet.address.derivationPath}`);

  wallet.balance$.subscribe((balance) => {
    console.log(`\nWallet Balance Updated: ${balance} satoshis`);

    // Check balance and ensure we only send once
    if (balance > 0n && !hasSentTransaction) {
      console.log('\nBalance is sufficient. Preparing to send transaction...');
      hasSentTransaction = true;

      wallet
        .send(recipientAddress, amountToSend)
        .then((tx) => {
          console.log(`submit tx:\n ${tx}`);
        })
        .catch((err) => {
          console.error('Failed to send transaction:', err.message);
        });
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
        `UTxO ${index + 1}: TxId: ${utxo.txId}, Index: ${utxo.index}, Amount: ${utxo.amount}, Address: ${utxo.address}`
      );
    });
  });
})();

process.stdin.resume();
