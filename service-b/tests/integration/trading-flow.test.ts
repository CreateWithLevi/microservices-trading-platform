import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import amqp from 'amqplib';
import Redis from 'ioredis';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { Pool } from 'pg';
import {
  getAssetPrice,
  storeTradeHistory,
  calculateTradeValue,
  type TradeSignal,
} from '../../src/trading';
import { TimescaleRepository } from '../../src/timescale-repository';

describe('Trading Flow Integration', () => {
  let rabbitContainer: StartedTestContainer;
  let redisContainer: StartedTestContainer;
  let timescaleContainer: StartedTestContainer;
  let connection: any;
  let channel: any;
  let redis: Redis;
  let timescaleRepo: TimescaleRepository;
  let pgPool: Pool;
  const QUEUE_NAME = 'trading_signals';

  beforeAll(async () => {
    // Start RabbitMQ container
    rabbitContainer = await new GenericContainer('rabbitmq:3-management')
      .withExposedPorts(5672, 15672)
      .withStartupTimeout(120000)
      .start();

    // Start Redis container
    redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .withStartupTimeout(60000)
      .start();

    // Start TimescaleDB container (PostgreSQL with TimescaleDB extension)
    timescaleContainer = await new GenericContainer('timescale/timescaledb:latest-pg16')
      .withExposedPorts(5432)
      .withEnvironment({
        POSTGRES_DB: 'trading_platform_test',
        POSTGRES_USER: 'test_user',
        POSTGRES_PASSWORD: 'test_pass',
      })
      .withStartupTimeout(120000)
      .start();

    // Connect to RabbitMQ
    const rabbitMQUrl = `amqp://localhost:${rabbitContainer.getMappedPort(5672)}`;
    connection = await amqp.connect(rabbitMQUrl);
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: false });

    // Connect to Redis
    const redisPort = redisContainer.getMappedPort(6379);
    redis = new Redis({
      host: 'localhost',
      port: redisPort,
    });

    // Connect to TimescaleDB and initialize schema
    const timescalePort = timescaleContainer.getMappedPort(5432);
    timescaleRepo = new TimescaleRepository({
      host: 'localhost',
      port: timescalePort,
      database: 'trading_platform_test',
      user: 'test_user',
      password: 'test_pass',
    });

    await timescaleRepo.connect();

    // Initialize database schema manually (since we don't have init.sql in tests)
    pgPool = new Pool({
      host: 'localhost',
      port: timescalePort,
      database: 'trading_platform_test',
      user: 'test_user',
      password: 'test_pass',
    });

    // Create TimescaleDB extension and trades table
    await pgPool.query('CREATE EXTENSION IF NOT EXISTS timescaledb');
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS trades (
        trade_time TIMESTAMPTZ NOT NULL,
        trade_id UUID DEFAULT gen_random_uuid(),
        asset_id VARCHAR(50) NOT NULL,
        action VARCHAR(10) NOT NULL CHECK (action IN ('BUY', 'SELL')),
        volume DECIMAL(15, 4) NOT NULL CHECK (volume > 0),
        price DECIMAL(15, 2) NOT NULL CHECK (price > 0),
        total_value DECIMAL(20, 2) NOT NULL,
        risk_check_id VARCHAR(100),
        risk_approved BOOLEAN NOT NULL DEFAULT true,
        processed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        service_instance VARCHAR(100),
        PRIMARY KEY (trade_time, trade_id)
      )
    `);

    // Convert to hypertable
    await pgPool.query(
      "SELECT create_hypertable('trades', 'trade_time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day')"
    );
  }, 240000);

  afterAll(async () => {
    if (channel) await channel.close();
    if (connection) await connection.close();
    if (redis) await redis.quit();
    if (timescaleRepo) await timescaleRepo.disconnect();
    if (pgPool) await pgPool.end();
    if (rabbitContainer) await rabbitContainer.stop();
    if (redisContainer) await redisContainer.stop();
    if (timescaleContainer) await timescaleContainer.stop();
  });

  it('should cache asset prices in Redis', async () => {
    const assetId = 'TEST_ASSET_01';

    // First call - cache miss
    const price1 = await getAssetPrice(redis, assetId);
    expect(price1).toBeGreaterThanOrEqual(50);
    expect(price1).toBeLessThanOrEqual(150);

    // Second call - cache hit
    const price2 = await getAssetPrice(redis, assetId);
    expect(price2).toBe(price1); // Should return same cached price

    // Verify price is cached in Redis
    const cachedPrice = await redis.get(`price:${assetId}`);
    expect(cachedPrice).toBe(price1.toString());
  });

  it('should store trade history in Redis', async () => {
    const signal: TradeSignal = {
      assetId: 'BATTERY_GRID_01',
      action: 'BUY',
      volume: 50.5,
      timestamp: new Date().toISOString(),
    };
    const price = 100.25;

    await storeTradeHistory(redis, signal, price);

    // Verify trade is stored in Redis list
    const trades = await redis.lrange('trade_history', 0, 0);
    expect(trades).toHaveLength(1);

    const storedTrade = JSON.parse(trades[0]);
    expect(storedTrade.assetId).toBe(signal.assetId);
    expect(storedTrade.action).toBe(signal.action);
    expect(storedTrade.volume).toBe(signal.volume);
    expect(storedTrade.price).toBe(price);
    expect(storedTrade.totalValue).toBe(calculateTradeValue(signal.volume, price));
  });

  it('should increment trade counter for asset', async () => {
    const assetId = 'COUNTER_TEST_ASSET';
    const signal: TradeSignal = {
      assetId,
      action: 'SELL',
      volume: 75,
      timestamp: new Date().toISOString(),
    };
    const price = 125;

    // Store first trade
    await storeTradeHistory(redis, signal, price);
    const count1 = await redis.get(`trade_count:${assetId}`);
    expect(count1).toBe('1');

    // Store second trade
    await storeTradeHistory(redis, signal, price);
    const count2 = await redis.get(`trade_count:${assetId}`);
    expect(count2).toBe('2');
  });

  it('should limit trade history to last 100 trades', async () => {
    const signal: TradeSignal = {
      assetId: 'HISTORY_TEST',
      action: 'BUY',
      volume: 10,
      timestamp: new Date().toISOString(),
    };

    // Store 110 trades
    for (let i = 0; i < 110; i++) {
      await storeTradeHistory(redis, signal, 100);
    }

    // Verify only 100 trades are kept
    const tradeCount = await redis.llen('trade_history');
    expect(tradeCount).toBeLessThanOrEqual(100);
  });

  it('should process complete trading flow: message → price fetch → storage', async () => {
    const signal: TradeSignal = {
      assetId: 'FLOW_TEST_ASSET',
      action: 'BUY',
      volume: 45.5,
      timestamp: new Date().toISOString(),
    };

    // 2. Consume signal from RabbitMQ (simulating Service B)
    const { processedSignal, consumerTag } = await new Promise<{
      processedSignal: TradeSignal;
      consumerTag: string;
    }>((resolve) => {
      let tag: string;
      void channel
        .consume(
          QUEUE_NAME,
          async (msg: any) => {
            if (msg) {
              const content = msg.content.toString();
              const receivedSignal = JSON.parse(content) as TradeSignal;

              // 3. Get price from Redis cache
              const price = await getAssetPrice(redis, receivedSignal.assetId);

              // 4. Store trade in Redis
              await storeTradeHistory(redis, receivedSignal, price);

              channel.ack(msg);
              resolve({ processedSignal: receivedSignal, consumerTag: tag });
            }
          },
          { noAck: false }
        )
        .then((result: any) => {
          tag = result.consumerTag;
          // 1. Publish signal to RabbitMQ (simulating Service A)
          channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(signal)));
        });
    });

    // Cancel consumer
    await channel.cancel(consumerTag);

    expect(processedSignal).toEqual(signal);

    // 5. Verify trade was stored in Redis
    const trades = await redis.lrange('trade_history', 0, 0);
    const latestTrade = JSON.parse(trades[0]);
    expect(latestTrade.assetId).toBe(signal.assetId);
    expect(latestTrade.action).toBe(signal.action);
    expect(latestTrade.volume).toBe(signal.volume);

    // 6. Verify price was cached
    const cachedPrice = await redis.get(`price:${signal.assetId}`);
    expect(cachedPrice).toBeDefined();

    // 7. Verify trade counter was incremented
    const tradeCount = await redis.get(`trade_count:${signal.assetId}`);
    expect(tradeCount).toBeDefined();
    expect(parseInt(tradeCount as string)).toBeGreaterThan(0);
  });

  it('should handle concurrent message processing', async () => {
    // Purge queue first to ensure it's empty
    await channel.purgeQueue(QUEUE_NAME);

    const signals: TradeSignal[] = [
      {
        assetId: 'CONCURRENT_01',
        action: 'BUY',
        volume: 10,
        timestamp: new Date().toISOString(),
      },
      {
        assetId: 'CONCURRENT_02',
        action: 'SELL',
        volume: 20,
        timestamp: new Date().toISOString(),
      },
      {
        assetId: 'CONCURRENT_03',
        action: 'BUY',
        volume: 30,
        timestamp: new Date().toISOString(),
      },
    ];

    const processedSignals: TradeSignal[] = [];

    // Set up a single consumer to handle all messages
    const consumeResult = await channel.consume(
      QUEUE_NAME,
      async (msg: any) => {
        if (msg) {
          const content = msg.content.toString();
          const receivedSignal = JSON.parse(content) as TradeSignal;

          const price = await getAssetPrice(redis, receivedSignal.assetId);
          await storeTradeHistory(redis, receivedSignal, price);

          channel.ack(msg);
          processedSignals.push(receivedSignal);
        }
      },
      { noAck: false }
    );

    // Give consumer time to register
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Publish all signals
    for (const signal of signals) {
      channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(signal)));
    }

    // Wait for all messages to be processed
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Timeout: Only processed ${processedSignals.length} of ${signals.length} messages`
          )
        );
      }, 10000);

      const checkInterval = setInterval(() => {
        if (processedSignals.length === signals.length) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
    });

    // Cancel consumer
    await channel.cancel(consumeResult.consumerTag);

    expect(processedSignals).toHaveLength(signals.length);
    expect(processedSignals).toEqual(signals);

    // Verify all trades were stored
    for (const signal of signals) {
      const count = await redis.get(`trade_count:${signal.assetId}`);
      expect(count).toBeDefined();
      expect(parseInt(count as string)).toBeGreaterThan(0);
    }
  }, 15000);

  it('should handle price cache expiration', async () => {
    const assetId = 'EXPIRY_TEST_ASSET';

    // Set a price with very short TTL (1 second)
    await redis.setex(`price:${assetId}`, 1, '99.99');

    // Verify price is cached
    const price1 = await getAssetPrice(redis, assetId);
    expect(price1).toBe(99.99);

    // Wait for cache to expire
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Should generate new price after expiration
    const price2 = await getAssetPrice(redis, assetId);
    expect(price2).toBeGreaterThanOrEqual(50);
    expect(price2).toBeLessThanOrEqual(150);
    // New price is randomly generated, so it's very unlikely to be exactly 99.99
    expect(price2).not.toBe(99.99);
  });

  it('should store trades in TimescaleDB for long-term analytics', async () => {
    const signal: TradeSignal = {
      assetId: 'TIMESCALE_TEST_ASSET',
      action: 'BUY',
      volume: 42.5,
      timestamp: new Date().toISOString(),
    };
    const price = 105.75;
    const riskCheckId = 'test-risk-check-123';

    // Store trade using TimescaleRepository
    await timescaleRepo.storeTradeFromSignal(signal, price, riskCheckId);

    // Wait a bit for async write to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify trade was written to TimescaleDB
    const result = await pgPool.query(
      'SELECT * FROM trades WHERE asset_id = $1 ORDER BY trade_time DESC LIMIT 1',
      [signal.assetId]
    );

    expect(result.rows).toHaveLength(1);

    const trade = result.rows[0];
    expect(trade.asset_id).toBe(signal.assetId);
    expect(trade.action).toBe(signal.action);
    expect(parseFloat(trade.volume)).toBe(signal.volume);
    expect(parseFloat(trade.price)).toBe(price);
    expect(parseFloat(trade.total_value)).toBe(signal.volume * price);
    expect(trade.risk_check_id).toBe(riskCheckId);
    expect(trade.risk_approved).toBe(true);
    expect(trade.trade_time).toBeDefined();
    expect(trade.trade_id).toBeDefined();
  });

  it('should query trades by asset and time range from TimescaleDB', async () => {
    const assetId = 'QUERY_TEST_ASSET';
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    // Store multiple trades for the same asset
    const signals: TradeSignal[] = [
      { assetId, action: 'BUY', volume: 10, timestamp: new Date().toISOString() },
      { assetId, action: 'SELL', volume: 15, timestamp: new Date().toISOString() },
      { assetId, action: 'BUY', volume: 20, timestamp: new Date().toISOString() },
    ];

    for (const signal of signals) {
      await timescaleRepo.storeTradeFromSignal(signal, 100);
    }

    // Wait for async writes to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Query trades for this asset within time range
    const trades = await timescaleRepo.getTradesByAsset(assetId, oneHourAgo, oneHourFromNow);

    expect(trades.length).toBeGreaterThanOrEqual(signals.length);

    // Verify trade data
    const retrievedAssetIds = trades.map((t) => t.assetId);
    expect(retrievedAssetIds.every((id) => id === assetId)).toBe(true);
  });

  it('should get total trade count from TimescaleDB', async () => {
    const initialCount = await timescaleRepo.getTradeCount();
    expect(initialCount).toBeGreaterThanOrEqual(0);

    // Store a new trade
    const signal: TradeSignal = {
      assetId: 'COUNT_TEST_ASSET',
      action: 'BUY',
      volume: 25,
      timestamp: new Date().toISOString(),
    };
    await timescaleRepo.storeTradeFromSignal(signal, 100);

    // Wait for async write
    await new Promise((resolve) => setTimeout(resolve, 500));

    const newCount = await timescaleRepo.getTradeCount();
    expect(newCount).toBeGreaterThan(initialCount);
  });
});
