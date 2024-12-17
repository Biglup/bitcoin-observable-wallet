import axios, { AxiosInstance } from 'axios';
import {
  BlockchainDataProvider,
  BlockInfo,
  TransactionHistoryEntry,
  TransactionStatus,
  UTxO
} from './BitcoinDataProvider';
import { from, Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

export class BlockstreamBitcoinDataProvider implements BlockchainDataProvider {
  private api: AxiosInstance;

  constructor(private network: 'testnet' | 'mainnet' = 'testnet') {
    const baseURL = this.network === 'testnet'
      ? 'https://blockstream.info/testnet/api'
      : 'https://blockstream.info/api';

    this.api = axios.create({ baseURL });
  }

  /**
   * Fetches the latest block info.
   */
  getLastKnownBlock(): Observable<BlockInfo> {
    return from(this.api.get('/blocks/tip/height')).pipe(
      switchMap((response) => {
        const latestBlockHeight = response.data;
        return this.api.get(`/block-height/${latestBlockHeight}`);
      }),
      switchMap((response) => {
        return this.api.get(`/block/${response.data}`);
      }),
      map((response) => ({
        height: response.data.height,
        hash: response.data.id
      }))
    );
  }

  /**
   * Fetches the balance of a specified address.
   */
  getAddressBalance(address: string): Observable<bigint> {
    return from(this.api.get(`/address/${address}`)).pipe(
      map((response) => BigInt(response.data.chain_stats.funded_txo_sum - response.data.chain_stats.spent_txo_sum))
    );
  }

  /**
   * Fetches the transaction history for an address.
   */
  getTransactions(
    address: string,
    afterBlockHeight?: number,
    limit: number = 50
  ): Observable<TransactionHistoryEntry[]> {
    return from(this.api.get(`/address/${address}/txs`)).pipe(
      map((response) => {
        const allTransactions = response.data.map((tx: any) => ({
          delta: BigInt(
            tx.vout.reduce((sum: number, output: any) => sum + (output.value || 0), 0)
          ),
          transactionHash: tx.txid,
          confirmations: tx.status.confirmed ? tx.status.block_height : 0,
          status: tx.status.confirmed ? TransactionStatus.Confirmed : TransactionStatus.Pending,
          blockHeight: tx.status.block_height || 0
        }));

        console.log(afterBlockHeight);
        console.log(limit);
        /*
        const filteredTransactions = afterBlockHeight
          ? allTransactions.filter((tx: any) => tx.blockHeight > afterBlockHeight)
          : allTransactions;*/

        return allTransactions;
      })
    );
  }

  /**
   * Fetches UTXOs for an address.
   */
  getUTxOs(address: string): Observable<UTxO[]> {
    return from(this.api.get(`/address/${address}/utxo`)).pipe(
      map((response) =>
        response.data.map((utxo: any) => ({
          txId: utxo.txid,
          index: utxo.vout,
          amount: BigInt(utxo.value),
          address
        }))
      )
    );
  }

  /**
   * Fetches the status of a transaction by its hash.
   */
  getTransactionStatus(txHash: string): Observable<TransactionStatus> {
    return from(this.api.get(`/tx/${txHash}/status`)).pipe(
      map((response) => (response.data.confirmed ? TransactionStatus.Confirmed : TransactionStatus.Pending))
    );
  }

  /**
   * Submits a raw transaction to the blockchain and returns the transaction hash.
   *
   * @param {string} rawTransaction - The raw transaction in hexadecimal format.
   * @returns {Observable<string>} An observable that emits the transaction hash upon successful submission.
   */
  submitTransaction(rawTransaction: string): Observable<string> {
    return from(
      this.api.post('/tx', rawTransaction, {
        headers: { 'Content-Type': 'text/plain' }
      })
    ).pipe(
      map((response) => {
        return response.data.trim();
      })
    );
  }
}
