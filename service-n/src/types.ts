/**
 * Shared type definitions for the notification service
 */

export type TradeAction = 'BUY' | 'SELL';

export type TradeNotification = {
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
