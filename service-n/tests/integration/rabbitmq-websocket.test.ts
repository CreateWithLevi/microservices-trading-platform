import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import amqp, { Connection, Channel } from 'amqplib';
import { io as ioClient, Socket } from 'socket.io-client';
import { GenericContainer, StartedTestContainer } from 'testcontainers';

const EXCHANGE_NAME = 'trading_events';
const QUEUE_NAME = 'trade_notifications';
const WS_PORT = 3002;

describe('Service N Integration Tests', () => {
  let rabbitmqContainer: StartedTestContainer;
  let rabbitmqConnection: Connection;
  let channel: Channel;
  let wsClient: Socket;

  beforeAll(async () => {
    // Start RabbitMQ container
    console.log('[Test] Starting RabbitMQ container...');
    rabbitmqContainer = await new GenericContainer('rabbitmq:3-management')
      .withExposedPorts(5672, 15672)
      .start();

    const rabbitmqUrl = `amqp://${rabbitmqContainer.getHost()}:${rabbitmqContainer.getMappedPort(5672)}`;
    console.log(`[Test] RabbitMQ running at: ${rabbitmqUrl}`);

    // Connect to RabbitMQ
    rabbitmqConnection = await amqp.connect(rabbitmqUrl);
    channel = await rabbitmqConnection.createChannel();

    // Assert exchange and queue
    await channel.assertExchange(EXCHANGE_NAME, 'fanout', { durable: false });
    await channel.assertQueue(QUEUE_NAME, { durable: false });
    await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, '');

    console.log('[Test] RabbitMQ setup complete');
  }, 60000); // 60 second timeout for container startup

  afterAll(async () => {
    // Cleanup
    if (wsClient) {
      wsClient.disconnect();
    }
    if (channel) {
      await channel.close();
    }
    if (rabbitmqConnection) {
      await rabbitmqConnection.close();
    }
    if (rabbitmqContainer) {
      await rabbitmqContainer.stop();
    }
  });

  it('should receive trade notification from RabbitMQ and broadcast via WebSocket', async () => {
    // This test verifies the end-to-end flow:
    // 1. Publish message to RabbitMQ
    // 2. Service N consumes it
    // 3. Service N broadcasts it via WebSocket
    // 4. WebSocket client receives it

    // Note: This test expects Service N to be running separately
    // For a full integration test, you would start Service N programmatically

    const tradeNotification = {
      id: 'test-trade-123',
      assetId: 'BATTERY_GRID_01',
      action: 'BUY',
      volume: 50,
      price: 75.5,
      totalValue: 3775,
      timestamp: new Date().toISOString(),
      status: 'approved',
      checkId: 'check-456',
    };

    // Connect WebSocket client
    wsClient = ioClient(`http://localhost:${WS_PORT}`, {
      transports: ['websocket'],
      reconnection: false,
    });

    // Wait for WebSocket connection
    await new Promise<void>((resolve, reject) => {
      wsClient.on('connect', () => {
        console.log('[Test] WebSocket connected');
        resolve();
      });
      wsClient.on('connect_error', (error) => {
        console.error('[Test] WebSocket connection error:', error);
        reject(error);
      });
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
    });

    // Set up listener for trade.update event
    const tradeUpdatePromise = new Promise((resolve) => {
      wsClient.on('trade.update', (data) => {
        console.log('[Test] Received trade.update:', data);
        resolve(data);
      });
    });

    // Publish message to RabbitMQ
    console.log('[Test] Publishing trade notification to RabbitMQ...');
    channel.publish(EXCHANGE_NAME, '', Buffer.from(JSON.stringify(tradeNotification)));

    // Wait for WebSocket to receive the message (with timeout)
    const receivedTrade = await Promise.race([
      tradeUpdatePromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for trade.update')), 5000)
      ),
    ]);

    // Verify the received trade matches what we sent
    expect(receivedTrade).toEqual(tradeNotification);
  }, 15000); // 15 second timeout for test

  it('should handle multiple trade notifications', async () => {
    const trades = [
      {
        id: 'test-1',
        assetId: 'BATTERY_GRID_01',
        action: 'BUY',
        volume: 30,
        price: 70.0,
        totalValue: 2100,
        timestamp: new Date().toISOString(),
        status: 'approved',
      },
      {
        id: 'test-2',
        assetId: 'BATTERY_GRID_02',
        action: 'SELL',
        volume: 150,
        price: 80.0,
        totalValue: 0,
        timestamp: new Date().toISOString(),
        status: 'rejected',
        rejectionReason: 'Volume exceeds limit',
      },
    ];

    // Connect WebSocket client
    wsClient = ioClient(`http://localhost:${WS_PORT}`, {
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
      wsClient.on('connect', resolve);
      wsClient.on('connect_error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    const receivedTrades: unknown[] = [];

    // Set up listener
    wsClient.on('trade.update', (data) => {
      receivedTrades.push(data);
    });

    // Publish multiple messages
    for (const trade of trades) {
      channel.publish(EXCHANGE_NAME, '', Buffer.from(JSON.stringify(trade)));
    }

    // Wait for all messages to be received
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify we received all trades
    expect(receivedTrades.length).toBe(2);
    expect(receivedTrades).toContainEqual(expect.objectContaining({ id: 'test-1' }));
    expect(receivedTrades).toContainEqual(expect.objectContaining({ id: 'test-2' }));
  }, 15000);
});
