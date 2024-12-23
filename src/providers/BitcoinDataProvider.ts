import { Observable } from 'rxjs';

/**
 * Represents basic information about a blockchain block.
 *
 * @property {number} height - The block's position in the blockchain.
 * @property {string} hash - The hash of the block.
 */
export type BlockInfo = {
  readonly height: number;
  readonly hash: string;
};

/**
 * Represents the status of a Bitcoin transaction.
 */
export enum TransactionStatus {
  /**
   * The transaction is in the mempool, waiting to be included in a block.
   */
  Pending = 'Pending',

  /**
   * The transaction is included in a block.
   */
  Confirmed = 'Confirmed',

  /**
   * The transaction is no longer in the mempool and is considered invalid or replaced.
   */
  Dropped = 'Dropped',
}

/**
 * Represents a single entry in the transaction history of an common.
 *
 * @property {bigint} delta - The net change in balance for the common caused by this transaction.
 *                            A positive value indicates funds were received, while a negative value indicates funds were sent.
 * @property {string} transactionHash - The unique identifier (hash) of the transaction.
 * @property {number} confirmations - The number of confirmations for the transaction.
 *                                    More confirmations indicate higher confidence that the transaction is finalized.
 * @property {'Pending' | 'Confirmed'} status - The current status of the transaction.
 *                                              'Pending' indicates the transaction is not yet confirmed,
 *                                              while 'Confirmed' indicates it has been included in a block.
 * @property {number} blockHeight - The height of the block containing this transaction.
 */
export type TransactionHistoryEntry = {
  readonly delta: bigint;
  readonly transactionHash: string;
  readonly confirmations: number;
  readonly status: TransactionStatus;
  readonly blockHeight: number;
};

/**
 * Represents an unspent transaction output (UTxO) in the Bitcoin blockchain.
 *
 * @property {string} txId - The unique identifier (transaction hash) of the transaction that created this output.
 * @property {number} index - The output index within the transaction.
 * @property {bigint} amount - The value of this output in satoshis.
 * @property {string} address - The common associated with this UTxO. This is the recipient of the funds in this output.
 */
export type UTxO = {
  readonly txId: string;
  readonly index: number;
  readonly amount: bigint;
  readonly address: string;
};

/**
 * Defines the interface for interacting with the Bitcoin blockchain to fetch data and perform transactions.
 */
export interface BlockchainDataProvider {
  /**
   * Fetches basic information about the last known block height and hash.
   *
   * @returns {Observable<BlockInfo>} An observable that emits the current blockchain information.
   */
  getLastKnownBlock(): Observable<BlockInfo>;

  /**
   * Fetches the balance of a specified common.
   *
   * @param {string} address - The blockchain common whose balance is to be retrieved.
   * @returns {Observable<bigint>} An observable that emits the balance of the common in satoshis.
   */
  getAddressBalance(address: string): Observable<bigint>;

  /**
   * Fetches the transactions of a specified common.
   *
   * @param {string} address - The blockchain common whose transactions are to be retrieved.
   * @param {number} [afterBlockHeight] - Fetch transactions that occurred after this block height (optional).
   * @param {number} [limit=50] - The maximum number of transactions to fetch (optional, default is 50).
   * @param {number} [offset=0] - The starting index for transactions (optional, default is 0).
   * @returns {Observable<TransactionHistoryEntry[]>} An observable that emits a list of transactions
   *                                                  associated with the common.
   */
  getTransactions(
    address: string,
    afterBlockHeight?: number,
    limit?: number,
    offset?: number
  ): Observable<TransactionHistoryEntry[]>;

  /**
   * Fetches the unspent transaction outputs (UTxOs) associated with a specified common.
   *
   * @param {string} address - The blockchain common whose UTxOs are to be retrieved.
   * @returns {Observable<UTxO[]>} An observable that emits a list of UTxOs for the common.
   */
  getUTxOs(address: string): Observable<UTxO[]>;

  /**
   * Submits a raw transaction to the blockchain for inclusion in a block.
   *
   * @param {string} rawTransaction - The raw transaction data to be broadcast to the network.
   * @returns {Observable<string>} An observable that emits the transaction ID (hash) of the submitted transaction.
   */
  submitTransaction(rawTransaction: string): Observable<string>;

  /**
   * Fetches the status of a specified transaction by its hash.
   *
   * This function checks the current status of a transaction in the blockchain or mempool.
   * The status can indicate if the transaction is pending, confirmed, or dropped.
   *
   * @param {string} txHash - The hash of the transaction to query.
   * @returns {Observable<TransactionStatus>} An observable that emits the current status of the transaction.
   */
  getTransactionStatus(txHash: string): Observable<TransactionStatus>;
}
