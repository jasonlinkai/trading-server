// 導出所有環境變數相關常量
export * from './env';

// 訂單相關常量
export const ORDER_TYPES = {
  MARKET: 'market',
  LIMIT: 'limit',
  STOP: 'stop',
  TAKE_PROFIT: 'take_profit'
};

// 交易操作類型
export const TRADE_ACTIONS = {
  BUY: 'buy',
  SELL: 'sell'
};

// 錯誤消息常量
export const ERROR_MESSAGES = {
  MISSING_FIELDS: 'Missing required fields',
  INVALID_ACTION: 'Invalid action. Must be either "buy" or "sell"',
  FAILED_TO_PROCESS: 'Failed to process order',
  POSITION_EXISTS: 'Cannot create order: A position already exists for this trading pair. Please close the existing position first.'
};

// API 路徑常量
export const API_PATHS = {
  ORDER: '/api/order',
  HEALTH: '/health',
  POSITION: '/api/position'
};

// HTTP 狀態碼
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
}; 