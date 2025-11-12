import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import amqp from 'amqplib';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { generateMockSignal, type TradeSignal } from '../../src/signals';

describe('RabbitMQ Integration', () => {
  let container: StartedTestContainer;
  let connection: any;
  let channel: any;
  const QUEUE_NAME = 'trading_signals';

  beforeAll(async () => {
    // Start RabbitMQ container
    container = await new GenericContainer('rabbitmq:3-management')
      .withExposedPorts(5672, 15672)
      .withStartupTimeout(120000)
      .start();

    const rabbitMQUrl = `amqp://localhost:${container.getMappedPort(5672)}`;
    connection = await amqp.connect(rabbitMQUrl);
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: false });
  }, 120000);

  afterAll(async () => {
    if (channel) await channel.close();
    if (connection) await connection.close();
    if (container) await container.stop();
  });

  it('should publish a message to RabbitMQ queue', async () => {
    const signal = generateMockSignal();
    const message = JSON.stringify(signal);

    // Publish message
    const published = channel.sendToQueue(QUEUE_NAME, Buffer.from(message));

    expect(published).toBe(true);

    // Verify message is in queue
    const queueInfo = await channel.checkQueue(QUEUE_NAME);
    expect(queueInfo.messageCount).toBeGreaterThan(0);
  });

  it('should publish and consume a message', async () => {
    const signal = generateMockSignal();
    const message = JSON.stringify(signal);

    // Publish message
    channel.sendToQueue(QUEUE_NAME, Buffer.from(message));

    // Consume message
    const receivedMessage = await new Promise<TradeSignal>((resolve) => {
      channel.consume(QUEUE_NAME, (msg: any) => {
        if (msg) {
          const content = msg.content.toString();
          const parsedSignal = JSON.parse(content) as TradeSignal;
          channel.ack(msg);
          resolve(parsedSignal);
        }
      });
    });

    expect(receivedMessage).toEqual(signal);
  });

  it('should handle multiple messages in order', async () => {
    const signals = [
      generateMockSignal(),
      generateMockSignal(),
      generateMockSignal(),
    ];

    // Publish all messages
    for (const signal of signals) {
      channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(signal)));
    }

    // Consume all messages
    const receivedSignals: TradeSignal[] = [];
    for (let i = 0; i < signals.length; i++) {
      const signal = await new Promise<TradeSignal>((resolve) => {
        channel.consume(QUEUE_NAME, (msg: any) => {
          if (msg) {
            const content = msg.content.toString();
            const parsedSignal = JSON.parse(content) as TradeSignal;
            channel.ack(msg);
            resolve(parsedSignal);
          }
        });
      });
      receivedSignals.push(signal);
    }

    expect(receivedSignals).toHaveLength(signals.length);
    expect(receivedSignals).toEqual(signals);
  });

  it('should reject invalid JSON messages', async () => {
    const invalidMessage = 'not valid json';
    channel.sendToQueue(QUEUE_NAME, Buffer.from(invalidMessage));

    const result = await new Promise<{ valid: boolean; error?: string }>(
      (resolve) => {
        channel.consume(QUEUE_NAME, (msg: any) => {
          if (msg) {
            try {
              const content = msg.content.toString();
              JSON.parse(content);
              channel.ack(msg);
              resolve({ valid: true });
            } catch (error) {
              channel.nack(msg, false, false); // Don't requeue
              resolve({
                valid: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }
        });
      }
    );

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});
