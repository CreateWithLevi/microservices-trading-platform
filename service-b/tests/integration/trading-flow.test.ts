import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import amqp from 'amqplib';
import Redis from 'ioredis';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import {
  getAssetPrice,
  storeTradeHistory,
  calculateTradeValue,
  type TradeSignal,
} from '../../src/trading';

describe('Trading Flow Integration', () => {
  let rabbitContainer: StartedTestContainer;
  let redisContainer: StartedTestContainer;
  let connection: any;
  let channel: any;
  let redis: Redis;
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
  }, 180000);

  afterAll(async () => {
    if (channel) await channel.close();
    if (connection) await connection.close();
    if (redis) await redis.quit();
    if (rabbitContainer) await rabbitContainer.stop();
    if (redisContainer) await redisContainer.stop();
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

    // 1. Publish signal to RabbitMQ (simulating Service A)
    channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(signal)));

    // 2. Consume signal from RabbitMQ (simulating Service B)
    const processedSignal = await new Promise<TradeSignal>((resolve) => {
      channel.consume(QUEUE_NAME, async (msg: any) => {
        if (msg) {
          const content = msg.content.toString();
          const receivedSignal = JSON.parse(content) as TradeSignal;

          // 3. Get price from Redis cache
          const price = await getAssetPrice(redis, receivedSignal.assetId);

          // 4. Store trade in Redis
          await storeTradeHistory(redis, receivedSignal, price);

          channel.ack(msg);
          resolve(receivedSignal);
        }
      });
    });

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

    // Publish all signals
    for (const signal of signals) {
      channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(signal)));
    }

    // Wait for all messages to be processed
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(`Timeout: Only processed ${processedSignals.length} of ${signals.length} messages`)
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
});
