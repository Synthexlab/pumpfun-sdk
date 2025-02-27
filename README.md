# PumpFun SDK

A comprehensive TypeScript/JavaScript SDK for interacting with Pump.fun on the Solana blockchain. This SDK provides utilities for trading operations, wallet management, and automated trading strategies.

[![npm version](https://badge.fury.io/js/pumpfun-sdk.svg)](https://badge.fury.io/js/pumpfun-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Table of Contents

- [PumpFun SDK](#pumpfun-sdk)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
  - [Features](#features)
  - [Quick Start](#quick-start)
  - [Detailed Usage](#detailed-usage)
    - [Trading Operations](#trading-operations)
      - [Buy Operations](#buy-operations)
      - [Sell Operations](#sell-operations)
    - [Wallet Management](#wallet-management)
    - [Configuration](#configuration)
      - [WalletGenerator Configuration](#walletgenerator-configuration)
    - [Error Handling](#error-handling)
  - [API Reference](#api-reference)
    - [Trading Functions](#trading-functions)
      - [pumpFunBuy](#pumpfunbuy)
      - [pumpFunSell](#pumpfunsell)
    - [Wallet Management](#wallet-management-1)
      - [WalletGenerator Methods](#walletgenerator-methods)
  - [Examples](#examples)
    - [Complete Trading Workflow](#complete-trading-workflow)
  - [Contributing](#contributing)
    - [Development Setup](#development-setup)
    - [Building and Testing](#building-and-testing)
    - [Contribution Guidelines](#contribution-guidelines)
    - [Code Review Process](#code-review-process)
  - [Security](#security)
    - [Security Considerations](#security-considerations)
  - [License](#license)
  - [Troubleshooting](#troubleshooting)
    - [Common Issues](#common-issues)
    - [Support](#support)
  - [Release Process](#release-process)
    - [Version Numbering](#version-numbering)

## Installation

```bash
npm install pumpfun-sdk
# or
yarn add pumpfun-sdk
```

## Features

- **Trading Operations**
  - Buy and sell tokens on Pump.fun
  - Transaction simulation before execution
  - Priority fee management
  - Slippage protection
  - Transaction tracking to finality

- **Market Data**
  - Token details and pricing
  - Market overview with trending tokens
  - Transaction history
  - Price quotes without execution

- **Wallet Management**
  - Generate multiple wallets
  - Distribute SOL to wallets
  - Collect remaining funds
  - Batch operations support

- **Advanced Utilities**
  - Enhanced retry mechanism with intelligent backoff
  - Comprehensive error classification
  - Transaction confirmation tracking
  - Type-safe interfaces and validation

## Quick Start

```typescript
import { 
  pumpFunBuy,
  pumpFunSell, 
  TransactionMode, 
  getCoinData,
  getMarketOverview,
  getBuyPriceQuote,
  WalletGenerator 
} from 'pumpfun-sdk';

// Get market overview with trending tokens
const market = await getMarketOverview(10); // Top 10 tokens
console.log(`Total tokens: ${market.totalTokens}`);
console.log(`Top token: ${market.tokens[0].name} (${market.tokens[0].mint})`);

// Get detailed coin data
const coin = await getCoinData('TOKEN_MINT_ADDRESS');
console.log(`${coin.name} price: ${coin.price_sol} SOL`);

// Get price quote without executing a transaction
const quote = await getBuyPriceQuote('TOKEN_MINT_ADDRESS', 0.1); // 0.1 SOL
console.log(`Expected tokens: ${quote.expectedOutputAmount}`);
console.log(`Price impact: ${(quote.priceImpact * 100).toFixed(2)}%`);

// Execute a buy operation with custom configuration
const result = await pumpFunBuy(
    TransactionMode.Execution,
    'YOUR_PRIVATE_KEY',
    'TOKEN_MINT_ADDRESS',
    0.1,          // SOL amount
    0.0001,       // Priority fee
    0.25,         // Slippage
    {             // Optional configuration
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      commitment: 'confirmed',
      trackTx: true
    }
);
console.log(`Transaction signature: ${result.signature}`);
console.log(`Tokens purchased: ${result.expectedOutput}`);

// Initialize wallet generator for multi-wallet operations
const generator = new WalletGenerator({
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    numberOfWallets: 10,
    solanaToDistribute: 0.1
});

// Generate wallets
const wallets = generator.generateWallets();
```

## Detailed Usage

### Trading Operations

#### Buy Operations

The SDK provides a comprehensive interface for buying tokens:

```typescript
import { pumpFunBuy, TransactionMode } from 'pumpfun-sdk';

await pumpFunBuy(
    TransactionMode.Execution,  // or TransactionMode.Simulation
    privateKey,                 // Base58 encoded private key
    mintAddress,               // Token mint address
    solAmount,                 // Amount of SOL to spend
    priorityFee,               // Optional priority fee in SOL
    slippage                   // Optional slippage tolerance (0-1)
);
```

#### Sell Operations

Similar interface for selling tokens:

```typescript
await pumpFunSell(
    TransactionMode.Execution,
    privateKey,
    mintAddress,
    tokenAmount,               // Amount of tokens to sell
    priorityFee,
    slippage
);
```

### Wallet Management

The `WalletGenerator` class provides comprehensive wallet management features:

```typescript
const generator = new WalletGenerator({
    rpcUrl: 'https://api.devnet.solana.com',
    numberOfWallets: 10,
    solanaToDistribute: 0.1,
    batchSize: 5,
    delayMs: 1000,
    minRemainingBalance: 5000
});

// Generate wallets
const wallets = generator.generateWallets();

// Distribute SOL
await generator.distributeToWallets(mainWalletPrivateKey, wallets);

// Collect remaining funds
await generator.collectFromAllWallets(wallets, destinationPublicKey);
```

### Configuration

#### WalletGenerator Configuration

```typescript
interface WalletGeneratorConfig {
    rpcUrl: string;              // Solana RPC endpoint
    numberOfWallets?: number;    // Number of wallets to generate (default: 100)
    solanaToDistribute?: number; // SOL amount to distribute (default: 2)
    batchSize?: number;         // Batch size for operations (default: 5)
    delayMs?: number;           // Delay between operations (default: 1000)
    minRemainingBalance?: number; // Min balance to keep (default: 5000 lamports)
}
```

### Error Handling

The SDK implements comprehensive error handling with retry mechanisms:

```typescript
try {
    await pumpFunBuy(/* ... */);
} catch (error) {
    if (error instanceof RetryError) {
        console.log(`Failed after ${error.attempts} attempts`);
    }
    // Handle other errors
}
```

## API Reference

### Market Data Functions

#### getCoinData
```typescript
function getCoinData(mintStr: string): Promise<CoinData>
```

#### getMarketOverview
```typescript
function getMarketOverview(limit: number = 50): Promise<MarketOverview>
```

#### getTokenTransactionHistory
```typescript
function getTokenTransactionHistory(mintStr: string, limit: number = 20): Promise<any>
```

#### getBuyPriceQuote
```typescript
function getBuyPriceQuote(mintStr: string, solAmount: number): Promise<any>
```

#### getSellPriceQuote
```typescript
function getSellPriceQuote(mintStr: string, tokenAmount: number): Promise<any>
```

### Trading Functions

#### pumpFunBuy
```typescript
function pumpFunBuy(
    transactionMode: TransactionMode,
    payerPrivateKey: string,
    mintStr: string,
    solIn: number,
    priorityFeeInSol?: number,
    slippageDecimal?: number,
    config?: SwapConfig
): Promise<{
    success: boolean;
    signature?: string;
    expectedOutput: number;
    inputAmount: number;
    outputToken: string;
    simulation?: any;
    logs?: string[];
}>
```

#### pumpFunSell
```typescript
function pumpFunSell(
    transactionMode: TransactionMode,
    payerPrivateKey: string,
    mintStr: string,
    tokenBalance: number,
    priorityFeeInSol?: number,
    slippageDecimal?: number,
    config?: SwapConfig
): Promise<{
    success: boolean;
    signature?: string;
    expectedOutput: number;
    inputAmount: number;
    outputToken: string;
    simulation?: any;
    logs?: string[];
}>
```

### Wallet Management

#### WalletGenerator Methods
```typescript
class WalletGenerator {
    generateWallets(): WalletData[];
    distributeToWallets(mainWalletPrivateKey: string, wallets: WalletData[]): Promise<Array<{
        publicKey: string;
        success: boolean;
        error?: string;
    }>>;
    collectFromAllWallets(wallets: WalletData[], destinationPublicKey: string): Promise<TransferResult[]>;
}
```

## Examples

### Complete Trading Workflow

```typescript
import { WalletGenerator, TransactionMode, pumpFunBuy, pumpFunSell } from 'pumpfun-sdk';

async function tradingWorkflow() {
    // Initialize generator
    const generator = new WalletGenerator({
        rpcUrl: 'https://api.devnet.solana.com',
        numberOfWallets: 5
    });

    // Generate wallets
    const wallets = generator.generateWallets();

    // Distribute SOL
    await generator.distributeToWallets(mainWalletPrivateKey, wallets);

    // Execute trades
    for (const wallet of wallets) {
        // Buy operation
        await pumpFunBuy(
            TransactionMode.Execution,
            wallet.secretKey,
            mintAddress,
            0.05
        );

        // Sell operation
        await pumpFunSell(
            TransactionMode.Execution,
            wallet.secretKey,
            mintAddress,
            1000
        );
    }

    // Collect remaining funds
    await generator.collectFromAllWallets(wallets, destinationPublicKey);
}
```

## Contributing

We welcome contributions to the PumpFun SDK! Here's how you can help:

### Development Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/pumpfun-sdk.git
cd pumpfun-sdk
```

2. Install dependencies:
```bash
npm install
```

3. Create a new branch:
```bash
git checkout -b feature/your-feature-name
```

### Building and Testing

1. Build the project:
```bash
npm run build
```

2. Run tests:
```bash
npm test
```

### Contribution Guidelines

1. **Code Style**
   - Follow TypeScript best practices
   - Use meaningful variable names
   - Add appropriate comments
   - Include type definitions

2. **Testing**
   - Write unit tests for new features
   - Ensure all tests pass
   - Add integration tests when necessary

3. **Documentation**
   - Update README.md if needed
   - Document new features
   - Add JSDoc comments to functions

4. **Pull Requests**
   - Create descriptive pull request titles
   - Reference any related issues
   - Provide a clear description of changes
   - Update documentation as needed

### Code Review Process

1. All submissions require review
2. Contributors should respond to comments
3. Keep discussions focused and professional
4. Address all feedback before merging

## Security

### Security Considerations

1. **Private Key Handling**
   - Never log private keys
   - Use secure key storage
   - Implement proper key rotation

2. **Transaction Safety**
   - Always use simulation before execution
   - Implement proper slippage protection
   - Handle transaction errors properly

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Troubleshooting

### Common Issues

1. **Transaction Failed**
   - Check RPC endpoint status
   - Verify account balances
   - Check for rate limiting

2. **Wallet Generation Issues**
   - Verify RPC connection
   - Check system requirements
   - Ensure proper permissions

### Support

For support, please:
1. Check the documentation
2. Search existing issues
3. Create a new issue with detailed information

---

## Release Process

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):
- MAJOR version for incompatible API changes
- MINOR version for backwards-compatible functionality
- PATCH version for backwards-compatible bug fixes

---

Built with ❤️ for the Solana community.