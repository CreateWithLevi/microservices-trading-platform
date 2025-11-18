# Service C - Risk Checker gRPC Service

A high-performance gRPC microservice written in Go that provides real-time risk assessment for trading signals.

## Overview

Service C acts as a **Risk Checker** that validates trading signals before they are executed. It implements a deterministic risk assessment algorithm via gRPC for low-latency synchronous communication.

**Technology Stack:**
- Language: Go (Golang)
- Protocol: gRPC
- Framework: `google.golang.org/grpc`
- Proto Definition: `protos/risk.proto`

## Business Logic

The service implements a simple deterministic risk check:

```go
if volume > 90:
    return { allowed: false, reason: "volume exceeds threshold" }
else:
    return { allowed: true, reason: "within acceptable limits" }
```

### Risk Thresholds
- **Maximum Volume**: 90 units
- **Action**: If exceeded, trade is rejected with reason
- **Check ID**: Unique UUID generated for each risk assessment

## gRPC Service Definition

### Proto File Location
`protos/risk.proto`

### Service Interface
```protobuf
service RiskChecker {
  rpc CheckTradeRisk (TradeRiskRequest) returns (TradeRiskResponse) {}
}
```

### Request Message
```protobuf
message TradeRiskRequest {
  string assetId = 1;    // Asset identifier (e.g., "BATTERY_GRID_01")
  double volume = 2;     // Trade volume to validate
  string action = 3;     // Trade action ("BUY" or "SELL")
  string timestamp = 4;  // ISO timestamp of trade signal
}
```

### Response Message
```protobuf
message TradeRiskResponse {
  bool allowed = 1;      // true if trade passes risk check
  string reason = 2;     // Human-readable explanation
  string checkId = 3;    // Unique identifier for this check
}
```

## Project Structure

```
service-c/
├── cmd/
│   └── server/
│       └── main.go              # gRPC server entry point
├── internal/
│   └── server/
│       └── risk_server.go       # Risk checking business logic
├── pkg/
│   └── riskpb/
│       ├── risk.pb.go           # Generated protobuf code
│       └── risk_grpc.pb.go      # Generated gRPC service code
├── Dockerfile                   # Multi-stage Docker build
├── .dockerignore               # Docker build optimization
├── go.mod                      # Go module dependencies
├── go.sum                      # Dependency checksums
└── README.md                   # This file
```

## Running Locally

### Prerequisites
- Go 1.23+ installed
- Port 50051 available

### Start the Server
```bash
cd service-c
go run cmd/server/main.go
```

Expected output:
```
========================================
Risk Checker gRPC Server (Service C)
========================================
Started at: 2025-11-18 12:55:00
Listening on port: 50051
Protocol: gRPC
Reflection: Enabled
========================================
Ready to process risk check requests...
```

### Build Binary
```bash
go build -o risk-server cmd/server/main.go
./risk-server
```

## Running with Docker

### Build Image
```bash
docker build -t service-c:latest .
```

### Run Container
```bash
docker run -p 50051:50051 service-c:latest
```

### Run with Docker Compose
```bash
# From project root
docker compose up service-c

# Build and run
docker compose up --build service-c
```

## Testing the Service

### Using grpcurl (Recommended)
```bash
# Install grpcurl
go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest

# List available services
grpcurl -plaintext localhost:50051 list

# Describe the RiskChecker service
grpcurl -plaintext localhost:50051 describe risk.RiskChecker

# Test with volume < 90 (should be allowed)
grpcurl -plaintext -d '{
  "assetId": "BATTERY_GRID_01",
  "volume": 75.5,
  "action": "BUY",
  "timestamp": "2025-11-18T12:00:00Z"
}' localhost:50051 risk.RiskChecker/CheckTradeRisk

# Test with volume > 90 (should be rejected)
grpcurl -plaintext -d '{
  "assetId": "BATTERY_GRID_01",
  "volume": 150.0,
  "action": "SELL",
  "timestamp": "2025-11-18T12:00:00Z"
}' localhost:50051 risk.RiskChecker/CheckTradeRisk
```

