// 範例：在 Node.js 中使用 Redis 進行快取 (使用 ioredis)
import Redis from 'ioredis';

// 假設 Redis 服務器在本地運行
const redis = new Redis();

// 模擬一個緩慢的資料庫查詢
async function fetchMarketPriceFromDB(symbol: string): Promise<number> {
    console.log(`[DB] Fetching price for ${symbol}...`);
    await new Promise(resolve => setTimeout(resolve, 500)); // 模擬 500ms 延遲
    return 120.50; // 範例價格
}

// 獲取市場價格的函數，帶有快取邏輯
async function getMarketPrice(symbol: string): Promise<number> {
    const cacheKey = `price:${symbol}`;

    // 1. 嘗試從快取讀取
    const cachedPrice = await redis.get(cacheKey);

    if (cachedPrice) {
        console.log(`[Cache HIT] Returning cached price for ${symbol}`);
        return parseFloat(cachedPrice);
    }

    // 2. 如果快取沒有，則從資料庫讀取
    console.log(`[Cache MISS] Fetching price for ${symbol} from DB...`);
    const dbPrice = await fetchMarketPriceFromDB(symbol);

    // 3. 寫入快取 (設定 10 秒過期)
    // 'EX' 參數代表秒數
    await redis.set(cacheKey, dbPrice, 'EX', 10);

    return dbPrice;
}

// --- 如何使用 ---
// (async () => {
//   await getMarketPrice('GRID_ENERGY'); // 第一次會 Cache MISS
//   await getMarketPrice('GRID_ENERGY'); // 第二次會 Cache HIT
// })();