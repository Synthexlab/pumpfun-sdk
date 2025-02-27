import { expect } from 'chai';
import sinon from 'sinon';
import axios from 'axios';
import { getCoinData, getMarketOverview, getTokenTransactionHistory, getBuyPriceQuote, getSellPriceQuote } from '../src/api';
import { APIError } from '../src/errors';
import * as utils from '../src/utils';

describe('API Functions', () => {
  let axiosStub: sinon.SinonStub;

  beforeEach(() => {
    // Create a stub for axios.get
    axiosStub = sinon.stub(axios, 'get');
  });

  afterEach(() => {
    // Restore original behavior
    axiosStub.restore();
  });

  describe('getCoinData', () => {
    it('should return coin data when API call is successful', async () => {
      // Sample coin data
      const sampleCoinData = {
        id: '1',
        mint: 'mock-mint-address',
        name: 'Test Coin',
        symbol: 'TEST',
        ticker: 'TEST',
        image: 'https://example.com/image.png',
        bonding_curve: 'mock-bonding-curve',
        associated_bonding_curve: 'mock-associated-bonding-curve',
        virtual_sol_reserves: 1000,
        virtual_token_reserves: 100000,
        price_sol: 0.01,
        liquidity_sol: 500,
        volume_24h_sol: 100
      };

      // Configure axiosStub to return a successful response
      axiosStub.resolves({ status: 200, data: sampleCoinData });

      // Call the function
      const result = await getCoinData('mock-mint-address');

      // Verify the result
      expect(result).to.deep.equal(sampleCoinData);
      expect(axiosStub.calledOnce).to.be.true;
      expect(axiosStub.firstCall.args[0]).to.include('coins/mock-mint-address');
    });

    it('should throw APIError when API returns non-200 status', async () => {
      // Configure axiosStub to return a non-200 response
      axiosStub.resolves({ status: 404, data: null });

      // Verify that the function throws an APIError
      try {
        await getCoinData('mock-mint-address');
        expect.fail('Function should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(APIError);
        expect((error as APIError).statusCode).to.equal(404);
      }
    });

    it('should handle network errors properly', async function() {
      this.timeout(10000); // Increase timeout to 10 seconds
      
      // Configure axiosStub to throw a network error
      axiosStub.rejects(new Error('Network Error'));
      
      // Stub withRetry to not actually retry but immediately pass through errors
      const withRetryStub = sinon.stub(utils, 'withRetry').callsFake(async (fn, options) => {
        try {
          return await fn();
        } catch (error) {
          throw error;
        }
      });

      // Verify that the function throws an APIError
      try {
        await getCoinData('mock-mint-address');
        expect.fail('Function should have thrown an error');
      } catch (error) {
        expect(error).to.be.instanceOf(APIError);
        expect((error as Error).message).to.include('Network Error');
      } finally {
        withRetryStub.restore();
      }
    });
  });

  describe('getMarketOverview', () => {
    it('should return market overview data when API call is successful', async () => {
      // Sample market data
      const sampleMarketData = {
        totalTokens: 100,
        totalVolume24h: 5000,
        tokens: [
          {
            mint: 'mock-mint-1',
            name: 'Test Coin 1',
            symbol: 'TEST1',
            price_sol: 0.01,
            volume_24h_sol: 100
          },
          {
            mint: 'mock-mint-2',
            name: 'Test Coin 2',
            symbol: 'TEST2',
            price_sol: 0.02,
            volume_24h_sol: 200
          }
        ]
      };

      // Configure axiosStub to return a successful response
      axiosStub.resolves({ status: 200, data: sampleMarketData });

      // Call the function with limit=2
      const result = await getMarketOverview();

      // Verify the result
      expect(result).to.deep.equal(sampleMarketData);
      expect(axiosStub.calledOnce).to.be.true;
    });
  });

  describe('Price Quote Functions', () => {
    // Sample coin data for testing quote functions
    const sampleCoinData = {
      id: '1',
      mint: 'mock-mint-address',
      name: 'Test Coin',
      symbol: 'TEST',
      virtual_sol_reserves: 1000,
      virtual_token_reserves: 100000,
      price_sol: 0.01,
      liquidity_sol: 500,
      volume_24h_sol: 100
    };

    beforeEach(() => {
      // Configure getCoinData to return sample data
      axiosStub.resolves({ status: 200, data: sampleCoinData });
    });

    it('should calculate buy price quote correctly', async () => {
      const result = await getBuyPriceQuote('mock-mint-address', 1);
      
      expect(result.inputAmount).to.equal(1);
      expect(result.expectedOutputAmount).to.equal(100); // 1 * 100000 / 1000
      expect(result.price).to.equal(0.01);
      expect(result.priceImpact).to.equal(1/500);
    });

    it('should calculate sell price quote correctly', async () => {
      const result = await getSellPriceQuote('mock-mint-address', 10000);
      
      expect(result.inputAmount).to.equal(10000);
      expect(result.expectedOutputAmount).to.equal(100); // 10000 * 1000 / 100000
      expect(result.price).to.equal(0.01);
      expect(result.priceImpact).to.equal(100/500);
    });
  });
});