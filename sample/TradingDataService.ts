// 範例：一個簡單的 TypeScript 數據服務類別

// 定義一個數據讀取器的介面 (Interface)
interface IDataReader {
    readData(sourceId: string): Promise<string>;
}

// 實作一個模擬的數據庫讀取器
class MockDatabaseReader implements IDataReader {
    public async readData(sourceId: string): Promise<string> {
        // 模擬非阻塞的資料庫 I/O
        await new Promise(resolve => setTimeout(resolve, 50)); // 模擬 50ms 延遲
        return `Data for ${sourceId} from DB`;
    }
}

// 交易數據服務，依賴 IDataReader
class TradingDataService {
    private dataReader: IDataReader;

    // 透過建構子注入依賴 (Dependency Injection)
    constructor(dataReader: IDataReader) {
        this.dataReader = dataReader;
    }

    // 業務邏輯：獲取並處理數據
    public async getProcessedData(id: string): Promise<string> {
        try {
            const rawData = await this.dataReader.readData(id);
            // 假設有一些處理邏輯
            const processedData = rawData.toUpperCase();
            console.log(`[TradingService] Processed data for ${id}`);
            return processedData;
        } catch (error) {
            console.error('Error processing data:', error);
            throw new Error('Failed to process trading data');
        }
    }
}

// --- 如何使用 ---
// const dbReader = new MockDatabaseReader();
// const tradingService = new TradingDataService(dbReader);
// tradingService.getProcessedData('BATTERY_GRID_A');