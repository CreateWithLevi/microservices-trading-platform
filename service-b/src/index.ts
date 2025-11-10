import amqp from 'amqplib';

// --- Configuration ---
// Must match Service A's configuration exactly
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost'; // RabbitMQ server URL (from env or default to localhost)
const QUEUE_NAME = 'trading_signals';

// --- Trading Signal Type ---
// (In a real project, this would be in a shared 'types' package)
type TradeSignal = {
  assetId: string;
  action: 'BUY' | 'SELL';
  volume: number;
  timestamp: string;
};

/**
 * Simulate a time-consuming database operation
 */
async function processTrade(signal: TradeSignal): Promise<void> {
  console.log(`[Service B] Processing signal: ${signal.action} ${signal.volume} MWh for ${signal.assetId}`);
  // Simulate I/O delay, e.g., writing to database
  await new Promise(resolve => setTimeout(resolve, 50)); // Simulate 50ms of work
  console.log(`[Service B] ...Processing complete. Trade saved to database.`);
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
