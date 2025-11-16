# Microservices Trading Platform

> A production-grade proof-of-concept demonstrating microservices architecture, event-driven design, and scalable infrastructure for high-frequency trading systems.

[![CI](https://github.com/CreateWithLevi/microservices-trading-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/CreateWithLevi/microservices-trading-platform/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-compose-blue.svg)](https://www.docker.com/)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-3.13-orange.svg)](https://www.rabbitmq.com/)
[![Redis](https://img.shields.io/badge/Redis-7-red.svg)](https://redis.io/)

## 🎯 Project Overview

This project demonstrates enterprise-level patterns for building scalable, low-latency trading infrastructure using modern microservices architecture. It showcases:

- **Event-driven architecture** with asynchronous message processing
- **Horizontal scalability** with containerized services
- **Low-latency communication** patterns
- **Production-ready** Docker deployment

## 🏗️ Architecture

```
┌─────────────────┐
│   Service A     │  AI Signal Generator
│  (Producer)     │  Generates trading signals every 3s
└────────┬────────┘
         │
         │ Publishes signals
         ▼
┌─────────────────┐
│   RabbitMQ      │  Message Broker
│  (Event Bus)    │  Round-robin load balancing
└────────┬────────┘
         │
         │ Distributes messages
         ▼
┌─────────────────┐       ┌─────────────────┐
│   Service B     │◄─────►│     Redis       │  In-Memory Cache
│  (Consumer x5)  │       │   (Cache/Store) │  Price caching + Trade history
└─────────────────┘       └─────────────────┘
```

### Current Components

| Service | Role | Technology | Scalability |
|---------|------|------------|-------------|
| **Service A** | Signal Generator | TypeScript + Node.js | Single instance |
| **RabbitMQ** | Message Queue | RabbitMQ 3.13 | Clusterable |
| **Redis** | Cache & Data Store | Redis 7 Alpine | Single instance (clusterable) |
| **Service B** | Execution Engine | TypeScript + Node.js + ioredis | **Horizontally scalable** |

## 🚀 Key Features

### ✅ Implemented

- **Asynchronous Processing**: Non-blocking I/O with async/await patterns
- **Message Queue**: RabbitMQ for reliable message delivery
- **Redis Caching**: Cache-aside pattern for asset prices with 30s TTL
- **Trade History**: Last 100 trades stored in Redis lists
- **Horizontal Scaling**: Scale consumers from 1 to N instances
- **Load Balancing**: Automatic round-robin distribution
- **Containerization**: Multi-stage Docker builds for optimal image size
- **Docker Compose**: One-command orchestration
- **Message Acknowledgment**: At-least-once delivery guarantee
- **Graceful Error Handling**: Circuit breaker patterns

### 🔜 Roadmap

- [x] **Redis Integration**: Caching layer for low-latency reads
  - ✅ Cache market prices with TTL
  - ✅ Store trade history in Redis lists
  - ✅ Track trade counters per asset
  - [ ] Use Redis Sorted Sets for time-series data

- [x] **Testing Infrastructure**: Production-level automated testing
  - ✅ Unit tests with Vitest and mocking
  - ✅ Integration tests with testcontainers
  - ✅ ESLint and Prettier configuration
  - ✅ GitHub Actions CI/CD pipeline
  - [ ] Git hooks with Husky

- [ ] **gRPC Service**: Low-latency synchronous communication
  - Portfolio management service
  - Protobuf definitions
  - Bi-directional streaming

- [ ] **API Gateway**: Kong or custom gateway
  - Rate limiting
  - Authentication & authorization
  - Request routing

- [ ] **Time-Series Database**: InfluxDB or TimescaleDB
  - Historical price data
  - Trade analytics

- [ ] **Monitoring & Observability**:
  - Prometheus metrics
  - Grafana dashboards
  - Distributed tracing

## 🛠️ Tech Stack

- **Language**: TypeScript 5.4
- **Runtime**: Node.js 18 (Alpine)
- **Message Broker**: RabbitMQ 3.13 with Management UI
- **Cache & Storage**: Redis 7 (Alpine) with AOF persistence
- **Containerization**: Docker + Docker Compose
- **Architecture**: Microservices, Event-driven

## 📦 Quick Start

### Prerequisites

- Docker Desktop
- Node.js 18+ (for local development)

### Run with Docker Compose

```bash
# Start all services
docker compose up --build -d

# Scale Service B to 5 instances
docker compose up -d --scale service-b=5

# View logs
docker compose logs -f

# Stop all services
docker compose down
```

### Local Development

```bash
# Terminal 1: Start RabbitMQ
docker run -d --name rabbitmq-dev -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# Terminal 2: Start Redis
docker run -d --name redis-dev -p 6379:6379 redis:7-alpine

# Terminal 3: Service A
cd service-a
npm install
npm start

# Terminal 4: Service B
cd service-b
npm install
npm start
```

## 📊 Monitoring

- **RabbitMQ Management UI**: http://localhost:15672
  - Username: `guest`
  - Password: `guest`
  - View queues, message rates, and consumer connections

- **Redis CLI**: Inspect cache and trade data
  ```bash
  # Connect to Redis container
  docker exec -it redis redis-cli

  # Example commands:
  GET price:BATTERY_GRID_01           # View cached asset price
  LRANGE trade_history 0 9            # View last 10 trades
  GET trade_count:BATTERY_GRID_01     # View trade count
  TTL price:BATTERY_GRID_01           # Check cache TTL
  ```

## 🎓 Learning Outcomes

This project demonstrates proficiency in:

### Building
- TypeScript best practices (async/await, error handling)
- Node.js asynchronous programming patterns
- Event loop optimization
- Type-safe microservices

### Optimizing
- Performance tuning for low-latency systems
- Message queue optimization
- Redis caching strategies (cache-aside pattern)
- Container image optimization (multi-stage builds)
- Memory-efficient processing

### Scaling
- Horizontal scaling strategies
- Load balancing patterns
- Stateless service design
- Inter-service communication (async with RabbitMQ)
- Containerization with Docker
- Service orchestration

## 📈 Performance

With 5 Service B instances:
- **Throughput**: ~1 message/3 seconds per producer
- **Latency**: <50ms processing time per message
- **Cache Performance**: Sub-millisecond reads from Redis
- **Scalability**: Linear scaling with consumer count (shared Redis cache)
- **Reliability**: At-least-once delivery guarantee

## 🔧 Configuration

### Environment Variables

```bash
# Service A & B
RABBITMQ_URL=amqp://rabbitmq  # Docker network
# or
RABBITMQ_URL=amqp://localhost  # Local development

# Service B only
REDIS_URL=redis://redis:6379  # Docker network
# or
REDIS_URL=redis://localhost:6379  # Local development
```

## 📝 Project Structure

```
.
├── service-a/              # Signal Generator (Producer)
│   ├── src/
│   │   └── index.ts        # Main application
│   ├── package.json
│   └── tsconfig.json
├── service-b/              # Execution Engine (Consumer)
│   ├── src/
│   │   └── index.ts        # Main application
│   ├── package.json
│   └── tsconfig.json
├── Dockerfile.node         # Shared multi-stage Docker build
├── docker-compose.yml      # Service orchestration
└── README.md
```

## 🔀 Development Workflow

This project follows the **Git Flow** branching model:

### Branch Structure
- **`main`**: Production-ready code (protected)
- **`develop`**: Integration branch for active development
- **`feature/*`**: Feature branches (e.g., `feature/add-grpc-service`)

### Workflow
```bash
# Start new feature
git checkout develop
git pull origin develop
git checkout -b feature/my-feature

# Make changes with atomic commits
git add .
git commit -m "feat(scope): description"

# Push and create PR (target: develop)
git push -u origin feature/my-feature
gh pr create --base develop --title "Feature title" --body "Description"
```

### Commit Convention
Follow conventional commits: `type(scope): description`
- **Types**: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- **Examples**:
  - `feat(service-a): add signal validation`
  - `fix(service-b): resolve Redis timeout`
  - `test(service-b): add integration tests`

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## 🧪 Testing

Both services include comprehensive test coverage:

### Running Tests
```bash
cd service-a  # or service-b

# Run all tests
npm test

# Run unit tests only (fast, uses mocks)
npm run test:unit

# Run integration tests (slower, uses testcontainers)
npm run test:integration

# Generate coverage report
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Code Quality
```bash
# Lint code
npm run lint
npm run lint:fix

# Format code
npm run format
npm run format:check

# Type check
npm run type-check
```

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Branch naming conventions
- Commit message format
- PR submission guidelines
- Code review process

## 🤝 Future Enhancements

### Phase 1: Git Hooks
- Add Husky for pre-commit hooks
- Enforce linting and formatting before commits
- Run type checks automatically

### Phase 2: gRPC Services
- Add portfolio management service
- Implement bi-directional streaming
- Compare REST vs gRPC performance

### Phase 3: Observability
- Add Prometheus metrics
- Create Grafana dashboards
- Implement distributed tracing with Jaeger

## 📚 References

- [RabbitMQ Best Practices](https://www.rabbitmq.com/best-practices.html)
- [Docker Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Microservices Patterns](https://microservices.io/patterns/)

## 📄 License

MIT

---

**Built with ❤️ as a demonstration of production-grade microservices architecture**
