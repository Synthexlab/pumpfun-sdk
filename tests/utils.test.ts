import { expect } from 'chai';
import sinon from 'sinon';
import { 
  withRetry, 
  bufferFromUInt64,
  isValidPublicKey,
  getKeyPairFromPrivateKey
} from '../src/utils';
import { RetryError, ValidationError } from '../src/errors';
import { PublicKey, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

describe('Utility Functions', () => {
  describe('withRetry', () => {
    let clock: sinon.SinonFakeTimers;
    
    beforeEach(() => {
      // Create a fake timer to control setTimeout
      clock = sinon.useFakeTimers();
    });
    
    afterEach(() => {
      // Restore original setTimeout
      clock.restore();
    });
    
    it('should return operation result on success', async () => {
      const operation = sinon.stub().resolves('success');
      
      const result = withRetry(operation);
      
      // Need to advance timers to make the Promise resolve
      await clock.runAllAsync();
      
      expect(await result).to.equal('success');
      expect(operation.calledOnce).to.be.true;
    });
    
    it('should retry on retryable errors', async () => {
      // Create a stub that fails with a 429 error twice, then succeeds
      const error = new Error('Too many requests');
      (error as any)['response'] = { status: 429 };
      
      const operation = sinon.stub();
      operation.onCall(0).rejects(error);
      operation.onCall(1).rejects(error);
      operation.onCall(2).resolves('success');
      
      const result = withRetry(operation);
      
      // Advance timers to trigger retries
      await clock.runAllAsync();
      
      expect(await result).to.equal('success');
      expect(operation.callCount).to.equal(3);
    });
    
    it('should throw RetryError after max attempts', async () => {
      // Create a stub that always fails with a retryable error
      const error = new Error('Too many requests');
      (error as any)['response'] = { status: 429 };
      
      const operation = sinon.stub().rejects(error);
      
      const resultPromise = withRetry(operation, { maxAttempts: 3 });
      
      // Advance timers to trigger retries
      await clock.runAllAsync();
      
      try {
        await resultPromise;
        expect.fail('Should have thrown an error');
      } catch (e) {
        expect(e).to.be.instanceOf(RetryError);
        expect((e as RetryError).attempts).to.equal(3);
      }
      
      expect(operation.callCount).to.equal(3);
    });
    
    it('should throw non-retryable errors immediately', async () => {
      // Create a stub that fails with a non-retryable error
      const error = new Error('Not found');
      (error as any)['response'] = { status: 404 };
      
      const operation = sinon.stub().rejects(error);
      
      try {
        await withRetry(operation);
        expect.fail('Should have thrown an error');
      } catch (e) {
        expect(e).not.to.be.instanceOf(RetryError);
        if (e instanceof Error) {
          expect(e.message).to.equal('Not found');
        } else {
          expect.fail('Error is not an instance of Error');
        }
      }
      
      expect(operation.calledOnce).to.be.true;
    });
  });
  
  describe('bufferFromUInt64', () => {
    it('should correctly convert small numbers to Buffer', () => {
      const buffer = bufferFromUInt64(42);
      
      // Convert buffer to number for verification
      const value = buffer.readBigUInt64LE();
      expect(value.toString()).to.equal('42');
    });
    
    it('should correctly convert large numbers to Buffer', () => {
      const largeNumber = '12345678901234567890';
      const buffer = bufferFromUInt64(largeNumber);
      
      // Convert buffer to number for verification
      const value = buffer.readBigUInt64LE();
      expect(value.toString()).to.equal(largeNumber);
    });
    
    it('should throw ValidationError for invalid inputs', () => {
      expect(() => bufferFromUInt64('not-a-number')).to.throw(ValidationError);
    });
  });
  
  describe('isValidPublicKey', () => {
    it('should return true for valid public keys', () => {
      // Create a real Solana keypair and use its public key
      const keypair = Keypair.generate();
      const validKey = keypair.publicKey.toString();
      expect(isValidPublicKey(validKey)).to.be.true;
    });
    
    it('should return false for invalid public keys', () => {
      expect(isValidPublicKey('not-a-key')).to.be.false;
      expect(isValidPublicKey('')).to.be.false;
    });
  });
});