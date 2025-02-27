# PUMPFUN SDK DEVELOPMENT GUIDE

## Build Commands
- `npm run build` - Build the project (TypeScript to JavaScript)
- `npm version patch/minor/major && npm publish` - Release new versions

## Code Style Guidelines
- **TypeScript**: Use strict mode with proper typing
- **Error Handling**: Use custom error classes (like RetryError) with proper messaging
- **Naming**: Use camelCase for variables/functions, PascalCase for classes/interfaces/types
- **Imports**: Group imports by source (external packages first, then internal modules)
- **Comments**: Add JSDoc comments for public API functions
- **Documentation**: Keep README.md updated with new features
- **Exports**: Use named exports, maintain organized exports in index.ts
- **Formatting**: Use consistent indentation (2 spaces) and line spacing
- **Security**: Never log private keys, implement proper security measures
- **Error Recovery**: Use retry mechanisms with backoff for network operations

## Project Structure
- `src/` - TypeScript source files
- `dist/` - Compiled JavaScript (generated)
- Core modules: api.ts, constants.ts, utils.ts, gen-wallets.ts, swap.ts, types.ts