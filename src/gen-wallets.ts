import { Connection, Keypair, SystemProgram, Transaction, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

export interface WalletData {
    publicKey: string;
    secretKey: string;
}

export interface WalletGeneratorConfig {
    rpcUrl: string;
    numberOfWallets?: number;
    solanaToDistribute?: number;
    batchSize?: number;
    delayMs?: number;
    minRemainingBalance?: number;
}

export interface TransferResult {
    fromPublicKey: string;
    success: boolean;
    amount?: number;
    error?: string;
}

export class WalletGenerator {
    private connection: Connection;
    private numberOfWallets: number;
    private solanaToDistribute: number;
    private batchSize: number;
    private delayMs: number;
    private minRemainingBalance: number;

    constructor(config: WalletGeneratorConfig) {
        this.connection = new Connection(config.rpcUrl, 'confirmed');
        this.numberOfWallets = config.numberOfWallets || 100;
        this.solanaToDistribute = config.solanaToDistribute || 2;
        this.batchSize = config.batchSize || 5;
        this.delayMs = config.delayMs || 1000;
        this.minRemainingBalance = config.minRemainingBalance || 5000; // 5000 lamports default min balance
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public generateWallets(): WalletData[] {
        return Array.from({ length: this.numberOfWallets }, () => {
            const wallet = Keypair.generate();
            return {
                publicKey: wallet.publicKey.toString(),
                secretKey: Buffer.from(wallet.secretKey).toString('base64')
            };
        });
    }

    private async distributeSOL(
        mainWallet: Keypair, 
        destinationWallet: Keypair, 
        amount: number, 
        retries: number = 3
    ): Promise<string> {
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const transaction = new Transaction().add(
                    SystemProgram.transfer({
                        fromPubkey: mainWallet.publicKey,
                        toPubkey: destinationWallet.publicKey,
                        lamports: amount,
                    })
                );
                
                const signature = await this.connection.sendTransaction(
                    transaction, 
                    [mainWallet]
                );
                await this.connection.confirmTransaction(signature);
                return signature;
            } catch (err: any) {
                if (attempt === retries - 1) throw err;
                if (err.message.includes('429')) {
                    await this.sleep(this.delayMs * (attempt + 1));
                    continue;
                }
                throw err;
            }
        }
        throw new Error('Max retries reached');
    }

    private async processBatch(
        mainWallet: Keypair, 
        wallets: WalletData[], 
        amountPerWallet: number, 
        startIdx: number
    ): Promise<Array<{ publicKey: string; success: boolean; error?: string }>> {
        const endIdx = Math.min(startIdx + this.batchSize, wallets.length);
        const batch = wallets.slice(startIdx, endIdx);
        const results: Array<{ publicKey: string; success: boolean; error?: string }> = [];

        for (const walletData of batch) {
            try {
                const wallet = WalletGenerator.decodeWallet(walletData.secretKey);
                const signature = await this.distributeSOL(mainWallet, wallet, amountPerWallet);
                results.push({
                    publicKey: walletData.publicKey,
                    success: true
                });
            } catch (err: any) {
                results.push({
                    publicKey: walletData.publicKey,
                    success: false,
                    error: err.message
                });
            }
            await this.sleep(this.delayMs);
        }

        return results;
    }

    public async distributeToWallets(
        mainWalletPrivateKey: string, 
        wallets: WalletData[]
    ): Promise<Array<{ publicKey: string; success: boolean; error?: string }>> {
        const results: Array<{ publicKey: string; success: boolean; error?: string }> = [];
        try {
            const mainWallet = WalletGenerator.createWalletFromPrivateKey(mainWalletPrivateKey);
            const amountPerWallet = (this.solanaToDistribute * LAMPORTS_PER_SOL) / wallets.length;

            for (let i = 0; i < wallets.length; i += this.batchSize) {
                const batchResults = await this.processBatch(
                    mainWallet, 
                    wallets, 
                    amountPerWallet, 
                    i
                );
                results.push(...batchResults);
            }
        } catch (err: any) {
            throw new Error(`Distribution failed: ${err.message}`);
        }

        return results;
    }

    public async collectFromWallet(
        sourceWallet: WalletData,
        destinationPublicKey: string
    ): Promise<TransferResult> {
        try {
            const wallet = WalletGenerator.decodeWallet(sourceWallet.secretKey);
            const balance = await this.connection.getBalance(wallet.publicKey);
            const transferAmount = balance - this.minRemainingBalance;

            if (transferAmount <= 0) {
                return {
                    fromPublicKey: sourceWallet.publicKey,
                    success: false,
                    error: 'Insufficient balance for transfer'
                };
            }

            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: wallet.publicKey,
                    toPubkey: new PublicKey(destinationPublicKey),
                    lamports: transferAmount,
                })
            );
            
            const signature = await this.connection.sendTransaction(transaction, [wallet]);
            await this.connection.confirmTransaction(signature);

            return {
                fromPublicKey: sourceWallet.publicKey,
                success: true,
                amount: transferAmount
            };
        } catch (err: any) {
            return {
                fromPublicKey: sourceWallet.publicKey,
                success: false,
                error: err.message
            };
        }
    }

    public async collectFromAllWallets(
        wallets: WalletData[],
        destinationPublicKey: string
    ): Promise<TransferResult[]> {
        const results: TransferResult[] = [];

        for (const wallet of wallets) {
            const result = await this.collectFromWallet(wallet, destinationPublicKey);
            results.push(result);
            await this.sleep(this.delayMs);
        }

        return results;
    }

    public static decodeWallet(base64SecretKey: string): Keypair {
        return Keypair.fromSecretKey(
            Uint8Array.from(Buffer.from(base64SecretKey, 'base64'))
        );
    }

    public static createWalletFromPrivateKey(privateKeyBase58: string): Keypair {
        const privateKeyBytes = Uint8Array.from(bs58.decode(privateKeyBase58));
        return Keypair.fromSecretKey(privateKeyBytes);
    }

    public static async getBalance(
        connection: Connection, 
        publicKey: string
    ): Promise<number> {
        const balance = await connection.getBalance(new PublicKey(publicKey));
        return balance / LAMPORTS_PER_SOL;
    }
}