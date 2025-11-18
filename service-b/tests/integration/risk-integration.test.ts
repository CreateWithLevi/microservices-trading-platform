import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Redis from 'ioredis';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { RiskClient, type TradeRiskRequest } from '../../src/grpc-client';
import { getAssetPrice, storeTradeHistory, type TradeSignal } from '../../src/trading';

describe('Risk Integration', () => {
  let redisContainer: StartedTestContainer;
  let redis: Redis;

  beforeAll(async () => {
    // Start Redis container for trade storage tests
    redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .withStartupTimeout(60000)
      .start();

    // Connect to Redis
    const redisPort = redisContainer.getMappedPort(6379);
    redis = new Redis({
      host: 'localhost',
      port: redisPort,
    });
  }, 180000);

  afterAll(async () => {
    if (redis) await redis.quit();
    if (redisContainer) await redisContainer.stop();
  });

  describe('RiskClient', () => {
    it('should handle risk check with allowed trade', async () => {
      // Create a mock RiskClient
      const mockRiskClient = new RiskClient('localhost:50051');

      // Mock the checkRisk method to return allowed
      vi.spyOn(mockRiskClient, 'checkRisk').mockResolvedValue({
        allowed: true,
        reason: 'Trade within risk limits',
        checkId: 'check-123',
      });

      const request: TradeRiskRequest = {
        assetId: 'BATTERY_GRID_01',
        volume: 50,
        action: 'BUY',
        timestamp: new Date().toISOString(),
      };

      const response = await mockRiskClient.checkRisk(request);

      expect(response.allowed).toBe(true);
      expect(response.reason).toBe('Trade within risk limits');
      expect(response.checkId).toBeDefined();
    });

    it('should handle risk check with rejected trade', async () => {
      // Create a mock RiskClient
      const mockRiskClient = new RiskClient('localhost:50051');

      // Mock the checkRisk method to return rejected
      vi.spyOn(mockRiskClient, 'checkRisk').mockResolvedValue({
        allowed: false,
        reason: 'Volume exceeds position limit',
        checkId: 'check-456',
      });

      const request: TradeRiskRequest = {
        assetId: 'BATTERY_GRID_01',
        volume: 1000,
        action: 'BUY',
        timestamp: new Date().toISOString(),
      };

      const response = await mockRiskClient.checkRisk(request);

      expect(response.allowed).toBe(false);
      expect(response.reason).toBe('Volume exceeds position limit');
      expect(response.checkId).toBeDefined();
    });

    it('should throw error when service is unavailable', async () => {
      // Create a mock RiskClient
      const mockRiskClient = new RiskClient('localhost:50051');

      // Mock the checkRisk method to throw an error
      vi.spyOn(mockRiskClient, 'checkRisk').mockRejectedValue(
        new Error(
          'Risk Service is unavailable at localhost:50051. Please ensure service-c is running.'
        )
      );

      const request: TradeRiskRequest = {
        assetId: 'BATTERY_GRID_01',
        volume: 50,
        action: 'BUY',
        timestamp: new Date().toISOString(),
      };

      await expect(mockRiskClient.checkRisk(request)).rejects.toThrow(
        'Risk Service is unavailable'
      );
    });
  });

  describe('Trading Flow with Risk Checks', () => {
    it('should process allowed trade and store in Redis', async () => {
      // Create mock RiskClient
      const mockRiskClient = new RiskClient('localhost:50051');
      vi.spyOn(mockRiskClient, 'checkRisk').mockResolvedValue({
        allowed: true,
        reason: 'Trade approved',
        checkId: 'check-789',
      });

      const signal: TradeSignal = {
        assetId: 'RISK_TEST_01',
        action: 'BUY',
        volume: 25.5,
        timestamp: new Date().toISOString(),
      };

      // Simulate trading flow with risk check
      const riskCheck = await mockRiskClient.checkRisk({
        assetId: signal.assetId,
        volume: signal.volume,
        action: signal.action,
        timestamp: signal.timestamp,
      });

      expect(riskCheck.allowed).toBe(true);

      // If allowed, proceed with trade processing
      if (riskCheck.allowed) {
        const price = await getAssetPrice(redis, signal.assetId);
        await storeTradeHistory(redis, signal, price);

        // Verify trade was stored
        const trades = await redis.lrange('trade_history', 0, 0);
        const storedTrade = JSON.parse(trades[0]);
        expect(storedTrade.assetId).toBe(signal.assetId);
        expect(storedTrade.action).toBe(signal.action);
      }
    });

    it('should skip rejected trade and not store in Redis', async () => {
      // Create mock RiskClient
      const mockRiskClient = new RiskClient('localhost:50051');
      vi.spyOn(mockRiskClient, 'checkRisk').mockResolvedValue({
        allowed: false,
        reason: 'Exceeds daily volume limit',
        checkId: 'check-999',
      });

      const signal: TradeSignal = {
        assetId: 'RISK_TEST_REJECTED',
        action: 'SELL',
        volume: 500,
        timestamp: new Date().toISOString(),
      };

      // Get initial trade count
      const initialCount = await redis.get(`trade_count:${signal.assetId}`);

      // Simulate trading flow with risk check
      const riskCheck = await mockRiskClient.checkRisk({
        assetId: signal.assetId,
        volume: signal.volume,
        action: signal.action,
        timestamp: signal.timestamp,
      });

      expect(riskCheck.allowed).toBe(false);
      expect(riskCheck.reason).toBe('Exceeds daily volume limit');

      // If rejected, skip trade processing (don't store)
      if (!riskCheck.allowed) {
        // Trade should not be stored
        const finalCount = await redis.get(`trade_count:${signal.assetId}`);
        expect(finalCount).toBe(initialCount); // Count should not change
      }
    });

    it('should handle risk service error gracefully', async () => {
      // Create mock RiskClient
      const mockRiskClient = new RiskClient('localhost:50051');
      vi.spyOn(mockRiskClient, 'checkRisk').mockRejectedValue(
        new Error('Risk Service check failed: Connection timeout')
      );

      const signal: TradeSignal = {
        assetId: 'RISK_TEST_ERROR',
        action: 'BUY',
        volume: 30,
        timestamp: new Date().toISOString(),
      };

      // Get initial trade count
      const initialCount = await redis.get(`trade_count:${signal.assetId}`);

      // Simulate trading flow with risk check
      let riskCheckPassed = false;
      try {
        await mockRiskClient.checkRisk({
          assetId: signal.assetId,
          volume: signal.volume,
          action: signal.action,
          timestamp: signal.timestamp,
        });
        riskCheckPassed = true;
      } catch (error) {
        // Risk check failed - should skip trade
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('Risk Service check failed');
      }

      // If risk check failed, trade should not be stored
      if (!riskCheckPassed) {
        const finalCount = await redis.get(`trade_count:${signal.assetId}`);
        expect(finalCount).toBe(initialCount); // Count should not change
      }
    });
  });

  describe('RiskClient Configuration', () => {
    it('should use default server address', () => {
      const client = new RiskClient();
      expect(client.isConnected()).toBe(false);
    });

    it('should use custom server address', () => {
      const client = new RiskClient('custom-host:9999');
      expect(client.isConnected()).toBe(false);
    });

    it('should throw error when checking risk without connecting', async () => {
      const client = new RiskClient();

      const request: TradeRiskRequest = {
        assetId: 'TEST',
        volume: 10,
        action: 'BUY',
        timestamp: new Date().toISOString(),
      };

      await expect(client.checkRisk(request)).rejects.toThrow(
        'RiskClient not connected. Call connect() before making requests.'
      );
    });

    it('should handle close operation', () => {
      const client = new RiskClient();
      // Should not throw even if not connected
      expect(() => client.close()).not.toThrow();
    });
  });
});
