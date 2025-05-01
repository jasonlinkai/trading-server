"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// 引入必要的套件
const express_1 = __importDefault(require("express")); // 導入 Express 框架，用於建立 Web 服務器
const cors_1 = __importDefault(require("cors")); // 跨來源資源共享，允許不同域的前端訪問 API
const helmet_1 = __importDefault(require("helmet")); // 增強 API 安全性的中間件
const dotenv_1 = __importDefault(require("dotenv")); // 用於載入環境變數
const express_rate_limit_1 = __importDefault(require("express-rate-limit")); // 限制 API 請求頻率，防止濫用
const ipWhitelist_1 = require("./middleware/ipWhitelist"); // 導入 IP 白名單驗證中間件
const order_1 = require("./routes/order"); // 導入訂單路由處理模塊
// 載入環境變數（從 .env 文件）
dotenv_1.default.config();
// 創建 Express 應用實例
const app = (0, express_1.default)();
// 設定服務器監聽端口，優先使用環境變數中的 PORT，若未設定則使用 3000
const port = process.env.PORT || 3000;
// 中間件設置
app.use((0, helmet_1.default)()); // 啟用 Helmet 安全中間件，防止常見 Web 漏洞
app.use((0, cors_1.default)()); // 啟用 CORS，允許跨域請求
app.use(express_1.default.json()); // 解析請求體中的 JSON 數據
// 請求頻率限制設置
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 時間窗口為 15 分鐘
    max: 100 // 每個 IP 在時間窗口內最多 100 個請求
});
app.use(limiter); // 啟用請求頻率限制
// 啟用 IP 白名單驗證，只允許特定 IP 訪問
app.use(ipWhitelist_1.validateIp);
// 設置路由
app.use('/api/order', order_1.orderRouter); // 將所有 /api/order 路徑的請求轉發到訂單路由處理器
// 健康檢查端點，用於監控服務是否正常運行
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// 全局錯誤處理中間件，捕獲並處理應用中發生的所有錯誤
app.use((err, req, res, next) => {
    console.error(err.stack); // 在控制台輸出錯誤堆棧信息
    res.status(500).json({ error: 'Something went wrong!' }); // 返回 500 錯誤響應
});
// 啟動服務器
app.listen(port, () => {
    console.log(`Server is running on port ${port}`); // 服務器成功啟動後的日誌信息
});
