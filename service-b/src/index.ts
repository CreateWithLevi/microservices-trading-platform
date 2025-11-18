import amqp from 'amqplib';
import Redis from 'ioredis';
import { getAssetPrice, storeTradeHistory, type TradeSignal } from './trading';
import { RiskClient } from './grpc-client';
import { createTimescaleRepository, type TimescaleRepository } from './timescale-repository';

// --- Configuration ---
// Must match Service A's configuration exactly
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost'; // RabbitMQ server URL (from env or default to localhost)
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'; // Redis server URL
const RISK_SERVICE_URL = process.env.RISK_SERVICE_URL || 'service-c:50051'; // gRPC Risk Service URL
const QUEUE_NAME = 'trading_signals';

// --- Redis Client ---
const redis = new Redis(REDIS_URL, {
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => {
  console.log('[Service B] Redis connected successfully');
});

redis.on('error', (err: Error) => {
  console.error('[Service B] Redis connection error:', err.message);
});

// --- Risk Service Client ---
const riskClient = new RiskClient(RISK_SERVICE_URL);

// --- TimescaleDB Repository ---
const timescaleRepo: TimescaleRepository = createTimescaleRepository();

/**
 * Process trade with Risk Service validation, Redis caching, and TimescaleDB storage
 */
async function processTrade(signal: TradeSignal): Promise<void> {
  console.log(
    `[Service B] Processing signal: ${signal.action} ${signal.volume} MWh for ${signal.assetId}`
  );

  // Step 1: Check trade risk with Risk Service (service-c)
  let riskCheckId: string | undefined;
  try {
    const riskCheck = await riskClient.checkRisk({
      assetId: signal.assetId,
      volume: signal.volume,
      action: signal.action,
      timestamp: signal.timestamp,
    });

    riskCheckId = riskCheck.checkId;

    console.log(
      `[Service B] Risk check result: ${riskCheck.allowed ? 'ALLOWED' : 'REJECTED'} (checkId: ${riskCheck.checkId})`
    );

    // If risk check fails, log and skip the trade
    if (!riskCheck.allowed) {
      console.log(`[Service B] ⚠️  Trade REJECTED by Risk Service. Reason: ${riskCheck.reason}`);
      console.log(`[Service B] Trade skipped. Message acknowledged without processing.`);
      return; // Exit early - trade will be ack'd but not stored
    }

    console.log(`[Service B] ✓ Trade approved by Risk Service. Proceeding...`);
  } catch (error) {
    // If Risk Service is down or unreachable, log error and skip trade
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Service B] ❌ Risk Service check failed: ${errorMessage}`);
    console.log(`[Service B] Trade skipped due to Risk Service error.`);
    return; // Exit early - trade will be ack'd but not stored
  }

  // Step 2: Get asset price from Redis cache
  const price = await getAssetPrice(redis, signal.assetId);
  const totalValue = (signal.volume * price).toFixed(2);

  console.log(
    `[Service B] Trade details: ${signal.action} ${signal.volume} MWh @ $${price}/MWh = $${totalValue}`
  );

  // Step 3: Store trade in Redis (hot data - recent trades, counters)
  await storeTradeHistory(redis, signal, price);

  // Step 4: Store trade in TimescaleDB asynchronously (cold data - long-term analytics)
  // Fire-and-forget pattern: Don't await to maintain low latency
  // TimescaleDB failures won't block trade processing
  void timescaleRepo.storeTradeFromSignal(signal, price, riskCheckId).catch((err: unknown) => {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Service B] TimescaleDB storage error (non-blocking):', errorMessage);
  });

  // Simulate database write delay
  await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate 50ms of work

  console.log(
    `[Service B] ...Processing complete. Trade saved to Redis (hot) and TimescaleDB (cold).`
  );
}

/**
 * Main function: Connect and consume messages
 */
async function startConsumer(): Promise<void> {
  try {
    // 1. Connect to Risk Service (gRPC)
    console.log('[Service B] Connecting to Risk Service...');
    riskClient.connect();

    // 2. Connect to TimescaleDB
    console.log('[Service B] Connecting to TimescaleDB...');
    try {
      await timescaleRepo.connect();
    } catch (error) {
      // Non-fatal: Continue without TimescaleDB (trades will only go to Redis)
      console.warn(
        '[Service B] ⚠️  TimescaleDB connection failed. Continuing without long-term storage.'
      );
    }

    // 3. Connect to RabbitMQ server
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    // 4. Assert the queue (ensure it exists)
    await channel.assertQueue(QUEUE_NAME, { durable: false });

    console.log('[Service B] Started successfully. Waiting for signals in the queue...');

    // 5. Consume messages from the queue
    // This sets up a listener
    await channel.consume(
      QUEUE_NAME,
      (msg) => {
        if (msg) {
          try {
            // Message content is a Buffer, need to convert to string, then parse
            const content = msg.content.toString();
            const signal = JSON.parse(content) as TradeSignal;

            // Process our business logic
            void processTrade(signal)
              .then(() => {
                // 6. (IMPORTANT) Acknowledge the message (Ack)
                // Tell RabbitMQ we've successfully processed this message, it can be deleted
                channel.ack(msg);
              })
              .catch((error) => {
                console.error('[Service B] Error processing message:', error);
                // If processing fails, we "reject" this message and requeue it
                // Note: In real applications, you need more complex error handling
                // to avoid "poison messages" that continuously retry
                channel.nack(msg, false, true); // (msg, all, requeue)
              });
          } catch (error) {
            console.error('[Service B] Error parsing message:', error);
            // If parsing fails, reject the message
            if (msg) {
              channel.nack(msg, false, false); // Don't requeue malformed messages
            }
          }
        }
      },
      {
        // noAck: false (default)
        // This means we need to manually call channel.ack() to confirm the message
        // This is key to ensuring "high availability" and "no data loss"
      }
    );
  } catch (error) {
    console.error('[Service B] Error occurred:', error);
    process.exit(1);
  }
}

// Graceful shutdown handlers
process.on('SIGINT', () => {
  console.log('\n[Service B] Received SIGINT, shutting down gracefully...');
  riskClient.close();
  redis.disconnect();
  void timescaleRepo.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Service B] Received SIGTERM, shutting down gracefully...');
  riskClient.close();
  redis.disconnect();
  void timescaleRepo.disconnect();
  process.exit(0);
});

// Start the consumer
startConsumer().catch((error) => {
  console.error('[Service B] Fatal error during startup:', error);
  riskClient.close();
  process.exit(1);
});
