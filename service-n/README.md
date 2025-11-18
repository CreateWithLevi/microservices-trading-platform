# Service N - Notification Service

Real-time notification service for broadcasting trade events via WebSockets. This service decouples WebSocket communication from the trade execution worker (Service B), allowing independent scaling and better separation of concerns.

## Architecture

**Service N** acts as a dedicated notification layer in the trading platform:
- Consumes trade notifications from RabbitMQ (`trading_events` exchange)
- Broadcasts events to all connected frontend clients via Socket.io
- Horizontally scalable and stateless

## Features

- **WebSocket Broadcasting**: Real-time trade updates via Socket.io
- **RabbitMQ Integration**: Consumes from `trading_events` exchange
- **Fanout Pattern**: All connected clients receive all trade updates
- **Stateless Design**: No local state, easily scalable
- **CORS Support**: Configurable origin for frontend connections

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **WebSocket**: Socket.io
- **Message Queue**: RabbitMQ (amqplib)
- **Testing**: Vitest + Testcontainers

## Getting Started

### Prerequisites

- Node.js 20+
- RabbitMQ running (with `trading_events` exchange)
- Service B publishing trade notifications

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run integration tests
npm run test:integration
```

### Environment Variables

```env
# RabbitMQ connection string
RABBITMQ_URL=amqp://localhost

# WebSocket server port
WS_PORT=3002

# Allowed CORS origin for WebSocket
CORS_ORIGIN=http://localhost:3000
```

## Docker

Included in the main `docker-compose.yml`:

```bash
# Start all services including Service N
cd ..
docker compose up --build

# Service N will listen on port 3002
```

## Project Structure

```
service-n/
├── src/
│   ├── index.ts              # Main entry point
│   ├── websocket-server.ts   # Socket.io server
│   └── types.ts              # TypeScript types
├── tests/
│   ├── integration/          # Integration tests
│   └── unit/                 # Unit tests
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
└── README.md                 # This file
```

## RabbitMQ Configuration

### Exchange
- **Name**: `trading_events`
- **Type**: `fanout`
- **Durable**: `false`

### Queue
- **Name**: `trade_notifications`
- **Durable**: `false`
- **Binding**: Bound to `trading_events` exchange

### Message Format

Service N expects trade notification messages in this format:

```typescript
{
  id: string;              // Unique trade ID
  assetId: string;         // Asset identifier
  action: 'BUY' | 'SELL';  // Trade action
  volume: number;          // Trade volume (MWh)
  price: number;           // Price per unit
  totalValue: number;      // Calculated total
  timestamp: string;       // ISO timestamp
  status: 'approved' | 'rejected';
  rejectionReason?: string;  // If rejected
  checkId?: string;          // Risk check ID
}
```

## WebSocket Events

### Client Events

#### `connect`
Emitted when a client connects successfully.

#### `disconnect`
Emitted when a client disconnects.

### Server Events

#### `trade.update`
Broadcast to all connected clients when a trade notification is received.

**Payload**: Same as the RabbitMQ message format (see above).

## Integration with Other Services

- **Service B** publishes trade notifications to `trading_events` exchange
- **Frontend** connects as a WebSocket client to receive real-time updates
- **RabbitMQ** acts as the message broker

## Testing

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests
```bash
# Requires Docker for testcontainers
npm run test:integration
```

Integration tests verify:
- RabbitMQ message consumption
- WebSocket broadcasting
- End-to-end message flow

## Production Considerations

### Scaling
- Service N is stateless and can be horizontally scaled
- For multiple instances, use **Redis Pub/Sub adapter** with Socket.io
- Enables event sharing across all Service N instances

### Security
- Configure CORS to allow only trusted origins
- Consider adding WebSocket authentication
- Use HTTPS/WSS in production

### Monitoring
- Monitor WebSocket connection count
- Track message processing rate
- Alert on RabbitMQ connection failures
