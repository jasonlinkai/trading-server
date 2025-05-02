import * as ccxt from 'ccxt';
import { ExchangeType, OrderType, TRADE_ACTIONS } from '../../enums';
import { OrderResult, OrderRequest } from '../../interfaces/order';


export abstract class TradingService {
  protected exchange?: ccxt.Exchange;
  protected apiKey: string;
  protected apiSecret: string;
  protected isTestnet: boolean;
  protected exchangeType: ExchangeType;

  protected readonly symbolMappingsForCCXT: Record<string, string> = {
    'BTCUSD': 'BTC/USD:BTC',
  };
  protected symbolMappingsForExchange: Record<string, string> = {
  };
  protected symbolMintickMap: { [key: string]: number } = {
  };

  protected marketDataCache: ccxt.Market[] = [];
  protected readonly cacheExpiryTime: number = 10 * 60 * 1000; // 10分鐘快取過期
  protected lastCacheTime: number = 0;

  constructor(exchangeType: ExchangeType, apiKey: string, apiSecret: string, isTestnet: boolean = false) {
    console.log(`[TradingService][INIT] 初始化交易服務, 交易所: ${exchangeType}, 測試網: ${isTestnet}`);
    console.log(`[TradingService][AUTH] API密鑰狀態: ${apiKey ? '已提供' : '未提供'}, 密鑰狀態: ${apiSecret ? '已提供' : '未提供'}`);
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
        console.error(`[${this.exchangeType}][ERROR] 交易所實例未初始化，無法獲取市場數據`);
        throw new Error('Exchange not initialized');
      }

      const currentTime = Date.now();

      // 如果快取有效且未過期，直接返回快取
      if (this.marketDataCache && (currentTime - this.lastCacheTime < this.cacheExpiryTime)) {
        const cacheAge = Math.round((currentTime - this.lastCacheTime) / 1000);
        console.log(`[${this.exchangeType}][CACHE] 使用快取的市場數據 (已快取 ${cacheAge} 秒) - 避免重複請求API以減輕服務器負擔和提高響應速度`);
        return this.marketDataCache;
      }

      console.log(`[${this.exchangeType}][API] 從 API 獲取市場數據 - 原因: 快取已過期或不存在，需要最新數據`);

      // 調用 API 獲取市場數據
      const markets = await this.exchange.fetchMarkets();
      console.log(`[${this.exchangeType}][API] 成功獲取 ${markets.length} 個市場數據 - 已更新所有可交易對的最新信息`);

      // 更新快取
      this.marketDataCache = markets;
      this.lastCacheTime = currentTime;

