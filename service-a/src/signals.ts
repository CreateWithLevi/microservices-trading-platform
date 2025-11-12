// --- Trading Signal Type ---
export type TradeSignal = {
  assetId: string;
  action: 'BUY' | 'SELL';
  volume: number; // MWh
  timestamp: string;
};

/**
 * Generate a random mock trading signal
 */
export function generateMockSignal(): TradeSignal {
  const actions: ['BUY', 'SELL'] = ['BUY', 'SELL'];
  const randomAction = actions[Math.floor(Math.random() * actions.length)];
  const randomVolume = parseFloat((Math.random() * 100 + 10).toFixed(2)); // 10 to 110 MWh

  return {
    assetId: 'BATTERY_GRID_01',
    action: randomAction,
    volume: randomVolume,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a trade signal with specific values (useful for testing)
 */
export function createTradeSignal(
  assetId: string,
  action: 'BUY' | 'SELL',
  volume: number,
  timestamp?: string
): TradeSignal {
  return {
    assetId,
    action,
    volume,
    timestamp: timestamp || new Date().toISOString(),
  };
}
