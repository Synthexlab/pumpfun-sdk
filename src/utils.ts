import { ComputeBudgetProgram, Keypair } from '@solana/web3.js';
import { Connection, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, Commitment } from '@solana/web3.js';
import bs58 from 'bs58';
import { RetryError, RPCError, ValidationError, TransactionError } from './errors';

/**
 * Creates a Solana connection object
 * @param rpcUrl The RPC URL to connect to
 * @param commitment The commitment level
 * @returns A new Connection instance
 */
export function createConnection(rpcUrl: string, commitment: Commitment = 'confirmed'): Connection {
    return new Connection(rpcUrl, commitment);
}

interface RetryOptions {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
    jitter?: boolean;
    retryableErrors?: Array<string | RegExp>;
}

/**
 * Utility function to retry operations with exponential backoff
 * @param operation Function to retry
 * @param options Retry configuration options
 * @returns Promise resolving to the operation result
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxAttempts = 5,
        initialDelay = 500,
        maxDelay = 10000,
        factor = 2,
        jitter = true,
        retryableErrors = [
            /429/,
            /Too many requests/,
            /timeout/i,
            /ConnectionError/i,
            /Network Error/i,
            /EAI_AGAIN/,
            /ETIMEDOUT/,
            /ECONNRESET/,
            /ECONNREFUSED/,
            /socket hang up/i,
            /Server responded with 5\d\d/,
            /internal server error/i,
            /Connection terminated/i,
            /rate limit/i
        ]
    } = options;

    let attempt = 1;
    let delay = initialDelay;

    while (true) {
        try {
            return await operation();
        } catch (error: any) {
            if (attempt >= maxAttempts) {
                throw new RetryError(
                    `Failed after ${attempt} attempts: ${error.message}`,
                    attempt
                );
            }

            // Check if the error is retryable
            const errorString = error?.toString() || '';
            const shouldRetry = retryableErrors.some(pattern => {
                if (typeof pattern === 'string') {
                    return errorString.includes(pattern);
                }
                return pattern.test(errorString);
            });

            // Also check for specific status codes
            const statusCode = error?.response?.status;
            const isRetryableStatusCode = statusCode && (
                statusCode === 429 || // Too many requests
                statusCode >= 500 || // Server errors
                statusCode === 408    // Request timeout
            );

            if (!shouldRetry && !isRetryableStatusCode) {
                throw error;
            }

            const jitterDelay = jitter
                ? delay * (0.5 + Math.random())
                : delay;
            
            await new Promise(resolve => setTimeout(resolve, jitterDelay));
            
            delay = Math.min(delay * factor, maxDelay);
            attempt++;
        }
    }
}

/**
 * Creates a keypair from a private key string
 * @param key Base58-encoded private key
 * @returns Solana Keypair
 */
