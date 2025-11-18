import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// --- Configuration ---
const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

/**
 * WebSocket server for real-time trade updates
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
      console.log(`[WebSocket] Client connected: ${socket.id}`);

      socket.on('disconnect', () => {
        console.log(`[WebSocket] Client disconnected: ${socket.id}`);
      });

      socket.on('error', (error) => {
        console.error(`[WebSocket] Socket error for ${socket.id}:`, error);
      });
    });
  }

  /**
   * Start the WebSocket server
   */
  public start(): void {
    this.httpServer.listen(WS_PORT, () => {
      console.log(`[WebSocket] Server listening on port ${WS_PORT}`);
      console.log(`[WebSocket] CORS origin: ${CORS_ORIGIN}`);
    });
  }

  /**
   * Emit a trade event to all connected clients
   */
  public emitTradeProcessed(trade: {
    id: string;
    assetId: string;
    action: string;
    volume: number;
    price: number;
    totalValue: number;
    timestamp: string;
    status: 'approved' | 'rejected';
    rejectionReason?: string;
    checkId?: string;
  }): void {
    console.log(`[WebSocket] Emitting trade:processed event for ${trade.assetId}`);
    this.io.emit('trade:processed', trade);
  }

  /**
   * Get the number of connected clients
   */
  public getConnectedClients(): number {
    return this.io.engine.clientsCount;
  }

  /**
   * Close the WebSocket server
   */
  public close(): void {
    console.log('[WebSocket] Closing server...');
    this.io.close();
    this.httpServer.close();
  }
}
