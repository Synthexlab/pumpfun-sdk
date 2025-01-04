import { Connection, LAMPORTS_PER_SOL, PublicKey, Transaction, TransactionInstruction, clusterApiUrl } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getKeyPairFromPrivateKey, createTransaction, sendAndConfirmTransactionWrapper, bufferFromUInt64, withRetry } from './utils';
import { getCoinData } from './api';
import { TransactionMode } from './types';
import { GLOBAL, FEE_RECIPIENT, SYSTEM_PROGRAM_ID, RENT, PUMP_FUN_ACCOUNT, PUMP_FUN_PROGRAM, ASSOC_TOKEN_ACC_PROG } from './constants';

export async function pumpFunBuy(transactionMode: TransactionMode, payerPrivateKey: string, mintStr: string, solIn: number, priorityFeeInSol: number = 0, slippageDecimal: number = 0.25) {
    try {
        const connection = new Connection(
            "https://mainnet.helius-rpc.com/?api-key=dfa5133f-e9fa-442f-891f-eae3c0b77875",
            {
                commitment: 'confirmed',
                confirmTransactionInitialTimeout: 60000
            }
        );

        const coinData = await withRetry(async () => {
            const data = await getCoinData(mintStr);
            if (!data) {
                throw new Error('Failed to retrieve coin data');
            }
            return data;
        });

        const payer = await getKeyPairFromPrivateKey(payerPrivateKey);
        const owner = payer.publicKey;
        const mint = new PublicKey(mintStr);

        const txBuilder = new Transaction();

        const tokenAccountAddress = await withRetry(() => 
            getAssociatedTokenAddress(
                mint,
                owner,
                false
            )
        );

        const tokenAccountInfo = await withRetry(() => 
            connection.getAccountInfo(tokenAccountAddress)
        );

        let tokenAccount: PublicKey;
        if (!tokenAccountInfo) {
            txBuilder.add(
                createAssociatedTokenAccountInstruction(
                    payer.publicKey,
                    tokenAccountAddress,
                    payer.publicKey,
                    mint
                )
            );
            tokenAccount = tokenAccountAddress;
        } else {
            tokenAccount = tokenAccountAddress;
        }

        const solInLamports = solIn * LAMPORTS_PER_SOL;
        const tokenOut = Math.floor(solInLamports * coinData["virtual_token_reserves"] / coinData["virtual_sol_reserves"]);

        const solInWithSlippage = solIn * (1 + slippageDecimal);
        const maxSolCost = Math.floor(solInWithSlippage * LAMPORTS_PER_SOL);
        const ASSOCIATED_USER = tokenAccount;
        const USER = owner;
        const BONDING_CURVE = new PublicKey(coinData['bonding_curve']);
        const ASSOCIATED_BONDING_CURVE = new PublicKey(coinData['associated_bonding_curve']);

        const keys = [
            { pubkey: GLOBAL, isSigner: false, isWritable: false },
            { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: BONDING_CURVE, isSigner: false, isWritable: true },
            { pubkey: ASSOCIATED_BONDING_CURVE, isSigner: false, isWritable: true },
            { pubkey: ASSOCIATED_USER, isSigner: false, isWritable: true },
            { pubkey: USER, isSigner: false, isWritable: true },
            { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: RENT, isSigner: false, isWritable: false },
            { pubkey: PUMP_FUN_ACCOUNT, isSigner: false, isWritable: false },
            { pubkey: PUMP_FUN_PROGRAM, isSigner: false, isWritable: false },
        ];

        const data = Buffer.concat([
            bufferFromUInt64("16927863322537952870"),
            bufferFromUInt64(tokenOut),
            bufferFromUInt64(maxSolCost)
        ]);

        const instruction = new TransactionInstruction({
            keys: keys,
            programId: PUMP_FUN_PROGRAM,
            data: data
        });
        txBuilder.add(instruction);

        const transaction = await createTransaction(connection, txBuilder.instructions, payer.publicKey, priorityFeeInSol);
        
        if (transactionMode == TransactionMode.Execution) {
            const signature = await withRetry(() => 
                sendAndConfirmTransactionWrapper(connection, transaction, [payer])
            );
            console.log('Buy transaction confirmed:', signature);
        }
        else if (transactionMode == TransactionMode.Simulation) {
            const simulatedResult = await withRetry(() => 
                connection.simulateTransaction(transaction)
            );
            console.log(simulatedResult);
        }
    } catch (error) {
        console.error('Error in pumpFunBuy:', error);
        throw error;
    }
}

