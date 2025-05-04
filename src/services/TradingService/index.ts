import * as ccxt from 'ccxt';
import { ExchangeType, OrderType, TRADE_ACTIONS } from '../../enums';
import { OrderResult, OrderRequest } from '../../interfaces/order';
import logger from '../../utils/logger';


export abstract class TradingService {
  protected exchange?: ccxt.Exchange;
  protected apiKey: string;
  protected apiSecret: string;
  protected isTestnet: boolean;
  protected exchangeType: ExchangeType;

  protected readonly symbolMappingsForCCXT: Record<string, string> = {
    'BTCUSD': 'BTC/USD:BTC',
    'BTCUSDT': 'BTC/USDT:USDT'
  };
  protected symbolMappingsForExchange: Record<string, string> = {
  };
  protected symbolMintickMap: { [key: string]: number } = {
  };

  protected marketDataCache: ccxt.Market[] = [];
  protected readonly cacheExpiryTime: number = 10 * 60 * 1000; // 10分鐘快取過期
  protected lastCacheTime: number = 0;

  constructor(exchangeType: ExchangeType, apiKey: string, apiSecret: string, isTestnet: boolean = false) {
    logger.info(`[TradingService][INIT] 初始化交易服務, 交易所: ${exchangeType}, 測試網: ${isTestnet}`);
    logger.info(`[TradingService][AUTH] API密鑰狀態: ${apiKey ? '已提供' : '未提供'}, 密鑰狀態: ${apiSecret ? '已提供' : '未提供'}`);
    this.exchangeType = exchangeType;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.isTestnet = isTestnet;
  }

  /**
 * 從 API 獲取市場數據，支持快取
 */
  protected async fetchMarketData(): Promise<ccxt.Market[]> {
    try {
      // 檢查交易所實例
      if (!this.exchange) {
        logger.error(`[${this.exchangeType}][ERROR] 交易所實例未初始化，無法獲取市場數據`);
        throw new Error('Exchange not initialized');
      }

      const currentTime = Date.now();

      // 如果快取有效且未過期，直接返回快取
      if (this.marketDataCache && (currentTime - this.lastCacheTime < this.cacheExpiryTime)) {
        const cacheAge = Math.round((currentTime - this.lastCacheTime) / 1000);
        logger.debug(`[${this.exchangeType}][CACHE] 使用快取的市場數據 (已快取 ${cacheAge} 秒) - 避免重複請求API以減輕服務器負擔和提高響應速度`);
        return this.marketDataCache;
      }

      logger.info(`[${this.exchangeType}][API] 從 API 獲取市場數據 - 原因: 快取已過期或不存在，需要最新數據`);

      // 調用 API 獲取市場數據
      const markets = await this.exchange.fetchMarkets();
      logger.info(`[${this.exchangeType}][API] 成功獲取 ${markets.length} 個市場數據 - 已更新所有可交易對的最新信息`);

      // 更新快取
      this.marketDataCache = markets;
      this.lastCacheTime = currentTime;

      // 返回市場數據
      return markets;
    } catch (error: any) {
      logger.error(`[${this.exchangeType}][ERROR] 獲取市場數據失敗: ${error.message} - 可能是網絡問題或API限制`);

      // 如果有快取，使用過期的快取作為備選
      if (this.marketDataCache) {
        logger.warn(`[${this.exchangeType}][CACHE] 使用過期的市場數據快取作為備選 - 確保系統在API失敗時仍能繼續運作`);
        return this.marketDataCache;
      }

      throw error;
    }
  }

