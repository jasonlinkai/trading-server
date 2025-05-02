export enum SymbolType {
  'BTCUSD' = 'BTCUSD',
}

export enum ExchangeType {
  BITMEX = 'bitmex',
  BINANCE = 'binance'
}

export enum OrderType {
  LIMIT = 'Limit',
  MARKET = 'Market',
  STOP = 'Stop',
  STOP_LIMIT = 'StopLimit',
  MARKET_IF_TOUCHED = 'MarketIfTouched',
  LIMIT_IF_TOUCHED = 'LimitIfTouched',
  BLOCK = 'Block',
  PEGGED = 'Pegged',
  MARKET_WITH_LEFT_OVER_AS_LIMIT = 'MarketWithLeftOverAsLimit'
}

// 交易操作類型
export enum TRADE_ACTIONS {
  BUY = 'buy',
  SELL = 'sell'
};

// 錯誤消息常量
export enum ERROR_MESSAGES {
  MISSING_FIELDS = 'Missing required fields',
  INVALID_ACTION = 'Invalid action. Must be either "buy" or "sell"',
  FAILED_TO_PROCESS = 'Failed to process order',
  POSITION_EXISTS = 'Cannot create order: A position already exists for this trading pair. Please close the existing position first.'
};

// API 路徑常量
export enum API_PATHS {
  BINANCE_ROUTER = '/api/binance',
  BITMEX_ROUTER = '/api/bitmex',
  FORMAT = '/api/format',
  HEALTH = '/health',
};

// HTTP 狀態碼
export enum HTTP_STATUS {
  OK = 200,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  INTERNAL_SERVER_ERROR = 500
}; 