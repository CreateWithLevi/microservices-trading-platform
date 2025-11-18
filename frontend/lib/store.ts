import { create } from 'zustand';
import type { Trade, ConnectionStatus, ChatMessage } from './types';

// Trade Store
interface TradeStore {
  trades: Trade[];
  connectionStatus: ConnectionStatus;
  addTrade: (trade: Trade) => void;
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

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  clearTrades: () => set({ trades: [] }),
}));

// Chat Store
interface ChatStore {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  addMessage: (message: ChatMessage) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isLoading: false,
  error: null,

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  clearMessages: () => set({ messages: [], error: null }),
}));
