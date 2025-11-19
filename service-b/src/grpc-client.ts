import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

// Define TypeScript interfaces for our proto messages
export interface TradeRiskRequest {
  assetId: string;
  volume: number;
  action: string;
  timestamp: string;
}

export interface TradeRiskResponse {
  allowed: boolean;
  reason: string;
  checkId: string;
}

// Define the gRPC service client type
interface RiskCheckerClient extends grpc.Client {
  CheckTradeRisk(
    request: TradeRiskRequest,
    options: grpc.CallOptions,
    callback: (error: grpc.ServiceError | null, response?: TradeRiskResponse) => void
  ): grpc.ClientUnaryCall;
}

/**
 * RiskClient class wraps gRPC calls to the Risk Checker service
 * Provides Promise-based async/await interface for easier usage
 */
export class RiskClient {
  private client: RiskCheckerClient | null = null;
  private readonly serverAddress: string;
  private readonly protoPath: string;

  constructor(serverAddress = 'service-c:50051') {
    this.serverAddress = serverAddress;
    // Proto file path - __dirname is /app/dist in Docker, /app/dist in local
    // For Docker containers: /app/protos/risk.proto
    // For local dev: navigate from dist up to protos folder
    this.protoPath = path.join(__dirname, '../protos/risk.proto');
  }

  /**
   * Initialize the gRPC client connection
   * Loads the proto file and creates the client
   */
  connect(): void {
    try {
      // Load proto file with proto-loader
      const packageDefinition = protoLoader.loadSync(this.protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      // Load the gRPC package
      const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);

      // Get the RiskChecker service from the 'risk' package
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      const riskPackage = protoDescriptor.risk as any;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!riskPackage || !riskPackage.RiskChecker) {
        throw new Error('RiskChecker service not found in proto file');
      }

      // Create the client with insecure credentials (for development)
      // In production, use proper TLS credentials
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      this.client = new riskPackage.RiskChecker(
        this.serverAddress,
        grpc.credentials.createInsecure()
      ) as RiskCheckerClient;

      console.log(`[RiskClient] Connected to Risk Service at ${this.serverAddress}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error during connection';
      throw new Error(`Failed to connect to Risk Service: ${errorMessage}`);
    }
  }

  /**
   * Check if a trade passes risk validation
   * @param request - Trade risk request with assetId, volume, action, timestamp
   * @returns Promise<TradeRiskResponse> - Response with allowed flag, reason, and checkId
   * @throws Error if service is unavailable or request fails
   */
  async checkRisk(request: TradeRiskRequest): Promise<TradeRiskResponse> {
    if (!this.client) {
      throw new Error('RiskClient not connected. Call connect() before making requests.');
    }

    return new Promise((resolve, reject) => {
      // Set a deadline for the request (5 seconds)
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 5);

      this.client!.CheckTradeRisk(request, { deadline }, (error, response) => {
        if (error) {
          // Handle different error types for better error messages
          if (error.code === grpc.status.UNAVAILABLE) {
            reject(
              new Error(
                `Risk Service is unavailable at ${this.serverAddress}. Please ensure service-c is running.`
              )
            );
          } else if (error.code === grpc.status.DEADLINE_EXCEEDED) {
            reject(new Error('Risk check timed out. Service-c may be overloaded or unresponsive.'));
          } else {
            reject(new Error(`Risk check failed: ${error.message} (code: ${error.code})`));
          }
        } else if (response) {
          resolve(response);
        } else {
          reject(new Error('No response received from Risk Service'));
        }
      });
    });
  }

  /**
   * Close the gRPC client connection
   * Should be called during graceful shutdown
   */
  close(): void {
    if (this.client) {
      this.client.close();
      console.log('[RiskClient] Connection closed');
      this.client = null;
    }
  }

  /**
   * Check if the client is connected
   */
  isConnected(): boolean {
    return this.client !== null;
  }
}
