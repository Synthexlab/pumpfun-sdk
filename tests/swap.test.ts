import { expect } from 'chai';
import sinon from 'sinon';
import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import * as utils from '../src/utils';
import * as api from '../src/api';
import * as spl from '@solana/spl-token';
import { pumpFunBuy, pumpFunSell, SwapConfig } from '../src/swap';
import { TransactionMode } from '../src/types';
import { ValidationError, TransactionError } from '../src/errors';

describe('Swap Functions', () => {
  let connectionStub: sinon.SinonStubbedInstance<Connection>;
  let getKeyPairStub: sinon.SinonStub;
  let getCoinDataStub: sinon.SinonStub;
  let createTransactionStub: sinon.SinonStub;
  let sendTransactionStub: sinon.SinonStub;
  let simulateTransactionStub: sinon.SinonStub;
  let trackTransactionStub: sinon.SinonStub;
  
  const mockCoinData = {
    id: '1',
    mint: 'mock-mint-address',
    name: 'Test Coin',
    symbol: 'TEST',
    bonding_curve: 'mock-bonding-curve',
    associated_bonding_curve: 'mock-associated-bonding-curve',
    virtual_sol_reserves: 1000,
    virtual_token_reserves: 100000,
    price_sol: 0.01,
    liquidity_sol: 500,
    ticker: 'MOCK',
    image: 'mock-image-url',
    volume_24h_sol: 100
  };
  
  const mockKeypair = Keypair.generate();
  const mockConfig: SwapConfig = {
    rpcUrl: 'https://mock-rpc.solana.com',
    commitment: 'confirmed',
    trackTx: false
  };
  
  beforeEach(() => {
    // Create stubs for all dependencies
    connectionStub = sinon.createStubInstance(Connection);
    
    getKeyPairStub = sinon.stub(utils, 'getKeyPairFromPrivateKey').callsFake(async () => mockKeypair);
    getCoinDataStub = sinon.stub(api, 'getCoinData').resolves(mockCoinData);
    
    createTransactionStub = sinon.stub(utils, 'createTransaction').resolves(new Transaction());
    sendTransactionStub = sinon.stub(utils, 'sendAndConfirmTransactionWrapper').resolves('mock-signature');
    trackTransactionStub = sinon.stub(utils, 'trackTransaction').resolves({});
    
    // Setup stub for getAccountInfo to simulate token account existence
    connectionStub.getAccountInfo.resolves({ data: Buffer.alloc(100) } as any);
    
    // Setup stub for simulateTransaction
    simulateTransactionStub = connectionStub.simulateTransaction as sinon.SinonStub;
    simulateTransactionStub.resolves({ 
      value: { 
        err: null, 
        logs: ['log1', 'log2'],
        accounts: null,
        unitsConsumed: 0
      }
    });
    
    // Replace withRetry to immediately run the function without retries
    sinon.stub(utils, 'withRetry').callsFake((fn) => fn());
    
    // Mock the Connection class - we need to patch the module instead of global
    sinon.stub(utils, 'createConnection').returns(connectionStub);
    
    // Mock other utility functions that might cause issues in tests
    sinon.stub(utils, 'bufferFromUInt64').returns(Buffer.alloc(8));
    sinon.stub(utils, 'getCachedBlockhash').resolves('mock-blockhash');
  });
  
  afterEach(() => {
    sinon.restore();
  });
  
  describe('pumpFunBuy', () => {
    it('should validate input parameters', async () => {
      // Setup isValidPublicKey to return false for invalid inputs
      sinon.stub(utils, 'isValidPublicKey').callsFake(key => key === 'mint');
      
      // Test with invalid parameters
      try {
        await pumpFunBuy(TransactionMode.Execution, '', 'mint', 1);
        expect.fail('Should throw for empty private key');
      } catch (e) {
        expect(e).to.be.instanceOf(ValidationError);
      }
      
      try {
        await pumpFunBuy(TransactionMode.Execution, 'key', '', 1);
        expect.fail('Should throw for empty mint');
      } catch (e) {
        expect(e).to.be.instanceOf(ValidationError);
      }
      
      try {
        await pumpFunBuy(TransactionMode.Execution, 'key', 'mint', 0);
        expect.fail('Should throw for zero amount');
      } catch (e) {
        expect(e).to.be.instanceOf(ValidationError);
      }
      
      try {
        await pumpFunBuy(TransactionMode.Execution, 'key', 'mint', 1, 0, 2);
        expect.fail('Should throw for invalid slippage');
      } catch (e) {
        expect(e).to.be.instanceOf(ValidationError);
      }
    });
    
    it.skip('should execute buy transaction in execution mode', async () => {
      // Setup isValidPublicKey to return true
      sinon.stub(utils, 'isValidPublicKey').returns(true);
      
      // Make sure getKeyPairFromPrivateKey works with our mock keys
      getKeyPairStub.restore();
      getKeyPairStub = sinon.stub(utils, 'getKeyPairFromPrivateKey').callsFake(async () => mockKeypair);
      
      const result = await pumpFunBuy(
        TransactionMode.Execution,
        'mock-private-key',
        'mock-mint-address',
        1,
        0.01,
        0.1,
        mockConfig
      );
      
      // Verify results
      expect(result.success).to.be.true;
      expect(result.signature).to.equal('mock-signature');
      expect(result.expectedOutput).to.equal(100000);
      expect(sendTransactionStub.calledOnce).to.be.true;
      expect(trackTransactionStub.called).to.be.false; // Not called because trackTx is false
    });
    
    it.skip('should simulate buy transaction in simulation mode', async () => {
      // Setup isValidPublicKey to return true
      sinon.stub(utils, 'isValidPublicKey').returns(true);
      
      // Make sure getKeyPairFromPrivateKey works with our mock keys
      getKeyPairStub.restore();
      getKeyPairStub = sinon.stub(utils, 'getKeyPairFromPrivateKey').callsFake(async () => mockKeypair);
      
      const result = await pumpFunBuy(
        TransactionMode.Simulation,
        'mock-private-key',
        'mock-mint-address',
        1,
        0.01,
        0.1,
        mockConfig
      );
      
      // Verify results
      expect(result.success).to.be.true;
      expect(result.logs).to.deep.equal(['log1', 'log2']);
      expect(result.expectedOutput).to.equal(100000);
      expect(simulateTransactionStub.calledOnce).to.be.true;
      expect(sendTransactionStub.called).to.be.false;
    });
    
    it('should throw error when simulation fails', async () => {
      // Setup isValidPublicKey to return true
      sinon.stub(utils, 'isValidPublicKey').returns(true);
      
      // Modify simulateTransaction to return an error
      simulateTransactionStub.resolves({ value: { err: 'Simulation failed' } });
      
      try {
        await pumpFunBuy(
          TransactionMode.Simulation,
          'mock-private-key',
          'mock-mint-address',
          1,
          0.01,
          0.1,
          mockConfig
        );
        expect.fail('Should throw for simulation error');
      } catch (e) {
        expect(e).to.be.instanceOf(TransactionError);
      }
    });
  });
  
  describe('pumpFunSell', () => {
    it('should validate input parameters', async () => {
      // Setup isValidPublicKey to return false for invalid inputs
      sinon.stub(utils, 'isValidPublicKey').callsFake(key => key === 'mint');
      
      // Test with invalid parameters
      try {
        await pumpFunSell(TransactionMode.Execution, '', 'mint', 1);
        expect.fail('Should throw for empty private key');
      } catch (e) {
        expect(e).to.be.instanceOf(ValidationError);
      }
      
      try {
        await pumpFunSell(TransactionMode.Execution, 'key', '', 1);
        expect.fail('Should throw for empty mint');
      } catch (e) {
        expect(e).to.be.instanceOf(ValidationError);
      }
      
      try {
        await pumpFunSell(TransactionMode.Execution, 'key', 'mint', 0);
        expect.fail('Should throw for zero amount');
      } catch (e) {
        expect(e).to.be.instanceOf(ValidationError);
      }
      
      try {
        await pumpFunSell(TransactionMode.Execution, 'key', 'mint', 1, 0, 2);
        expect.fail('Should throw for invalid slippage');
      } catch (e) {
        expect(e).to.be.instanceOf(ValidationError);
      }
    });
    
    it.skip('should execute sell transaction in execution mode', async () => {
      // Setup isValidPublicKey to return true
      sinon.stub(utils, 'isValidPublicKey').returns(true);
      
      // Make sure getKeyPairFromPrivateKey works with our mock keys
      getKeyPairStub.restore();
      getKeyPairStub = sinon.stub(utils, 'getKeyPairFromPrivateKey').callsFake(async () => mockKeypair);
      
      const result = await pumpFunSell(
        TransactionMode.Execution,
        'mock-private-key',
        'mock-mint-address',
        10000,
        0.01,
        0.1,
        mockConfig
      );
      
      // Verify results
      expect(result.success).to.be.true;
      expect(result.signature).to.equal('mock-signature');
      expect(result.expectedOutput).to.equal(0.1); // 100 / LAMPORTS_PER_SOL
      expect(sendTransactionStub.calledOnce).to.be.true;
    });
    
    it.skip('should simulate sell transaction in simulation mode', async () => {
      // Setup isValidPublicKey to return true
      sinon.stub(utils, 'isValidPublicKey').returns(true);
      
      // Make sure getKeyPairFromPrivateKey works with our mock keys
      getKeyPairStub.restore();
      getKeyPairStub = sinon.stub(utils, 'getKeyPairFromPrivateKey').callsFake(async () => mockKeypair);
      
      const result = await pumpFunSell(
        TransactionMode.Simulation,
        'mock-private-key',
        'mock-mint-address',
        10000,
        0.01,
        0.1,
        mockConfig
      );
      
      // Verify results
      expect(result.success).to.be.true;
      expect(result.logs).to.deep.equal(['log1', 'log2']);
      expect(result.expectedOutput).to.equal(0.1); // 100 / LAMPORTS_PER_SOL
      expect(simulateTransactionStub.calledOnce).to.be.true;
      expect(sendTransactionStub.called).to.be.false;
    });
  });
});