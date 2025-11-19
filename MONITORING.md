# Monitoring Stack Guide

This document describes the Prometheus and Grafana monitoring implementation for the microservices trading platform.

## Architecture Overview

The monitoring stack consists of:

- **Prometheus** (port 9090): Metrics collection and storage
- **Grafana** (port 3001): Metrics visualization and dashboarding
- **RabbitMQ Exporter** (port 9419): RabbitMQ queue metrics
- **Redis Exporter** (port 9121): Redis cache metrics
- **Service B** (port 3000): Exposes `/metrics` endpoint with custom trading metrics
- **Service C** (port 8080): Exposes `/metrics` endpoint with risk check metrics

## Quick Start

### 1. Start the Monitoring Stack

```bash
# Start all services including monitoring
docker compose up -d

# Scale Service B to 3 instances (optional)
docker compose up -d --scale service-b=3

# View logs
docker compose logs -f prometheus grafana
```

### 2. Access Monitoring UIs

- **Grafana Dashboard**: http://localhost:3001
  - Username: `admin`
  - Password: `admin`
  - Pre-configured dashboard: "Trading Platform Monitoring Dashboard"

- **Prometheus UI**: http://localhost:9090
  - Query metrics directly
  - View targets and service health

- **RabbitMQ Management**: http://localhost:15672
  - Username: `guest`
  - Password: `guest`

### 3. Verify Metrics Endpoints

```bash
# Service B metrics
curl http://localhost:3000/metrics

# Service C metrics
curl http://localhost:8080/metrics

# Prometheus targets (should show all services as UP)
curl http://localhost:9090/api/v1/targets
```

## Custom Metrics

### Service B (Trade Execution Service)

#### `trades_processed_total`
**Type:** Counter
**Description:** Total number of trades processed
**Labels:**
- `action`: BUY or SELL
- `asset_id`: Trading asset identifier (e.g., BATTERY_GRID_01)
- `status`: approved, rejected, or error

**Example Query:**
```promql
# Rate of approved trades per second
rate(trades_processed_total{status="approved"}[1m])

# Total trades by status
sum by (status) (trades_processed_total)
```

#### `processing_duration_seconds`
**Type:** Histogram
**Description:** Time spent processing a trade signal (includes risk check, Redis ops, etc.)
**Labels:**
- `action`: BUY or SELL
- `asset_id`: Trading asset identifier
- `status`: approved, rejected, or error

**Buckets:** 0.01s, 0.05s, 0.1s, 0.5s, 1s, 2s, 5s

**Example Query:**
```promql
# 95th percentile processing duration
histogram_quantile(0.95, rate(processing_duration_seconds_bucket[5m]))

# Average processing time by status
rate(processing_duration_seconds_sum[5m]) / rate(processing_duration_seconds_count[5m])
```

#### `risk_checks_total`
**Type:** Counter
**Description:** Total number of risk checks performed
**Labels:**
- `result`: allowed, rejected, or error

**Example Query:**
```promql
# Risk check approval rate
rate(risk_checks_total{result="allowed"}[1m]) / rate(risk_checks_total[1m]) * 100
```

#### `redis_cache_total`
**Type:** Counter
**Description:** Total number of Redis cache operations
**Labels:**
- `operation`: price_cache, trade_history
- `result`: hit, miss, write

**Example Query:**
```promql
# Cache hit rate
sum(redis_cache_total{result="hit"}) / sum(redis_cache_total{operation="price_cache"}) * 100
```

### Service C (Risk Checker Service)

#### `risk_checks_total`
**Type:** Counter
**Description:** Total number of risk checks performed
**Labels:**
- `result`: allowed or rejected
- `asset_id`: Trading asset identifier

**Example Query:**
```promql
# Risk checks per second by result
rate(risk_checks_total[1m])

# Rejection rate by asset
sum by (asset_id) (risk_checks_total{result="rejected"}) / sum by (asset_id) (risk_checks_total)
```

#### `risk_check_duration_seconds`
**Type:** Histogram
**Description:** Time spent processing a risk check
**Labels:**
- `result`: allowed or rejected
- `asset_id`: Trading asset identifier

**Buckets:** 0.001s (1ms), 0.005s (5ms), 0.01s (10ms), 0.025s (25ms), 0.05s (50ms), 0.1s (100ms), 0.25s, 0.5s

**Example Query:**
```promql
# 99th percentile latency
histogram_quantile(0.99, rate(risk_check_duration_seconds_bucket[5m]))

# Average latency by result
rate(risk_check_duration_seconds_sum[5m]) / rate(risk_check_duration_seconds_count[5m])
```

