/**
 * Metrics HTTP Server for Service B
 *
 * Exposes Prometheus metrics on /metrics endpoint
 */

import express, { Request, Response } from 'express';
import { register } from './metrics';

const METRICS_PORT = process.env.METRICS_PORT ? parseInt(process.env.METRICS_PORT) : 3000;

/**
 * Start the metrics HTTP server
 *
 * Exposes /metrics endpoint for Prometheus scraping
 */
export function startMetricsServer(): void {
  const app = express();

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'healthy', service: 'service-b' });
  });

  // Prometheus metrics endpoint
  app.get('/metrics', (_req: Request, res: Response) => {
    void (async () => {
      try {
        res.set('Content-Type', register.contentType);
        const metrics = await register.metrics();
        res.end(metrics);
      } catch (error) {
        res.status(500).end(error);
      }
    })();
  });

  const server = app.listen(METRICS_PORT, () => {
    console.log(`[Service B] Metrics server listening on http://localhost:${METRICS_PORT}/metrics`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[Service B] SIGTERM received, closing metrics server...');
    server.close();
  });

  process.on('SIGINT', () => {
    console.log('[Service B] SIGINT received, closing metrics server...');
    server.close();
  });
}
