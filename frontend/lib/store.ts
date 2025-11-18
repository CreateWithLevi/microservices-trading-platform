import { create } from 'zustand';
import type { TradeResult, ConnectionStatus } from './types';

interface TradeStore {
  trades: TradeResult[];
  connectionStatus: ConnectionStatus;
  addTrade: (trade: TradeResult) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  clearTrades: () => void;
}

export const useTradeStore = create<TradeStore>((set) => ({
  trades: [],
  connectionStatus: 'disconnected',

  addTrade: (trade) =>
    set((state) => ({
      // Keep only the last 100 trades to prevent memory issues
      trades: [trade, ...state.trades].slice(0, 100),
    })),

  setConnectionStatus: (status) =>
    set({ connectionStatus: status }),

  clearTrades: () =>
    set({ trades: [] }),
}));
