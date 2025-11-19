import * as Sentry from '@sentry/node';
import amqp from 'amqplib';
import Redis from 'ioredis';
import { getAssetPrice, storeTradeHistory, type TradeSignal } from './trading';
import { RiskClient } from './grpc-client';

// --- Sentry Initialization ---
// Initialize Sentry for error tracking (disabled if SENTRY_DSN not set)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 1.0, // 100% of transactions for performance monitoring
    enableLogs: true, // Enable structured logging to Sentry
    integrations: [
      // Automatically capture console.log, console.warn, and console.error as logs
      Sentry.consoleLoggingIntegration({
        levels: ['log', 'warn', 'error'],
      }),
    ],
  });
  console.log('[Service B] Sentry initialized successfully');
} else {
  console.log('[Service B] Sentry DSN not provided, error tracking disabled');
}

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
  // Capture Redis connection errors in Sentry
  Sentry.captureException(err, {
    tags: {
      service: 'service-b',
      operation: 'redis-connection',
    },
  });
});

// --- Risk Service Client ---
const riskClient = new RiskClient(RISK_SERVICE_URL);

/**
 * Process trade with Risk Service validation and Redis integration
 */
async function processTrade(signal: TradeSignal): Promise<void> {
  // Create a span to measure performance of trade processing
  await Sentry.startSpan(
    {
      op: 'message.process',
      name: `Process trade: ${signal.assetId}`,
      attributes: {
        action: signal.action,
        volume: signal.volume,
        assetId: signal.assetId,
      },
    },
    async () => {
      console.log(
        `[Service B] Processing signal: ${signal.action} ${signal.volume} MWh for ${signal.assetId}`
      );

      // Step 1: Check trade risk with Risk Service (service-c)
      try {
        const riskCheck = await riskClient.checkRisk({
          assetId: signal.assetId,
          volume: signal.volume,
          action: signal.action,
          timestamp: signal.timestamp,
        });

        console.log(
          `[Service B] Risk check result: ${riskCheck.allowed ? 'ALLOWED' : 'REJECTED'} (checkId: ${riskCheck.checkId})`
        );

        // If risk check fails, log and skip the trade
        if (!riskCheck.allowed) {
          console.log(
            `[Service B] ⚠️  Trade REJECTED by Risk Service. Reason: ${riskCheck.reason}`
          );
          console.log(`[Service B] Trade skipped. Message acknowledged without processing.`);
          return; // Exit early - trade will be ack'd but not stored
        }

        console.log(`[Service B] ✓ Trade approved by Risk Service. Proceeding...`);
      } catch (error) {
        // If Risk Service is down or unreachable, log error and skip trade
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Service B] ❌ Risk Service check failed: ${errorMessage}`);
        console.log(`[Service B] Trade skipped due to Risk Service error.`);

        // Capture error in Sentry
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

        return; // Exit early - trade will be ack'd but not stored
      }

      // Step 2: Get asset price from Redis cache
      const price = await getAssetPrice(redis, signal.assetId);
      const totalValue = (signal.volume * price).toFixed(2);

      console.log(
        `[Service B] Trade details: ${signal.action} ${signal.volume} MWh @ $${price}/MWh = $${totalValue}`
      );

      // Step 3: Store trade in Redis
      await storeTradeHistory(redis, signal, price);

      // Simulate database write delay
      await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate 50ms of work

      console.log(`[Service B] ...Processing complete. Trade saved to database and Redis.`);
    }
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

    // 2. Connect to RabbitMQ server
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    // 3. Assert the queue (ensure it exists)
    await channel.assertQueue(QUEUE_NAME, { durable: false });

    console.log('[Service B] Started successfully. Waiting for signals in the queue...');

    // 4. Consume messages from the queue
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
                // 5. (IMPORTANT) Acknowledge the message (Ack)
                // Tell RabbitMQ we've successfully processed this message, it can be deleted
                channel.ack(msg);
              })
              .catch((error) => {
                console.error('[Service B] Error processing message:', error);

                // Capture error in Sentry
                Sentry.captureException(error, {
                  tags: {
                    service: 'service-b',
                    operation: 'process-trade',
                  },
                });

                // If processing fails, we "reject" this message and requeue it
                // Note: In real applications, you need more complex error handling
                // to avoid "poison messages" that continuously retry
                channel.nack(msg, false, true); // (msg, all, requeue)
              });
          } catch (error) {
            console.error('[Service B] Error parsing message:', error);

            // Capture error in Sentry
            Sentry.captureException(error, {
              tags: {
                service: 'service-b',
                operation: 'parse-message',
              },
            });

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

    // Capture error in Sentry
    Sentry.captureException(error, {
      tags: {
        service: 'service-b',
        operation: 'startup',
      },
    });

    // Flush Sentry before exit
    await Sentry.close(2000);
    process.exit(1);
  }
}

// Graceful shutdown handlers
process.on('SIGINT', () => {
  console.log('\n[Service B] Received SIGINT, shutting down gracefully...');
  riskClient.close();
  redis.disconnect();

  // Flush Sentry events before exit (fire and forget)
  void Sentry.close(2000).then(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n[Service B] Received SIGTERM, shutting down gracefully...');
  riskClient.close();
  redis.disconnect();

  // Flush Sentry events before exit (fire and forget)
  void Sentry.close(2000).then(() => {
    process.exit(0);
  });
});

// Start the consumer
startConsumer().catch(async (error) => {
  console.error('[Service B] Fatal error during startup:', error);

  // Capture error in Sentry
  Sentry.captureException(error, {
    tags: {
      service: 'service-b',
      operation: 'fatal-startup',
    },
  });

  riskClient.close();

  // Flush Sentry before exit
  await Sentry.close(2000);
  process.exit(1);
});
