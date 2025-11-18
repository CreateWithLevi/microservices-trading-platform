'use client';

import { useTradeStore } from '@/lib/store';
import { useWebSocket } from '@/hooks/useWebSocket';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

export default function RealTimeTicker() {
  const { trades, connectionStatus } = useTradeStore();

  // Initialize WebSocket connection
  useWebSocket();

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

  const stats = {
    total: trades.length,
    approved: trades.filter((t) => t.status === 'approved').length,
    rejected: trades.filter((t) => t.status === 'rejected').length,
  };

  return (
    <div className="bg-gray-800 rounded-lg shadow-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-white">Live Trades</h2>
        <div className="flex items-center gap-2">
          <div className={clsx('w-3 h-3 rounded-full animate-pulse', getStatusColor())} />
          <span className="text-sm text-gray-300 capitalize">{connectionStatus}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Total Trades</p>
          <p className="text-3xl font-bold text-white">{stats.total}</p>
        </div>
        <div className="bg-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Approved</p>
          <p className="text-3xl font-bold text-green-400">{stats.approved}</p>
        </div>
        <div className="bg-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Rejected</p>
          <p className="text-3xl font-bold text-red-400">{stats.rejected}</p>
        </div>
      </div>

      {/* Trades List */}
      <div className="max-h-96 overflow-y-auto">
        {trades.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">
              {connectionStatus === 'connected'
                ? 'Waiting for trades...'
                : 'Connect to Service N to see live trades'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {trades.map((trade) => (
              <div
                key={trade.id}
                className={clsx(
                  'p-4 rounded-lg border-l-4 transition-all hover:bg-gray-750',
                  trade.status === 'approved'
                    ? 'border-green-500 bg-green-500/10'
                    : 'border-red-500 bg-red-500/10'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-white">{trade.assetId}</span>
                      <span
                        className={clsx(
                          'px-2 py-0.5 rounded text-xs font-semibold',
                          trade.action === 'BUY'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-purple-500/20 text-purple-400'
                        )}
                      >
                        {trade.action}
                      </span>
                      <span
                        className={clsx(
                          'px-2 py-0.5 rounded text-xs font-semibold',
                          trade.status === 'approved'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        )}
                      >
                        {trade.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                      <div>
                        <span className="text-gray-400">Volume:</span>
                        <span className="ml-1 text-white">{trade.volume} MWh</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Price:</span>
                        <span className="ml-1 text-white">${trade.price.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Total:</span>
                        <span className="ml-1 text-white">${trade.totalValue.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Time:</span>
                        <span className="ml-1 text-white">
                          {formatDistanceToNow(new Date(trade.timestamp), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    {trade.rejectionReason && (
                      <div className="mt-2 text-xs text-red-300">
                        Reason: {trade.rejectionReason}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
