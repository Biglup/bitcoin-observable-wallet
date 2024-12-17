import axios, { AxiosInstance } from 'axios';
import {
  BlockchainDataProvider,
  BlockInfo,
  TransactionHistoryEntry,
  TransactionStatus,
  UTxO
} from './BitcoinDataProvider';
import { Observable, from, catchError, of, throwError, tap } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Implementation of the BlockchainDataProvider interface using BlockCypher's Bitcoin API.
 */
export class BlockCypherBitcoinDataProvider implements BlockchainDataProvider {
  private api: AxiosInstance;

  constructor(private token: string, network: string = 'main') {
    this.api = axios.create({
      baseURL: `https://api.blockcypher.com/v1/btc/${network}`
    });
  }

  /**
   * Fetches basic information about the blockchain, including the current block height and hash.
   *
   * @returns {Observable<BlockInfo>} An observable that emits the current blockchain information.
   */
  getLastKnownBlock(): Observable<BlockInfo> {
    return from(this.api.get('/')).pipe(
      map((response) => ({
        height: response.data.height,
        hash: response.data.hash
      }))
    );
  }

  /**
   * Fetches the balance of a specified common.
   *
   * @param {string} address - The blockchain common whose balance is to be retrieved.
   * @returns {Observable<bigint>} An observable that emits the balance of the common in satoshis.
   */
  getAddressBalance(address: string): Observable<bigint> {
    return from(
      this.api.get(`/addrs/${address}`, {
        params: { token: this.token }
      })
    ).pipe(map((response) => BigInt(response.data.balance)));
  }

  /**
   * Fetches the transaction history of a specified common.
   *
   * @param {string} address - The blockchain common whose transaction history is to be retrieved.
   * @param {number} [afterBlockHeight] - Fetch transactions that occurred after this block height (optional).
   * @param {number} [limit=50] - The maximum number of transactions to fetch (optional, default is 50).
   * @param {number} [offset=0] - The starting index for transactions (optional, default is 0).
   * @returns {Observable<TransactionHistoryEntry[]>} An observable that emits a list of transactions associated with the common.
   */
  getTransactions(
    address: string,
    afterBlockHeight?: number,
    limit: number = 50,
    offset: number = 0
  ): Observable<TransactionHistoryEntry[]> {
    const params: Record<string, any> = {
      limit,
      offset,
      token: this.token
    };

    if (afterBlockHeight !== undefined) {
      params.after = afterBlockHeight;
    }

    return from(this.api.get(`/addrs/${address}`, { params })).pipe(
      tap((response) => console.log(response)),
      map((response) => {
        const transactions = response.data.txrefs || [];
        return transactions.map((tx: any) => ({
          delta: BigInt(tx.value),
          transactionHash: tx.tx_hash,
          confirmations: tx.confirmations,
          status: tx.confirmations > 0 ? TransactionStatus.Confirmed : TransactionStatus.Pending,
          blockHeight: tx.block_height
        }));
      })
    );
  }

  /**
   * Fetches the unspent transaction outputs (UTxOs) associated with a specified common.
   *
   * @param {string} address - The blockchain common whose UTxOs are to be retrieved.
   * @returns {Observable<UTxO[]>} An observable that emits a list of UTxOs for the common.
   */
  getUTxOs(address: string): Observable<UTxO[]> {
    return from(
      this.api.get(`/addrs/${address}`, {
        params: { unspentOnly: true, token: this.token }
      })
    ).pipe(
      map((response) => {
        const utxos = response.data.txrefs || [];
        return utxos.map((utxo: any) => ({
          txId: utxo.tx_hash,
          index: utxo.tx_output_n,
          amount: BigInt(utxo.value),
          address: response.data.address
        }));
      })
    );
  }

  /**
   * Submits a raw transaction to the blockchain for inclusion in a block.
   *
   * @param {string} rawTransaction - The raw transaction data to be broadcast to the network.
   * @returns {Observable<string>} An observable that emits the transaction ID (hash) of the submitted transaction.
   */
  submitTransaction(rawTransaction: string): Observable<string> {
    return from(
      this.api.post(`/txs/push`, { tx: rawTransaction }, { params: { token: this.token } })
    ).pipe(
      map((response) => response.data.tx.hash)
    );
  }

  /**
   * Fetches the status of a specified transaction by its hash.
   *
   * This function checks the current status of a transaction in the blockchain or mempool.
   * The status can indicate if the transaction is pending, confirmed, or dropped.
   *
   * @param {string} txHash - The hash of the transaction to query.
   * @returns {Observable<TransactionStatus>} An observable that emits the current status of the transaction.
   */
  getTransactionStatus(txHash: string): Observable<TransactionStatus> {
    return from(
      this.api.get(`/txs/${txHash}`, {
        params: { token: this.token }
      })
    ).pipe(
      map((response) => {
        const data = response.data;

        if (data.confirmations > 0) {
          return TransactionStatus.Confirmed;
        } else {
          return TransactionStatus.Pending;
        }
      }),
      catchError((error) => {
        if (error.response?.status === 404) {
          return of(TransactionStatus.Dropped);
        }
        return throwError(() => new Error(`Failed to fetch transaction status: ${error.message}`));
      })
    );
  }
}
