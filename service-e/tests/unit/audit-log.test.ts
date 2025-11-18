import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { AuditLog } from '../../src/models/AuditLog';

describe('AuditLog Model', () => {
  beforeAll(async () => {
    // Connect to in-memory MongoDB for unit tests
    await mongoose.connect('mongodb://127.0.0.1:27017/audit_logs_test');
  });

  afterAll(async () => {
    // Clean up
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('should create a valid audit log with required fields', async () => {
    const auditLogData = {
      eventType: 'TRADE_EXECUTED',
      serviceName: 'service-b',
      payload: {
        assetId: 'BATTERY_01',
        action: 'BUY',
        volume: 50,
        price: 100.5,
      },
    };

    const auditLog = new AuditLog(auditLogData);
    const savedLog = await auditLog.save();

    expect(savedLog._id).toBeDefined();
    expect(savedLog.eventType).toBe('TRADE_EXECUTED');
    expect(savedLog.serviceName).toBe('service-b');
    expect(savedLog.payload).toEqual(auditLogData.payload);
    expect(savedLog.timestamp).toBeInstanceOf(Date);
  });

  it('should store flexible payload with any structure', async () => {
    const complexPayload = {
      nested: {
        data: {
          level: 3,
          values: [1, 2, 3],
        },
      },
      metadata: {
        userId: 'user123',
        ipAddress: '192.168.1.1',
      },
      customField: true,
    };

    const auditLog = new AuditLog({
      eventType: 'CUSTOM_EVENT',
      serviceName: 'service-test',
      payload: complexPayload,
    });

    const savedLog = await auditLog.save();

    expect(savedLog.payload).toEqual(complexPayload);
    expect(savedLog.payload.nested.data.level).toBe(3);
    expect(savedLog.payload.metadata.userId).toBe('user123');
  });

  it('should add metadata field if provided', async () => {
    const auditLog = new AuditLog({
      eventType: 'USER_LOGIN',
      serviceName: 'auth-service',
      payload: { username: 'testuser' },
      metadata: {
        correlationId: 'abc-123',
        userId: 'user-456',
        ipAddress: '10.0.0.1',
      },
    });

    const savedLog = await auditLog.save();

    expect(savedLog.metadata).toBeDefined();
    expect(savedLog.metadata?.correlationId).toBe('abc-123');
    expect(savedLog.metadata?.userId).toBe('user-456');
  });

  it('should automatically add timestamps', async () => {
    const auditLog = new AuditLog({
      eventType: 'TEST_EVENT',
      serviceName: 'test-service',
      payload: { test: true },
    });

    const savedLog = await auditLog.save();

    expect(savedLog.createdAt).toBeInstanceOf(Date);
    expect(savedLog.updatedAt).toBeInstanceOf(Date);
  });

  it('should fail validation if required fields are missing', async () => {
    const invalidLog = new AuditLog({
      // Missing eventType
      serviceName: 'test-service',
      payload: { test: true },
    });

    await expect(invalidLog.save()).rejects.toThrow();
  });
});
