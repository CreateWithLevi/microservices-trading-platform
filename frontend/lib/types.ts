/**
 * Shared type definitions for the trading platform
 */

export type TradeAction = 'BUY' | 'SELL';

export type TradeSignal = {
  assetId: string;
  action: TradeAction;
  volume: number;
  timestamp: string;
};

export type TradeResult = {
  id: string;
  assetId: string;
  action: TradeAction;
  volume: number;
  price: number;
  totalValue: number;
  timestamp: string;
  status: 'approved' | 'rejected';
  rejectionReason?: string;
  checkId?: string;
};

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';
