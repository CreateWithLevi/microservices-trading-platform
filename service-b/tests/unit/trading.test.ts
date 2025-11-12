import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Redis from 'ioredis';
import { getAssetPrice, storeTradeHistory, calculateTradeValue, type TradeSignal } from '../../src/trading';

describe('trading', () => {
  describe('calculateTradeValue', () => {
    it('should calculate trade value correctly', () => {
      expect(calculateTradeValue(100, 50.5)).toBe('5050.00');
      expect(calculateTradeValue(25.5, 100)).toBe('2550.00');
      expect(calculateTradeValue(10, 75.25)).toBe('752.50');
    });

    it('should return value with 2 decimal places', () => {
      const result = calculateTradeValue(33.33, 44.44);
      expect(result).toMatch(/^\d+\.\d{2}$/);
    });
  });

  describe('getAssetPrice', () => {
    let mockRedis: Partial<Redis>;

    beforeEach(() => {
      mockRedis = {
        get: vi.fn(),
        setex: vi.fn(),
      };
    });

    it('should return cached price if available', async () => {
      const cachedPrice = '75.50';
      (mockRedis.get as any).mockResolvedValue(cachedPrice);

      const price = await getAssetPrice(mockRedis as Redis, 'ASSET_123');

      expect(price).toBe(75.5);
      expect(mockRedis.get).toHaveBeenCalledWith('price:ASSET_123');
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('should generate and cache new price if not cached', async () => {
      (mockRedis.get as any).mockResolvedValue(null);
      (mockRedis.setex as any).mockResolvedValue('OK');

      const price = await getAssetPrice(mockRedis as Redis, 'ASSET_456');

      expect(price).toBeGreaterThanOrEqual(50);
      expect(price).toBeLessThanOrEqual(150);
      expect(mockRedis.get).toHaveBeenCalledWith('price:ASSET_456');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'price:ASSET_456',
        30,
        expect.any(String)
      );
    });

    it('should cache price for 30 seconds', async () => {
      (mockRedis.get as any).mockResolvedValue(null);
      (mockRedis.setex as any).mockResolvedValue('OK');

      await getAssetPrice(mockRedis as Redis, 'ASSET_789');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'price:ASSET_789',
        30,
        expect.any(String)
      );
    });
  });

  describe('storeTradeHistory', () => {
    let mockRedis: Partial<Redis>;
    let signal: TradeSignal;

    beforeEach(() => {
      mockRedis = {
        lpush: vi.fn(),
        ltrim: vi.fn(),
        incr: vi.fn(),
      };

      signal = {
        assetId: 'BATTERY_GRID_01',
        action: 'BUY',
        volume: 50.5,
        timestamp: '2024-01-01T00:00:00.000Z',
      };
    });

    it('should store trade record in Redis list', async () => {
      const price = 100.25;
      (mockRedis.lpush as any).mockResolvedValue(1);
      (mockRedis.ltrim as any).mockResolvedValue('OK');
      (mockRedis.incr as any).mockResolvedValue(1);

      await storeTradeHistory(mockRedis as Redis, signal, price);

      expect(mockRedis.lpush).toHaveBeenCalledWith(
        'trade_history',
        expect.stringContaining('"assetId":"BATTERY_GRID_01"')
      );
    });

    it('should include price and totalValue in trade record', async () => {
      const price = 75.50;
      (mockRedis.lpush as any).mockResolvedValue(1);
      (mockRedis.ltrim as any).mockResolvedValue('OK');
      (mockRedis.incr as any).mockResolvedValue(1);

      await storeTradeHistory(mockRedis as Redis, signal, price);

      const callArg = (mockRedis.lpush as any).mock.calls[0][1];
      const tradeRecord = JSON.parse(callArg);

      expect(tradeRecord.price).toBe(75.50);
      expect(tradeRecord.totalValue).toBe('3812.75'); // 50.5 * 75.50
    });

    it('should trim trade history to last 100 trades', async () => {
      const price = 100;
      (mockRedis.lpush as any).mockResolvedValue(1);
      (mockRedis.ltrim as any).mockResolvedValue('OK');
      (mockRedis.incr as any).mockResolvedValue(1);

      await storeTradeHistory(mockRedis as Redis, signal, price);

      expect(mockRedis.ltrim).toHaveBeenCalledWith('trade_history', 0, 99);
    });

    it('should increment trade counter for asset', async () => {
      const price = 100;
      (mockRedis.lpush as any).mockResolvedValue(1);
      (mockRedis.ltrim as any).mockResolvedValue('OK');
      (mockRedis.incr as any).mockResolvedValue(5);

      await storeTradeHistory(mockRedis as Redis, signal, price);

      expect(mockRedis.incr).toHaveBeenCalledWith('trade_count:BATTERY_GRID_01');
    });
  });
});
