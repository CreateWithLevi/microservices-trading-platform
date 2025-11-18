/**
 * Prometheus Metrics for Service B (Trade Execution Service)
 *
 * Exposes application metrics for monitoring trade processing performance
 */

import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

// Create a custom registry
export const register = new Registry();

// Collect default Node.js metrics (memory, CPU, event loop, etc.)
collectDefaultMetrics({ register });

/**
 * Counter: Total trades processed
 *
 * Labels:
 * - action: BUY or SELL
 * - asset_id: Trading asset identifier
 * - status: approved, rejected, error
 */
export const tradesProcessedTotal = new Counter({
  name: 'trades_processed_total',
  help: 'Total number of trades processed by Service B',
  labelNames: ['action', 'asset_id', 'status'],
  registers: [register],
});

/**
 * Histogram: Trade processing duration
 *
 * Tracks time spent processing each trade (including risk check, Redis ops, etc.)
 *
 * Buckets: 0.01s, 0.05s, 0.1s, 0.5s, 1s, 2s, 5s
 */
export const processingDurationSeconds = new Histogram({
  name: 'processing_duration_seconds',
  help: 'Time spent processing a trade signal in seconds',
  labelNames: ['action', 'asset_id', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0],
  registers: [register],
});

/**
 * Counter: Risk check results
 *
 * Labels:
 * - result: allowed, rejected, error
 */
export const riskChecksTotal = new Counter({
  name: 'risk_checks_total',
  help: 'Total number of risk checks performed',
  labelNames: ['result'],
  registers: [register],
});

/**
 * Counter: Redis cache hits/misses
 *
 * Labels:
 * - operation: price_cache, trade_history
 * - result: hit, miss
 */
export const redisCacheTotal = new Counter({
  name: 'redis_cache_total',
  help: 'Total number of Redis cache operations',
  labelNames: ['operation', 'result'],
  registers: [register],
});
