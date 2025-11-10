# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A microservices-based trading platform demonstrating event-driven architecture with RabbitMQ message queuing. The system simulates high-frequency trading signals with horizontally scalable consumers.

**Core Pattern**: Service A (producer) generates trading signals every 3 seconds → RabbitMQ (message broker) → Service B (consumer, horizontally scalable) processes signals with at-least-once delivery guarantee.

## Architecture

### Services
- **Service A** (`service-a/`): Signal generator/producer that publishes trading signals to RabbitMQ
  - Generates mock `TradeSignal` objects (assetId, action: BUY/SELL, volume, timestamp)
  - Publishes to `trading_signals` queue every 3 seconds
  - Single instance (not horizontally scalable)

- **Service B** (`service-b/`): Trade execution engine/consumer that processes signals
  - Consumes from `trading_signals` queue
  - Simulates 50ms processing time per message
  - Horizontally scalable (can run multiple instances with round-robin load balancing)
  - Uses manual message acknowledgment (ack/nack) for reliability

- **RabbitMQ**: Message broker providing asynchronous communication
  - Queue name: `trading_signals`
  - Non-durable queue (doesn't persist across restarts)
  - Enables horizontal scaling via round-robin distribution

### Communication Flow
1. Service A connects to RabbitMQ and asserts the `trading_signals` queue
2. Service A publishes JSON-serialized `TradeSignal` messages as Buffers
3. RabbitMQ distributes messages round-robin across Service B instances
4. Service B instances consume messages, process them, and acknowledge (ack) on success or reject (nack) on failure

### Shared Type Definition
Both services duplicate the `TradeSignal` type definition:
```typescript
type TradeSignal = {
  assetId: string;
  action: 'BUY' | 'SELL';
  volume: number;
  timestamp: string;
};
```
Note: In production, this would be in a shared types package.

## Development Commands

### Docker Compose (Production-like)
```bash
# Start all services (RabbitMQ + Service A + Service B)
docker compose up --build -d

# Scale Service B to 5 instances for horizontal scaling demo
docker compose up -d --scale service-b=5

# View logs (all services)
docker compose logs -f

# View logs for specific service
docker compose logs -f service-a
docker compose logs -f service-b

# Stop all services
docker compose down
```

### Local Development
```bash
# Start RabbitMQ locally
docker run -d --name rabbitmq-dev -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# Service A
cd service-a
npm install
npm start        # Run with ts-node
npm run build    # Compile TypeScript to dist/

# Service B
cd service-b
npm install
npm start        # Run with ts-node
npm run build    # Compile TypeScript to dist/
```

### Monitoring
- RabbitMQ Management UI: http://localhost:15672 (guest/guest)
  - View queue depth, message rates, consumer connections
  - Useful for observing load balancing across Service B instances

## Environment Configuration

### Environment Variables
- `RABBITMQ_URL`: RabbitMQ connection string
  - Docker: `amqp://rabbitmq` (uses Docker network service name)
  - Local: `amqp://localhost` (default)
  - Set in `docker-compose.yml` for containerized services

## Build System

### TypeScript Configuration
- Target: ES2020
- Module: CommonJS
- Strict mode enabled
- Source: `src/` → Output: `dist/`
- Both services share identical `tsconfig.json`

### Docker Multi-stage Build
- Stage 1 (builder): Compile TypeScript with full dependencies
- Stage 2 (production): Copy compiled JS + production dependencies only
- Shared `Dockerfile.node` used by both services via different build contexts in `docker-compose.yml`

## Key Implementation Details

### Message Acknowledgment Pattern
Service B uses manual acknowledgment for reliability:
- Success: `channel.ack(msg)` removes message from queue
- Failure: `channel.nack(msg, false, true)` requeues message for retry
- This ensures at-least-once delivery guarantee
- Warning: No poison message handling (infinite retry on persistent failures)

### Scaling Considerations
- Service A: Single instance (generates signals at fixed rate)
- Service B: Horizontally scalable (use `--scale` flag)
- RabbitMQ: Single instance (can be clustered in production)
- Load balancing: Automatic round-robin by RabbitMQ

## Future Roadmap
Per README, planned integrations include:
- Redis caching layer for market data
- gRPC service for portfolio management (low-latency sync calls)
- API Gateway (Kong) with rate limiting
- Time-series DB (InfluxDB/TimescaleDB)
- Observability stack (Prometheus, Grafana, distributed tracing)
