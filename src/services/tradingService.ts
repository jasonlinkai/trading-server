import * as ccxt from 'ccxt';
import { LotSizeConverter } from '../utils/lotSizeConverter';
import { ExchangeType } from './tradingServiceFactory';

export interface OrderData {
  exchange: string;  // 交易所 (可能是 'BINANCE' 或 'BITMEX')
  interval: string;  // 時間週期
  now: string;      // 當前時間
  action: string;
  symbol: string;
  qty: number;      // 手數
  price: number;    // 用於計算止盈止損的價格
  limit_price?: number;
  take_profit: {
    points: number;
    is_percentage: boolean;
  };
  stop_loss: {
    points: number;
    is_percentage: boolean;
  };
}

export interface OrderResult {
  success: boolean;
  order?: any;
  takeProfitOrder?: any;
  stopLossOrder?: any;
  error?: string;
  errorDetails?: any;
}

export abstract class TradingService {
  protected exchange: ccxt.Exchange;
  protected apiKey: string;
  protected apiSecret: string;
  protected isTestnet: boolean;
  protected exchangeType: ExchangeType;
  protected symbolMintickMap: { [symbol: string]: number } = {};
  protected symbolsInitialized: Set<string> = new Set();

  constructor(exchangeType: string, apiKey: string, apiSecret: string, isTestnet: boolean = false) {
    console.log(`[TradingService][INIT] 初始化交易服務, 交易所: ${exchangeType}, 測試網: ${isTestnet}`);
    console.log(`[TradingService][AUTH] API密鑰狀態: ${apiKey ? '已提供' : '未提供'}, 密鑰狀態: ${apiSecret ? '已提供' : '未提供'}`);
    
    // 確保 exchangeType 為小寫
    this.exchangeType = exchangeType.toLowerCase() as ExchangeType;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.isTestnet = isTestnet;

    // 初始化 CCXT exchange
    console.log(`[TradingService][INIT] 創建 ${this.exchangeType} 交易所實例`);
    this.exchange = this.exchangeType === 'binance' 
      ? new ccxt.binance({ 
          apiKey: this.apiKey,
          secret: this.apiSecret,
          enableRateLimit: true
        })
      : new ccxt.bitmex({ 
          apiKey: this.apiKey,
          secret: this.apiSecret,
          enableRateLimit: true
        });

    // 如果是測試網，設置測試網 URL
    if (this.isTestnet) {
      console.log(`[TradingService][INIT] 配置測試網模式，交易所: ${this.exchangeType}`);
      if (this.exchange.urls.test) {
        console.log(`[TradingService][INIT] 測試網 URL: ${this.exchange.urls.test}`);
        this.exchange.urls.api = this.exchange.urls.test;
      } else {
        console.warn(`[TradingService][WARN] 交易所 ${this.exchangeType} 沒有提供測試網 URL`);
      }
    }

    console.log(`[TradingService][INIT] 交易服務初始化完成, 交易所: ${this.exchangeType}, 基礎URL: ${this.exchange.urls.api}`);
  }

