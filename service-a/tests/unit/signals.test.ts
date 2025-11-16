import { describe, it, expect } from 'vitest';
import { generateMockSignal, createTradeSignal } from '../../src/signals';

describe('signals', () => {
  describe('generateMockSignal', () => {
    it('should generate a valid trade signal', () => {
      const signal = generateMockSignal();

      expect(signal).toHaveProperty('assetId');
      expect(signal).toHaveProperty('action');
      expect(signal).toHaveProperty('volume');
      expect(signal).toHaveProperty('timestamp');
    });

    it('should have assetId as BATTERY_GRID_01', () => {
      const signal = generateMockSignal();
      expect(signal.assetId).toBe('BATTERY_GRID_01');
    });

    it('should have action as either BUY or SELL', () => {
      const signal = generateMockSignal();
      expect(['BUY', 'SELL']).toContain(signal.action);
    });

    it('should have volume between 10 and 110 MWh', () => {
      const signal = generateMockSignal();
      expect(signal.volume).toBeGreaterThanOrEqual(10);
      expect(signal.volume).toBeLessThanOrEqual(110);
    });

    it('should have a valid ISO timestamp', () => {
      const signal = generateMockSignal();
      const timestamp = new Date(signal.timestamp);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.toISOString()).toBe(signal.timestamp);
    });

    it('should generate different volumes on multiple calls', () => {
      const signals = Array.from({ length: 10 }, () => generateMockSignal());
      const volumes = signals.map((s) => s.volume);
      const uniqueVolumes = new Set(volumes);

      // At least some volumes should be different (very unlikely to be all the same)
      expect(uniqueVolumes.size).toBeGreaterThan(1);
    });
  });

  describe('createTradeSignal', () => {
    it('should create a signal with specified values', () => {
      const signal = createTradeSignal('ASSET_123', 'BUY', 50.5);

      expect(signal.assetId).toBe('ASSET_123');
      expect(signal.action).toBe('BUY');
      expect(signal.volume).toBe(50.5);
      expect(signal.timestamp).toBeDefined();
    });

    it('should use provided timestamp if given', () => {
      const customTimestamp = '2024-01-01T00:00:00.000Z';
      const signal = createTradeSignal('ASSET_123', 'SELL', 100, customTimestamp);

      expect(signal.timestamp).toBe(customTimestamp);
    });

    it('should generate current timestamp if not provided', () => {
      const before = Date.now();
      const signal = createTradeSignal('ASSET_123', 'BUY', 75);
      const after = Date.now();
      const signalTime = new Date(signal.timestamp).getTime();

      expect(signalTime).toBeGreaterThanOrEqual(before);
      expect(signalTime).toBeLessThanOrEqual(after);
    });
  });
});