  /**
 * 根據符號查找匹配的市場
 */
  protected findMatchingMarketBySymbol(symbol: string): ccxt.Market | false {
    const exchangeSymbol = this.convertSymbolForExchange(symbol);
    logger.debug(`[${this.exchangeType}][MATCH] 查找 ${symbol} ${exchangeSymbol}的市場數據 - 比對API返回的市場數據，尋找最佳匹配`);
    const market = this.marketDataCache.find(m => {
      return m?.id === symbol || m?.id === exchangeSymbol || m?.symbol === symbol || m?.symbol === exchangeSymbol
    });

    if (market) {
      logger.debug(`[${this.exchangeType}][MATCH] 找到匹配的市場: ${market.symbol} (ID: ${market.id}) - 可直接使用此市場數據`);
      return market;
    } else {
      logger.debug(`[${this.exchangeType}][MATCH] 未找到匹配的市場`);
      return false;
    }
  }

  /**
 * 從市場數據中提取 mintick
 */
  protected extractMintickFromMarket(market: ccxt.Market): Promise<number | false> {
    return market?.info?.tickSize || market?.precision?.price || false;
  }
  protected getMintickBySymbol(symbol: string): number {
    return this.symbolMintickMap[symbol] || 0.001;
  }

  /**
   * 將任意交易對符號轉換為 BitMEX 支持的標準格式
   * @param symbol 需要轉換的交易對符號
   * @returns BitMEX 標準格式的交易對符號
   */
  protected convertSymbolForExchange(symbol: string): string {
    logger.debug(`[${this.exchangeType}][SYMBOL] 開始轉換交易對: ${symbol} - 原因: 需要將通用符號轉換為 ${this.exchangeType} 專用格式`);

    // 優先使用映射表查詢
    const result = this.symbolMappingsForExchange[symbol];
    logger.debug(`[${this.exchangeType}][SYMBOL] 從映射表查找到交易對: ${symbol} -> ${result} - 使用預定義映射關係`);
    return result || symbol;
  }
  /**
   * 將任意交易對符號轉換為 CCTX 支持的標準格式
   * @param symbol 需要轉換的交易對符號
   * @returns CCTX 標準格式的交易對符號
   */
  protected convertSymbolForCCXT(symbol: string): string {
    logger.debug(`[${this.exchangeType}][SYMBOL] 開始轉換交易對: ${symbol} - 原因: 需要將通用符號轉換為 CCTX 專用格式`);

    // 優先使用映射表查詢
    const result = this.symbolMappingsForCCXT[symbol];
    logger.debug(`[${this.exchangeType}][SYMBOL] 從映射表查找到交易對: ${symbol} -> ${result} - 使用預定義映射關係`);
    return result || symbol;
  }

  /**
 * 根據點數計算價格 - 優化精度處理
 */
  protected calculatePriceByPoints(
    entryPrice: number,
    points: number,
    isPercentage: boolean,
    isTakeProfit: boolean,
    mintick: number = 1
  ): number {
    logger.debug(`[${this.exchangeType}][CALC] 開始計算${isTakeProfit ? 'HP' : 'LP'}價格 - 入場價: ${entryPrice}, 點數: ${points}, 模式: ${isPercentage ? '百分比' : '點數'}, Mintick: ${mintick}`);

    let result: number;
    if (isPercentage) {
      const multiplier = isTakeProfit ? (1 + points / 100) : (1 - points / 100);
      logger.debug(`[${this.exchangeType}][CALC] 百分比模式計算 - 乘數: ${multiplier} (${points}%) - 根據百分比調整入場價`);
      result = entryPrice * multiplier;
    } else {
      const adjustment = points * mintick;  // 使用 mintick 調整點數
      logger.debug(`[${this.exchangeType}][CALC] 點數模式計算 - 調整值: ${adjustment} (${points} × ${mintick}) - 根據點數和最小變動單位計算價格差`);
      result = isTakeProfit ? entryPrice + adjustment : entryPrice - adjustment;
    }

    // 使用 mintick 正確四捨五入
    const roundedResult = Math.round(result / mintick) * mintick;
    logger.debug(`[${this.exchangeType}][CALC] 價格計算結果: ${entryPrice} => ${roundedResult} - 按 mintick=${mintick} 四捨五入，確保價格符合交易所要求`);
    return roundedResult;
  }

