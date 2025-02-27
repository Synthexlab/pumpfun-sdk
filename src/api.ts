import axios from 'axios';
import { APIError, RetryError } from './errors';
import { withRetry } from './utils';

export interface CoinData {
    id: string;
    mint: string;
    name: string;
    symbol: string;
    ticker: string;
    image: string;
    bonding_curve: string;
    associated_bonding_curve: string;
    virtual_sol_reserves: number;
    virtual_token_reserves: number;
    price_sol: number;
    liquidity_sol: number;
    volume_24h_sol: number;
    [key: string]: any; // For any additional fields
}

export interface MarketOverview {
    totalTokens: number;
    totalVolume24h: number;
    tokens: Array<{
        mint: string;
        name: string;
        symbol: string;
        price_sol: number;
        volume_24h_sol: number;
    }>;
}

/**
 * Standard headers for API requests to Pump.fun
 */
const standardHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.pump.fun/",
    "Origin": "https://www.pump.fun",
    "Connection": "keep-alive",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site"
};

/**
 * Get detailed data for a specific coin by mint address
 * @param mintStr The mint address of the token
 * @returns Promise with the coin data or throws an error
 */
export async function getCoinData(mintStr: string): Promise<CoinData> {
    try {
        const url = `https://frontend-api-v3.pump.fun/coins/${mintStr}`;
        const response = await withRetry(async () => {
            const resp = await axios.get(url, { headers: standardHeaders });
            if (resp.status !== 200) {
                throw new APIError(`Failed to retrieve coin data: ${resp.status}`, resp.status);
            }
            return resp;
        });
        
        return response.data;
    } catch (error) {
        if (error instanceof RetryError || error instanceof APIError) {
            throw error;
        }
        throw new APIError(`Error fetching coin data: ${error instanceof Error ? error.message : String(error)}`, 0);
    }
}

/**
 * Get market overview with trending tokens
 * @param limit Optional number of tokens to return
 * @returns Promise with market overview data
 */
export async function getMarketOverview(limit: number = 10): Promise<MarketOverview> {
    try {
        const url = `https://frontend-api-v3.pump.fun/coins?limit=${limit}`;
        const response = await withRetry(async () => {
            const resp = await axios.get(url, { headers: standardHeaders });
            if (resp.status !== 200) {
                throw new APIError(`Failed to retrieve market data: ${resp.status}`, resp.status);
            }
            return resp;
        });

        return response.data;
    } catch (error) {
        if (error instanceof RetryError || error instanceof APIError) {
            throw error;
        }
        throw new APIError(`Error fetching market data: ${error instanceof Error ? error.message : String(error)}`, 0);
    }
}

/**
 * Get transaction history for a specific token
 * @param mintStr The mint address of the token
 * @param limit Optional number of transactions to return
 * @returns Promise with transaction history
 */
export async function getTokenTransactionHistory(mintStr: string, limit: number = 20): Promise<any> {
    try {
        const url = `https://frontend-api-v3.pump.fun/coins/${mintStr}/transactions?limit=${limit}`;
        const response = await withRetry(async () => {
            const resp = await axios.get(url, { headers: standardHeaders });
            if (resp.status !== 200) {
                throw new APIError(`Failed to retrieve transaction history: ${resp.status}`, resp.status);
            }
            return resp;
        });

        return response.data;
    } catch (error) {
        if (error instanceof RetryError || error instanceof APIError) {
            throw error;
        }
        throw new APIError(`Error fetching transaction history: ${error instanceof Error ? error.message : String(error)}`, 0);
    }
}

/**
 * Get price quote for buying tokens without executing a transaction
 * @param mintStr The mint address of the token
 * @param solAmount Amount of SOL to spend
 * @returns Promise with the quote details
 */
export async function getBuyPriceQuote(mintStr: string, solAmount: number): Promise<any> {
    try {
        const coinData = await getCoinData(mintStr);
        const tokenAmount = Math.floor(solAmount * coinData.virtual_token_reserves / coinData.virtual_sol_reserves);
        
        return {
            inputAmount: solAmount,
            expectedOutputAmount: tokenAmount,
            price: coinData.price_sol,
            priceImpact: solAmount / coinData.liquidity_sol
        };
    } catch (error) {
        if (error instanceof RetryError || error instanceof APIError) {
            throw error;
        }
        throw new APIError(`Error calculating buy price quote: ${error instanceof Error ? error.message : String(error)}`, 0);
    }
}

/**
 * Get price quote for selling tokens without executing a transaction
 * @param mintStr The mint address of the token
 * @param tokenAmount Amount of tokens to sell
 * @returns Promise with the quote details
 */
export async function getSellPriceQuote(mintStr: string, tokenAmount: number): Promise<any> {
    try {
        const coinData = await getCoinData(mintStr);
        const solAmount = tokenAmount * coinData.virtual_sol_reserves / coinData.virtual_token_reserves;
        
        return {
            inputAmount: tokenAmount,
            expectedOutputAmount: solAmount,
            price: coinData.price_sol,
            priceImpact: solAmount / coinData.liquidity_sol
        };
    } catch (error) {
        if (error instanceof RetryError || error instanceof APIError) {
            throw error;
        }
        throw new APIError(`Error calculating sell price quote: ${error instanceof Error ? error.message : String(error)}`, 0);
    }
}