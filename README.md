# **Bitcoin Observable Wallet Proof of Concept**

This project is a **proof of concept (PoC)** implementation of a simple Bitcoin wallet, built using **TypeScript** and leveraging:
- **BitcoinJS** for address/key derivation and transaction building/signing.
- **Blockstream & Blockcypher API** to interact with the Bitcoin network (Testnet or Mainnet) for transaction history, UTXO retrieval, and broadcasting transactions.
- **RxJS** for reactive programming to observe wallet state, transaction history, and UTXO updates.

---

## **Features**

This PoC showcases the following core wallet functionalities:

1. **Address and Key Derivation**:
    - Supports **BIP32** and **Electrum-compatible** derivation paths.
    - Generates:
        - Legacy (P2PKH)
        - SegWit (P2SH-P2WPKH)
        - Native SegWit (P2WPKH)
        - Taproot (P2TR) addresses.

2. **Transaction History and UTXOs**:
    - Fetches transaction history for specified addresses.
    - Retrieves **UTXOs** (Unspent Transaction Outputs) for address spending.

3. **Balance Tracking**:
    - Continuously tracks and updates wallet balance based on UTXOs.

4. **Transaction Building and Signing**:
    - Constructs a raw transaction from available UTXOs.
    - Signs the transaction using the derived private key.
    - Submits the transaction to the Bitcoin network.

5. **Transaction Tracking**:
    - Tracks the status of a transaction (e.g., Pending, Confirmed, or Dropped) until it is included in a block.

---

## **Dependencies**

- **BitcoinJS**: Library for Bitcoin transaction building, key derivation, and signing.
- **Blockstream API**: Blockchain backend to fetch transaction data and submit transactions.
- **Blockcypher API**: Alternative blockchain backend for fetching transaction data and submitting transactions.
- **RxJS**: Reactive library for handling real-time updates (transaction history, balance, and UTXOs).

---

## **How It Works**

### **1. Derive Keys and Addresses**
The wallet generates Bitcoin addresses and keys for the following address types:
- Legacy
- SegWit
- Native SegWit
- Taproot
- Electrum Native SegWit

Example:
```typescript
const mnemonic = 'your 12-word mnemonic here';
const seed = bip39.mnemonicToSeedSync(mnemonic);
const publicKey = derivePublicKey(seed, AddressType.NativeSegWit, ChainType.External, 0);
const address = deriveAddressByType(publicKey, AddressType.NativeSegWit, bitcoin.networks.testnet);

console.log(`Generated Address: ${address}`);
```

### **2. Track Balance, Transactions, and UTXOs**

The wallet uses RxJS Observables to continuously fetch and track the following data:

- Transaction History
- UTXO Set
- Wallet Balance

```Typescript
wallet.transactionHistory$.subscribe((txHistory) => {
  console.log('Transaction History:', txHistory);
});

wallet.utxos$.subscribe((utxos) => {
  console.log('UTXOs:', utxos);
});

wallet.balance$.subscribe((balance) => {
  console.log(`Balance: ${balance} satoshis`);
});
```

### **3. Build, Sign and Submit Transactions**

The wallet constructs a raw transaction, signs it, and submits it to the Bitcoin network.

```typescript
wallet
  .send(recipientAddress, amountToSend)
  .then((hash) => {
     console.log(`Transaction successfully sent! Sent ${amountToSend} satoshis to ${recipientAddress}, Tx Hash: ${hash}`);
  })
  .catch((err) => {
     console.error('Failed to send transaction:', err.message);
  });
```

### **4. Track Transaction Status**

The wallet tracks the status of a transaction until it is included in a block.

```typescript
provider.getTransactionStatus('your-tx-hash').subscribe((status) => {
  console.log(`Transaction Status: ${status}`);
});
```

---

## **Getting Started**

1. **Clone the Repository**:
```bash
git clone https://github.com/Biglup/bitcoin-observable-wallet.git
cd bitcoin-observable-wallet
```

2. **Install Dependencies**:
```bash
yarn install
```

## **Demo**

The PoC includes a simple demo that showcases the wallet functionalities. You can run the demo by executing the following command:

```bash
ts-node ./src/index.ts

Starting to track wallet...

Transaction History Updated:
Tx 1: Hash: b0b4db..., Confirmations: 0, Status: Pending, Delta: +10000
Tx 2: Hash: f0c4ab..., Confirmations: 2, Status: Confirmed, Delta: -500

UTxOs Updated:
UTxO 1: TxId: b0b4db..., Index: 0, Amount: 10000, Address: tb1...

Wallet Balance Updated: 9500 satoshis

Transaction submitted! Hash: c5f8e4...
```

## **Conclusion**

This PoC demonstrates a fully functional Bitcoin wallet capable of:

- Deriving addresses and keys.
- Fetching transaction history and UTXOs.
- Tracking balances in real-time.
- Building, signing, and submitting transactions.
- Polling transaction status for confirmations.

You can extend this PoC further to include more advanced features, such as:

- Multi-address discovery
- Fee estimation
- Improved UTXO selection strategies to avoid dust outputs
