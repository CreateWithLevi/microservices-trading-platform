import { Pool, type PoolClient, type PoolConfig } from 'pg';
import type { TradeSignal } from './trading';

/**
 * Configuration for TimescaleDB connection
 */
export interface TimescaleConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max?: number; // Maximum number of clients in pool
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

/**
 * Trade data to be stored in TimescaleDB
 */
export interface TradeData {
  tradeTime: Date;
  assetId: string;
  action: 'BUY' | 'SELL';
  volume: number;
  price: number;
  totalValue: number;
  riskCheckId?: string;
  riskApproved: boolean;
  serviceInstance?: string;
}

/**
 * Repository class for TimescaleDB operations
 * Handles long-term trade history storage with time-series optimization
 *
 * Separation of concerns:
 * - Redis: Hot data (caching, recent trades, counters)
 * - TimescaleDB: Cold/Analytical data (long-term storage, time-series queries)
 */
export class TimescaleRepository {
  private pool: Pool;
  private connected: boolean = false;

  constructor(config: TimescaleConfig) {
    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: config.max || 20, // Maximum pool size
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
    };

    this.pool = new Pool(poolConfig);

    // Handle pool errors
    this.pool.on('error', (err: Error) => {
      console.error('[TimescaleDB] Unexpected pool error:', err.message);
    });
  }

  /**
   * Initialize connection and verify database connectivity
   */
  async connect(): Promise<void> {
    try {
      // Test connection with a simple query
      const client = await this.pool.connect();
      const result = await client.query<{ now: Date }>('SELECT NOW()');
      client.release();

      this.connected = true;
      console.log('[TimescaleDB] Connected successfully at', result.rows[0]?.now);
    } catch (error) {
      this.connected = false;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[TimescaleDB] Connection failed:', errorMessage);
      throw new Error(`Failed to connect to TimescaleDB: ${errorMessage}`);
    }
  }

  /**
   * Check if repository is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Store a trade record in TimescaleDB
   * This is designed to be called asynchronously (fire-and-forget)
   *
   * @param trade - Trade data to store
   * @returns Promise that resolves when trade is stored
   */
  async storeTrade(trade: TradeData): Promise<void> {
    if (!this.connected) {
      console.warn('[TimescaleDB] Not connected. Skipping trade storage.');
      return;
    }

    const query = `
      INSERT INTO trades (
        trade_time,
        asset_id,
        action,
        volume,
        price,
        total_value,
        risk_check_id,
        risk_approved,
        service_instance
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    const values = [
      trade.tradeTime,
      trade.assetId,
      trade.action,
      trade.volume,
      trade.price,
      trade.totalValue,
      trade.riskCheckId || null,
      trade.riskApproved,
      trade.serviceInstance || null,
    ];

    try {
      await this.pool.query(query, values);
      console.log(
        `[TimescaleDB] Trade stored: ${trade.action} ${trade.volume} MWh of ${trade.assetId} @ $${trade.price}`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[TimescaleDB] Failed to store trade:', errorMessage);
      // Don't throw error - fire-and-forget pattern
      // We don't want TimescaleDB failures to block trade processing
    }
  }

  /**
   * Store trade from TradeSignal with additional metadata
   * Convenience method for converting TradeSignal to TradeData
   *
   * @param signal - Trade signal from RabbitMQ
   * @param price - Asset price at trade time
   * @param riskCheckId - Optional risk check ID from Risk Service
   */
  async storeTradeFromSignal(
    signal: TradeSignal,
    price: number,
    riskCheckId?: string
  ): Promise<void> {
    const tradeData: TradeData = {
      tradeTime: new Date(signal.timestamp),
      assetId: signal.assetId,
      action: signal.action,
      volume: signal.volume,
      price: price,
      totalValue: signal.volume * price,
      riskCheckId: riskCheckId,
      riskApproved: true, // Only approved trades are stored
      serviceInstance: process.env.HOSTNAME || 'unknown',
    };

    await this.storeTrade(tradeData);
  }

  /**
   * Query trades for a specific asset within a time range
   * Example analytical query for demonstrating TimescaleDB capabilities
   *
   * @param assetId - Asset ID to query
   * @param startTime - Start of time range
   * @param endTime - End of time range
   * @returns Array of trade records
   */
  async getTradesByAsset(assetId: string, startTime: Date, endTime: Date): Promise<TradeData[]> {
    if (!this.connected) {
      throw new Error('TimescaleDB not connected');
    }

    const query = `
      SELECT
        trade_time,
        asset_id,
        action,
        volume,
        price,
        total_value,
        risk_check_id,
        risk_approved,
        service_instance
      FROM trades
      WHERE asset_id = $1
        AND trade_time >= $2
        AND trade_time <= $3
      ORDER BY trade_time DESC
    `;

    interface TradeRow {
      trade_time: Date;
      asset_id: string;
      action: string;
      volume: string;
      price: string;
      total_value: string;
      risk_check_id: string | null;
      risk_approved: boolean;
      service_instance: string | null;
    }

    try {
      const result = await this.pool.query<TradeRow>(query, [assetId, startTime, endTime]);

      return result.rows.map((row) => ({
        tradeTime: row.trade_time,
        assetId: row.asset_id,
        action: row.action as 'BUY' | 'SELL',
        volume: parseFloat(row.volume),
        price: parseFloat(row.price),
        totalValue: parseFloat(row.total_value),
        riskCheckId: row.risk_check_id ?? undefined,
        riskApproved: row.risk_approved,
        serviceInstance: row.service_instance ?? undefined,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[TimescaleDB] Query failed:', errorMessage);
      throw error;
    }
  }

  /**
   * Get total trade count (for testing/monitoring)
   */
  async getTradeCount(): Promise<number> {
    if (!this.connected) {
      return 0;
    }

    try {
      const result = await this.pool.query<{ count: string }>('SELECT COUNT(*) FROM trades');
      return parseInt(result.rows[0]?.count ?? '0');
    } catch (error) {
      console.error('[TimescaleDB] Failed to get trade count:', error);
      return 0;
    }
  }

  /**
   * Close database connection pool
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.connected = false;
      console.log('[TimescaleDB] Disconnected successfully');
    }
  }

  /**
   * Get a client from the pool (for advanced use cases)
   * Remember to call client.release() when done
   */
  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }
}

/**
 * Create TimescaleRepository instance from environment variables
 */
export function createTimescaleRepository(): TimescaleRepository {
  const config: TimescaleConfig = {
    host: process.env.TIMESCALE_HOST || 'localhost',
    port: parseInt(process.env.TIMESCALE_PORT || '5432'),
    database: process.env.TIMESCALE_DATABASE || 'trading_platform',
    user: process.env.TIMESCALE_USER || 'trading_user',
    password: process.env.TIMESCALE_PASSWORD || 'trading_pass',
  };

  return new TimescaleRepository(config);
}
