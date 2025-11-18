import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import mongoose from 'mongoose';
import amqp, { ConsumeMessage } from 'amqplib';
import { AuditLog } from '../../src/models/AuditLog';

describe('Audit Service Integration Tests', () => {
  let mongoContainer: StartedTestContainer;
  let rabbitmqContainer: StartedTestContainer;
  let mongoUrl: string;
  let rabbitmqUrl: string;
  let connection: any;
  let channel: any;

  beforeAll(async () => {
    // Start MongoDB container
    console.log('Starting MongoDB container...');
    mongoContainer = await new GenericContainer('mongo:6')
      .withExposedPorts(27017)
      .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
      .start();

    const mongoHost = mongoContainer.getHost();
    const mongoPort = mongoContainer.getMappedPort(27017);
    mongoUrl = `mongodb://${mongoHost}:${mongoPort}/audit_logs_test`;

    console.log(`MongoDB container started at ${mongoUrl}`);

    // Connect to MongoDB
    await mongoose.connect(mongoUrl);
    console.log('Connected to MongoDB');

    // Start RabbitMQ container
    console.log('Starting RabbitMQ container...');
    rabbitmqContainer = await new GenericContainer('rabbitmq:3-management')
      .withExposedPorts(5672)
      .withWaitStrategy(Wait.forLogMessage(/Server startup complete/))
      .start();

    const rabbitmqHost = rabbitmqContainer.getHost();
    const rabbitmqPort = rabbitmqContainer.getMappedPort(5672);
    rabbitmqUrl = `amqp://${rabbitmqHost}:${rabbitmqPort}`;

    console.log(`RabbitMQ container started at ${rabbitmqUrl}`);

    // Connect to RabbitMQ
    connection = await amqp.connect(rabbitmqUrl);
    channel = await connection.createChannel();
    console.log('Connected to RabbitMQ');
  }, 120000);

  afterAll(async () => {
    // Close RabbitMQ connections
    if (channel) {
      await channel.close();
    }
    if (connection) {
      await connection.close();
    }

    // Close MongoDB connection
    await mongoose.disconnect();

    // Stop containers
    if (mongoContainer) {
      await mongoContainer.stop();
    }
    if (rabbitmqContainer) {
      await rabbitmqContainer.stop();
    }
  }, 60000);

  it('should save audit log to MongoDB', async () => {
    const auditLogData = {
      eventType: 'TRADE_EXECUTED',
      serviceName: 'service-b',
      payload: {
        assetId: 'BATTERY_01',
        action: 'BUY',
        volume: 50,
        price: 100.5,
      },
      metadata: {
        correlationId: 'test-123',
      },
    };

    const auditLog = new AuditLog(auditLogData);
    const savedLog = await auditLog.save();

    expect(savedLog._id).toBeDefined();
    expect(savedLog.eventType).toBe('TRADE_EXECUTED');
    expect(savedLog.serviceName).toBe('service-b');

    // Verify it was saved to MongoDB
    const foundLog = await AuditLog.findById(savedLog._id);
    expect(foundLog).toBeDefined();
    expect(foundLog?.eventType).toBe('TRADE_EXECUTED');
  });

  it('should consume message from RabbitMQ fanout exchange and save to MongoDB', async () => {
    const EXCHANGE_NAME = 'system_events_test';

    // Assert fanout exchange
    await channel.assertExchange(EXCHANGE_NAME, 'fanout', { durable: false });

    // Create an exclusive queue and bind to exchange (simulating service-e behavior)
    const queueResult = await channel.assertQueue('', { exclusive: true });
    const queueName = queueResult.queue;
    await channel.bindQueue(queueName, EXCHANGE_NAME, '');

    // Track received messages
    const receivedMessages: any[] = [];

    // Start consuming
    const consumerTag = await channel.consume(
      queueName,
      async (msg: ConsumeMessage | null) => {
        if (msg) {
          const content = msg.content.toString();
          const event = JSON.parse(content);

          // Save to MongoDB (simulating service-e logic)
          const auditLog = new AuditLog({
            eventType: event.eventType || 'unknown',
            serviceName: event.serviceName || 'unknown',
            payload: event.payload || event,
            timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
            metadata: event.metadata || {},
          });

          await auditLog.save();
          receivedMessages.push(event);
          channel.ack(msg);
        }
      },
      { noAck: false }
    );

    // Wait a bit for consumer to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Publish a test event to the fanout exchange
    const testEvent = {
      eventType: 'SIGNAL_GENERATED',
      serviceName: 'service-a',
      payload: {
        assetId: 'BATTERY_02',
        action: 'SELL',
        volume: 75,
      },
      timestamp: new Date().toISOString(),
      metadata: {
        correlationId: 'test-fanout-123',
      },
    };

    channel.publish(EXCHANGE_NAME, '', Buffer.from(JSON.stringify(testEvent)));

    // Wait for message to be processed
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify message was received
    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].eventType).toBe('SIGNAL_GENERATED');

    // Verify it was saved to MongoDB
    const savedLogs = await AuditLog.find({ eventType: 'SIGNAL_GENERATED' });
    expect(savedLogs.length).toBeGreaterThan(0);
    expect(savedLogs[0].serviceName).toBe('service-a');
    expect(savedLogs[0].payload.assetId).toBe('BATTERY_02');

    // Cancel consumer
    await channel.cancel(consumerTag.consumerTag);
  });

  it('should handle multiple messages from fanout exchange', async () => {
    const EXCHANGE_NAME = 'system_events_multi_test';

    // Assert fanout exchange
    await channel.assertExchange(EXCHANGE_NAME, 'fanout', { durable: false });

    // Create an exclusive queue and bind to exchange
    const queueResult = await channel.assertQueue('', { exclusive: true });
    const queueName = queueResult.queue;
    await channel.bindQueue(queueName, EXCHANGE_NAME, '');

    // Track received messages
    let messageCount = 0;

    // Start consuming
    const consumerTag = await channel.consume(
      queueName,
      async (msg: ConsumeMessage | null) => {
        if (msg) {
          const content = msg.content.toString();
          const event = JSON.parse(content);

          // Save to MongoDB
          const auditLog = new AuditLog({
            eventType: event.eventType || 'unknown',
            serviceName: event.serviceName || 'unknown',
            payload: event.payload || event,
          });

          await auditLog.save();
          messageCount++;
          channel.ack(msg);
        }
      },
      { noAck: false }
    );

    // Wait for consumer to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Publish multiple events
    const eventsToPublish = 5;
    for (let i = 0; i < eventsToPublish; i++) {
      const event = {
        eventType: 'BATCH_EVENT',
        serviceName: `service-${i}`,
        payload: { index: i, timestamp: Date.now() },
      };
      channel.publish(EXCHANGE_NAME, '', Buffer.from(JSON.stringify(event)));
    }

    // Wait for all messages to be processed
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify all messages were received
    expect(messageCount).toBe(eventsToPublish);

    // Verify all were saved to MongoDB
    const savedLogs = await AuditLog.find({ eventType: 'BATCH_EVENT' });
    expect(savedLogs.length).toBe(eventsToPublish);

    // Cancel consumer
    await channel.cancel(consumerTag.consumerTag);
  });

  it('should query audit logs by eventType', async () => {
    // Create multiple audit logs with different event types
    await AuditLog.create([
      {
        eventType: 'USER_LOGIN',
        serviceName: 'auth-service',
        payload: { username: 'user1' },
      },
      {
        eventType: 'USER_LOGIN',
        serviceName: 'auth-service',
        payload: { username: 'user2' },
      },
      {
        eventType: 'USER_LOGOUT',
        serviceName: 'auth-service',
        payload: { username: 'user1' },
      },
    ]);

    // Query by eventType
    const loginLogs = await AuditLog.find({ eventType: 'USER_LOGIN' });
    expect(loginLogs.length).toBe(2);

    const logoutLogs = await AuditLog.find({ eventType: 'USER_LOGOUT' });
    expect(logoutLogs.length).toBe(1);
  });

  it('should query audit logs by serviceName', async () => {
    // Create audit logs from different services
    await AuditLog.create([
      {
        eventType: 'TRADE_EXECUTED',
        serviceName: 'service-b',
        payload: { trade: 1 },
      },
      {
        eventType: 'SIGNAL_GENERATED',
        serviceName: 'service-a',
        payload: { signal: 1 },
      },
    ]);

    // Query by serviceName
    const serviceBLogs = await AuditLog.find({ serviceName: 'service-b' });
    expect(serviceBLogs.length).toBeGreaterThan(0);

    const serviceALogs = await AuditLog.find({ serviceName: 'service-a' });
    expect(serviceALogs.length).toBeGreaterThan(0);
  });
});
