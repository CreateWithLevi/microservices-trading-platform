import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import amqp from 'amqplib';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { generateMockSignal, type TradeSignal } from '../../src/signals';

describe('RabbitMQ Integration', () => {
  let container: StartedTestContainer;
  let connection: any;
  let channel: any;
  const QUEUE_NAME = 'test_trading_signals'; // Use different queue name to avoid conflicts

  beforeAll(async () => {
    // Start RabbitMQ container
    container = await new GenericContainer('rabbitmq:3-management')
      .withExposedPorts(5672, 15672)
      .withStartupTimeout(120000)
      .start();

    const rabbitMQUrl = `amqp://localhost:${container.getMappedPort(5672)}`;
    connection = await amqp.connect(rabbitMQUrl);
    channel = await connection.createChannel();
  }, 120000);

  afterAll(async () => {
    if (channel && !channel.closing) {
      try {
        await channel.close();
      } catch (error) {
        // Channel may already be closed
      }
    }
    if (connection) await connection.close();
    if (container) await container.stop();
  });

  it('should publish a message to RabbitMQ queue', async () => {
    // Assert queue for this test
    await channel.assertQueue(QUEUE_NAME, { durable: false });

    const signal = generateMockSignal();
    const message = JSON.stringify(signal);

    // Publish message
    const published = channel.sendToQueue(QUEUE_NAME, Buffer.from(message));

    expect(published).toBe(true);

    // Verify message is in queue
    const queueInfo = await channel.checkQueue(QUEUE_NAME);
    expect(queueInfo.messageCount).toBeGreaterThan(0);

    // Clean up - purge the queue
    await channel.purgeQueue(QUEUE_NAME);
  });

  it('should publish and consume a message', async () => {
    // Assert queue for this test
    await channel.assertQueue(QUEUE_NAME, { durable: false });
    await channel.purgeQueue(QUEUE_NAME); // Ensure queue is empty

    const signal = generateMockSignal();
    const message = JSON.stringify(signal);
    let receivedMessage: TradeSignal | null = null;

    // Set up consumer first and get consumerTag
    const consumeResult = await channel.consume(
      QUEUE_NAME,
      (msg: any) => {
        if (msg) {
          const content = msg.content.toString();
          const parsedSignal = JSON.parse(content) as TradeSignal;
          channel.ack(msg);
          receivedMessage = parsedSignal;
        }
      },
      { noAck: false }
    );

    // Publish message
    channel.sendToQueue(QUEUE_NAME, Buffer.from(message));

    // Wait for message
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout: Message was not received'));
      }, 5000);

      const checkInterval = setInterval(() => {
        if (receivedMessage !== null) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
    });

    // Cancel consumer
    await channel.cancel(consumeResult.consumerTag);

    expect(receivedMessage).toEqual(signal);

    // Clean up
    await channel.purgeQueue(QUEUE_NAME);
  });

  it(
    'should handle multiple messages in order',
    async () => {
      // Assert queue for this test
      await channel.assertQueue(QUEUE_NAME, { durable: false });
      await channel.purgeQueue(QUEUE_NAME); // Ensure queue is empty

      const signals = [generateMockSignal(), generateMockSignal(), generateMockSignal()];
      const receivedSignals: TradeSignal[] = [];

      // Set up consumer first and get consumerTag
      const consumeResult = await channel.consume(
        QUEUE_NAME,
        (msg: any) => {
          if (msg) {
            try {
              const content = msg.content.toString();
              const parsedSignal = JSON.parse(content) as TradeSignal;
              channel.ack(msg);
              receivedSignals.push(parsedSignal);
            } catch (error) {
              // Skip invalid messages from previous tests
              channel.nack(msg, false, false);
            }
          }
        },
        { noAck: false }
      );

      // Publish all messages
      for (const signal of signals) {
        channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(signal)));
      }

      // Wait for all messages to be received
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new Error(
              `Timeout: Only received ${receivedSignals.length} of ${signals.length} messages`
            )
          );
        }, 5000);

        const checkInterval = setInterval(() => {
          if (receivedSignals.length === signals.length) {
            clearInterval(checkInterval);
            clearTimeout(timeout);
            resolve();
          }
        }, 100);
      });

      // Cancel consumer
      await channel.cancel(consumeResult.consumerTag);

      expect(receivedSignals).toHaveLength(signals.length);
      expect(receivedSignals).toEqual(signals);

      // Clean up
      await channel.purgeQueue(QUEUE_NAME);
    },
    10000
  );

  it(
    'should reject invalid JSON messages',
    async () => {
      // Assert queue for this test
      await channel.assertQueue(QUEUE_NAME, { durable: false });
      await channel.purgeQueue(QUEUE_NAME); // Ensure queue is empty

      const invalidMessage = 'not valid json';
      let result: { valid: boolean; error?: string } | null = null;

      // Set up consumer first and get consumerTag
      const consumeResult = await channel.consume(
        QUEUE_NAME,
        (msg: any) => {
          if (msg) {
            try {
              const content = msg.content.toString();
              JSON.parse(content);
              channel.ack(msg);
              result = { valid: true };
            } catch (error) {
              channel.nack(msg, false, false); // Don't requeue
              result = {
                valid: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              };
            }
          }
        },
        { noAck: false }
      );

      // Publish invalid message
      channel.sendToQueue(QUEUE_NAME, Buffer.from(invalidMessage));

      // Wait for message to be processed
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Timeout: Message was not processed. Result: ${JSON.stringify(result)}`));
        }, 5000);

        const checkInterval = setInterval(() => {
          if (result !== null) {
            clearInterval(checkInterval);
            clearTimeout(timeout);
            resolve();
          }
        }, 100);
      });

      // Cancel consumer
      await channel.cancel(consumeResult.consumerTag);

      expect(result).not.toBeNull();
      expect(result!.valid).toBe(false);
      expect(result!.error).toBeDefined();

      // Clean up
      await channel.purgeQueue(QUEUE_NAME);
    },
    10000
  );
});