#### `risk_check_volume_mwh`
**Type:** Histogram
**Description:** Distribution of trade volumes checked (in MWh)
**Labels:** None

**Buckets:** 10, 25, 50, 75, 90, 100, 150, 200, 300

**Example Query:**
```promql
# Volume distribution
histogram_quantile(0.5, rate(risk_check_volume_mwh_bucket[5m]))
```

## Grafana Dashboard

The pre-configured "Trading Platform Monitoring Dashboard" includes 9 panels:

### 1. Trade Processing Rate (Service B)
- **Visualization:** Time series graph
- **Metric:** `rate(trades_processed_total[1m])`
- **Shows:** Trades processed per second by status and asset

### 2. Risk Check Latency (Service C)
- **Visualization:** Time series graph
- **Metrics:** p95 and p99 latency
- **Shows:** Risk check performance over time

### 3. RabbitMQ Queue Depth
- **Visualization:** Gauge
- **Metric:** `rabbitmq_queue_messages{queue="trading_signals"}`
- **Shows:** Current number of messages in the trading signals queue
- **Thresholds:**
  - Green: < 10 messages
  - Yellow: 10-50 messages
  - Red: > 50 messages

### 4. Risk Check Results
- **Visualization:** Pie chart
- **Metric:** `sum by (result) (risk_checks_total)`
- **Shows:** Distribution of allowed vs rejected trades

### 5. Redis Cache Hit Rate
- **Visualization:** Gauge
- **Metric:** `sum(redis_cache_total{result="hit"}) / sum(redis_cache_total) * 100`
- **Shows:** Percentage of cache hits
- **Thresholds:**
  - Red: < 50%
  - Yellow: 50-80%
  - Green: > 80%

### 6. Total Approved Trades
- **Visualization:** Stat
- **Metric:** `sum(trades_processed_total{status="approved"})`
- **Shows:** Cumulative count of approved trades

### 7. Total Rejected Trades
- **Visualization:** Stat
- **Metric:** `sum(trades_processed_total{status="rejected"})`
- **Shows:** Cumulative count of rejected trades

### 8. Trade Processing Duration (Service B)
- **Visualization:** Time series graph
- **Metrics:** p50, p95, p99 latency
- **Shows:** Processing time percentiles over time

### 9. RabbitMQ Message Rates
- **Visualization:** Time series graph
- **Metrics:** Published vs consumed message rates
- **Shows:** Message flow through the queue

## Useful Prometheus Queries

### System Health

```promql
# Check all targets are UP
up{job=~"service-.*"}

# Service availability (last 5 minutes)
avg_over_time(up{job="service-b"}[5m]) * 100
```

### Performance Analysis

```promql
# Average trade processing time
rate(processing_duration_seconds_sum[5m]) / rate(processing_duration_seconds_count[5m])

# Trades per second (total)
sum(rate(trades_processed_total[1m]))

# Error rate
rate(trades_processed_total{status="error"}[5m]) / rate(trades_processed_total[5m]) * 100
```

### Capacity Planning

```promql
# Queue growth rate
deriv(rabbitmq_queue_messages{queue="trading_signals"}[5m])

# Service B instances processing trades
count(trades_processed_total)

# Messages processed per Service B instance
rate(trades_processed_total[1m]) / count(trades_processed_total)
```

### Business Metrics

```promql
# Total trade volume (MWh) - estimated from histogram
sum(rate(risk_check_volume_mwh_sum[1h])) / sum(rate(risk_check_volume_mwh_count[1h]))

# Rejection rate by asset
sum by (asset_id) (risk_checks_total{result="rejected"}) / sum by (asset_id) (risk_checks_total) * 100

# Most active assets
topk(5, sum by (asset_id) (rate(trades_processed_total[1h])))
```

## Testing the Monitoring Stack

### 1. Run Integration Tests

```bash
# Test Service B metrics endpoint
cd service-b
npm test tests/integration/metrics.test.ts

# Expected results:
# ✓ should return 200 status code for /metrics endpoint
# ✓ should return metrics in Prometheus format
# ✓ should expose trades_processed_total metric
# ✓ should expose processing_duration_seconds metric
# ✓ should expose risk_checks_total metric
# ✓ should expose redis_cache_total metric
# ✓ should expose default Node.js metrics
# ✓ should return 200 status code for /health endpoint
# ✓ should return healthy status in /health response
```

### 2. Generate Test Load

