import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useTradeStore } from '@/lib/store';
import type { Trade } from '@/lib/types';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3002';

let socket: Socket | null = null;

export function useWebSocket() {
  const { addTrade, setConnectionStatus } = useTradeStore();

  useEffect(() => {
    // Initialize socket connection
    socket = io(SOCKET_URL, {
      reconnectionDelay: 1000,
      reconnection: true,
      reconnectionAttempts: 10,
      transports: ['websocket'],
    });

    // Connection event handlers
    socket.on('connect', () => {
      console.log('[WebSocket] Connected to Service N');
      setConnectionStatus('connected');
    });

    socket.on('disconnect', () => {
      console.log('[WebSocket] Disconnected from Service N');
      setConnectionStatus('disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error);
      setConnectionStatus('error');
    });

    // Trade event handler
    socket.on('trade.update', (trade: Trade) => {
      console.log('[WebSocket] Received trade update:', trade);
      addTrade(trade);
    });

    // Cleanup on unmount
    return () => {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
    };
  }, [addTrade, setConnectionStatus]);

  return {
    socket,
  };
}
