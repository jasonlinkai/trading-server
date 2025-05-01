"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HTTP_STATUS = exports.API_PATHS = exports.ERROR_MESSAGES = exports.TRADE_ACTIONS = exports.ORDER_TYPES = void 0;
// 導出所有環境變數相關常量
__exportStar(require("./env"), exports);
// 訂單相關常量
exports.ORDER_TYPES = {
    MARKET: 'market',
    LIMIT: 'limit',
    STOP: 'stop',
    TAKE_PROFIT: 'take_profit'
};
// 交易操作類型
exports.TRADE_ACTIONS = {
    BUY: 'buy',
    SELL: 'sell'
};
// 錯誤消息常量
exports.ERROR_MESSAGES = {
    MISSING_FIELDS: 'Missing required fields',
    INVALID_ACTION: 'Invalid action. Must be either "buy" or "sell"',
    FAILED_TO_PROCESS: 'Failed to process order'
};
// API 路徑常量
exports.API_PATHS = {
    ORDER: '/api/order',
    HEALTH: '/health'
};
// HTTP 狀態碼
exports.HTTP_STATUS = {
    OK: 200,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500
};
