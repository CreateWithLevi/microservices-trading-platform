import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import type { TradeNotification } from './types';

// --- Configuration ---
const WS_PORT = parseInt(process.env.WS_PORT || '3002', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

/**
 * WebSocket server for broadcasting trade notifications to frontend clients
 */
export class WebSocketServer {
  private io: SocketIOServer;
  private httpServer: ReturnType<typeof createServer>;

  constructor() {
    // Create HTTP server for Socket.IO
    this.httpServer = createServer();

    // Initialize Socket.IO with CORS configuration
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: CORS_ORIGIN,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();
  }

  /**
   * Set up connection event handlers
   */
  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log(`[Service N] WebSocket client connected: ${socket.id}`);

      socket.on('disconnect', () => {
        console.log(`[Service N] WebSocket client disconnected: ${socket.id}`);
      });

      socket.on('error', (error) => {
        console.error(`[Service N] WebSocket error for ${socket.id}:`, error);
      });
    });
  }

  /**
   * Start the WebSocket server
   */
  public start(): void {
    this.httpServer.listen(WS_PORT, () => {
      console.log(`[Service N] WebSocket server listening on port ${WS_PORT}`);
      console.log(`[Service N] CORS origin: ${CORS_ORIGIN}`);
    });
  }

  /**
   * Broadcast a trade notification to all connected clients
   */
  public broadcastTradeUpdate(trade: TradeNotification): void {
    console.log(
      `[Service N] Broadcasting trade.update for ${trade.assetId} (status: ${trade.status})`
    );
    this.io.emit('trade.update', trade);
  }

  /**
   * Get the number of connected clients
   */
  public getConnectedClients(): number {
    return this.io.engine.clientsCount;
  }

  /**
   * Get the Socket.IO server instance (for testing)
   */
  public getIO(): SocketIOServer {
    return this.io;
  }

  /**
   * Close the WebSocket server
   */
  public close(): Promise<void> {
    return new Promise((resolve) => {
      console.log('[Service N] Closing WebSocket server...');
      this.io.close(() => {
        this.httpServer.close(() => {
          resolve();
        });
      });
    });
  }
}
