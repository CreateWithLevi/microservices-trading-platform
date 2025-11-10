// 範例：一個 Node.js (Express) 微服務端點

import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

interface TradeSignal {
    assetId: string;   // e.g., 'BATTERY_001'
    action: 'BUY' | 'SELL';
    volume: number;    // in MWh
    timestamp: number;
}

// 接收來自 AI 平台的交易訊號
app.post('/api/v1/signals', (req: Request, res: Response) => {
    const signal = req.body as TradeSignal;

    // 這裡應該進行嚴格的數據驗證
    if (!signal.assetId || !signal.action || !signal.volume) {
        return res.status(400).json({ error: 'Invalid signal payload' });
    }

    // 實際應用中：
    // 1. 將這個訊號發佈到 Kafka 或 RabbitMQ
    // 2. 讓 'TradingExecutionService' 訂閱並執行
    console.log(`[SignalService] Received signal: ${signal.action} ${signal.volume}MWh for ${signal.assetId}`);

    // 為了低延遲，這個 API 應該快速響應
    res.status(202).json({ message: 'Signal accepted and queued for processing.' });
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Trading Signal Service running on port ${PORT}`);
});