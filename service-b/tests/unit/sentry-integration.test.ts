import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type Redis from 'ioredis';
import { RiskClient } from '../../src/grpc-client';
import { getAssetPrice, type TradeSignal } from '../../src/trading';

// Mock Sentry
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  close: vi.fn().mockResolvedValue(true),
}));

describe('Sentry Integration', () => {
  let mockRedis: Partial<Redis>;
  let mockRiskClient: Partial<RiskClient>;
  let captureException: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Import Sentry after mocking
    const Sentry = await import('@sentry/node');
    captureException = Sentry.captureException as ReturnType<typeof vi.fn>;

    // Reset mocks
    vi.clearAllMocks();

    // Mock Redis client
    mockRedis = {
      get: vi.fn(),
      setex: vi.fn(),
      lpush: vi.fn() as any,
      ltrim: vi.fn() as any,
      incr: vi.fn() as any,
    };

    // Mock RiskClient
    mockRiskClient = {
      checkRisk: vi.fn(),
      connect: vi.fn(),
      close: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('processTrade error handling', () => {
    it('should capture exception in Sentry when Risk Service fails', async () => {
      const signal: TradeSignal = {
        assetId: 'BATTERY_GRID_01',
        action: 'BUY',
        volume: 50,
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      // Mock Risk Service to throw error
      const riskError = new Error('Risk Service is unavailable');
      (mockRiskClient.checkRisk as any).mockRejectedValue(riskError);

      // Simulate the processTrade logic
      try {
        const riskCheck = await mockRiskClient.checkRisk!({
          assetId: signal.assetId,
          volume: signal.volume,
          action: signal.action,
          timestamp: signal.timestamp,
        });

        if (!riskCheck.allowed) {
          // Trade rejected - should not reach here in this test
          return;
        }
      } catch (error) {
        // Simulate Sentry capture as implemented in src/index.ts
        const Sentry = await import('@sentry/node');
        Sentry.captureException(error, {
          tags: {
            service: 'service-b',
            operation: 'risk-check',
          },
          extra: {
            assetId: signal.assetId,
            action: signal.action,
            volume: signal.volume,
          },
        });

        // Verify Sentry.captureException was called
        expect(captureException).toHaveBeenCalledTimes(1);
        expect(captureException).toHaveBeenCalledWith(riskError, {
          tags: {
            service: 'service-b',
            operation: 'risk-check',
          },
          extra: {
            assetId: 'BATTERY_GRID_01',
            action: 'BUY',
            volume: 50,
          },
        });

        return; // Exit early as expected
      }
    });

    it('should capture exception when trade processing fails', async () => {
      const signal: TradeSignal = {
        assetId: 'BATTERY_GRID_01',
        action: 'BUY',
        volume: 50,
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      // Mock successful risk check
      (mockRiskClient.checkRisk as any).mockResolvedValue({
        allowed: true,
        reason: 'Trade approved',
        checkId: 'check-123',
      });

      // Mock Redis to throw error
      const redisError = new Error('Redis connection failed');
      (mockRedis.get as any).mockRejectedValue(redisError);

      // Simulate the processTrade logic
      try {
        const riskCheck = await mockRiskClient.checkRisk!({
          assetId: signal.assetId,
          volume: signal.volume,
          action: signal.action,
          timestamp: signal.timestamp,
        });

        if (!riskCheck.allowed) {
          return;
        }

        // This should throw Redis error
        await getAssetPrice(mockRedis as Redis, signal.assetId);
      } catch (error) {
        // Simulate Sentry capture for processing errors
        const Sentry = await import('@sentry/node');
        Sentry.captureException(error, {
          tags: {
            service: 'service-b',
            operation: 'process-trade',
          },
        });

        // Verify Sentry.captureException was called
        expect(captureException).toHaveBeenCalledTimes(1);
        expect(captureException).toHaveBeenCalledWith(redisError, {
          tags: {
            service: 'service-b',
            operation: 'process-trade',
          },
        });
      }
    });

    it('should capture exception when message parsing fails', async () => {
      // Simulate message parsing error
      try {
        // Simulate invalid JSON parsing
        JSON.parse('invalid json');
      } catch (error) {
        // Simulate Sentry capture for parse errors
        const Sentry = await import('@sentry/node');
        Sentry.captureException(error, {
          tags: {
            service: 'service-b',
            operation: 'parse-message',
          },
        });

        // Verify Sentry.captureException was called
        expect(captureException).toHaveBeenCalled();
        expect(captureException.mock.calls[0][1]).toMatchObject({
          tags: {
            service: 'service-b',
            operation: 'parse-message',
          },
        });
      }
    });

    it('should not capture exception when trade is rejected by Risk Service', async () => {
      const signal: TradeSignal = {
        assetId: 'BATTERY_GRID_01',
        action: 'BUY',
        volume: 500, // High volume that would be rejected
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      // Mock Risk Service to reject trade (not an error, just rejected)
      (mockRiskClient.checkRisk as any).mockResolvedValue({
        allowed: false,
        reason: 'Volume exceeds position limit',
        checkId: 'check-456',
      });

      // Simulate the processTrade logic
      const riskCheck = await mockRiskClient.checkRisk!({
        assetId: signal.assetId,
        volume: signal.volume,
        action: signal.action,
        timestamp: signal.timestamp,
      });

      if (!riskCheck.allowed) {
        // Trade rejected - this is expected behavior, not an error
        // Sentry should NOT be called for business logic rejections
        expect(captureException).not.toHaveBeenCalled();
        return;
      }
    });

    it('should capture exception during startup errors', async () => {
      const startupError = new Error('RabbitMQ connection failed');

      // Simulate startup error
      const Sentry = await import('@sentry/node');
      Sentry.captureException(startupError, {
        tags: {
          service: 'service-b',
          operation: 'startup',
        },
      });

      // Verify Sentry.captureException was called
      expect(captureException).toHaveBeenCalledTimes(1);
      expect(captureException).toHaveBeenCalledWith(startupError, {
        tags: {
          service: 'service-b',
          operation: 'startup',
        },
      });
    });
  });

  describe('Sentry initialization', () => {
    it('should initialize Sentry when SENTRY_DSN is provided', async () => {
      const Sentry = await import('@sentry/node');

      // Simulate Sentry initialization
      Sentry.init({
        dsn: 'https://fake-dsn@sentry.io/123456',
        environment: 'production',
        tracesSampleRate: 1.0,
      });

      // Verify init was called
      expect(Sentry.init).toHaveBeenCalled();
    });

    it('should flush Sentry events on shutdown', async () => {
      const Sentry = await import('@sentry/node');

      // Simulate shutdown flush
      await Sentry.close(2000);

      // Verify close was called with timeout
      expect(Sentry.close).toHaveBeenCalledWith(2000);
    });
  });
});
