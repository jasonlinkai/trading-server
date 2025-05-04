// 引入必要的套件
import express from 'express';                // 導入 Express 框架，用於建立 Web 服務器
import cors from 'cors';                      // 跨來源資源共享，允許不同域的前端訪問 API
import helmet from 'helmet';                  // 增強 API 安全性的中間件
import dotenv from 'dotenv';                  // 用於載入環境變數
import rateLimit from 'express-rate-limit';   // 限制 API 請求頻率，防止濫用
import { validateIp } from './middleware/ipWhitelist'; // 導入 IP 白名單驗證中間件
import { registerOrderRoute } from './routes/order'; // 導入 Binance 路由
import { API_PATHS, ExchangeType } from './enums';
import { BINANCE_API_KEY, BITMEX_API_KEY, BITMEX_API_SECRET, BINANCE_API_SECRET, IS_TESTNET } from './constants';
import logger from './utils/logger';  // 導入自定義日誌工具

// 載入環境變數（從 .env 文件）
dotenv.config();

// 創建 Express 應用實例
const app = express();
// 設定服務器監聽端口，優先使用環境變數中的 PORT，若未設定則使用 3000
const port = process.env.PORT || 3000;

// 設置信任代理，允許反向代理
app.set('trust proxy', true);

// 中間件設置
app.use(helmet());       // 啟用 Helmet 安全中間件，防止常見 Web 漏洞
app.use(cors());         // 啟用 CORS，允許跨域請求

// 自定義中間件處理 text/plain 格式的請求
app.use((req, res, next) => {
  if (req.headers['content-type'] && 
      req.headers['content-type'].includes('text/plain')) {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        // 嘗試將文本解析為 JSON
        if (data) {
          req.body = JSON.parse(data);
        } else {
          req.body = {};
        }
        next();
      } catch (e) {
        logger.error('[請求錯誤] 無法解析 text/plain 請求體為 JSON:', e);
        res.status(400).json({ error: 'Invalid JSON in request body' });
      }
    });
  } else {
    next();
  }
});

// 標準 JSON 解析中間件
app.use(express.json()); // 解析請求體中的 JSON 數據

// 請求頻率限制設置
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 時間窗口為 15 分鐘
  max: 100,                 // 每個 IP 在時間窗口內最多 100 個請求
  skip: (req, res) => {
    // 跳過對 /api/format 和 /health 端點的限制
    return req.path === '/api/format' || req.path === '/health';
  }
});
app.use(limiter);           // 啟用請求頻率限制

// 啟用 IP 白名單驗證，只允許特定 IP 訪問
app.use(validateIp);


app.use(API_PATHS.BINANCE_ROUTER, registerOrderRoute(ExchangeType.BINANCE, BINANCE_API_KEY, BINANCE_API_SECRET, IS_TESTNET, false)); // 註冊 Binance 特定的 API 路由
app.use(API_PATHS.BITMEX_ROUTER, registerOrderRoute(ExchangeType.BITMEX, BITMEX_API_KEY, BITMEX_API_SECRET, IS_TESTNET, false)); // 註冊 BitMEX 特定的 API 路由

// API 格式說明終端點
app.get(API_PATHS.FORMAT, (req, res) => {
  res.json({
    description: '交易伺服器API格式說明',
    endpoints: {
      '/api/[exchange]/order': {
        method: 'POST',
        contentType: 'application/json 或 text/plain (包含JSON字符串)',
        description: '創建 [exchange] 新訂單',
        requestFormat: {
          interval: 'string (時間週期)',
          now: 'string (信號時間)',
          action: 'string ("buy" 或 "sell")',
          symbol: 'string (TradingView圖表上的交易對 {{ticker}} ，例如 "BTCUSD.P、BTCUSDT.P")',
          qty: 'number (交易數量)',
          price: 'number (交易價格)',
          leverage: 'number (槓桿倍數)',
          take_profit: {
            points: 'number (止盈點數)',
            is_percentage: 'boolean (是否百分比)'
          },
          stop_loss: {
            points: 'number (止損點數)',
            is_percentage: 'boolean (是否百分比)'
          }
        }
      },
      '/api/[exchange]/position': {
        method: 'GET',
        description: '獲取 [exchange] 持倉信息',
        parameters: {
          symbol: 'string (必填，交易對，例如 "BTCUSD")'
        },
        example: '/api/[exchange]/position?symbol=BTCUSD'
      },
      '/api/[exchange]/position/close': {
        method: 'POST',
        contentType: 'application/json',
        description: '關閉 [exchange] 指定交易對的持倉',
        requestFormat: {
          symbol: 'string (必填，交易對，例如 "BTCUSD")'
        },
        example: {
          symbol: 'BTCUSD'
        }
      }
    }
  });
});

// 健康檢查端點，用於監控服務是否正常運行
app.get(API_PATHS.HEALTH, (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 全局錯誤處理中間件，捕獲並處理應用中發生的所有錯誤
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('[系統錯誤] 請求處理異常:', err.stack);  // 使用logger記錄錯誤堆棧信息
  res.status(500).json({ error: 'Something went wrong!' }); // 返回 500 錯誤響應
});

// 啟動服務器
app.listen(port, () => {
  logger.info(`[系統啟動] 服務器已在端口 ${port} 上啟動運行`); // 標準化日誌格式
}); 