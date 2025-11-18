import amqp from 'amqplib';
import { WebSocketServer } from './websocket-server';
import type { TradeNotification } from './types';

// --- Configuration ---
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const EXCHANGE_NAME = 'trading_events';
const QUEUE_NAME = 'trade_notifications';

// --- WebSocket Server ---
const wsServer = new WebSocketServer();

/**
 * Main function: Connect to RabbitMQ and consume trade notifications
 */
async function startNotificationService(): Promise<void> {
  try {
    // 1. Start WebSocket server
    console.log('[Service N] Starting WebSocket server...');
    wsServer.start();

    // 2. Connect to RabbitMQ server
    console.log('[Service N] Connecting to RabbitMQ...');
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    // 3. Assert the exchange (fanout type for broadcasting to multiple consumers)
    await channel.assertExchange(EXCHANGE_NAME, 'fanout', { durable: false });

    // 4. Assert the queue (non-durable for real-time notifications)
    await channel.assertQueue(QUEUE_NAME, { durable: false });

    // 5. Bind the queue to the exchange
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, '');

    console.log('[Service N] Started successfully. Waiting for trade notifications...');
    console.log(`[Service N] Listening on exchange: ${EXCHANGE_NAME}, queue: ${QUEUE_NAME}`);

    // 6. Consume messages from the queue
    await channel.consume(
      QUEUE_NAME,
      (msg) => {
        if (msg) {
          try {
            // Parse the trade notification
            const content = msg.content.toString();
            const trade = JSON.parse(content) as TradeNotification;

            console.log(
              `[Service N] Received trade notification: ${trade.action} ${trade.volume} MWh for ${trade.assetId} (${trade.status})`
            );

            // Broadcast the trade update via WebSocket
            wsServer.broadcastTradeUpdate(trade);

            // Acknowledge the message
            channel.ack(msg);
          } catch (error) {
            console.error('[Service N] Error processing message:', error);
            // Reject malformed messages without requeuing
            if (msg) {
              channel.nack(msg, false, false);
            }
          }
        }
      },
      {
        noAck: false, // Use manual acknowledgment
      }
    );

    // Handle connection errors
    connection.on('error', (err) => {
      console.error('[Service N] RabbitMQ connection error:', err);
    });

    connection.on('close', () => {
      console.log('[Service N] RabbitMQ connection closed');
      process.exit(1);
    });
  } catch (error) {
    console.error('[Service N] Error occurred:', error);
    process.exit(1);
  }
}

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  console.log('\n[Service N] Received SIGINT, shutting down gracefully...');
  await wsServer.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Service N] Received SIGTERM, shutting down gracefully...');
  await wsServer.close();
  process.exit(0);
});

// Start the notification service
startNotificationService().catch((error) => {
  console.error('[Service N] Fatal error during startup:', error);
  process.exit(1);
});
