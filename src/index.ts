import { BlockstreamBitcoinDataProvider, TransactionStatus } from './providers';
import { ObservableBitcoinWallet } from './wallet';
import * as bitcoin from 'bitcoinjs-lib';

// Initialize provider and wallet
const provider = new BlockstreamBitcoinDataProvider('testnet');
const mnemonic = '...'; // Insert your mnemonic here
const wallet = new ObservableBitcoinWallet(provider, 30000, 20, mnemonic, bitcoin.networks.testnet);

// Target transaction parameters
const recipientAddress = 'tb1q63535rhljvyzrjc0qefvr9m757545fma4agg0j';
const amountToSend = 500n; // satoshis

console.log('Wallet is starting to listen...');

let hasSentTransaction = false;

wallet.balance$.subscribe((balance) => {
  console.log(`\nWallet Balance Updated: ${balance} satoshis`);

  // Check balance and ensure we only send once
  if (balance > 0n && !hasSentTransaction) {
    console.log('\nBalance is sufficient. Preparing to send transaction...');
    hasSentTransaction = true;

    wallet
      .send(recipientAddress, amountToSend)
      .then((hash) => {
        console.log(`Transaction successfully sent! Sent ${amountToSend} satoshis to ${recipientAddress}, Tx Hash: ${hash}`);
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
      `Tx ${index + 1}: Hash: ${tx.transactionHash}, Confirmations: ${tx.confirmations}, Status: ${tx.status}, Delta: ${tx.delta}`
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

wallet.syncProgress$.subscribe((progress) => {
  console.log(`\nSync Progress: ${progress}%`);
});

process.stdin.resume();
