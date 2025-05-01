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

// 中間件設置
app.use(helmet());       // 啟用 Helmet 安全中間件，防止常見 Web 漏洞
app.use(cors());         // 啟用 CORS，允許跨域請求
app.use(express.json()); // 解析請求體中的 JSON 數據

// 請求頻率限制設置
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 時間窗口為 15 分鐘
  max: 100                  // 每個 IP 在時間窗口內最多 100 個請求
});
app.use(limiter);           // 啟用請求頻率限制

// 啟用 IP 白名單驗證，只允許特定 IP 訪問
app.use(validateIp);

// 設置路由
app.use('/api/order', orderRouter); // 將所有 /api/order 路徑的請求轉發到訂單路由處理器
app.use('/api/position', orderRouter); // 註冊持倉查詢API，使用同一個路由處理器

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