# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A microservices-based trading platform demonstrating event-driven architecture with RabbitMQ message queuing and gRPC-based risk validation. The system simulates high-frequency trading signals with horizontally scalable consumers and real-time risk checking.

**Core Pattern**: Service A (producer) generates trading signals every 3 seconds → RabbitMQ (message broker) → Service B (consumer, horizontally scalable) validates trades with Service C (gRPC risk checker) → processes approved signals with at-least-once delivery guarantee.

## Architecture

### Services
- **Service A** (`service-a/`): Signal generator/producer that publishes trading signals to RabbitMQ
  - Generates mock `TradeSignal` objects (assetId, action: BUY/SELL, volume, timestamp)
  - Publishes to `trading_signals` queue every 3 seconds
  - Single instance (not horizontally scalable)

- **Service B** (`service-b/`): Trade execution engine/consumer that processes signals
  - Consumes from `trading_signals` queue
  - **Validates trades with Service C via gRPC before execution**
  - **Broadcasts trade events via WebSocket server (Socket.io) on port 3001**
  - Integrates Redis for caching asset prices and storing trade history
  - Simulates 50ms processing time per message
  - Horizontally scalable (can run multiple instances with round-robin load balancing)
  - Uses manual message acknowledgment (ack/nack) for reliability

- **Service C** (`service-c/`): Risk checker service (gRPC server) written in Go
  - Validates trades against risk rules (volume limits, position limits, etc.)
  - Exposes gRPC API on port 50051
  - Returns `TradeRiskResponse` with `allowed` flag and rejection reason
  - Horizontally scalable (stateless design)
  - Low-latency (<10ms response time)