export async function pumpFunSell(transactionMode: TransactionMode, payerPrivateKey: string, mintStr: string, tokenBalance: number, priorityFeeInSol: number = 0, slippageDecimal: number = 0.25) {
    try {
        const connection = new Connection(
            "https://mainnet.helius-rpc.com/?api-key=dfa5133f-e9fa-442f-891f-eae3c0b77875",
            {
                commitment: 'confirmed',
                confirmTransactionInitialTimeout: 60000
            }
        );

        const coinData = await withRetry(async () => {
            const data = await getCoinData(mintStr);
            if (!data) {
                throw new Error('Failed to retrieve coin data');
            }
            return data;
        });

        const payer = await getKeyPairFromPrivateKey(payerPrivateKey);
        const owner = payer.publicKey;
        const mint = new PublicKey(mintStr);
        const txBuilder = new Transaction();

        const tokenAccountAddress = await withRetry(() => 
            getAssociatedTokenAddress(
                mint,
                owner,
                false
            )
        );

        const tokenAccountInfo = await withRetry(() => 
            connection.getAccountInfo(tokenAccountAddress)
        );

        let tokenAccount: PublicKey;
        if (!tokenAccountInfo) {
            txBuilder.add(
                createAssociatedTokenAccountInstruction(
                    payer.publicKey,
                    tokenAccountAddress,
                    payer.publicKey,
                    mint
                )
            );
            tokenAccount = tokenAccountAddress;
        } else {
            tokenAccount = tokenAccountAddress;
        }

        const minSolOutput = Math.floor(tokenBalance! * (1 - slippageDecimal) * coinData["virtual_sol_reserves"] / coinData["virtual_token_reserves"]);

        const keys = [
            { pubkey: GLOBAL, isSigner: false, isWritable: false },
            { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: new PublicKey(coinData['bonding_curve']), isSigner: false, isWritable: true },
            { pubkey: new PublicKey(coinData['associated_bonding_curve']), isSigner: false, isWritable: true },
            { pubkey: tokenAccount, isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: false, isWritable: true },
            { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: ASSOC_TOKEN_ACC_PROG, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: PUMP_FUN_ACCOUNT, isSigner: false, isWritable: false },
            { pubkey: PUMP_FUN_PROGRAM, isSigner: false, isWritable: false }
        ];

        const data = Buffer.concat([
            bufferFromUInt64("12502976635542562355"),
            bufferFromUInt64(tokenBalance),
            bufferFromUInt64(minSolOutput)
        ]);

        const instruction = new TransactionInstruction({
            keys: keys,
            programId: PUMP_FUN_PROGRAM,
            data: data
        });
        txBuilder.add(instruction);

        const transaction = await createTransaction(connection, txBuilder.instructions, payer.publicKey, priorityFeeInSol);

        if (transactionMode == TransactionMode.Execution) {
            const signature = await withRetry(() => 
                sendAndConfirmTransactionWrapper(connection, transaction, [payer])
            );
            console.log('Sell transaction confirmed:', signature);
        }
        else if (transactionMode == TransactionMode.Simulation) {
            const simulatedResult = await withRetry(() => 
                connection.simulateTransaction(transaction)
            );
            console.log(simulatedResult);
        }
    } catch (error) {
        console.error('Error in pumpFunSell:', error);
        throw error;
    }
}