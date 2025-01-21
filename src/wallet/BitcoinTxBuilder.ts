import { UTxO } from '../providers';
import { BitcoinSigner } from './BitcoinSigner';
import { payments, Psbt } from 'bitcoinjs-lib';
import { Network } from '../common';
import * as bitcoin from 'bitcoinjs-lib';

export const buildTx = (toAddress: string, changeAddress: string, amount: bigint, fee: bigint, utxos: UTxO[], signer: BitcoinSigner, network: Network): string => {
  const fixedFee = fee;
  const net = network === Network.Mainnet ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;

  try {
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


    const publicKey = signer.getPublicKey();
    const psbt = new Psbt({ network: net });

    selectedUTxOs.forEach((utxo) => {
      psbt.addInput({
        hash: utxo.txId,
        index: utxo.index,
        witnessUtxo: {
          script: payments.p2wpkh({ pubkey: publicKey, network: net }).output!,
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
        address: changeAddress,
        value: Number(change)
      });
    }

    psbt.signAllInputs(signer);

    psbt.finalizeAllInputs();

    return psbt.extractTransaction().toHex();
  } catch (error) {
    console.error('Failed to send transaction:', error);
    throw error;
  }
};
