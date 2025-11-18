# ============================================
# Multi-stage Dockerfile for Go gRPC Service
# Stage 1: Build the Go binary
# Stage 2: Run in minimal alpine container
# ============================================

# ----------------- Stage 1: Builder -----------------
FROM golang:1.23-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git

# Set working directory
WORKDIR /build

# Copy go mod files first (better layer caching)
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary
# CGO_ENABLED=0 for static binary (works with scratch/alpine)
# -ldflags="-w -s" strips debug info for smaller binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o /build/risk-server \
    ./cmd/server/main.go

# ----------------- Stage 2: Runtime -----------------
FROM alpine:3.20

# Add ca-certificates for HTTPS calls (if needed)
RUN apk --no-cache add ca-certificates

# Create non-root user for security
RUN addgroup -g 1001 appuser && \
    adduser -D -u 1001 -G appuser appuser

WORKDIR /app

# Copy binary from builder stage
COPY --from=builder /build/risk-server .

# Change ownership to non-root user
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose gRPC port
EXPOSE 50051

# Health check (optional - requires grpc_health_probe or custom impl)
# HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
#   CMD ["/app/risk-server", "--health-check"]

# Run the binary
ENTRYPOINT ["/app/risk-server"]