export async function getKeyPairFromPrivateKey(key: string): Promise<Keypair> {
    try {
        return Keypair.fromSecretKey(
            new Uint8Array(bs58.decode(key))
        );
    } catch (error) {
        throw new ValidationError(`Invalid private key format: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Cache for recent blockhash to reduce RPC calls
let cachedBlockhash: { blockhash: string; lastValidBlockHeight: number } | null = null;
let blockhashExpirySlot = 0;

/**
 * Gets a cached blockhash or fetches a new one if cache is expired
 * @param connection Solana connection
 * @returns Promise resolving to blockhash string
 */
export async function getCachedBlockhash(connection: Connection): Promise<string> {
    try {
        const currentSlot = await withRetry(() => connection.getSlot());

        if (!cachedBlockhash || currentSlot >= blockhashExpirySlot) {
            const latestBlockhash = await withRetry(() => connection.getLatestBlockhash());
            cachedBlockhash = latestBlockhash;
            blockhashExpirySlot = latestBlockhash.lastValidBlockHeight;
        }

        return cachedBlockhash.blockhash;
    } catch (error) {
        throw new RPCError(`Failed to get blockhash: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Creates a transaction with instructions and priority fee
 * @param connection Solana connection
 * @param instructions Transaction instructions
 * @param payer Payer public key
 * @param priorityFeeInSol Optional priority fee in SOL
 * @returns Promise resolving to Transaction
 */
export async function createTransaction(
    connection: Connection,
    instructions: TransactionInstruction[],
    payer: PublicKey,
    priorityFeeInSol: number = 0
): Promise<Transaction> {
    if (!instructions || instructions.length === 0) {
        throw new ValidationError('No instructions provided for transaction');
    }
    
    if (priorityFeeInSol < 0) {
        throw new ValidationError('Priority fee cannot be negative');
    }

    try {
        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units: 1000000,
        });

        const transaction = new Transaction().add(modifyComputeUnits);

        if (priorityFeeInSol > 0) {
            const microLamports = priorityFeeInSol * 1_000_000_000;
            const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
                microLamports,
            });
            transaction.add(addPriorityFee);
        }

        transaction.add(...instructions);
        transaction.feePayer = payer;

        transaction.recentBlockhash = await getCachedBlockhash(connection);
        return transaction;
    } catch (error) {
        if (error instanceof ValidationError || error instanceof RPCError) {
            throw error;
        }
        throw new RPCError(`Transaction creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Wrapper for sending and confirming transactions with retry logic
 * @param connection Solana connection
 * @param transaction Transaction to send
 * @param signers Array of signers
 * @returns Promise resolving to transaction signature
 */
export async function sendAndConfirmTransactionWrapper(
    connection: Connection, 
    transaction: Transaction, 
    signers: Keypair[]
): Promise<string> {
    try {
        const signature = await withRetry(() => 
            sendAndConfirmTransaction(
                connection, 
                transaction, 
                signers, 
                { 
                    skipPreflight: true, 
                    preflightCommitment: 'confirmed',
                    maxRetries: 3
                }
            )
        );
        
        return signature;
    } catch (error: any) {
        // Extract Solana error logs if available
        const logs = error?.logs || [];
        const signature = error?.signature;
        
        throw new TransactionError(
            `Transaction failed: ${error instanceof Error ? error.message : String(error)}`,
            signature,
            logs
        );
    }
}

/**
 * Safely converts a number or string to a Buffer
 * @param value Number or string to convert to Buffer
 * @returns Buffer containing the BigInt representation
 */
export function bufferFromUInt64(value: number | string): Buffer {
    try {
        // Validate number is within safe range
        const bigIntValue = BigInt(value);
        if (typeof value === 'number' && 
            (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER)) {
            throw new ValidationError(`Number ${value} exceeds safe integer limits`);
        }
        
        let buffer = Buffer.alloc(8);
        buffer.writeBigUInt64LE(bigIntValue);
        return buffer;
    } catch (error) {
        if (error instanceof ValidationError) {
            throw error;
        }
        throw new ValidationError(`Failed to convert value to buffer: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Validates a Solana public key string
 * @param publicKeyString Public key string to validate
 * @returns Boolean indicating if the key is valid
 */
export function isValidPublicKey(publicKeyString: string): boolean {
    try {
        new PublicKey(publicKeyString);
        return true;
    } catch {
        return false;
    }
}

/**
 * Tracks a transaction until it reaches finality
 * @param connection Solana connection
 * @param signature Transaction signature
 * @param timeoutMs Optional timeout in milliseconds
 * @returns Promise resolving to confirmed transaction details
 */
export async function trackTransaction(
    connection: Connection,
    signature: string,
    timeoutMs: number = 60000
): Promise<any> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
        try {
            const status = await withRetry(() => 
                connection.getSignatureStatus(signature, { searchTransactionHistory: true })
            );
            
            if (status?.value) {
                if (status.value.err) {
                    const errorMsg = typeof status.value.err === 'string' 
                        ? status.value.err 
                        : JSON.stringify(status.value.err);
                    throw new TransactionError(`Transaction failed: ${errorMsg}`, signature);
                }

                if (status.value.confirmationStatus === 'finalized') {
                    const confirmedTx = await withRetry(() => 
                        connection.getTransaction(signature, { commitment: 'finalized' })
                    );
                    return confirmedTx;
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            if (error instanceof TransactionError) {
                throw error;
            }
            throw new RPCError(`Failed to track transaction: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    throw new RPCError(`Transaction tracking timed out after ${timeoutMs}ms`);
}