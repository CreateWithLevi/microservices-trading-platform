/**
 * Shared type definitions for the trading platform
 */

// Trade Types
export type TradeAction = 'BUY' | 'SELL';

export type TradeStatus = 'approved' | 'rejected';

export type TradeSignal = {
  assetId: string;
  action: TradeAction;
  volume: number;
  timestamp: string;
};

export type Trade = {
  id: string;
  assetId: string;
  action: TradeAction;
  volume: number;
  price: number;
  totalValue: number;
  timestamp: string;
  status: TradeStatus;
  rejectionReason?: string;
  checkId?: string;
};

// Alias for backward compatibility
export type TradeResult = Trade;

// WebSocket Types
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

// Chat Types
export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

export type ChatRequest = {
  question: string;
  context?: string;
};

export type ChatResponse = {
  answer: string;
  confidence?: number;
  sources?: string[];
};

// Trade History Types
export type TradeHistoryFilter = {
  startDate?: string;
  endDate?: string;
  assetId?: string;
  status?: TradeStatus;
  action?: TradeAction;
  limit?: number;
  offset?: number;
};

export type TradeHistoryResponse = {
  trades: Trade[];
  total: number;
  page: number;
  pageSize: number;
};

// API Error Types
export type APIError = {
  message: string;
  code?: string;
  details?: unknown;
};
