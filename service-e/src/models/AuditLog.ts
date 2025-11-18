import mongoose, { Schema, Document } from 'mongoose';

/**
 * Interface for AuditLog document
 */
export interface IAuditLog extends Document {
  eventType: string;
  serviceName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>;
  timestamp: Date;
  metadata?: {
    correlationId?: string;
    userId?: string;
    ipAddress?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Mongoose schema for audit logs
 * Uses Schema.Types.Mixed for flexible payload storage
 */
const AuditLogSchema = new Schema<IAuditLog>(
  {
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    serviceName: {
      type: String,
      required: true,
      index: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      required: false,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
    collection: 'audit_logs',
  }
);

// Create indexes for common query patterns
AuditLogSchema.index({ eventType: 1, timestamp: -1 });
AuditLogSchema.index({ serviceName: 1, timestamp: -1 });

/**
 * AuditLog model
 */
export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
