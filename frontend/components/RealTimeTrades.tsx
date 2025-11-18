'use client';

import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useTradeStore } from '@/lib/store';
import type { TradeResult } from '@/lib/types';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3002';

let socket: Socket | null = null;

export default function RealTimeTrades() {
  const { trades, connectionStatus, addTrade, setConnectionStatus } = useTradeStore();

  useEffect(() => {
    // Initialize socket connection
    socket = io(SOCKET_URL, {
      reconnectionDelay: 1000,
      reconnection: true,
      reconnectionAttempts: 10,
      transports: ['websocket'],
      agent: false,
      upgrade: false,
      rejectUnauthorized: false,
    });

    // Connection event handlers
    socket.on('connect', () => {
      console.log('[WebSocket] Connected to Service N (Notification Service)');
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

    // Trade event handler (Service N broadcasts 'trade.update')
    socket.on('trade.update', (trade: TradeResult) => {
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

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Connection Error';
      default:
        return 'Disconnected';
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg shadow-xl p-6">
      {/* Connection Status */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-white">Live Trades</h2>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${getStatusColor()} animate-pulse`} />
          <span className="text-sm text-gray-300">{getStatusText()}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Total Trades</p>
          <p className="text-2xl font-bold text-white">{trades.length}</p>
        </div>
        <div className="bg-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Approved</p>
          <p className="text-2xl font-bold text-green-400">
            {trades.filter((t) => t.status === 'approved').length}
          </p>
        </div>
        <div className="bg-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Rejected</p>
          <p className="text-2xl font-bold text-red-400">
            {trades.filter((t) => t.status === 'rejected').length}
          </p>
        </div>
      </div>

      {/* Trades List */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="pb-3 text-gray-400 font-medium">Time</th>
              <th className="pb-3 text-gray-400 font-medium">Asset</th>
              <th className="pb-3 text-gray-400 font-medium">Action</th>
              <th className="pb-3 text-gray-400 font-medium">Volume</th>
              <th className="pb-3 text-gray-400 font-medium">Price</th>
              <th className="pb-3 text-gray-400 font-medium">Total Value</th>
              <th className="pb-3 text-gray-400 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td colSpan={7} className="pt-8 text-center text-gray-500">
                  {connectionStatus === 'connected'
                    ? 'Waiting for trades...'
                    : 'Connect to Service B to see live trades'}
                </td>
              </tr>
            ) : (
              trades.map((trade) => (
                <tr
                  key={trade.id}
                  className="border-b border-gray-700 hover:bg-gray-750 transition-colors"
                >
                  <td className="py-3 text-gray-300 text-sm">
                    {new Date(trade.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="py-3 text-white font-medium">{trade.assetId}</td>
                  <td className="py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        trade.action === 'BUY'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-purple-500/20 text-purple-400'
                      }`}
                    >
                      {trade.action}
                    </span>
                  </td>
                  <td className="py-3 text-gray-300">{trade.volume} MWh</td>
                  <td className="py-3 text-gray-300">${trade.price.toFixed(2)}</td>
                  <td className="py-3 text-gray-300">${trade.totalValue.toFixed(2)}</td>
                  <td className="py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        trade.status === 'approved'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                      title={trade.rejectionReason || ''}
                    >
                      {trade.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
