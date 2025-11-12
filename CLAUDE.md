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
  - Integrates Redis for caching asset prices and storing trade history
  - Simulates 50ms processing time per message
  - Horizontally scalable (can run multiple instances with round-robin load balancing)
  - Uses manual message acknowledgment (ack/nack) for reliability

- **RabbitMQ**: Message broker providing asynchronous communication
  - Queue name: `trading_signals`
  - Non-durable queue (doesn't persist across restarts)
  - Enables horizontal scaling via round-robin distribution

- **Redis**: In-memory data store for caching and fast data access
  - Caches asset prices with 30-second TTL
  - Stores last 100 trades in `trade_history` list
  - Tracks trade counts per asset
  - Persistence enabled with AOF (Append-Only File)

### Communication Flow
1. Service A connects to RabbitMQ and asserts the `trading_signals` queue
2. Service A publishes JSON-serialized `TradeSignal` messages as Buffers
3. RabbitMQ distributes messages round-robin across Service B instances
4. Service B instances:
   - Consume messages from RabbitMQ
   - Check Redis cache for asset price (cache hit) or generate new price (cache miss)
   - Calculate trade value using cached price
   - Store trade record in Redis (`trade_history` list)
   - Increment trade counter in Redis
   - Acknowledge message to RabbitMQ on success or reject (nack) on failure

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
# Start all services (RabbitMQ + Redis + Service A + Service B)
docker compose up --build -d

# Scale Service B to 5 instances for horizontal scaling demo
docker compose up -d --scale service-b=5

# View logs (all services)
docker compose logs -f

# View logs for specific service
docker compose logs -f service-a
docker compose logs -f service-b
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
- RabbitMQ: Single instance (can be clustered in production)
- Redis: Single instance (can use Redis Cluster/Sentinel for HA)
- Load balancing: Automatic round-robin by RabbitMQ

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

## Future Roadmap
Per README, planned integrations include:
- ✅ Redis caching layer for market data (COMPLETED)
- ✅ Unit and integration tests with Vitest and testcontainers (COMPLETED)
- ✅ ESLint and Prettier configuration (COMPLETED)
- GitHub Actions CI/CD pipeline (IN PROGRESS)
- Git hooks with Husky for pre-commit checks (PLANNED)
- gRPC service for portfolio management (PLANNED)
- API Gateway (Kong) with rate limiting (PLANNED)
- Time-series DB (InfluxDB/TimescaleDB) (PLANNED)
- Observability stack (Prometheus, Grafana, distributed tracing) (PLANNED)
