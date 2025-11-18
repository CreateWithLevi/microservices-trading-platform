import type Redis from 'ioredis';

// --- Trading Signal Type ---
export type TradeSignal = {
  assetId: string;
  action: 'BUY' | 'SELL';
  volume: number;
  timestamp: string;
};

export type TradeRecord = TradeSignal & {
  price: number;
  totalValue: string;
};

/**
 * Get or generate asset price from Redis cache
 */
export async function getAssetPrice(redis: Redis, assetId: string): Promise<number> {
  // Try to get price from cache
  const cachedPrice = await redis.get(`price:${assetId}`);

  if (cachedPrice) {
    console.log(`[Service B] Cache HIT: Retrieved price for ${assetId} = $${cachedPrice}`);
    return parseFloat(cachedPrice);
  }

  // Cache miss: generate a new price and cache it
  const newPrice = parseFloat((Math.random() * 100 + 50).toFixed(2)); // $50-$150
  await redis.setex(`price:${assetId}`, 30, newPrice.toString()); // Cache for 30 seconds
  console.log(
    `[Service B] Cache MISS: Generated new price for ${assetId} = $${newPrice} (cached for 30s)`
  );

  return newPrice;
}

/**
 * Store trade history in Redis
 */
export async function storeTradeHistory(
  redis: Redis,
  signal: TradeSignal,
  price: number
): Promise<void> {
  const tradeRecord: TradeRecord = {
    ...signal,
    price,
    totalValue: (signal.volume * price).toFixed(2),
  };

  // Store in a Redis list for trade history
  await redis.lpush('trade_history', JSON.stringify(tradeRecord));
  await redis.ltrim('trade_history', 0, 99); // Keep only last 100 trades

  // Increment trade counter
  await redis.incr(`trade_count:${signal.assetId}`);
}

/**
 * Calculate trade value
 */
export function calculateTradeValue(volume: number, price: number): string {
  return (volume * price).toFixed(2);
}
