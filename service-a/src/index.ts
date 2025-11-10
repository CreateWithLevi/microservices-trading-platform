import amqp from 'amqplib';

// --- Configuration ---
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost'; // RabbitMQ server URL (from env or default to localhost)
const QUEUE_NAME = 'trading_signals'; // Name of the queue

// --- Trading Signal Type ---
type TradeSignal = {
  assetId: string;
  action: 'BUY' | 'SELL';
  volume: number; // MWh
  timestamp: string;
};

/**
 * Generate a random mock trading signal
 */
function generateMockSignal(): TradeSignal {
  const actions: ['BUY', 'SELL'] = ['BUY', 'SELL'];
  const randomAction = actions[Math.floor(Math.random() * actions.length)];
  const randomVolume = parseFloat((Math.random() * 100 + 10).toFixed(2)); // 10 to 110 MWh

  return {
    assetId: 'BATTERY_GRID_01',
    action: randomAction,
    volume: randomVolume,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Main function: Connect to RabbitMQ and publish messages
 */
async function startSignalGenerator() {
  try {
    // 1. Connect to RabbitMQ server
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    // 2. Assert (declare) a queue
    // This ensures the queue exists, creating it if necessary
    // durable: false means the queue won't survive RabbitMQ restarts (suitable for our simulation)
    await channel.assertQueue(QUEUE_NAME, { durable: false });

    console.log('[Service A] Started successfully. Connecting to RabbitMQ...');
    console.log(`[Service A] Sending signals to queue: ${QUEUE_NAME}`);

    // 3. Generate and send a new signal every 3 seconds
    setInterval(() => {
      const signal = generateMockSignal();
      const message = JSON.stringify(signal);

      // Send message to the specified queue
      // Message must be a Buffer
      channel.sendToQueue(QUEUE_NAME, Buffer.from(message));

      console.log(`[Service A] Signal sent: ${signal.action} ${signal.volume} MWh`);
    }, 3000); // Every 3 seconds

  } catch (error) {
    console.error('[Service A] Error occurred:', error);
    process.exit(1); // Exit the program
  }
}

// Start the service
startSignalGenerator();