      // 返回市場數據
      return markets;
    } catch (error: any) {
      console.error(`[${this.exchangeType}][ERROR] 獲取市場數據失敗: ${error.message} - 可能是網絡問題或API限制`);

      // 如果有快取，使用過期的快取作為備選
      if (this.marketDataCache) {
        console.log(`[${this.exchangeType}][CACHE] 使用過期的市場數據快取作為備選 - 確保系統在API失敗時仍能繼續運作`);
        return this.marketDataCache;
      }

      throw error;
    }
  }

  /**
 * 根據符號查找匹配的市場
 */
  protected findMatchingMarketBySymbol(symbol: string): ccxt.Market | false {
    console.log(`[${this.exchangeType}][MATCH] 查找 ${symbol} 的市場數據 - 比對API返回的市場數據，尋找最佳匹配`);
    const exchangeSymbol = this.convertSymbolForExchange(symbol);
    // 查找完全匹配的市場
    const market = this.marketDataCache.find(m => {
      return m?.id === exchangeSymbol
    });

    if (market) {
      console.log(`[${this.exchangeType}][MATCH] 找到匹配的市場: ${market.symbol} (ID: ${market.id}) - 可直接使用此市場數據`);
      return market;
    } else {
      console.log(`[${this.exchangeType}][MATCH] 未找到匹配的市場`);
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
    console.log(`[${this.exchangeType}][SYMBOL] 開始轉換交易對: ${symbol} - 原因: 需要將通用符號轉換為 BitMEX 專用格式`);

    // 優先使用映射表查詢
    const result = this.symbolMappingsForExchange[symbol];
    console.log(`[${this.exchangeType}][SYMBOL] 從映射表查找到交易對: ${symbol} -> ${result} - 使用預定義映射關係`);
    return result || symbol;
  }
  /**
   * 將任意交易對符號轉換為 CCTX 支持的標準格式
   * @param symbol 需要轉換的交易對符號
   * @returns CCTX 標準格式的交易對符號
   */
  protected convertSymbolForCCXT(symbol: string): string {
    console.log(`[${this.exchangeType}][SYMBOL] 開始轉換交易對: ${symbol} - 原因: 需要將通用符號轉換為 CCTX 專用格式`);

    // 優先使用映射表查詢
    const result = this.symbolMappingsForCCXT[symbol];
    console.log(`[${this.exchangeType}][SYMBOL] 從映射表查找到交易對: ${symbol} -> ${result} - 使用預定義映射關係`);
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
    console.log(`[${this.exchangeType}][CALC] 開始計算${isTakeProfit ? 'HP' : 'LP'}價格 - 入場價: ${entryPrice}, 點數: ${points}, 模式: ${isPercentage ? '百分比' : '點數'}, Mintick: ${mintick}`);

    let result: number;
    if (isPercentage) {
      const multiplier = isTakeProfit ? (1 + points / 100) : (1 - points / 100);
      console.log(`[${this.exchangeType}][CALC] 百分比模式計算 - 乘數: ${multiplier} (${points}%) - 根據百分比調整入場價`);
      result = entryPrice * multiplier;
    } else {
      const adjustment = points * mintick;  // 使用 mintick 調整點數
      console.log(`[${this.exchangeType}][CALC] 點數模式計算 - 調整值: ${adjustment} (${points} × ${mintick}) - 根據點數和最小變動單位計算價格差`);
      result = isTakeProfit ? entryPrice + adjustment : entryPrice - adjustment;
    }

    // 使用 mintick 正確四捨五入
    const roundedResult = Math.round(result / mintick) * mintick;
    console.log(`[${this.exchangeType}][CALC] 價格計算結果: ${entryPrice} => ${roundedResult} - 按 mintick=${mintick} 四捨五入，確保價格符合交易所要求`);
    return roundedResult;
  }

  /**
   * 獲取持倉信息
   */
  async fetchPosition(symbol: string): Promise<ccxt.Position | false> {
    console.log(`[${this.exchangeType}][POSITION] 獲取 ${symbol} 的持倉信息 - 查詢當前賬戶在該交易對的倉位狀態`);
    try {
      if (!this.exchange) {
        console.error(`[${this.exchangeType}][ERROR] 交易所實例未初始化，無法獲取持倉 - 可能是配置問題或初始化失敗`);
        throw new Error('Exchange not initialized');
      }

      // 使用 convertSymbol 轉換交易對
      const exchangeSymbol = this.convertSymbolForExchange(symbol);
      const cctxSymbol = this.convertSymbolForCCXT(symbol);
      console.log(`[${this.exchangeType}][POSITION] 轉換後的交易對: ${cctxSymbol} - 確保使用交易所接受的格式`);
      console.log(`[${this.exchangeType}][POSITION] 調用API獲取持倉數據 - 從交易所實時獲取最新持倉信息`);

      try {
        // 嘗試獲取持倉數據
        const positions = await this.exchange.fetchPositions() || [];
        console.log(`[${this.exchangeType}][POSITION] 獲取持倉數據: ${JSON.stringify(positions)}`);
        // 使用增強的符號匹配邏輯查找有效持倉
        const matchedPosition = positions.filter((p: any) => {
          return p.symbol === cctxSymbol && p?.info?.symbol === exchangeSymbol && p.contracts > 0;
        });

        if (matchedPosition.length > 0) {
          console.log(`[${this.exchangeType}][POSITION] 發現持倉: ${JSON.stringify(matchedPosition)}`);
          return matchedPosition[0];
        } else {
          console.log(`[${this.exchangeType}][POSITION] 未發現持倉`);
          return false;
        }
      } catch (apiError) {
        console.error(`[${this.exchangeType}][ERROR] API調用時發生錯誤: ${apiError instanceof Error ? apiError.message : String(apiError)} - 可能是網絡問題或API限制`);
        return false;
      }
    } catch (error) {
      console.error(`[${this.exchangeType}][ERROR] 獲取持倉時發生錯誤 - 系統錯誤或參數無效`);
      return false
    }
  }

  /**
   * 獲取賬戶餘額
   */
  async fetchBalance(): Promise<any> {
    console.log(`[${this.exchangeType}][BALANCE] 獲取賬戶餘額 - 查詢所有幣種的資金狀況`);
    try {
      if (!this.exchange) {
        console.error(`[${this.exchangeType}][ERROR] 交易所實例未初始化，無法獲取餘額 - 可能是配置問題或初始化失敗`);
        throw new Error('Exchange not initialized');
      }

      console.log(`[${this.exchangeType}][BALANCE] 調用API獲取餘額數據 - 從交易所實時獲取最新資金信息`);
      const balance = await this.exchange.fetchBalance();

      // 僅記錄關鍵餘額信息而非完整對象
      const totalBalances = Object.entries(balance.total || {})
        .filter(([_, value]) => value && value > 0)
        .map(([currency, value]) => `${currency}: ${value}`)
        .join(', ');

      console.log(`[${this.exchangeType}][BALANCE] 餘額獲取成功: ${totalBalances || '無可用餘額'} - 賬戶資金狀況良好`);

      return balance;
    } catch (error) {
      console.error(`[${this.exchangeType}][ERROR] 獲取餘額時發生錯誤 - 可能是網絡問題或API限制`);
      throw error;
    }
  }

  /**
   * 對指定交易對進行平倉
   * @param symbol 需要平倉的交易對符號
   * @returns boolean
   */
  async closePosition(symbol: string): Promise<boolean> {
    console.log(`[${this.exchangeType}][CLOSE] 開始對 ${symbol} 進行全部平倉 - 自動關閉該交易對的所有倉位`);
    try {
      if (!this.exchange) {
        console.error(`[${this.exchangeType}][ERROR] 交易所實例未初始化，無法進行平倉操作 - 可能是配置問題或初始化失敗`);
        throw new Error('Exchange not initialized');
      }
      await this.exchange.closePosition(symbol);
      console.log(`[${this.exchangeType}][CLOSE] 平倉訂單提交成功: ${symbol} - 倉位已關閉`);
      return true;
    } catch (error: any) {
      console.error(`[${this.exchangeType}][ERROR] 平倉操作失敗: ${error.message} - 可能是網絡問題或參數無效`);
      throw error;
    }
  }

  /**
 * 創建訂單
 */
  async createOrder(orderData: OrderRequest): Promise<OrderResult> {
    console.log(`\n========== [${this.exchangeType}][ORDER] 開始處理訂單 ==========`);
    console.log(`[${this.exchangeType}][ORDER] 訂單詳情: 交易對=${orderData.symbol}, 操作=${orderData.action}, 數量=${orderData.qty}手 - 準備執行交易請求`);

    try {
      if (!this.exchange) {
        console.error(`[${this.exchangeType}][ERROR] 交易所實例未初始化，無法下單`);
        throw new Error('Exchange not initialized');
      }

      const symbol = orderData.symbol;
      const exchangeSymbol = this.convertSymbolForExchange(symbol);

      // 每次創建訂單前先更新市場數據
      await this.fetchMarketData();
      const market = this.findMatchingMarketBySymbol(symbol);
      if (!market) {
        console.error(`[${this.exchangeType}][ERROR] 未找到匹配的市場 - 需要嘗試其他匹配方法或使用默認值`);
        throw new Error('No matching market found');
      }

      // 獲取 mintick
      let mintick = await this.extractMintickFromMarket(market);
      if (mintick) {
        console.log(`[${this.exchangeType}][MINTICK] 從市場數據中提取最小價格變動單位: ${mintick}`);
      } else {
        console.error(`[${this.exchangeType}][ERROR] 無法從市場數據中提取最小價格變動單位 - 使用硬編碼默認值`);
        mintick = this.getMintickBySymbol(symbol);
      }
      console.log(`[${this.exchangeType}][MINTICK] ${exchangeSymbol} 的最小價格變動單位為: ${mintick}`);

      const quantity = this.checkQuantity(orderData.qty);

      // 創建主訂單（市價單或限價單）
      const orderType = orderData.limit_price ? OrderType.LIMIT : OrderType.MARKET;
      console.log(`[${this.exchangeType}][MAIN] 創建${orderType}單: ${orderData.action} ${quantity} ${exchangeSymbol} ${orderData.limit_price ? `@ ${orderData.limit_price}` : ''} - 提交主要交易訂單`);

      let order;
      try {
        order = await this.exchange.createOrder(
          exchangeSymbol,
          orderType,
          orderData.action.toLowerCase(),
          quantity,
          orderData.limit_price
        );
        console.log(`[${this.exchangeType}][MAIN] 主訂單創建成功: ID=${order.id}, 狀態=${order.status} - 交易所已接受訂單`);

        // 檢查實際執行的數量是否與請求的數量不同
        if (order.info && order.info.orderQty && Number(order.info.orderQty) !== quantity) {
          console.warn(`[${this.exchangeType}][WARN] 實際執行的數量 (${order.info.orderQty}) 與請求的數量 (${quantity}) 不同 - 可能是交易所規則或流動性限制`);
        }
      } catch (orderError: any) {
        console.error(`[${this.exchangeType}][ERROR] 主訂單創建失敗: ${orderError instanceof Error ? orderError.message : '未知錯誤'} - 訂單被交易所拒絕`);

        // 提供更詳細的錯誤診斷
        if (orderError.message) {
          if (orderError.message.includes('insufficient')) {
            console.error(`[${this.exchangeType}][ERROR] 餘額不足 - 請確保賬戶有足夠資金`);
          } else if (orderError.message.includes('rate limit')) {
            console.error(`[${this.exchangeType}][ERROR] API 頻率限制 - 請稍後再試或降低請求頻率`);
          } else if (orderError.message.includes('Invalid price')) {
            console.error(`[${this.exchangeType}][ERROR] 價格無效 - 可能不符合最小變動單位要求`);
          } else if (orderError.message.includes('below the min size')) {
            console.error(`[${this.exchangeType}][ERROR] 訂單數量過小 - 低於交易所最小要求`);
          }
        }

        throw orderError;
      }

      const result: OrderResult = {
        success: true,
        order: order
      };

      // 使用訂單價格計算止盈止損
      const entryPrice = orderData.price;
      console.log(`[${this.exchangeType}] 使用入場價格: ${entryPrice} 計算HP、LP`);

      // 計算止盈價格
      console.log(`[${this.exchangeType}] 計算HP價格: 點數=${orderData.take_profit.points}, 模式=${orderData.take_profit.is_percentage ? '百分比' : '點數'}`);
      const hightPrice = this.calculatePriceByPoints(
        entryPrice,
        orderData.action.toLowerCase() === TRADE_ACTIONS.BUY ? orderData.take_profit.points : orderData.stop_loss.points,
        orderData.action.toLowerCase() === TRADE_ACTIONS.BUY ? orderData.take_profit.is_percentage : orderData.stop_loss.is_percentage,
        true,
        mintick
      );

      // 計算止損價格
      console.log(`[${this.exchangeType}] 計算LP價格: 點數=${orderData.stop_loss.points}, 模式=${orderData.stop_loss.is_percentage ? '百分比' : '點數'}`);
      const lowPrice = this.calculatePriceByPoints(
        entryPrice,
        orderData.action.toLowerCase() === TRADE_ACTIONS.BUY ? orderData.stop_loss.points : orderData.take_profit.points,
        orderData.action.toLowerCase() === TRADE_ACTIONS.BUY ? orderData.stop_loss.is_percentage : orderData.take_profit.is_percentage,
        false,
        mintick
      );

      // 如果API返回的訂單數量與請求的不同，使用API返回的數量
      const executedQuantity = order.info && order.info.orderQty ? Number(order.info.orderQty) : quantity;
      console.log(`[${this.exchangeType}] 使用實際執行數量 ${executedQuantity} 創建高低價訂單`);

      // 創建止盈訂單
      console.log(`[${this.exchangeType}] 創建HP訂單: ${executedQuantity} ${exchangeSymbol} @ ${hightPrice}`);

      let takeProfitOrder;
      try {
        takeProfitOrder = await this.exchange.createOrder(
          exchangeSymbol,
          orderData.action.toLowerCase() === TRADE_ACTIONS.BUY ? OrderType.MARKET_IF_TOUCHED : OrderType.STOP,
          orderData.action.toLowerCase() === TRADE_ACTIONS.BUY ? TRADE_ACTIONS.SELL : TRADE_ACTIONS.BUY,
          executedQuantity,
          undefined,
          {
            stopPx: hightPrice,
          }
        );
        console.log(`[${this.exchangeType}] 創建HP訂單成功: ID=${takeProfitOrder.id}, 狀態=${takeProfitOrder.status} - 等待價格達到 ${hightPrice} 觸發`);
        result.takeProfitOrder = takeProfitOrder;
      } catch (tpError: any) {
        console.error(`[${this.exchangeType}] 創建HP訂單失敗: ${tpError instanceof Error ? tpError.message : '未知錯誤'}`);
      }

      // 創建止損訂單
      console.log(`[${this.exchangeType}] 創建LP訂單: ${executedQuantity} ${exchangeSymbol} @ ${lowPrice}`);

      let stopLossOrder;
      try {
        stopLossOrder = await this.exchange.createOrder(
          exchangeSymbol,
          orderData.action.toLowerCase() === TRADE_ACTIONS.BUY ? OrderType.STOP : OrderType.MARKET_IF_TOUCHED,
          orderData.action.toLowerCase() === TRADE_ACTIONS.BUY ? TRADE_ACTIONS.SELL : TRADE_ACTIONS.BUY,
          executedQuantity,
          undefined,
          {
            stopPx: lowPrice,
          }
        );
        console.log(`[${this.exchangeType}] 創建LP訂單成功: ID=${stopLossOrder.id}, 狀態=${stopLossOrder.status} - 等待價格達到 ${lowPrice} 觸發`);
        result.stopLossOrder = stopLossOrder;
      } catch (slError: any) {
        console.error(`[${this.exchangeType}] 創建LP訂單失敗: ${slError instanceof Error ? slError.message : '未知錯誤'}`);
      }

      // 總結訂單處理狀態
      console.log(`[${this.exchangeType}][SUCCESS] 訂單處理完成:
        - 主訂單: ${result.order ? '成功' : '失敗'}
        - HP訂單: ${result.takeProfitOrder ? '成功' : '失敗或未創建'}
        - LP訂單: ${result.stopLossOrder ? '成功' : '失敗或未創建'}`);
      console.log(`========== [${this.exchangeType}][ORDER] 訂單處理完成 ==========\n`);

      return result;
    } catch (error: any) {
      console.error(`\n[${this.exchangeType}][FATAL] 訂單處理過程中發生嚴重錯誤 - 交易操作失敗`);

      // 記錄更詳細的錯誤信息
      if (error.response) {
        console.error(`[${this.exchangeType}][ERROR] API 響應錯誤: ${JSON.stringify(error.response.data || {})} - 交易所返回的詳細錯誤`);
      }

      if (error.message) {
        if (error.message.includes('insufficient')) {
          console.error(`[${this.exchangeType}][ERROR] 餘額不足 - 請檢查賬戶資金是否足夠`);
        } else if (error.message.includes('permission')) {
          console.error(`[${this.exchangeType}][ERROR] API 權限不足 - 請檢查 API Key 的權限設置`);
        } else if (error.message.includes('Invalid')) {
          console.error(`[${this.exchangeType}][ERROR] 參數無效 - 請檢查訂單參數是否符合交易所規則`);
        } else if (error.message.includes('Rate limit')) {
          console.error(`[${this.exchangeType}][ERROR] API 請求頻率超限 - 請稍後再試或減少請求頻率`);
        }
      }

      console.log(`========== [${this.exchangeType}][ORDER] 訂單處理失敗 ==========\n`);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        errorDetails: error
      };
    }
  }
  abstract checkQuantity(quantity: number): number;

  /**
   * 取消指定交易對的所有訂單
   * @param symbol 交易對符號
   * @returns 取消結果
   */
  async cancelAllOrders(symbol: string): Promise<boolean> {
    console.log(`[${this.exchangeType}][CANCEL] 開始取消 ${symbol} 的所有訂單 - 清理潛在的止盈止損訂單`);
    try {
      if (!this.exchange) {
        console.error(`[${this.exchangeType}][ERROR] 交易所實例未初始化，無法取消訂單 - 可能是配置問題或初始化失敗`);
        throw new Error('Exchange not initialized');
      }
      
      const exchangeSymbol = this.convertSymbolForExchange(symbol);
      await this.exchange.cancelAllOrders(exchangeSymbol);
      console.log(`[${this.exchangeType}][CANCEL] 成功取消 ${symbol} 的所有訂單`);
      return true;
    } catch (error: any) {
      console.error(`[${this.exchangeType}][ERROR] 取消訂單失敗: ${error.message} - 可能是網絡問題或無訂單可取消`);
      throw error;
    }
  }

  async checkPositionsAndClearOrders(
    symbols: string[],
  ) {
    console.log(`[排程][${this.exchangeType}] 開始檢查持倉和清理訂單`);
    
    // Check each symbol
    for (const symbol of symbols) {
      try {
        console.log(`[排程][${this.exchangeType}] 檢查交易對 ${symbol}`);
        
        // Fetch position for this symbol
        const position = await this.fetchPosition(symbol);
        
        if (!position) {
          console.log(`[排程][${this.exchangeType}] 交易對 ${symbol} 無持倉，檢查並清理訂單`);
          
          // No position exists, cancel all orders for this symbol
          await this.cancelAllOrders(symbol);
          console.log(`[排程][${this.exchangeType}] 已清理交易對 ${symbol} 的所有訂單`);
        } else {
          console.log(`[排程][${this.exchangeType}] 交易對 ${symbol} 有持倉，保留所有訂單`);
        }
      } catch (error) {
        console.error(`[排程][${this.exchangeType}][錯誤] 處理交易對 ${symbol} 時發生錯誤:`, error);
        // Continue with next symbol despite error
      }
    }
    
    console.log(`[排程][${this.exchangeType}] 檢查持倉和清理訂單完成`);
  } 
} 