import { ComputeBudgetProgram, Keypair } from '@solana/web3.js';
import { Connection, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

export class RetryError extends Error {
    constructor(message: string, public readonly attempts: number) {
        super(message);
        this.name = 'RetryError';
    }
}

interface RetryOptions {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
    jitter?: boolean;
}

export async function withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxAttempts = 5,
        initialDelay = 500,
        maxDelay = 10000,
        factor = 2,
        jitter = true
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

            if (error?.response?.status !== 429 && 
                !error.toString().includes('429') && 
                !error.toString().includes('Too many requests')) {
                throw error;
            }

            const jitterDelay = jitter
                ? delay * (0.5 + Math.random())
                : delay;

            console.log(`Attempt ${attempt} failed. Retrying after ${Math.round(jitterDelay)}ms...`);
            
            await new Promise(resolve => setTimeout(resolve, jitterDelay));
            
            delay = Math.min(delay * factor, maxDelay);
            attempt++;
        }
    }
}

export async function getKeyPairFromPrivateKey(key: string) {
    return Keypair.fromSecretKey(
        new Uint8Array(bs58.decode(key))
    );
}

let cachedBlockhash: { blockhash: string; lastValidBlockHeight: number } | null = null;
let blockhashExpirySlot = 0;

export async function getCachedBlockhash(connection: Connection): Promise<string> {
    const currentSlot = await withRetry(() => connection.getSlot());

    if (!cachedBlockhash || currentSlot >= blockhashExpirySlot) {
        const latestBlockhash = await withRetry(() => connection.getLatestBlockhash());
        cachedBlockhash = latestBlockhash;
        blockhashExpirySlot = latestBlockhash.lastValidBlockHeight;
    }

    return cachedBlockhash.blockhash;
}

export async function createTransaction(
    connection: Connection,
    instructions: TransactionInstruction[],
    payer: PublicKey,
    priorityFeeInSol: number = 0
): Promise<Transaction> {
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
}

export async function sendAndConfirmTransactionWrapper(
    connection: Connection, 
    transaction: Transaction, 
    signers: any[]
) {
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
        console.log('Transaction confirmed with signature:', signature);
        return signature;
    } catch (error) {
        console.error('Error sending transaction:', error);
        throw error;
    }
}

export function bufferFromUInt64(value: number | string) {
    let buffer = Buffer.alloc(8);
    buffer.writeBigUInt64LE(BigInt(value));
    return buffer;
}