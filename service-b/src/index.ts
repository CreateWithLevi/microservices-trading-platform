import amqp from 'amqplib';
import Redis from 'ioredis';
import { getAssetPrice, storeTradeHistory, type TradeSignal } from './trading';
import { RiskClient } from './grpc-client';
import { WebSocketServer } from './websocket-server';
import { randomUUID } from 'crypto';

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

// --- WebSocket Server ---
const wsServer = new WebSocketServer();

/**
 * Process trade with Risk Service validation and Redis integration
 */
async function processTrade(signal: TradeSignal): Promise<void> {
  console.log(
    `[Service B] Processing signal: ${signal.action} ${signal.volume} MWh for ${signal.assetId}`
  );

  const tradeId = randomUUID();
  let price = 0;
  let totalValue = 0;
  let status: 'approved' | 'rejected' = 'rejected';
  let rejectionReason: string | undefined;
  let checkId: string | undefined;

  // Step 1: Check trade risk with Risk Service (service-c)
  try {
    const riskCheck = await riskClient.checkRisk({
      assetId: signal.assetId,
      volume: signal.volume,
      action: signal.action,
      timestamp: signal.timestamp,
    });

    checkId = riskCheck.checkId;

    console.log(
      `[Service B] Risk check result: ${riskCheck.allowed ? 'ALLOWED' : 'REJECTED'} (checkId: ${riskCheck.checkId})`
    );

    // If risk check fails, log and skip the trade
    if (!riskCheck.allowed) {
      console.log(`[Service B] ⚠️  Trade REJECTED by Risk Service. Reason: ${riskCheck.reason}`);
      console.log(`[Service B] Trade skipped. Message acknowledged without processing.`);
      status = 'rejected';
      rejectionReason = riskCheck.reason;

      // Emit rejected trade event via WebSocket
      wsServer.emitTradeProcessed({
        id: tradeId,
        assetId: signal.assetId,
        action: signal.action,
        volume: signal.volume,
        price: 0,
        totalValue: 0,
        timestamp: signal.timestamp,
        status: 'rejected',
        rejectionReason: riskCheck.reason,
        checkId: riskCheck.checkId,
      });

      return; // Exit early - trade will be ack'd but not stored
    }

    console.log(`[Service B] ✓ Trade approved by Risk Service. Proceeding...`);
    status = 'approved';
  } catch (error) {
    // If Risk Service is down or unreachable, log error and skip trade
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Service B] ❌ Risk Service check failed: ${errorMessage}`);
    console.log(`[Service B] Trade skipped due to Risk Service error.`);
    rejectionReason = `Risk Service error: ${errorMessage}`;

    // Emit error trade event via WebSocket
    wsServer.emitTradeProcessed({
      id: tradeId,
      assetId: signal.assetId,
      action: signal.action,
      volume: signal.volume,
      price: 0,
      totalValue: 0,
      timestamp: signal.timestamp,
      status: 'rejected',
      rejectionReason,
    });

    return; // Exit early - trade will be ack'd but not stored
  }

  // Step 2: Get asset price from Redis cache
  price = await getAssetPrice(redis, signal.assetId);
  totalValue = parseFloat((signal.volume * price).toFixed(2));

  console.log(
    `[Service B] Trade details: ${signal.action} ${signal.volume} MWh @ $${price}/MWh = $${totalValue}`
  );

  // Step 3: Store trade in Redis
  await storeTradeHistory(redis, signal, price);

  // Simulate database write delay
  await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate 50ms of work

  console.log(`[Service B] ...Processing complete. Trade saved to database and Redis.`);

  // Step 4: Emit approved trade event via WebSocket
  wsServer.emitTradeProcessed({
    id: tradeId,
    assetId: signal.assetId,
    action: signal.action,
    volume: signal.volume,
    price,
    totalValue,
    timestamp: signal.timestamp,
    status: 'approved',
    checkId,
  });
}

/**
 * Main function: Connect and consume messages
 */
async function startConsumer(): Promise<void> {
  try {
    // 1. Start WebSocket server
    console.log('[Service B] Starting WebSocket server...');
    wsServer.start();

    // 2. Connect to Risk Service (gRPC)
    console.log('[Service B] Connecting to Risk Service...');
    riskClient.connect();

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
  wsServer.close();
  riskClient.close();
  redis.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Service B] Received SIGTERM, shutting down gracefully...');
  wsServer.close();
  riskClient.close();
  redis.disconnect();
  process.exit(0);
});

// Start the consumer
startConsumer().catch((error) => {
  console.error('[Service B] Fatal error during startup:', error);
  riskClient.close();
  process.exit(1);
});