### Expected Responses

**Approved Trade** (volume ≤ 90):
```json
{
  "allowed": true,
  "reason": "Trade approved: volume 75.50 is within acceptable limits",
  "checkId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Rejected Trade** (volume > 90):
```json
{
  "allowed": false,
  "reason": "Trade rejected: volume 150.00 exceeds maximum allowed threshold of 90",
  "checkId": "b2c3d4e5-f6a7-8901-bcde-f12345678901"
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GRPC_PORT` | `50051` | Port for gRPC server to listen on |

## Docker Optimization

The Dockerfile uses a **multi-stage build** for optimal image size:

1. **Builder Stage**: Compiles Go binary with full toolchain
2. **Runtime Stage**: Minimal Alpine Linux (ca. 20MB total)

**Security Features:**
- Runs as non-root user (`appuser`)
- Static binary with no CGO dependencies
- Stripped debug symbols (`-ldflags="-w -s"`)

## Integration with Other Services

### Service A (Signal Generator)
Service A could call this gRPC service before publishing signals to RabbitMQ:
```javascript
// Pseudo-code (Node.js/TypeScript)
const riskCheck = await riskClient.CheckTradeRisk({
  assetId: signal.assetId,
  volume: signal.volume,
  action: signal.action,
  timestamp: signal.timestamp
});

if (riskCheck.allowed) {
  // Publish to RabbitMQ
} else {
  console.log(`Trade blocked: ${riskCheck.reason}`);
}
```

### Service B (Trade Executor)
Service B could validate trades before execution:
```javascript
// Pseudo-code
const validation = await riskClient.CheckTradeRisk(tradeData);
if (!validation.allowed) {
  channel.nack(msg); // Reject message
  return;
}
// Proceed with execution
```

## Performance Characteristics

- **Latency**: Sub-millisecond for risk checks (no I/O operations)
- **Throughput**: Limited by network and CPU (no database bottleneck)
- **Horizontal Scaling**: Stateless design allows multiple instances behind load balancer
- **Concurrency**: Go's goroutine-based gRPC server handles concurrent requests efficiently

## Development Notes

### Regenerating Proto Code
If you modify `protos/risk.proto`, regenerate Go code:
```bash
# Install protoc and Go plugins
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

# Generate code
protoc --go_out=. --go_opt=paths=source_relative \
       --go-grpc_out=. --go-grpc_opt=paths=source_relative \
       protos/risk.proto
```

### Adding More Risk Rules
To extend the risk logic, edit `internal/server/risk_server.go`:
```go
func (s *RiskServer) CheckTradeRisk(ctx context.Context, req *riskpb.TradeRiskRequest) (*riskpb.TradeRiskResponse, error) {
    // Add your custom risk rules here
    if req.Volume > 90 {
        // Existing rule
    }

    // Example: Check for daily trade limits
    if dailyTradeCount > 100 {
        return &riskpb.TradeRiskResponse{
            Allowed: false,
            Reason:  "Daily trade limit exceeded",
            CheckId: uuid.New().String(),
        }, nil
    }

    // More rules...
}
```

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 50051
lsof -i :50051
# Or
netstat -tulpn | grep 50051

# Kill the process
kill -9 <PID>
```

### Connection Refused
- Verify server is running: `netstat -tulpn | grep 50051`
- Check firewall rules
- Ensure correct host/port in client configuration

### Build Errors
```bash
# Clean and rebuild
go clean
rm -rf go.sum
go mod tidy
go build ./cmd/server/main.go
```

## Future Enhancements

Potential improvements for production use:
- [ ] Implement dynamic risk thresholds from configuration
- [ ] Add Redis integration for rate limiting
- [ ] Implement circuit breaker pattern
- [ ] Add structured logging (zerolog, zap)
- [ ] Metrics export (Prometheus)
- [ ] Distributed tracing (OpenTelemetry)
- [ ] Health check endpoint
- [ ] Graceful shutdown improvements
- [ ] TLS/mTLS support for secure communication

## License

Part of the microservices-trading-platform project.
