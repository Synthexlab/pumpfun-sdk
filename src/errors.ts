/**
 * Custom error class for API related errors
 */
export class APIError extends Error {
    constructor(message: string, public readonly statusCode: number) {
        super(message);
        this.name = 'APIError';
    }
}

/**
 * Custom error class for retry failures
 */
export class RetryError extends Error {
    constructor(message: string, public readonly attempts: number) {
        super(message);
        this.name = 'RetryError';
    }
}

/**
 * Custom error class for transaction failures
 */
export class TransactionError extends Error {
    constructor(message: string, public readonly signature?: string, public readonly logs?: string[]) {
        super(message);
        this.name = 'TransactionError';
    }
}

/**
 * Custom error class for wallet-related errors
 */
export class WalletError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WalletError';
    }
}

/**
 * Custom error class for RPC errors
 */
export class RPCError extends Error {
    constructor(message: string, public readonly code?: number) {
        super(message);
        this.name = 'RPCError';
    }
}

/**
 * Custom error class for validation errors
 */
export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}