// 引入必要的套件
import express from 'express';                // 導入 Express 框架，用於建立 Web 服務器
import cors from 'cors';                      // 跨來源資源共享，允許不同域的前端訪問 API
import helmet from 'helmet';                  // 增強 API 安全性的中間件
import dotenv from 'dotenv';                  // 用於載入環境變數
import rateLimit from 'express-rate-limit';   // 限制 API 請求頻率，防止濫用
import { validateIp } from './middleware/ipWhitelist'; // 導入 IP 白名單驗證中間件
import { orderRouter } from './routes/order'; // 導入訂單路由處理模塊

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
        console.error('[請求錯誤] 無法解析 text/plain 請求體為 JSON:', e);
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

// 設置路由
app.use('/api/order', orderRouter); // 將所有 /api/order 路徑的請求轉發到訂單路由處理器
app.use('/api/position', orderRouter); // 註冊持倉查詢API，使用同一個路由處理器

// API 格式說明終端點
app.get('/api/format', (req, res) => {
  res.json({
    description: '交易伺服器API格式說明',
    endpoints: {
      '/api/order': {
        method: 'POST',
        contentType: 'application/json 或 text/plain (包含JSON字符串)',
        description: '創建新訂單',
        requestFormat: {
          exchange: 'string (交易所名稱，例如 "bitmex")',
          interval: 'string (時間週期)',
          now: 'string (信號時間)',
          action: 'string ("buy" 或 "sell")',
          symbol: 'string (交易對，例如 "BTC/USD")',
          qty: 'number (交易數量)',
          price: 'number (交易價格)',
          take_profit: {
            points: 'number (止盈點數)',
            is_percentage: 'boolean (是否百分比)'
          },
          stop_loss: {
            points: 'number (止損點數)',
            is_percentage: 'boolean (是否百分比)'
          }
        },
        example: {
          exchange: 'bitmex',
          interval: '1h',
          now: '2023-05-01T14:30:00Z',
          action: 'buy',
          symbol: 'BTC/USD',
          qty: 100,
          price: 35000,
          take_profit: {
            points: 500,
            is_percentage: false
          },
          stop_loss: {
            points: 300,
            is_percentage: false
          }
        }
      },
      '/api/position': {
        method: 'GET',
        description: '獲取持倉信息',
        parameters: {
          symbol: 'string (必填，交易對，例如 "BTC/USD")'
        },
        example: '/api/position?symbol=BTC/USD'
      }
    }
  });
});

// 健康檢查端點，用於監控服務是否正常運行
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 全局錯誤處理中間件，捕獲並處理應用中發生的所有錯誤
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);  // 在控制台輸出錯誤堆棧信息
  res.status(500).json({ error: 'Something went wrong!' }); // 返回 500 錯誤響應
});

// 啟動服務器
app.listen(port, () => {
  console.log(`Server is running on port ${port}`); // 服務器成功啟動後的日誌信息
}); 