- **RabbitMQ**: Message broker providing asynchronous communication
  - Queue name: `trading_signals`
  - Non-durable queue (doesn't persist across restarts)
  - Enables horizontal scaling via round-robin distribution

- **Redis**: In-memory data store for caching and fast data access
  - Caches asset prices with 30-second TTL
  - Stores last 100 trades in `trade_history` list
  - Tracks trade counts per asset
  - Persistence enabled with AOF (Append-Only File)

- **Frontend** (`frontend/`): Real-time dashboard built with Next.js 14+
  - Displays live trade execution data via WebSocket connection
  - Built with Next.js App Router, TypeScript, and Tailwind CSS
  - Uses Zustand for state management
  - Socket.io client connects to Service B's WebSocket server
  - Real-time updates for approved and rejected trades
  - Runs on port 3000

### Communication Flow
1. Service A connects to RabbitMQ and asserts the `trading_signals` queue
2. Service A publishes JSON-serialized `TradeSignal` messages as Buffers
3. RabbitMQ distributes messages round-robin across Service B instances
4. Service B instances:
   - Consume messages from RabbitMQ
   - **Call Service C via gRPC to validate trade risk**
     - If `allowed: false` → Log rejection reason, broadcast rejection via WebSocket, acknowledge message, skip trade
     - If `allowed: true` → Proceed with execution
     - If Service C unavailable → Log error, broadcast error via WebSocket, acknowledge message, skip trade (fail-safe)
   - Check Redis cache for asset price (cache hit) or generate new price (cache miss)
   - Calculate trade value using cached price
   - Store trade record in Redis (`trade_history` list)
   - Increment trade counter in Redis
   - **Broadcast trade result via WebSocket to all connected clients**
   - Acknowledge message to RabbitMQ on success or reject (nack) on failure
5. Service C (when called):
   - Receives `TradeRiskRequest` via gRPC
   - Validates trade against risk rules (volume < 100 MWh, valid action, etc.)
   - Returns `TradeRiskResponse` with `allowed` boolean and reason string
6. Frontend Dashboard:
   - Connects to Service B's WebSocket server via Socket.io client
   - Listens for `trade:processed` events
   - Updates Zustand store with new trade data
   - Renders real-time trade list with approval/rejection status

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
# Start all services (RabbitMQ + Redis + Service A + Service B + Service C)
docker compose up --build -d

# Scale Service B to 5 instances for horizontal scaling demo
docker compose up -d --scale service-b=5

# View logs (all services)
docker compose logs -f

# View logs for specific service
docker compose logs -f service-a
docker compose logs -f service-b
docker compose logs -f service-c
docker compose logs -f redis

# Stop all services
docker compose down
```

### Local Development
```bash
# Start RabbitMQ locally
docker run -d --name rabbitmq-dev -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# Start Redis locally
docker run -d --name redis-dev -p 6379:6379 redis:7-alpine

# Start Service C (Risk Checker) locally
cd service-c
docker build -t service-c:dev .
docker run -d --name service-c-dev -p 50051:50051 service-c:dev

# Service A
cd service-a
npm install
npm start        # Run with ts-node
npm run build    # Compile TypeScript to dist/

# Service B
cd service-b
npm install
RISK_SERVICE_URL=localhost:50051 npm start  # Run with ts-node
npm run build    # Compile TypeScript to dist/
```

### Monitoring
- RabbitMQ Management UI: http://localhost:15672 (guest/guest)
  - View queue depth, message rates, consumer connections
  - Useful for observing load balancing across Service B instances

- Redis CLI (inspect cache and data):
  ```bash
  # Connect to Redis container
  docker exec -it redis redis-cli

  # Useful commands:
  GET price:BATTERY_GRID_01           # Get cached price
  LRANGE trade_history 0 9            # View last 10 trades
  GET trade_count:BATTERY_GRID_01     # Get trade count for asset
  KEYS *                              # List all keys
  TTL price:BATTERY_GRID_01           # Check time-to-live for price cache
  ```

## Environment Configuration

### Environment Variables
- `RABBITMQ_URL`: RabbitMQ connection string
  - Docker: `amqp://rabbitmq` (uses Docker network service name)
  - Local: `amqp://localhost` (default)
  - Set in `docker-compose.yml` for containerized services

- `REDIS_URL`: Redis connection string (Service B only)
  - Docker: `redis://redis:6379` (uses Docker network service name)
  - Local: `redis://localhost:6379` (default)
  - Set in `docker-compose.yml` for containerized services

- `RISK_SERVICE_URL`: gRPC Risk Service connection string (Service B only)
  - Docker: `service-c:50051` (uses Docker network service name)
  - Local: `localhost:50051` (default)
  - Set in `docker-compose.yml` for containerized services

- `GRPC_PORT`: gRPC server port (Service C only)
  - Default: `50051`
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

### Redis Caching Strategy (Service B)
Service B implements a cache-aside pattern:
- **Price Caching**: Asset prices cached for 30 seconds with `SETEX`
  - Cache hit: Retrieves price from Redis (fast)
  - Cache miss: Generates new price, stores in Redis, returns value
- **Trade History**: Stores last 100 trades using Redis lists (`LPUSH` + `LTRIM`)
- **Trade Counters**: Tracks trade count per asset with `INCR`
- **Connection Handling**: Automatic retry with exponential backoff (max 2s delay)

### Message Acknowledgment Pattern
Service B uses manual acknowledgment for reliability:
- Success: `channel.ack(msg)` removes message from queue
- Failure: `channel.nack(msg, false, true)` requeues message for retry
- This ensures at-least-once delivery guarantee
- Warning: No poison message handling (infinite retry on persistent failures)

### Scaling Considerations
- Service A: Single instance (generates signals at fixed rate)
- Service B: Horizontally scalable (use `--scale` flag)
  - All instances share same Redis cache
  - Price cache reduces redundant calculations across instances
  - All instances call same Service C for risk checks
- Service C: Horizontally scalable (stateless gRPC server)
  - Can run multiple instances behind a load balancer
  - No shared state, pure validation logic
- RabbitMQ: Single instance (can be clustered in production)
- Redis: Single instance (can use Redis Cluster/Sentinel for HA)
- Load balancing: Automatic round-robin by RabbitMQ

## gRPC Risk Service Integration

### Overview
Service C is a Go-based gRPC server that validates trades before execution. Service B calls it synchronously before processing each trade.

### Architecture
```
Service B (TypeScript)  →  gRPC Client  →  Service C (Go)
                                              gRPC Server
```

### Implementation Details

**Service C (Go):**
- Location: `service-c/`
- Framework: gRPC with Protocol Buffers
- Port: 50051
- Protobuf definition: `protos/risk.proto`
- Generated code: `service-c/pkg/riskpb/`
- Implementation: `service-c/internal/server/risk_server.go`

**Service B (TypeScript):**
- gRPC Client wrapper: `service-b/src/grpc-client.ts`
- Integration point: `service-b/src/index.ts` in `processTrade()` function
- Dependencies: `@grpc/grpc-js`, `@grpc/proto-loader`

### Trade Validation Flow
1. Service B receives trade signal from RabbitMQ
2. Service B calls `RiskClient.checkRisk()` with trade details
3. Service C validates trade (volume < 100 MWh, valid action, etc.)
4. Service C returns `TradeRiskResponse`:
   - `allowed: true` → Service B proceeds with execution
   - `allowed: false` → Service B logs rejection and skips trade
5. If gRPC call fails (Service C down):
   - Service B logs error
   - Service B skips trade (fail-safe behavior)
   - Message is acknowledged to prevent requeue

### Error Handling
The RiskClient implements comprehensive error handling:
- **UNAVAILABLE**: Service C is down or unreachable
- **DEADLINE_EXCEEDED**: Request timeout (5 second deadline)
- **Other errors**: Generic gRPC errors with error codes

All errors result in trade rejection to maintain system safety.

### Testing
- Unit tests: Mock RiskClient responses in `service-b/tests/integration/risk-integration.test.ts`
- Integration tests: Use Vitest mocks to simulate allowed/rejected/error scenarios
- No live gRPC server needed for CI (mocked)

## Git Workflow & Branching Model

This project follows the **Git Flow** branching model for professional version control.

### Branch Structure

- **`main`**: Production-ready code
  - Always stable and deployable
  - Only receives merges from `develop` branch for releases
  - Protected branch (requires PR reviews)
  - Tagged with version numbers (e.g., `v1.0.0`)

- **`develop`**: Integration branch for active development
  - Main development branch where features are integrated
  - Always contains the latest delivered development changes
  - Base branch for all new feature branches
  - Should be stable but may contain unreleased features

- **`feature/*`**: Feature branches
  - Created from `develop` branch
  - Naming convention: `feature/brief-description` (e.g., `feature/add-redis-cache`)
  - One feature per branch
  - Merged back into `develop` via Pull Request
  - Deleted after successful merge

### Workflow Process

1. **Starting a new feature**:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/my-feature-name
   ```

2. **Development**:
   - Make atomic commits with conventional commit messages
   - Commit format: `type(scope): description`
   - Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
   - Example: `feat(service-a): add signal validation`

3. **Creating Pull Request**:
   ```bash
   git push -u origin feature/my-feature-name
   gh pr create --base develop --title "Feature title" --body "Description"
   ```
   - ALWAYS target `develop` branch (not `main`)
   - Write comprehensive PR descriptions
   - Include summary, changes, testing notes

4. **After PR approval**:
   - Merge PR into `develop` using GitHub UI
   - Delete feature branch
   - Pull latest `develop` locally

5. **Release to production**:
   - Create PR from `develop` to `main`
   - After merge, tag the release: `git tag v1.0.0`
   - Push tags: `git push --tags`

### Commit Message Format

Follow conventional commits:
```
<type>(<scope>): <description>

[optional body]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring (no functional changes)
- `test`: Adding or updating tests
- `chore`: Maintenance tasks (dependencies, config)

**Examples**:
```
feat(service-a): add signal validation logic
fix(service-b): resolve Redis connection timeout
docs: update CLAUDE.md with branching model
test(service-b): add integration tests for Redis caching
refactor(service-a): extract signal generation to separate module
chore: update dependencies to latest versions
```

### Important Rules

1. **Never commit directly to `main` or `develop`**
   - Always use feature branches and PRs

2. **Always create feature branches from `develop`**
   - Not from `main` or other feature branches

3. **Keep feature branches focused**
   - One feature/fix per branch
   - Make atomic commits

4. **Write clear PR descriptions**
   - Include what changed, why, and how to test

5. **Delete merged feature branches**
   - Keeps repository clean
   - Use `git branch -d feature/branch-name` locally

### Branch Protection (Recommended)

Configure GitHub branch protection for `main` and `develop`:
- Require pull request reviews before merging
- Require status checks to pass (CI/CD tests)
- Require branches to be up to date before merging
- No direct pushes allowed

## Testing Infrastructure

### Test Suites
Both services include comprehensive test coverage:

**Unit Tests**:
- Located in `tests/unit/`
- Test individual functions in isolation
- Use Vitest with mocking for external dependencies
- Run with: `npm run test:unit`

**Integration Tests**:
- Located in `tests/integration/`
- Test real interactions with RabbitMQ and Redis
- Use testcontainers to spin up real service instances
- Run with: `npm run test:integration`

### Running Tests
```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run with coverage report
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# View test UI
npm run test:ui
```

### Code Quality Tools

**ESLint**:
- TypeScript-aware linting with strict rules
- Configuration: `.eslintrc.json` in each service
- Run: `npm run lint`
- Auto-fix: `npm run lint:fix`

**Prettier**:
- Consistent code formatting
- Configuration: `.prettierrc.json` in each service
- Check formatting: `npm run format:check`
- Auto-format: `npm run format`

**TypeScript**:
- Strict mode enabled
- Type checking: `npm run type-check`

### Pre-commit Workflow (Recommended)
Before committing:
```bash
npm run type-check  # Verify TypeScript types
npm run lint:fix    # Fix linting issues
npm run format      # Format code
npm test            # Run all tests
```

## CI/CD Pipeline

### GitHub Actions Workflow
The project includes a comprehensive CI/CD pipeline (`.github/workflows/ci.yml`) that runs on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

**Pipeline Jobs** (run in parallel):
1. **Service A - Test & Lint**:
   - Runs unit tests with Vitest
   - Runs integration tests with testcontainers (RabbitMQ)
   - Performs ESLint checks
   - Performs Prettier formatting checks
   - Runs TypeScript type checking
   - Generates coverage report (non-blocking)

2. **Service B - Test & Lint**:
   - Runs unit tests with Vitest
   - Runs integration tests with testcontainers (RabbitMQ + Redis)
   - Performs ESLint checks
   - Performs Prettier formatting checks
   - Runs TypeScript type checking
   - Generates coverage report (non-blocking)

3. **Docker Build Test**:
   - Builds both service Docker images
   - Validates multi-stage build process
   - Tests Docker Compose configuration

**Key CI Features**:
- Parallel job execution for faster feedback
- Comprehensive test coverage (unit + integration)
- Automated code quality checks (lint + format + type-check)
- Docker build validation
- Coverage reporting (non-blocking to not fail CI)

**Common CI Issues & Fixes**:
- **Prettier formatting errors**: Run `npm run lint:fix` to auto-fix
- **Integration test timeouts**: Ensure proper consumer lifecycle management (cancel consumers after tests)
- **RabbitMQ consumer interference**: Always purge queues before tests and cancel consumers with `channel.cancel(consumerTag)`
- **TypeScript errors**: Run `npm run type-check` locally before committing

## Real-time WebSockets & Frontend Dashboard

### Overview
The platform includes a real-time dashboard built with Next.js 14+ that displays live trade execution data via WebSocket connections. Service B acts as a Backend-for-Frontend (BFF) by running a Socket.io server alongside its RabbitMQ consumer.

### Architecture

**WebSocket Server (Service B):**
- Location: `service-b/src/websocket-server.ts`
- Framework: Socket.io
- Port: 3001
- CORS: Configured to allow connections from frontend (port 3000)
- Events emitted: `trade:processed`

**Frontend (Next.js):**
- Location: `frontend/`
- Framework: Next.js 14+ with App Router
- Styling: Tailwind CSS
- State Management: Zustand
- WebSocket Client: Socket.io-client
- Port: 3000

### Implementation Details

**Service B WebSocket Integration:**
```typescript
// WebSocket server initialization
const wsServer = new WebSocketServer();
wsServer.start(); // Runs on port 3001

// Emit trade events after processing
wsServer.emitTradeProcessed({
  id: string,           // Unique trade ID
  assetId: string,      // Asset identifier
  action: 'BUY' | 'SELL',
  volume: number,       // Trade volume in MWh
  price: number,        // Asset price per MWh
  totalValue: number,   // Calculated total value
  timestamp: string,    // ISO timestamp
  status: 'approved' | 'rejected',
  rejectionReason?: string,  // Present if rejected
  checkId?: string,     // Risk check ID from Service C
});
```

**Frontend State Management (Zustand):**
```typescript
// lib/store.ts
const useTradeStore = create<TradeStore>((set) => ({
  trades: [],
  connectionStatus: 'disconnected',
  addTrade: (trade) => set((state) => ({
    trades: [trade, ...state.trades].slice(0, 100), // Keep last 100
  })),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
}));
```

**Frontend WebSocket Client:**
```typescript
// components/RealTimeTrades.tsx
const socket = io(SOCKET_URL, {
  reconnectionDelay: 1000,
  reconnection: true,
  reconnectionAttempts: 10,
  transports: ['websocket'],
});

socket.on('trade:processed', (trade: TradeResult) => {
  addTrade(trade); // Update Zustand store
});
```

### Running the Frontend

**Development Mode:**
```bash
# Start frontend locally (requires Service B running on port 3001)
cd frontend
npm install
npm run dev

# Access dashboard at http://localhost:3000
```

**Docker Mode:**
```bash
# Start all services including frontend
docker compose up --build

# Access dashboard at http://localhost:3000
# WebSocket connects to Service B at http://localhost:3001
```

**Environment Variables:**
- `NEXT_PUBLIC_SOCKET_URL`: WebSocket server URL (default: `http://localhost:3001`)
- `WS_PORT`: WebSocket server port in Service B (default: `3001`)
- `CORS_ORIGIN`: Allowed CORS origin for WebSocket (default: `http://localhost:3000`)

### Dashboard Features

1. **Real-time Trade List**: Displays all processed trades with details (asset, action, volume, price, status)
2. **Connection Status Indicator**: Shows WebSocket connection state (connected, disconnected, error)
3. **Trade Statistics**: Live counts for total trades, approved trades, and rejected trades
4. **Trade Status Badges**: Color-coded badges for approved (green) and rejected (red) trades
5. **Auto-scrolling**: New trades appear at the top of the list
6. **Rejection Reasons**: Hover over rejected trades to see rejection reason

### Testing

**Frontend Component Tests:**
```bash
cd frontend
npm test                # Run all tests
npm run test:ui         # Run with Vitest UI
npm run test:coverage   # Generate coverage report
```

Tests include:
- Component rendering verification
- Socket event listener registration
- Trade event handling
- Store updates on trade reception
- Connection status updates
- Cleanup on unmount

**Key Test Files:**
- `tests/setup.ts`: Test configuration with Socket.io mocks
- `tests/components/RealTimeTrades.test.tsx`: Component tests with React Testing Library

### WebSocket Event Flow

1. **Service B starts**: WebSocket server listens on port 3001
2. **Frontend loads**: Socket.io client connects to Service B
3. **Connection established**: Frontend updates connection status to "connected"
4. **Trade processed**: Service B emits `trade:processed` event with trade data
5. **Frontend receives**: Socket.io client triggers callback with trade data
6. **Store updated**: Zustand store adds trade to state
7. **UI re-renders**: React component displays updated trade list

### Production Considerations

**Scalability:**
- Currently, Service B runs a single WebSocket server instance
- For horizontal scaling, consider:
  - Redis Pub/Sub adapter for Socket.io to share events across instances
  - Sticky sessions for WebSocket connections
  - Dedicated real-time service separate from Service B

**Security:**
- CORS configured to allow specific frontend origin
- Consider adding authentication for WebSocket connections
- Use HTTPS/WSS in production

**Performance:**
- Frontend keeps only last 100 trades in memory to prevent bloat
- WebSocket uses binary frames for efficient data transfer
- Reconnection logic handles temporary network issues

## Future Roadmap
Per README, planned integrations include:
- ✅ Redis caching layer for market data (COMPLETED)
- ✅ Unit and integration tests with Vitest and testcontainers (COMPLETED)
- ✅ ESLint and Prettier configuration (COMPLETED)
- ✅ GitHub Actions CI/CD pipeline (COMPLETED)
- ✅ gRPC Risk Service (Service C) in Go with client integration in Service B (COMPLETED)
- ✅ Real-time WebSockets and Frontend Dashboard with Next.js 14+ (COMPLETED)
- Git hooks with Husky for pre-commit checks (PLANNED)
- gRPC service for portfolio management (PLANNED)
- API Gateway (Kong) with rate limiting (PLANNED)
- Time-series DB (InfluxDB/TimescaleDB) (PLANNED)
- Observability stack (Prometheus, Grafana, distributed tracing) (PLANNED)