```bash
# Service A will automatically generate trading signals every 3 seconds
# To increase load, scale Service A (note: may cause duplicate signals)

# Monitor the metrics in Grafana as trades are processed
# Watch for:
# - Increasing trade counts
# - Cache hit rate improvements (after 30s)
# - Risk check latencies (should be < 10ms)
# - Processing durations (should be ~50-100ms)
```

### 3. Test Service Scaling

```bash
# Scale Service B to 5 instances
docker compose up -d --scale service-b=5

# Verify Prometheus sees all instances
curl http://localhost:9090/api/v1/targets | grep service-b

# Check load distribution in Grafana
# Trades should be distributed across all instances (round-robin)
```

### 4. Test Failure Scenarios

```bash
# Stop Service C (Risk Service)
docker compose stop service-c

# Observe in Grafana:
# - risk_checks_total{result="error"} increases
# - trades_processed_total{status="error"} increases
# - Service C target shows DOWN in Prometheus

# Restart Service C
docker compose start service-c

# Verify recovery
```

## Alerting (Future Enhancement)

While not currently implemented, here are recommended alerts:

### Critical Alerts

```yaml
# High error rate
- alert: HighTradeErrorRate
  expr: rate(trades_processed_total{status="error"}[5m]) > 0.1
  for: 2m
  annotations:
    summary: "High trade processing error rate"

# Service down
- alert: ServiceDown
  expr: up{job=~"service-.*"} == 0
  for: 1m
  annotations:
    summary: "Service {{ $labels.job }} is down"

# Queue backing up
- alert: QueueBacklog
  expr: rabbitmq_queue_messages{queue="trading_signals"} > 100
  for: 5m
  annotations:
    summary: "RabbitMQ queue has significant backlog"
```

### Warning Alerts

```yaml
# High latency
- alert: HighProcessingLatency
  expr: histogram_quantile(0.95, rate(processing_duration_seconds_bucket[5m])) > 1
  for: 5m
  annotations:
    summary: "95th percentile processing latency > 1s"

# Low cache hit rate
- alert: LowCacheHitRate
  expr: sum(redis_cache_total{result="hit"}) / sum(redis_cache_total) * 100 < 50
  for: 10m
  annotations:
    summary: "Redis cache hit rate below 50%"
```

## Troubleshooting

### Metrics not appearing in Prometheus

1. Check target health:
   ```bash
   curl http://localhost:9090/api/v1/targets
   ```

2. Verify service metrics endpoints:
   ```bash
   curl http://localhost:3000/metrics  # Service B
   curl http://localhost:8080/metrics  # Service C
   ```

3. Check Prometheus logs:
   ```bash
   docker compose logs prometheus
   ```

### Grafana dashboard not loading

1. Verify Prometheus datasource:
   - Go to Configuration → Data Sources
   - Check "Prometheus" is configured
   - URL should be `http://prometheus:9090`

2. Check dashboard provisioning:
   ```bash
   docker compose logs grafana
   # Look for "Provisioning dashboards"
   ```

3. Manually import dashboard:
   - Go to Dashboards → Import
   - Upload `infra/grafana/dashboards/trading-dashboard.json`

### High memory usage

Prometheus stores metrics in memory. For production:

1. Configure retention:
   ```yaml
   # In docker-compose.yml
   command:
     - '--storage.tsdb.retention.time=15d'
     - '--storage.tsdb.retention.size=10GB'
   ```

2. Reduce scrape frequency:
   ```yaml
   # In prometheus.yml
   global:
     scrape_interval: 30s  # Increase from 15s
   ```

## Production Considerations

### Security

- Change Grafana admin password (default: admin/admin)
- Enable authentication on Prometheus
- Use TLS for all endpoints
- Restrict network access to monitoring ports

### High Availability

- Run multiple Prometheus instances with federation
- Use Grafana with PostgreSQL backend
- Deploy RabbitMQ and Redis in cluster mode

### Data Retention

- Configure Prometheus retention policies
- Archive old metrics to long-term storage (e.g., Thanos, Cortex)
- Regular backups of Grafana dashboards

### Performance Optimization

- Increase Prometheus resources for large deployments
- Use recording rules for frequently-queried metrics
- Optimize dashboard queries (use recording rules)
- Consider remote write to scalable storage

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [prom-client (Node.js)](https://github.com/siimon/prom-client)
- [prometheus/client_golang](https://github.com/prometheus/client_golang)
- [RabbitMQ Prometheus Plugin](https://www.rabbitmq.com/prometheus.html)
- [Redis Exporter](https://github.com/oliver006/redis_exporter)