  /**
   * 初始化交易對的相關信息
   */
  protected async initializeSymbol(symbol: string): Promise<void> {
    console.log(`\n[TradingService][SYMBOL] ======== 開始初始化交易對 ${symbol} ========`);
    
    // 如果已經初始化過，直接返回
    if (this.symbolsInitialized.has(symbol)) {
      console.log(`[TradingService][SYMBOL] 交易對 ${symbol} 已經初始化過，使用緩存值`);
      console.log(`[TradingService][SYMBOL] 當前 ${symbol} 的 mintick 值: ${this.symbolMintickMap[symbol]}`);
      console.log(`[TradingService][SYMBOL] ======== 交易對初始化已跳過 ========\n`);
      return;
    }

    console.log(`[TradingService][SYMBOL] 開始為 ${this.exchangeType} 交易所初始化 ${symbol} 交易對`);
    console.log(`[TradingService][SYMBOL] 初始化前的默認 mintick 值: ${this.symbolMintickMap[symbol] || '未設置 (將使用默認值 0.1)'}`);
    
    try {
      // 獲取市場信息
      console.log(`[TradingService][SYMBOL] 請求 ${this.exchangeType} 交易所的市場數據...`);
      console.log(`[TradingService][SYMBOL] API 請求: fetchMarkets()`);
      
      let markets;
      try {
        markets = await this.exchange.fetchMarkets();
        console.log(`[TradingService][SYMBOL] 成功獲取 ${markets.length} 個市場數據`);
      } catch (error) {
        console.error(`[TradingService][ERROR] 獲取市場數據失敗:`, error);
        throw new Error(`Failed to fetch markets: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // 尋找匹配的交易對
      console.log(`[TradingService][SYMBOL] 在 ${markets.length} 個市場中搜索 ${symbol} 交易對...`);
      const market = markets.find(m => m && m.symbol === symbol);
      
      if (!market) {
        console.error(`[TradingService][ERROR] 在 ${this.exchangeType} 交易所中找不到 ${symbol} 交易對`);
        console.log(`[TradingService][SYMBOL] 可用的交易對:`);
        console.log(markets.slice(0, 5).map(m => m && m.symbol).join(', ') + (markets.length > 5 ? '...' : ''));
        throw new Error(`Market not found for symbol: ${symbol}`);
      }

      // 記錄詳細的市場數據
      console.log(`[TradingService][SYMBOL] 找到 ${symbol} 交易對的市場數據:`);
      console.log(`  - 交易所ID: ${market.id}`);
      console.log(`  - 基準貨幣/計價貨幣: ${market.base}/${market.quote}`);
      console.log(`  - 是否激活: ${market.active}`);
      console.log(`  - 精度信息: ${JSON.stringify(market.precision)}`);
      console.log(`  - 限制信息: ${JSON.stringify(market.limits)}`);
      console.log(`  - 合約規模: ${market.contractSize || '未指定'}`);
      
      // 保存最小價格變動單位
      const oldMintick = this.symbolMintickMap[symbol] || 0.1;
      console.log(`[TradingService][SYMBOL] 嘗試從市場數據中提取 mintick 值...`);
      
      // 優先使用精度信息獲取mintick
      if (market.precision && typeof market.precision.price === 'number') {
        // 檢查是否是小數位數值（通常大於等於0的整數，表示小數點後的位數）
        if (market.precision.price >= 0 && Number.isInteger(market.precision.price)) {
          const precisionDigits = market.precision.price;
          this.symbolMintickMap[symbol] = Math.pow(10, -precisionDigits);
          console.log(`[TradingService][SYMBOL] 從精度小數位數 ${precisionDigits} 計算 mintick: ${this.symbolMintickMap[symbol]}`);
        } 
        // 如果是直接的最小價格變動單位
        else {
          this.symbolMintickMap[symbol] = market.precision.price;
          console.log(`[TradingService][SYMBOL] 使用價格精度值作為 mintick: ${market.precision.price}`);
        }
      } 
      // 如果是字符串形式的精度，嘗試解析
      else if (market.precision && typeof market.precision.price === 'string') {
        try {
          const precisionValue = parseFloat(market.precision.price);
          this.symbolMintickMap[symbol] = precisionValue;
          console.log(`[TradingService][SYMBOL] 從字符串精度值解析 mintick: ${precisionValue}`);
        } catch (e) {
          console.log(`[TradingService][SYMBOL] 無法解析字符串精度值: ${market.precision.price}, 使用默認值`);
          this.symbolMintickMap[symbol] = 0.1;
        }
      }
      // 嘗試從市場的價格過濾器中獲取
      else if (market.info && market.info.filters) {
        console.log(`[TradingService][SYMBOL] 嘗試從市場的過濾器獲取 mintick...`);
        try {
          const priceFilter = Array.isArray(market.info.filters) 
            ? market.info.filters.find((f: any) => f.filterType === 'PRICE_FILTER') 
            : null;
            
          if (priceFilter && typeof priceFilter.tickSize === 'string') {
            const tickSize = parseFloat(priceFilter.tickSize);
            if (!isNaN(tickSize) && tickSize > 0) {
              this.symbolMintickMap[symbol] = tickSize;
              console.log(`[TradingService][SYMBOL] 從過濾器獲取 tickSize: ${tickSize}`);
            }
          }
        } catch (e) {
          console.log(`[TradingService][SYMBOL] 解析過濾器信息時出錯: ${e}`);
        }
      }
      // 如果無法從精度信息獲取，檢查步長信息
      else if (market.limits && market.limits.price && market.limits.price.min) {
        this.symbolMintickMap[symbol] = market.limits.price.min;
        console.log(`[TradingService][SYMBOL] 使用價格最小限制作為 mintick: ${market.limits.price.min}`);
      } 
      // 對於 BitMEX，使用硬編碼的默認值
      else if (this.exchangeType === 'bitmex') {
        // BitMEX 常見交易對的默認 mintick 值
        const bitmexDefaults: {[key: string]: number} = {
          'XBTUSD': 0.5,
          'ETHUSD': 0.05,
          'XRPUSD': 0.0001
        };
        
        const bitmexSymbol = symbol.replace('BTC', 'XBT').replace('/', '');
        if (bitmexDefaults[bitmexSymbol]) {
          this.symbolMintickMap[symbol] = bitmexDefaults[bitmexSymbol];
          console.log(`[TradingService][SYMBOL] 使用 BitMEX 硬編碼默認值: ${bitmexDefaults[bitmexSymbol]}`);
        } else {
          this.symbolMintickMap[symbol] = 0.1;
          console.log(`[TradingService][SYMBOL] 未找到 BitMEX 交易對 ${bitmexSymbol} 的默認值，使用 0.1`);
        }
      }
      // 如果無法獲取，使用默認值
      else {
        this.symbolMintickMap[symbol] = 0.1;
        console.log(`[TradingService][SYMBOL] 無法從市場數據獲取 mintick，使用默認值: 0.1`);
      }
      
      console.log(`[TradingService][SYMBOL] 更新 ${symbol} 的 mintick 值: ${oldMintick} -> ${this.symbolMintickMap[symbol]}`);

      // 初始化合約規格
      console.log(`[TradingService][SYMBOL] 開始初始化 ${symbol} 的合約規格...`);
      try {
        await LotSizeConverter.initializeContractSize(this.exchange, symbol);
        console.log(`[TradingService][SYMBOL] 合約規格初始化成功`);
      } catch (error) {
        console.error(`[TradingService][ERROR] 初始化合約規格失敗:`, error);
        console.log(`[TradingService][SYMBOL] 將使用默認合約規格`);
      }
      
      // 標記為已初始化
      this.symbolsInitialized.add(symbol);
      console.log(`[TradingService][SYMBOL] 交易對 ${symbol} 初始化成功，添加到已初始化列表`);
      console.log(`[TradingService][SYMBOL] ======== 交易對初始化完成 ========\n`);
    } catch (error) {
      console.error(`[TradingService][ERROR] 初始化交易對 ${symbol} 時發生錯誤:`, error);
      // 使用默認值
      this.symbolMintickMap[symbol] = 0.1;
      console.log(`[TradingService][SYMBOL] 由於錯誤，對 ${symbol} 使用默認 mintick 值: 0.1`);
      console.log(`[TradingService][SYMBOL] ======== 交易對初始化失敗 ========\n`);
    }
  }

  /**
   * 獲取最小價格變動單位，如果需要會初始化交易對
   */
  protected async getMintick(symbol: string): Promise<number> {
    console.log(`[TradingService][MINTICK] 獲取 ${symbol} 的 mintick 值`);
    
    // 如果交易對未初始化，先初始化
    if (!this.symbolsInitialized.has(symbol)) {
      console.log(`[TradingService][MINTICK] ${symbol} 未初始化，需要先初始化交易對...`);
      await this.initializeSymbol(symbol);
    }
    
    const mintick = this.symbolMintickMap[symbol] || 0.1;
    console.log(`[TradingService][MINTICK] 返回 ${symbol} 的 mintick 值: ${mintick}${mintick === 0.1 ? ' (默認值)' : ''}`);
    return mintick;
  }

  /**
   * 將手數轉換為實際交易數量
   */
  protected convertLotsToQuantity(lots: number, symbol: string, price?: number): number {
    console.log(`[TradingService][LOTS] 開始轉換手數: ${lots} 手 -> ${symbol} 交易單位`);
    console.log(`[TradingService][LOTS] 轉換參數: 手數=${lots}, 交易對=${symbol}, 價格=${price || 'N/A'}, 交易所=${this.exchangeType}`);
    
    try {
      const quantity = LotSizeConverter.convertLotsToQuantity(lots, symbol, this.exchangeType, price);
      console.log(`[TradingService][LOTS] 手數轉換結果: ${lots} 手 = ${quantity} 交易單位`);
      return quantity;
    } catch (error) {
      console.error(`[TradingService][ERROR] 手數轉換失敗:`, error);
      throw new Error(`Failed to convert lots to quantity: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 根據點數計算價格
   */
  protected calculatePriceByPoints(
    basePrice: number,
    points: number,
    isPercentage: boolean,
    isProfit: boolean,
    mintick: number = 1
  ): number {
    console.log(`[TradingService][PRICE] 開始計算點數對應的價格:`);
    console.log(`  - 基準價格: ${basePrice}`);
    console.log(`  - 點數: ${points}`);
    console.log(`  - 百分比模式: ${isPercentage}`);
    console.log(`  - 是否為盈利點: ${isProfit}`);
    console.log(`  - Mintick: ${mintick}`);
    
    let delta: number;
    if (isPercentage) {
      delta = basePrice * (points / 100);
      console.log(`[TradingService][PRICE] 使用百分比計算價格變動: ${basePrice} × ${points}% = ${delta}`);
    } else {
      delta = points;
      console.log(`[TradingService][PRICE] 使用固定點數計算價格變動: ${points}`);
    }
    
    if (!isProfit) {
      delta = -delta;
      console.log(`[TradingService][PRICE] 調整為虧損方向的變動: ${delta}`);
    }
    
    const rawPrice = basePrice + delta;
    console.log(`[TradingService][PRICE] 未經四捨五入的價格: ${basePrice} + ${delta} = ${rawPrice}`);
    
    // 根據 mintick 四捨五入
    const finalPrice = Math.round(rawPrice / mintick) * mintick;
    console.log(`[TradingService][PRICE] 根據 mintick=${mintick} 四捨五入後的最終價格: ${finalPrice}`);
    
    return finalPrice;
  }

  abstract createOrder(orderData: OrderData): Promise<OrderResult>;
  abstract getPosition(symbol: string): Promise<any>;
  abstract getBalance(): Promise<any>;
} 