  /**
   * 獲取持倉信息
   */
  async fetchPosition(symbol: string): Promise<ccxt.Position | false> {
    logger.info(`[${this.exchangeType}][POSITION] 獲取 ${symbol} 的持倉信息 - 查詢當前賬戶在該交易對的倉位狀態`);
    try {
      if (!this.exchange) {
        logger.error(`[${this.exchangeType}][ERROR] 交易所實例未初始化，無法獲取持倉 - 可能是配置問題或初始化失敗`);
        throw new Error('Exchange not initialized');
      }

      // 使用 convertSymbol 轉換交易對
      const exchangeSymbol = this.convertSymbolForExchange(symbol);
      const cctxSymbol = this.convertSymbolForCCXT(symbol);
      logger.debug(`[${this.exchangeType}][POSITION] 轉換後的交易對: ${cctxSymbol} - 確保使用交易所接受的格式`);
      logger.debug(`[${this.exchangeType}][POSITION] 調用API獲取持倉數據 - 從交易所實時獲取最新持倉信息`);

      try {
        // 嘗試獲取持倉數據
        const positions = await this.exchange.fetchPositions() || [];
        logger.debug(`[${this.exchangeType}][POSITION] 獲取持倉數據: ${JSON.stringify(positions)}`);
        // 使用增強的符號匹配邏輯查找有效持倉
        const matchedPosition = positions.filter((p: any) => {
          return (p.symbol === cctxSymbol || p?.info?.symbol === exchangeSymbol) && p.contracts > 0;
        });

        if (matchedPosition.length > 0) {
          logger.info(`[${this.exchangeType}][POSITION] 發現持倉: ${JSON.stringify(matchedPosition)}`);
          return matchedPosition[0];
        } else {
          logger.info(`[${this.exchangeType}][POSITION] 未發現持倉`);
          return false;
        }
      } catch (apiError) {
        logger.error(`[${this.exchangeType}][ERROR] API調用時發生錯誤: ${apiError instanceof Error ? apiError.message : String(apiError)} - 可能是網絡問題或API限制`);
        return false;
      }
    } catch (error) {
      logger.error(`[${this.exchangeType}][ERROR] 獲取持倉時發生錯誤 - 系統錯誤或參數無效`);
      return false
    }
  }

  /**
   * 獲取賬戶餘額
   */
  async fetchBalance(): Promise<any> {
    logger.info(`[${this.exchangeType}][BALANCE] 獲取賬戶餘額 - 查詢所有幣種的資金狀況`);
    try {
      if (!this.exchange) {
        logger.error(`[${this.exchangeType}][ERROR] 交易所實例未初始化，無法獲取餘額 - 可能是配置問題或初始化失敗`);
        throw new Error('Exchange not initialized');
      }

      logger.debug(`[${this.exchangeType}][BALANCE] 調用API獲取餘額數據 - 從交易所實時獲取最新資金信息`);
      const balance = await this.exchange.fetchBalance();

      // 僅記錄關鍵餘額信息而非完整對象
      const totalBalances = Object.entries(balance.total || {})
        .filter(([_, value]) => value && value > 0)
        .map(([currency, value]) => `${currency}: ${value}`)
        .join(', ');

      logger.info(`[${this.exchangeType}][BALANCE] 餘額獲取成功: ${totalBalances || '無可用餘額'} - 賬戶資金狀況良好`);

      return balance;
    } catch (error) {
      logger.error(`[${this.exchangeType}][ERROR] 獲取餘額時發生錯誤 - 可能是網絡問題或API限制`);
      throw error;
    }
  }

