import amqp from 'amqplib';
import Redis from 'ioredis';

// --- Configuration ---
// Must match Service A's configuration exactly
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost'; // RabbitMQ server URL (from env or default to localhost)
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'; // Redis server URL
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

// --- Trading Signal Type ---
// (In a real project, this would be in a shared 'types' package)
type TradeSignal = {
  assetId: string;
  action: 'BUY' | 'SELL';
  volume: number;
  timestamp: string;
};

/**
 * Get or generate asset price from Redis cache
 */
async function getAssetPrice(assetId: string): Promise<number> {
  // Try to get price from cache
  const cachedPrice = await redis.get(`price:${assetId}`);

  if (cachedPrice) {
    console.log(`[Service B] Cache HIT: Retrieved price for ${assetId} = $${cachedPrice}`);
    return parseFloat(cachedPrice);
  }

  // Cache miss: generate a new price and cache it
  const newPrice = parseFloat((Math.random() * 100 + 50).toFixed(2)); // $50-$150
  await redis.setex(`price:${assetId}`, 30, newPrice.toString()); // Cache for 30 seconds
  console.log(`[Service B] Cache MISS: Generated new price for ${assetId} = $${newPrice} (cached for 30s)`);

  return newPrice;
}

/**
 * Store trade history in Redis
 */
async function storeTradeHistory(signal: TradeSignal, price: number): Promise<void> {
  const tradeRecord = {
    ...signal,
    price,
    totalValue: (signal.volume * price).toFixed(2),
  };

  // Store in a Redis list for trade history
  await redis.lpush('trade_history', JSON.stringify(tradeRecord));
  await redis.ltrim('trade_history', 0, 99); // Keep only last 100 trades

  // Increment trade counter
  await redis.incr(`trade_count:${signal.assetId}`);
}

/**
 * Process trade with Redis integration
 */
async function processTrade(signal: TradeSignal): Promise<void> {
  console.log(`[Service B] Processing signal: ${signal.action} ${signal.volume} MWh for ${signal.assetId}`);

  // Get asset price from Redis cache
  const price = await getAssetPrice(signal.assetId);
  const totalValue = (signal.volume * price).toFixed(2);

  console.log(`[Service B] Trade details: ${signal.action} ${signal.volume} MWh @ $${price}/MWh = $${totalValue}`);

  // Store trade in Redis
  await storeTradeHistory(signal, price);

  // Simulate database write delay
  await new Promise(resolve => setTimeout(resolve, 50)); // Simulate 50ms of work

  console.log(`[Service B] ...Processing complete. Trade saved to database and Redis.`);
}

/**
 * Main function: Connect and consume messages
 */
async function startConsumer() {
  try {
    // 1. Connect to RabbitMQ server
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    // 2. Assert the queue (ensure it exists)
    await channel.assertQueue(QUEUE_NAME, { durable: false });

    console.log('[Service B] Started successfully. Waiting for signals in the queue...');

    // 3. Consume messages from the queue
    // This sets up a listener
    channel.consume(QUEUE_NAME, async (msg) => {
      if (msg) {
        try {
          // Message content is a Buffer, need to convert to string, then parse
          const content = msg.content.toString();
          const signal = JSON.parse(content) as TradeSignal;

          // Process our business logic
          await processTrade(signal);

          // 4. (IMPORTANT) Acknowledge the message (Ack)
          // Tell RabbitMQ we've successfully processed this message, it can be deleted
          channel.ack(msg);

        } catch (error) {
          console.error('[Service B] Error processing message:', error);
          // If processing fails, we "reject" this message and requeue it
          // Note: In real applications, you need more complex error handling
          // to avoid "poison messages" that continuously retry
          if (msg) {
            channel.nack(msg, false, true); // (msg, all, requeue)
          }
        }
      }
    }, {
      // noAck: false (default)
      // This means we need to manually call channel.ack() to confirm the message
      // This is key to ensuring "high availability" and "no data loss"
    });

  } catch (error) {
    console.error('[Service B] Error occurred:', error);
    process.exit(1);
  }
}

// Start the consumer
startConsumer();
