import amqp, { ConsumeMessage } from 'amqplib';
import { connectToMongoDB, disconnectFromMongoDB } from './database';
import { AuditLog } from './models/AuditLog';

/**
 * Configuration
 */
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const EXCHANGE_NAME = 'system_events';
const EXCHANGE_TYPE = 'fanout';

/**
 * Global connection and channel references
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let connection: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let channel: any = null;

/**
 * Connect to RabbitMQ with retry logic
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function connectToRabbitMQ(): Promise<{ connection: any; channel: any }> {
  const maxRetries = 10;
  const retryDelay = 2000;
  let currentRetry = 0;

  while (currentRetry < maxRetries) {
    try {
      console.log(`[RabbitMQ] Attempting to connect to ${RABBITMQ_URL}...`);

      const conn = await amqp.connect(RABBITMQ_URL);
      const ch = await conn.createChannel();

      console.log('[RabbitMQ] Successfully connected to RabbitMQ');

      // Handle connection errors
      conn.on('error', (err) => {
        console.error('[RabbitMQ] Connection error:', err);
      });

      conn.on('close', () => {
        console.warn('[RabbitMQ] Connection closed');
      });

      return { connection: conn, channel: ch };
    } catch (error) {
      currentRetry++;
      console.error(
        `[RabbitMQ] Connection failed (attempt ${currentRetry}/${maxRetries}):`,
        error instanceof Error ? error.message : error
      );

      if (currentRetry < maxRetries) {
        console.log(`[RabbitMQ] Retrying in ${retryDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      } else {
        throw new Error(`Failed to connect to RabbitMQ after ${maxRetries} attempts`);
      }
    }
  }

  throw new Error('Unexpected error in connectToRabbitMQ');
}

/**
 * Process incoming audit event and save to MongoDB
 */
async function processAuditEvent(msg: ConsumeMessage): Promise<void> {
  try {
    const content = msg.content.toString();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const event = JSON.parse(content);

    console.log('[Audit] Received event:', {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      eventType: event.eventType || 'unknown',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      serviceName: event.serviceName || 'unknown',
    });

    // Create audit log entry
    const auditLog = new AuditLog({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      eventType: event.eventType || 'unknown',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      serviceName: event.serviceName || 'unknown',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      payload: event.payload || event,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
      timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      metadata: event.metadata || {},
    });

    // Save to MongoDB asynchronously
    await auditLog.save();

    console.log('[Audit] Event saved to MongoDB:', auditLog._id);
  } catch (error) {
    console.error('[Audit] Error processing event:', error);
    // Don't throw - we don't want to crash the service on individual message failures
  }
}

/**
 * Start consuming messages from the fanout exchange
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function startConsuming(ch: any): Promise<void> {
  try {
    // Assert the fanout exchange
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await ch.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, {
      durable: true,
    });

    console.log(`[RabbitMQ] Fanout exchange '${EXCHANGE_NAME}' asserted`);

    // Create an exclusive queue (auto-delete when consumer disconnects)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const queueResult = await ch.assertQueue('', {
      exclusive: true,
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const queueName = queueResult.queue;

    console.log(`[RabbitMQ] Created exclusive queue: ${queueName}`);

    // Bind queue to the fanout exchange
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await ch.bindQueue(queueName, EXCHANGE_NAME, '');

    console.log(`[RabbitMQ] Queue bound to exchange '${EXCHANGE_NAME}'`);

    // Start consuming messages
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await ch.consume(
      queueName,
      async (msg: ConsumeMessage | null) => {
        if (msg) {
          await processAuditEvent(msg);
          // Always acknowledge messages to prevent requeue
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          ch.ack(msg);
        }
      },
      {
        noAck: false, // Manual acknowledgment
      }
    );

    console.log(`[RabbitMQ] Started consuming from exchange '${EXCHANGE_NAME}'`);
  } catch (error) {
    console.error('[RabbitMQ] Error starting consumer:', error);
    throw error;
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[Shutdown] Received ${signal}, shutting down gracefully...`);

  try {
    // Close RabbitMQ channel and connection
    if (channel) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await channel.close();
      console.log('[Shutdown] RabbitMQ channel closed');
    }

    if (connection) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await connection.close();
      console.log('[Shutdown] RabbitMQ connection closed');
    }

    // Disconnect from MongoDB
    await disconnectFromMongoDB();

    console.log('[Shutdown] Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[Shutdown] Error during shutdown:', error);
    process.exit(1);
  }
}

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  try {
    console.log('=== Service E - Audit Service ===');
    console.log('[Startup] Starting Audit Service...');

    // Connect to MongoDB
    await connectToMongoDB();

    // Connect to RabbitMQ
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { connection: conn, channel: ch } = await connectToRabbitMQ();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    connection = conn;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    channel = ch;

    // Start consuming messages
    await startConsuming(ch);

    console.log('[Startup] Audit Service is running and ready to log events');

    // Register shutdown handlers
    process.on('SIGINT', () => {
      void shutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
  } catch (error) {
    console.error('[Startup] Failed to start Audit Service:', error);
    process.exit(1);
  }
}

// Start the application
void main();
