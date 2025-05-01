"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_IPS = exports.PORT = exports.API_SECRET = exports.API_KEY = exports.IS_TESTNET = exports.EXCHANGE_TYPE = exports.BINANCE_API_SECRET = exports.BINANCE_API_KEY = exports.BITMEX_API_SECRET = exports.BITMEX_API_KEY = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
// 加載環境變數
dotenv_1.default.config();
// 交易所 API 密鑰配置
exports.BITMEX_API_KEY = process.env.BITMEX_API_KEY || '';
exports.BITMEX_API_SECRET = process.env.BITMEX_API_SECRET || '';
exports.BINANCE_API_KEY = process.env.BINANCE_API_KEY || '';
exports.BINANCE_API_SECRET = process.env.BINANCE_API_SECRET || '';
// 交易所配置
exports.EXCHANGE_TYPE = (process.env.EXCHANGE_TYPE || 'binance').toLowerCase();
exports.IS_TESTNET = process.env.IS_TESTNET === 'true';
// 根據交易所類型選擇對應的 API 密鑰
exports.API_KEY = exports.EXCHANGE_TYPE === 'bitmex'
    ? exports.BITMEX_API_KEY
    : exports.BINANCE_API_KEY;
exports.API_SECRET = exports.EXCHANGE_TYPE === 'bitmex'
    ? exports.BITMEX_API_SECRET
    : exports.BINANCE_API_SECRET;
// 服務器配置
exports.PORT = process.env.PORT || 3000;
// IP 白名單配置
exports.ALLOWED_IPS = process.env.ALLOWED_IPS
    ? process.env.ALLOWED_IPS.split(',').map(ip => ip.trim())
    : [];
