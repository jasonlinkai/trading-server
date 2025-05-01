import dotenv from 'dotenv';

// 加載環境變數
dotenv.config();

// 交易所 API 密鑰配置
export const BITMEX_API_KEY = process.env.BITMEX_API_KEY || '';
export const BITMEX_API_SECRET = process.env.BITMEX_API_SECRET || '';
export const BINANCE_API_KEY = process.env.BINANCE_API_KEY || '';
export const BINANCE_API_SECRET = process.env.BINANCE_API_SECRET || '';

// 交易所配置
export const EXCHANGE_TYPE = (process.env.EXCHANGE_TYPE || 'binance').toLowerCase();
export const IS_TESTNET = process.env.IS_TESTNET === 'true';

// 根據交易所類型選擇對應的 API 密鑰
export const API_KEY = EXCHANGE_TYPE === 'bitmex' 
  ? BITMEX_API_KEY 
  : BINANCE_API_KEY;
export const API_SECRET = EXCHANGE_TYPE === 'bitmex'
  ? BITMEX_API_SECRET
  : BINANCE_API_SECRET;

// 服務器配置
export const PORT = process.env.PORT || 3000;

// IP 白名單配置
export const ALLOWED_IPS = process.env.ALLOWED_IPS
  ? process.env.ALLOWED_IPS.split(',').map(ip => ip.trim())
  : []; 