/**
 * 交易訂單的請求接口定義，描述從客戶端接收的訂單數據結構
 */
export interface OrderRequestData {
  exchange: string;      // 交易所名稱
  interval: string;      // 交易時間週期
  now: string;           // 訊號時間
  action: string;        // 交易動作（buy/sell）
  symbol: string;        // 交易對符號
  qty: string;           // 交易數量 (接收为字符串)
  price: string;         // 交易價格 (接收为字符串)
  limit_price?: string;  // 可選的限價 (接收为字符串)
  take_profit: {         // 止盈設置
    points: number;      // 止盈點數
    is_percentage: boolean; // 是否為百分比
  };
  stop_loss: {           // 止損設置
    points: number;      // 止損點數
    is_percentage: boolean; // 是否為百分比
  };
} 

/**
 * adapter 適配器之後的OrderRequestData
 */
export interface OrderRequest {
  exchange: string;      // 交易所名稱
  interval: string;      // 交易時間週期
  now: string;           // 訊號時間
  action: string;        // 交易動作（buy/sell）
  symbol: string;        // 交易對符號
  qty: number;           // 交易數量 (接收为字符串)
  price: number;         // 交易價格 (接收为字符串)
  limit_price?: number;  // 可選的限價 (接收为字符串)
  take_profit: {         // 止盈設置
    points: number;      // 止盈點數
    is_percentage: boolean; // 是否為百分比
  };
  stop_loss: {           // 止損設置
    points: number;      // 止損點數
    is_percentage: boolean; // 是否為百分比
  };
} 