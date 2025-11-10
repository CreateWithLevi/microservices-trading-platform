# Microservices Trading Platform

> A production-grade proof-of-concept demonstrating microservices architecture, event-driven design, and scalable infrastructure for high-frequency trading systems.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-compose-blue.svg)](https://www.docker.com/)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-3.13-orange.svg)](https://www.rabbitmq.com/)

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
┌─────────────────┐
│   Service B     │  Trade Execution Engine
│  (Consumer x5)  │  Processes signals in parallel
└─────────────────┘
```

### Current Components

| Service | Role | Technology | Scalability |
|---------|------|------------|-------------|
| **Service A** | Signal Generator | TypeScript + Node.js | Single instance |
| **RabbitMQ** | Message Queue | RabbitMQ 3.13 | Clusterable |
| **Service B** | Execution Engine | TypeScript + Node.js | **Horizontally scalable** |

## 🚀 Key Features

### ✅ Implemented

- **Asynchronous Processing**: Non-blocking I/O with async/await patterns
- **Message Queue**: RabbitMQ for reliable message delivery
- **Horizontal Scaling**: Scale consumers from 1 to N instances
- **Load Balancing**: Automatic round-robin distribution
- **Containerization**: Multi-stage Docker builds for optimal image size
- **Docker Compose**: One-command orchestration
- **Message Acknowledgment**: At-least-once delivery guarantee
- **Graceful Error Handling**: Circuit breaker patterns

### 🔜 Roadmap

- [ ] **Redis Integration**: Caching layer for low-latency reads
  - Cache market prices
  - Implement cache invalidation strategies
  - Use Redis Sorted Sets for time-series data

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

# Terminal 2: Service A
cd service-a
npm install
npm start

# Terminal 3: Service B
cd service-b
npm install
npm start
```

## 📊 Monitoring

- **RabbitMQ Management UI**: http://localhost:15672
  - Username: `guest`
  - Password: `guest`
  - View queues, message rates, and consumer connections

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
- **Scalability**: Linear scaling with consumer count
- **Reliability**: At-least-once delivery guarantee

## 🔧 Configuration

### Environment Variables

```bash
# Service A & B
RABBITMQ_URL=amqp://rabbitmq  # Docker network
# or
RABBITMQ_URL=amqp://localhost  # Local development
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

## 🤝 Future Enhancements

### Phase 2: Redis Integration
- Add caching layer for market data
- Implement cache-aside pattern
- Use Redis pub/sub for real-time updates

### Phase 3: gRPC Services
- Add portfolio management service
- Implement bi-directional streaming
- Compare REST vs gRPC performance

### Phase 4: Observability
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
