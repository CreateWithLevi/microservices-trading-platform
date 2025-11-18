'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/services/api';
import type { Trade, TradeHistoryFilter } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

export default function TradeHistory() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TradeHistoryFilter>({ limit: 50 });

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.getTradeHistory(filter);
      setTrades(response.trades);
    } catch (err) {
      setError('Failed to fetch trade history. Service may be unavailable.');
      console.error('[TradeHistory] Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg shadow-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-white">Trade History</h2>
        <button
          onClick={fetchHistory}
          disabled={isLoading}
          className={clsx(
            'px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium',
            'hover:bg-blue-700 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-lg">
          <p className="text-sm text-yellow-300">{error}</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="pb-3 text-gray-400 font-medium text-sm">Time</th>
              <th className="pb-3 text-gray-400 font-medium text-sm">Asset</th>
              <th className="pb-3 text-gray-400 font-medium text-sm">Action</th>
              <th className="pb-3 text-gray-400 font-medium text-sm">Volume</th>
              <th className="pb-3 text-gray-400 font-medium text-sm">Price</th>
              <th className="pb-3 text-gray-400 font-medium text-sm">Total</th>
              <th className="pb-3 text-gray-400 font-medium text-sm">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="pt-8 text-center text-gray-500">
                  Loading history...
                </td>
              </tr>
            ) : trades.length === 0 ? (
              <tr>
                <td colSpan={7} className="pt-8 text-center text-gray-500">
                  No trade history available
                </td>
              </tr>
            ) : (
              trades.map((trade) => (
                <tr
                  key={trade.id}
                  className="border-b border-gray-700 hover:bg-gray-750 transition-colors"
                >
                  <td className="py-3 text-gray-300 text-sm">
                    {formatDistanceToNow(new Date(trade.timestamp), { addSuffix: true })}
                  </td>
                  <td className="py-3 text-white font-medium text-sm">{trade.assetId}</td>
                  <td className="py-3">
                    <span
                      className={clsx(
                        'px-2 py-1 rounded text-xs font-semibold',
                        trade.action === 'BUY'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-purple-500/20 text-purple-400'
                      )}
                    >
                      {trade.action}
                    </span>
                  </td>
                  <td className="py-3 text-gray-300 text-sm">{trade.volume} MWh</td>
                  <td className="py-3 text-gray-300 text-sm">${trade.price.toFixed(2)}</td>
                  <td className="py-3 text-gray-300 text-sm">${trade.totalValue.toFixed(2)}</td>
                  <td className="py-3">
                    <span
                      className={clsx(
                        'px-2 py-1 rounded text-xs font-semibold',
                        trade.status === 'approved'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      )}
                      title={trade.rejectionReason || ''}
                    >
                      {trade.status}
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
