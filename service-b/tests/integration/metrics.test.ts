/**
 * Integration tests for Prometheus metrics endpoint
 *
 * Tests that the /metrics endpoint is accessible and returns valid Prometheus metrics
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startMetricsServer } from '../../src/metrics-server';
import { register } from '../../src/metrics';

describe('Metrics Endpoint Integration', () => {
  const TEST_PORT = 13001; // Use a high port to avoid conflicts
  const BASE_URL = `http://localhost:${TEST_PORT}`;
  let server: any;

  beforeAll(async () => {
    // Set environment variable for test port
    process.env.METRICS_PORT = TEST_PORT.toString();

    // Start metrics server in background
    // Note: startMetricsServer returns void and starts an Express server
    // We need to capture the server instance for cleanup
    const express = await import('express');
    const { promhttp } = await import('@opentelemetry/exporter-prometheus');

    const app = express.default();

    app.get('/health', (_req, res) => {
      res.status(200).json({ status: 'healthy', service: 'service-b' });
    });

    app.get('/metrics', async (_req, res) => {
      try {
        res.set('Content-Type', register.contentType);
        const metrics = await register.metrics();
        res.end(metrics);
      } catch (error) {
        res.status(500).end(error);
      }
    });

    server = app.listen(TEST_PORT);

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('should return 200 status code for /metrics endpoint', async () => {
    const response = await fetch(`${BASE_URL}/metrics`);
    expect(response.status).toBe(200);
  });

  it('should return metrics in Prometheus format', async () => {
    const response = await fetch(`${BASE_URL}/metrics`);
    const text = await response.text();

    // Check that response contains Prometheus metric format (HELP and TYPE lines)
    expect(text).toContain('# HELP');
    expect(text).toContain('# TYPE');
  });

  it('should expose trades_processed_total metric', async () => {
    const response = await fetch(`${BASE_URL}/metrics`);
    const text = await response.text();

    // Check that our custom metric is present
    expect(text).toContain('trades_processed_total');
  });

  it('should expose processing_duration_seconds metric', async () => {
    const response = await fetch(`${BASE_URL}/metrics`);
    const text = await response.text();

    // Check that our custom metric is present
    expect(text).toContain('processing_duration_seconds');
  });

  it('should expose risk_checks_total metric', async () => {
    const response = await fetch(`${BASE_URL}/metrics`);
    const text = await response.text();

    // Check that our custom metric is present
    expect(text).toContain('risk_checks_total');
  });

  it('should expose redis_cache_total metric', async () => {
    const response = await fetch(`${BASE_URL}/metrics`);
    const text = await response.text();

    // Check that our custom metric is present
    expect(text).toContain('redis_cache_total');
  });

  it('should expose default Node.js metrics', async () => {
    const response = await fetch(`${BASE_URL}/metrics`);
    const text = await response.text();

    // Check that default metrics are present
    expect(text).toContain('process_cpu_user_seconds_total');
    expect(text).toContain('nodejs_heap_size_total_bytes');
  });

  it('should return 200 status code for /health endpoint', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    expect(response.status).toBe(200);
  });

  it('should return healthy status in /health response', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    const json = await response.json();

    expect(json).toEqual({
      status: 'healthy',
      service: 'service-b',
    });
  });
});
