/**
 * API client for backend services
 */

import type {
  ChatRequest,
  ChatResponse,
  TradeHistoryFilter,
  TradeHistoryResponse,
  APIError,
} from '../types';

const SERVICE_B_URL = process.env.NEXT_PUBLIC_SERVICE_B_URL || 'http://localhost:3001';
const SERVICE_D_URL = process.env.NEXT_PUBLIC_SERVICE_D_URL || 'http://localhost:3004';

class APIClient {
  private async request<T>(url: string, options?: RequestInit): Promise<T> {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const error: APIError = {
          message: `HTTP ${response.status}: ${response.statusText}`,
          code: response.status.toString(),
        };
        throw error;
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw {
          message: error.message,
          details: error,
        } as APIError;
      }
      throw error;
    }
  }

  // Chat API (Service D)
  async sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
    return this.request<ChatResponse>(`${SERVICE_D_URL}/api/v1/ask`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Trade History API (Service B)
  async getTradeHistory(filter?: TradeHistoryFilter): Promise<TradeHistoryResponse> {
    const params = new URLSearchParams();
    if (filter?.startDate) params.append('startDate', filter.startDate);
    if (filter?.endDate) params.append('endDate', filter.endDate);
    if (filter?.assetId) params.append('assetId', filter.assetId);
    if (filter?.status) params.append('status', filter.status);
    if (filter?.action) params.append('action', filter.action);
    if (filter?.limit) params.append('limit', filter.limit.toString());
    if (filter?.offset) params.append('offset', filter.offset.toString());

    const queryString = params.toString();
    const url = `${SERVICE_B_URL}/api/v1/trades${queryString ? `?${queryString}` : ''}`;

    return this.request<TradeHistoryResponse>(url);
  }

  // Health check
  async healthCheck(service: 'b' | 'd'): Promise<{ status: string }> {
    const url = service === 'b' ? SERVICE_B_URL : SERVICE_D_URL;
    return this.request<{ status: string }>(`${url}/health`);
  }
}

export const apiClient = new APIClient();