  /**
   * 對指定交易對進行平倉
   * @param symbol 需要平倉的交易對符號
   * @returns boolean
   */
  async closePosition(symbol: string): Promise<boolean> {
    logger.info(`[${this.exchangeType}][CLOSE] 開始對 ${symbol} 進行全部平倉 - 自動關閉該交易對的所有倉位`);
    try {
      if (!this.exchange) {
        logger.error(`[${this.exchangeType}][ERROR] 交易所實例未初始化，無法進行平倉操作 - 可能是配置問題或初始化失敗`);
        throw new Error('Exchange not initialized');
      }
      await this.exchange.closePosition(symbol);
      logger.info(`[${this.exchangeType}][CLOSE] 平倉訂單提交成功: ${symbol} - 倉位已關閉`);
      return true;
    } catch (error: any) {
      logger.error(`[${this.exchangeType}][ERROR] 平倉操作失敗: ${error.message} - 可能是網絡問題或參數無效`);
      return false;
    }
  }

  /**
 * 創建訂單
 */
  abstract createOrder(orderData: OrderRequest): Promise<OrderResult>;
  abstract checkQuantity(quantity: number): number;

  /**
   * 取消指定交易對的所有訂單
   * @param symbol 交易對符號
   * @returns 取消結果
   */
  async cancelAllOrders(symbol: string): Promise<boolean> {
    logger.info(`[${this.exchangeType}][CANCEL] 開始取消 ${symbol} 的所有訂單 - 清理潛在的止盈止損訂單`);
    try {
      if (!this.exchange) {
        logger.error(`[${this.exchangeType}][ERROR] 交易所實例未初始化，無法取消訂單 - 可能是配置問題或初始化失敗`);
        throw new Error('Exchange not initialized');
      }
      
      const exchangeSymbol = this.convertSymbolForExchange(symbol);
      await this.exchange.cancelAllOrders(exchangeSymbol);
      logger.info(`[${this.exchangeType}][CANCEL] 成功取消 ${symbol} 的所有訂單`);
      return true;
    } catch (error: any) {
      logger.error(`[${this.exchangeType}][ERROR] 取消訂單失敗: ${error.message} - 可能是網絡問題或無訂單可取消`);
      throw error;
    }
  }

  async checkPositionsAndClearOrders(
    symbols: string[],
  ) {
    logger.info(`[排程][${this.exchangeType}] 開始檢查持倉和清理訂單`);
    
    // Check each symbol
    for (const symbol of symbols) {
      try {
        logger.info(`[排程][${this.exchangeType}] 檢查交易對 ${symbol}`);
        
        // Fetch position for this symbol
        const position = await this.fetchPosition(symbol);
        
        if (!position) {
          logger.info(`[排程][${this.exchangeType}] 交易對 ${symbol} 無持倉，檢查並清理訂單`);
          
          // No position exists, cancel all orders for this symbol
          await this.cancelAllOrders(symbol);
          logger.info(`[排程][${this.exchangeType}] 已清理交易對 ${symbol} 的所有訂單`);
        } else {
          logger.info(`[排程][${this.exchangeType}] 交易對 ${symbol} 有持倉，保留所有訂單`);
        }
      } catch (error) {
        logger.error(`[排程][${this.exchangeType}][錯誤] 處理交易對 ${symbol} 時發生錯誤:`, error);
        // Continue with next symbol despite error
      }
    }
    
    logger.info(`[排程][${this.exchangeType}] 檢查持倉和清理訂單完成`);
  } 

  async closeAllPositions() {
    logger.info(`[${this.exchangeType}][POSITION] 開始關閉所有持倉`);
    try {
      if (!this.exchange) {
        logger.error(`[${this.exchangeType}][ERROR] 交易所實例未初始化，無法關閉所有持倉 - 可能是配置問題或初始化失敗`);
        throw new Error('Exchange not initialized');
      }
      await this.exchange.closeAllPositions();
      logger.info(`[${this.exchangeType}][POSITION] 成功關閉所有持倉`);
      return true;
    } catch (error) {
      logger.error(`[${this.exchangeType}][ERROR] 關閉所有持倉時發生錯誤 - 系統錯誤或參數無效`);
      return false
    }
  }
}