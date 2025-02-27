import { Connection, LAMPORTS_PER_SOL, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { 
    getKeyPairFromPrivateKey, 
    createTransaction, 
    sendAndConfirmTransactionWrapper, 
    bufferFromUInt64, 
    withRetry,
    trackTransaction,
    isValidPublicKey,
    createConnection
} from './utils';
import { getCoinData, getBuyPriceQuote } from './api';
import { TransactionMode } from './types';
import { GLOBAL, FEE_RECIPIENT, SYSTEM_PROGRAM_ID, RENT, PUMP_FUN_ACCOUNT, PUMP_FUN_PROGRAM, ASSOC_TOKEN_ACC_PROG } from './constants';
import { ValidationError, TransactionError } from './errors';

// Configuration options
export interface SwapConfig {
    rpcUrl?: string;
    commitment?: 'processed' | 'confirmed' | 'finalized';
    trackTx?: boolean;
}

// Default configuration
const DEFAULT_CONFIG: SwapConfig = {
    rpcUrl: "https://api.mainnet-beta.solana.com",
    commitment: 'confirmed',
    trackTx: true
};

/**
 * Buy tokens on Pump.fun
 * 
 * @param transactionMode Transaction mode (Simulation or Execution)
 * @param payerPrivateKey Base58-encoded private key
 * @param mintStr Token mint address
 * @param solIn Amount of SOL to spend
 * @param priorityFeeInSol Optional priority fee in SOL
 * @param slippageDecimal Optional slippage tolerance (0-1)
 * @param config Optional configuration parameters
 * @returns Promise resolving to transaction signature if executed
 */
export async function pumpFunBuy(
    transactionMode: TransactionMode, 
    payerPrivateKey: string, 
    mintStr: string, 
    solIn: number, 
    priorityFeeInSol: number = 0, 
    slippageDecimal: number = 0.25,
    config: SwapConfig = {}
) {
    // Parameter validation
    if (!payerPrivateKey) {
        throw new ValidationError('Private key is required');
    }
    
    if (!mintStr || !isValidPublicKey(mintStr)) {
        throw new ValidationError('Invalid token mint address');
    }
    
    if (solIn <= 0) {
        throw new ValidationError('SOL amount must be greater than 0');
    }
    
    if (slippageDecimal < 0 || slippageDecimal > 1) {
        throw new ValidationError('Slippage must be between 0 and 1');
    }
    
    // Merge with default config
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    
    try {
        const connection = createConnection(finalConfig.rpcUrl!, finalConfig.commitment);

        // Get coin data
        const coinData = await getCoinData(mintStr);
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
        
        if (transactionMode === TransactionMode.Execution) {
            const signature = await sendAndConfirmTransactionWrapper(connection, transaction, [payer]);
            
            // Track transaction to finality if requested
            if (finalConfig.trackTx) {
                await trackTransaction(connection, signature);
            }
            
            return {
                success: true,
                signature,
                expectedOutput: tokenOut,
                inputAmount: solIn,
                outputToken: mintStr
            };
        }
        else if (transactionMode === TransactionMode.Simulation) {
            const simulatedResult = await withRetry(() => 
                connection.simulateTransaction(transaction)
            );
            
            if (simulatedResult.value.err) {
                throw new TransactionError(
                    `Simulation failed: ${simulatedResult.value.err}`,
                    undefined,
                    simulatedResult.value.logs || []
                );
            }
            
            return {
                success: true,
                simulation: simulatedResult.value,
                expectedOutput: tokenOut,
                inputAmount: solIn,
                logs: simulatedResult.value.logs
            };
        }
        
        throw new ValidationError('Invalid transaction mode');
    } catch (error) {
        if (error instanceof ValidationError || error instanceof TransactionError) {
            throw error;
        }
        throw new TransactionError(`Error in pumpFunBuy: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Sell tokens on Pump.fun
 * 
 * @param transactionMode Transaction mode (Simulation or Execution)
 * @param payerPrivateKey Base58-encoded private key
 * @param mintStr Token mint address
 * @param tokenBalance Amount of tokens to sell
 * @param priorityFeeInSol Optional priority fee in SOL
 * @param slippageDecimal Optional slippage tolerance (0-1)
 * @param config Optional configuration parameters
 * @returns Promise resolving to transaction signature if executed
 */
export async function pumpFunSell(
    transactionMode: TransactionMode, 
    payerPrivateKey: string, 
    mintStr: string, 
    tokenBalance: number, 
    priorityFeeInSol: number = 0, 
    slippageDecimal: number = 0.25,
    config: SwapConfig = {}
) {
    // Parameter validation
    if (!payerPrivateKey) {
        throw new ValidationError('Private key is required');
    }
    
    if (!mintStr || !isValidPublicKey(mintStr)) {
        throw new ValidationError('Invalid token mint address');
    }
    
    if (tokenBalance <= 0) {
        throw new ValidationError('Token amount must be greater than 0');
    }
    
    if (slippageDecimal < 0 || slippageDecimal > 1) {
        throw new ValidationError('Slippage must be between 0 and 1');
    }
    
    // Merge with default config
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    
    try {
        const connection = createConnection(finalConfig.rpcUrl!, finalConfig.commitment);

        // Get coin data
        const coinData = await getCoinData(mintStr);
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

        const minSolOutput = Math.floor(tokenBalance * (1 - slippageDecimal) * coinData.virtual_sol_reserves / coinData.virtual_token_reserves);
        const expectedSolOutput = Math.floor(tokenBalance * coinData.virtual_sol_reserves / coinData.virtual_token_reserves);

        const BONDING_CURVE = new PublicKey(coinData.bonding_curve);
        const ASSOCIATED_BONDING_CURVE = new PublicKey(coinData.associated_bonding_curve);

        const keys = [
            { pubkey: GLOBAL, isSigner: false, isWritable: false },
            { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: BONDING_CURVE, isSigner: false, isWritable: true },
            { pubkey: ASSOCIATED_BONDING_CURVE, isSigner: false, isWritable: true },
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

        if (transactionMode === TransactionMode.Execution) {
            const signature = await sendAndConfirmTransactionWrapper(connection, transaction, [payer]);
            
            // Track transaction to finality if requested
            if (finalConfig.trackTx) {
                await trackTransaction(connection, signature);
            }
            
            return {
                success: true,
                signature,
                expectedOutput: expectedSolOutput / LAMPORTS_PER_SOL,
                inputAmount: tokenBalance,
                outputToken: 'SOL'
            };
        }
        else if (transactionMode === TransactionMode.Simulation) {
            const simulatedResult = await withRetry(() => 
                connection.simulateTransaction(transaction)
            );
            
            if (simulatedResult.value.err) {
                throw new TransactionError(
                    `Simulation failed: ${simulatedResult.value.err}`,
                    undefined,
                    simulatedResult.value.logs || []
                );
            }
            
            return {
                success: true,
                simulation: simulatedResult.value,
                expectedOutput: expectedSolOutput / LAMPORTS_PER_SOL,
                inputAmount: tokenBalance,
                logs: simulatedResult.value.logs
            };
        }
        
        throw new ValidationError('Invalid transaction mode');
    } catch (error) {
        if (error instanceof ValidationError || error instanceof TransactionError) {
            throw error;
        }
        throw new TransactionError(`Error in pumpFunSell: ${error instanceof Error ? error.message : String(error)}`);
    }
}