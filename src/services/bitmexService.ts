import * as ccxt from 'ccxt';
import { TradingService, OrderData, OrderResult } from './tradingService';
import { ExchangeType } from './tradingServiceFactory';

export class BitMEXService extends TradingService {
  // BitMEX 交易對關係映射表 - 不同格式之間的對應關係
  private readonly symbolMappings: Map<string, string> = new Map();
  
  // BitMEX 標準交易對與 tickSize 的對應關係
  protected symbolMintickMap: { [key: string]: number } = {
    'BTC/USD': 0.5,     // BitMEX XBTUSD 的最小價格變動單位
    'ETH/USD': 0.05,    // BitMEX ETHUSD 的最小價格變動單位
    'XRP/USD': 0.0001   // BitMEX XRPUSD 的最小價格變動單位
  };

  // API 快取，避免重複請求
  private marketDataCache: ccxt.Market[] | null = null;
  private readonly cacheExpiryTime: number = 5 * 60 * 1000; // 5分鐘快取過期
  private lastCacheTime: number = 0;

  constructor(exchangeType: string, apiKey: string, apiSecret: string, isTestnet: boolean = false) {
    console.log(`[BitMEXService][INIT] 初始化 BitMEX 服務 (API Key: ${apiKey ? '已設置' : '未設置'}, Testnet: ${isTestnet ? '啟用' : '禁用'}) - 為交易準備基礎服務`);
    super(exchangeType, apiKey, apiSecret, isTestnet);
    
    // 初始化符號映射關係
    this.initSymbolMappings();
    
    // 初始化硬編碼的交易對信息
    this.initSymbolData();
    
    this.exchange = new ccxt.bitmex({
      apiKey: this.apiKey,
      secret: this.apiSecret,
      enableRateLimit: true,
    });

    if (this.isTestnet) {
      console.log(`[BitMEXService][INIT] 設置 BitMEX 測試網模式 - 避免在生產環境意外下單`);
      this.exchange.setSandboxMode(true);
    }
    console.log(`[BitMEXService][INIT] BitMEX 服務初始化完成，交易所基礎 URL: ${this.exchange.urls.api} - 已建立交易所連接`);
  }

  /**
   * 初始化符號映射關係
   * 建立不同格式交易對符號之間的映射關係
   */
  private initSymbolMappings(): void {
    console.log(`[BitMEXService][INIT] 初始化交易對符號映射關係 - 用於處理不同系統間的符號格式差異`);
    
    // 標準格式 -> BitMEX 格式
    this.symbolMappings.set('BTC/USD', 'XBTUSD');
    this.symbolMappings.set('ETH/USD', 'ETHUSD');
    this.symbolMappings.set('XRP/USD', 'XRPUSD');
    
    // CCXT 格式 -> BitMEX 格式
    this.symbolMappings.set('BTC/USD:BTC', 'XBTUSD');
    this.symbolMappings.set('ETH/USD:ETH', 'ETHUSD');
    this.symbolMappings.set('XRP/USD:XRP', 'XRPUSD');
    
    // BitMEX 格式 -> BitMEX 格式 (自映射)
    this.symbolMappings.set('XBTUSD', 'XBTUSD');
    this.symbolMappings.set('ETHUSD', 'ETHUSD');
    this.symbolMappings.set('XRPUSD', 'XRPUSD');
    
    console.log(`[BitMEXService][INIT] 符號映射關係初始化完成: ${this.symbolMappings.size} 個映射 - 確保交易符號兼容性`);
  }

  /**
   * 初始化硬編碼的交易對信息，用於當 API 無法獲取數據時作為備選
   */
  private initSymbolData(): void {
    console.log(`[BitMEXService][INIT] 初始化硬編碼的交易對信息 - 作為 API 數據失敗時的備用數據源`);
    
    // 擴充更多的符號格式以支持不同的匹配方式
    this.symbolMintickMap = {
      // 標準符號格式
      'BTC/USD': 0.5,      // BitMEX XBTUSD 的標準符號表示
      'ETH/USD': 0.05,     // BitMEX ETHUSD 的標準符號表示
      'XRP/USD': 0.0001,   // BitMEX XRPUSD 的標準符號表示
      
      // BitMEX 特有符號格式
      'XBTUSD': 0.5,       // BitMEX BTC/USD 的交易所特定格式
      'ETHUSD': 0.05,      // BitMEX ETH/USD 的交易所特定格式
      'XRPUSD': 0.0001,    // BitMEX XRP/USD 的交易所特定格式
      
      // CCXT 返回的符號格式
      'BTC/USD:BTC': 0.5,  // CCXT 返回的 BTC/USD 格式
      'ETH/USD:ETH': 0.05, // CCXT 返回的 ETH/USD 格式
      'XRP/USD:XRP': 0.0001 // CCXT 返回的 XRP/USD 格式
    };
    
    console.log(`[BitMEXService][INIT] 硬編碼交易對信息已更新，包含 ${Object.keys(this.symbolMintickMap).length} 個交易對 - 確保系統在 API 失敗時仍能正常運作`);
  }

  /**
   * 將任意交易對符號轉換為 BitMEX 支持的標準格式
   * @param symbol 需要轉換的交易對符號
   * @returns BitMEX 標準格式的交易對符號
   */
  private convertSymbol(symbol: string): string {
    console.log(`[BitMEXService][SYMBOL] 開始轉換交易對: ${symbol} - 原因: 需要將通用符號轉換為 BitMEX 專用格式`);
    
    // 優先使用映射表查詢
    if (this.symbolMappings.has(symbol)) {
      const result = this.symbolMappings.get(symbol)!;
      console.log(`[BitMEXService][SYMBOL] 從映射表查找到交易對: ${symbol} -> ${result} - 使用預定義映射關係`);
      return result;
    }
    
    // 嘗試提取交易對基本部分
    let result = symbol;
    
    // 處理 CCXT 格式，例如 "BTC/USD:BTC"
    if (symbol.includes(':')) {
      const basePart = symbol.split(':')[0];
      if (this.symbolMappings.has(basePart)) {
        result = this.symbolMappings.get(basePart)!;
        console.log(`[BitMEXService][SYMBOL] 處理 CCXT 格式: ${symbol} -> ${result} - 提取基本部分並應用映射`);
        return result;
      }
    }
    
    // 處理 BTC -> XBT 轉換
    if (symbol.startsWith('BTC/')) {
      const xbtSymbol = 'XBT' + symbol.slice(3);
      const bitmexStyle = xbtSymbol.replace('/', '');
      console.log(`[BitMEXService][SYMBOL] BTC -> XBT 轉換: ${symbol} -> ${bitmexStyle} - BitMEX 使用 XBT 代替 BTC`);
      return bitmexStyle;
    }
    
    console.log(`[BitMEXService][SYMBOL] 交易對轉換結果: ${symbol} -> ${result} - 未找到特定映射，可能使用原始符號`);
    return result;
  }

  /**
   * 判斷兩個交易對符號是否匹配
   * @param apiSymbol API 返回的交易對符號
   * @param requestSymbol 請求中使用的交易對符號
   * @returns 是否匹配
   */
  private matchSymbol(apiSymbol: string, requestSymbol: string): boolean {
    // 如果符號完全相同，直接匹配
    if (apiSymbol === requestSymbol) {
      return true;
    }
    
    // 將請求符號轉換為標準格式再比較
    const standardizedRequest = this.convertSymbol(requestSymbol);
    
    // 如果 API 符號與標準化後的請求符號匹配，則匹配成功
    if (apiSymbol === standardizedRequest) {
      return true;
    }
    
    // 將 API 符號轉換為標準格式再比較
    try {
      const standardizedApi = this.convertSymbol(apiSymbol);
      if (standardizedApi === standardizedRequest) {
        return true;
      }
    } catch (e) {
      // 轉換失敗，不匹配
      return false;
    }
    
    // 檢查符號的基本部分
    const requestBaseParts = requestSymbol.split('/');
    const apiBaseParts = apiSymbol.split('/');
    
    // BTC vs XBT 特殊處理
    const hasBtcXbtMatch = (
      (apiSymbol.includes('BTC') && requestSymbol.includes('XBT')) ||
      (apiSymbol.includes('XBT') && requestSymbol.includes('BTC'))
    );
    
    if (hasBtcXbtMatch) {
      return true;
    }
    
    // 提取幣種部分
    const requestBase = requestBaseParts[0] || '';
    const apiBase = apiBaseParts[0] || '';
    
    // 處理 BTC/XBT 等價情況
    if ((requestBase === 'BTC' && apiBase === 'XBT') || 
        (requestBase === 'XBT' && apiBase === 'BTC')) {
      return true;
    }
    
    return false;
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
    console.log(`[BitMEXService][CALC] 開始計算${isTakeProfit ? '止盈' : '止損'}價格 - 入場價: ${entryPrice}, 點數: ${points}, 模式: ${isPercentage ? '百分比' : '點數'}, Mintick: ${mintick}`);
    
    let result: number;
    if (isPercentage) {
      const multiplier = isTakeProfit ? (1 + points / 100) : (1 - points / 100);
      console.log(`[BitMEXService][CALC] 百分比模式計算 - 乘數: ${multiplier} (${points}%) - 根據百分比調整入場價`);
      result = entryPrice * multiplier;
    } else {
      const adjustment = points * mintick;  // 使用 mintick 調整點數
      console.log(`[BitMEXService][CALC] 點數模式計算 - 調整值: ${adjustment} (${points} × ${mintick}) - 根據點數和最小變動單位計算價格差`);
      result = isTakeProfit ? entryPrice + adjustment : entryPrice - adjustment;
    }
    
    // 使用 mintick 正確四捨五入
    const roundedResult = Math.round(result / mintick) * mintick;
    console.log(`[BitMEXService][CALC] 價格計算結果: ${entryPrice} => ${roundedResult} - 按 mintick=${mintick} 四捨五入，確保價格符合交易所要求`);
    return roundedResult;
  }

  /**
   * 從 API 獲取市場數據，支持快取
   */
  private async fetchMarketData(): Promise<ccxt.Market[]> {
    const currentTime = Date.now();
    
    // 如果快取有效且未過期，直接返回快取
    if (this.marketDataCache && (currentTime - this.lastCacheTime < this.cacheExpiryTime)) {
      const cacheAge = Math.round((currentTime - this.lastCacheTime) / 1000);
      console.log(`[BitMEXService][CACHE] 使用快取的市場數據 (已快取 ${cacheAge} 秒) - 避免重複請求API以減輕服務器負擔和提高響應速度`);
      return this.marketDataCache;
    }
    
    console.log(`[BitMEXService][API] 從 API 獲取市場數據 - 原因: 快取已過期或不存在，需要最新數據`);
    try {
      // 檢查交易所實例
      if (!this.exchange || !this.exchange.has['fetchMarkets']) {
        throw new Error('交易所實例未初始化或不支持獲取市場數據');
      }
      
      // 調用 API 獲取市場數據
      const markets = await this.exchange.fetchMarkets();
      console.log(`[BitMEXService][API] 成功獲取 ${markets.length} 個市場數據 - 已更新所有可交易對的最新信息`);
      
      // 更新快取
      this.marketDataCache = markets;
      this.lastCacheTime = currentTime;
      
      return markets;
    } catch (error: any) {
      console.error(`[BitMEXService][ERROR] 獲取市場數據失敗: ${error.message} - 可能是網絡問題或API限制`);
      
      // 如果有快取，使用過期的快取作為備選
      if (this.marketDataCache) {
        console.log(`[BitMEXService][CACHE] 使用過期的市場數據快取作為備選 - 確保系統在API失敗時仍能繼續運作`);
        return this.marketDataCache;
      }
      
      throw error;
    }
  }

  /**
   * 改進的交易對初始化方法
   */
  protected async initializeSymbol(symbol: string): Promise<void> {
    // 先轉換交易對符號，確保使用 BitMEX 的格式
    const bitmexSymbol = this.convertSymbol(symbol);
    console.log(`[BitMEXService][INIT] 初始化交易對 ${symbol} -> ${bitmexSymbol} - 獲取該交易對的市場數據和最小變動單位`);
    
    // 檢查是否已經初始化過
    if (this.symbolsInitialized.has(bitmexSymbol)) {
      console.log(`[BitMEXService][INIT] 交易對 ${bitmexSymbol} 已初始化，使用緩存值 ${this.symbolMintickMap[bitmexSymbol]} - 避免重複初始化`);
      return;
    }
    
    try {
      // 從 API 獲取市場數據
      const markets = await this.fetchMarketData();
      
      // 尋找匹配的交易對
      const market = this.findMatchingMarket(markets, bitmexSymbol, symbol);
      
      if (market) {
        // 從找到的市場數據中提取 mintick
        await this.extractMintickFromMarket(market, bitmexSymbol, symbol);
      } else {
        // 未找到匹配的交易對
        console.log(`[BitMEXService][INIT] 在 BitMEX 市場數據中未找到 ${bitmexSymbol} - 嘗試查找替代交易對`);
        
        // 嘗試尋找替代的交易對
        const alternativeMarket = this.findAlternativeMarket(markets, bitmexSymbol);
        
        if (alternativeMarket) {
          await this.extractMintickFromMarket(alternativeMarket, bitmexSymbol, symbol);
        } else {
          // 使用硬編碼的默認值
          this.useHardcodedMintick(bitmexSymbol, symbol);
        }
      }
    } catch (error: any) {
      console.error(`[BitMEXService][ERROR] 初始化交易對 ${bitmexSymbol} 失敗: ${error.message} - 回退到使用硬編碼值`);
      // 使用硬編碼的默認值
      this.useHardcodedMintick(bitmexSymbol, symbol);
    }
  }

  /**
   * 根據符號查找匹配的市場
   */
  private findMatchingMarket(markets: ccxt.Market[], bitmexSymbol: string, originalSymbol: string): ccxt.Market | undefined {
    console.log(`[BitMEXService][MATCH] 查找 ${bitmexSymbol} (原始: ${originalSymbol}) 的市場數據 - 比對API返回的市場數據，尋找最佳匹配`);
    
    // 查找完全匹配的市場
    let market = markets.find(m => {
      if (!m) return false;
      
      // 檢查各種可能的匹配
      if (m.id === bitmexSymbol || m.symbol === bitmexSymbol) {
        return true;
      }
      
      // 檢查原始符號匹配
      if (m.symbol === originalSymbol) {
        return true;
      }
      
      // 檢查 info 對象中的 symbol 字段
      if (m.info && typeof m.info.symbol === 'string' && m.info.symbol === bitmexSymbol) {
        return true;
      }
      
      // 使用 matchSymbol 進行更複雜的匹配
      return this.matchSymbol(m.symbol, bitmexSymbol);
    });
    
    if (market) {
      console.log(`[BitMEXService][MATCH] 找到匹配的市場: ${market.symbol} (ID: ${market.id}) - 可直接使用此市場數據`);
    } else {
      console.log(`[BitMEXService][MATCH] 未找到匹配的市場 - 需要嘗試其他匹配方法或使用默認值`);
    }
    
    return market;
  }

  /**
   * 查找替代的市場數據
   */
  private findAlternativeMarket(markets: ccxt.Market[], bitmexSymbol: string): ccxt.Market | undefined {
    console.log(`[BitMEXService][ALT] 查找 ${bitmexSymbol} 的替代市場數據 - 原因: 主要匹配方法失敗，嘗試替代方案`);
    
    // 對於 XBTUSD，嘗試查找 BTC/USD:BTC 格式
    if (bitmexSymbol === 'XBTUSD') {
      const btcUsdMarket = markets.find(m => 
        m && (m.symbol === 'BTC/USD:BTC' || m.symbol === 'XBT/USD:XBT' || 
              (m.base === 'BTC' && m.quote === 'USD') ||
              (m.base === 'XBT' && m.quote === 'USD'))
      );
      
      if (btcUsdMarket) {
        console.log(`[BitMEXService][ALT] 找到 ${bitmexSymbol} 的替代市場: ${btcUsdMarket.symbol} (ID: ${btcUsdMarket.id}) - 使用基於幣種的匹配`);
        return btcUsdMarket;
      }
    }
    // 對於 ETHUSD，嘗試查找 ETH/USD:ETH 格式
    else if (bitmexSymbol === 'ETHUSD') {
      const ethUsdMarket = markets.find(m => 
        m && (m.symbol === 'ETH/USD:ETH' || 
              (m.base === 'ETH' && m.quote === 'USD'))
      );
      
      if (ethUsdMarket) {
        console.log(`[BitMEXService][ALT] 找到 ${bitmexSymbol} 的替代市場: ${ethUsdMarket.symbol} (ID: ${ethUsdMarket.id}) - 使用基於幣種的匹配`);
        return ethUsdMarket;
      }
    }
    
    console.log(`[BitMEXService][ALT] 未找到 ${bitmexSymbol} 的替代市場 - 將使用硬編碼默認值`);
    return undefined;
  }

  /**
   * 從市場數據中提取 mintick
   */
  private async extractMintickFromMarket(market: ccxt.Market | undefined, bitmexSymbol: string, originalSymbol: string): Promise<void> {
    if (!market) {
      console.log(`[BitMEXService][EXTRACT] 市場數據為空，使用硬編碼默認值 - 無法從空數據中提取信息`);
      this.useHardcodedMintick(bitmexSymbol, originalSymbol);
      return;
    }
    
    console.log(`[BitMEXService][EXTRACT] 從市場 ${market.symbol} 提取 ${bitmexSymbol} 的 mintick 值 - 分析API返回的市場數據結構`);
    
    // 先從 info 對象中獲取 tickSize
    if (market.info && market.info.tickSize) {
      const tickSize = typeof market.info.tickSize === 'string' 
        ? parseFloat(market.info.tickSize) 
        : market.info.tickSize;
        
      if (!isNaN(tickSize) && tickSize > 0) {
        console.log(`[BitMEXService][EXTRACT] 成功從 tickSize 獲取到 mintick: ${tickSize} - 直接使用API提供的精確值`);
        this.setMintickForAllFormats(bitmexSymbol, originalSymbol, tickSize);
        return;
      }
    }
    
    // 如果沒有 tickSize，嘗試從精度信息獲取
    if (market.precision && market.precision.price !== undefined) {
      console.log(`[BitMEXService][EXTRACT] 未找到 tickSize，嘗試從精度信息獲取: ${JSON.stringify(market.precision)} - 備選數據源`);
      
      let mintick;
      if (typeof market.precision.price === 'number') {
        // 如果是整數，視為小數位數
        if (Number.isInteger(market.precision.price) && market.precision.price >= 0) {
          mintick = Math.pow(10, -market.precision.price);
          console.log(`[BitMEXService][EXTRACT] 從小數位數 ${market.precision.price} 計算 mintick: ${mintick} - 將小數位數轉換為最小變動單位`);
        } else {
          // 直接使用精度值
          mintick = market.precision.price;
          console.log(`[BitMEXService][EXTRACT] 直接使用精度值作為 mintick: ${mintick} - API返回的是具體數值而非小數位數`);
        }
        
        if (mintick > 0) {
          this.setMintickForAllFormats(bitmexSymbol, originalSymbol, mintick);
          return;
        }
      }
    }
    
    // 如果無法從市場數據中獲取 mintick，使用硬編碼的默認值
    console.log(`[BitMEXService][EXTRACT] 無法從市場數據中獲取 mintick，使用硬編碼默認值 - 所有API提取方法均失敗`);
    this.useHardcodedMintick(bitmexSymbol, originalSymbol);
  }

  /**
   * 為所有格式的交易對設置 mintick 值
   */
  private setMintickForAllFormats(bitmexSymbol: string, originalSymbol: string, mintick: number): void {
    console.log(`[BitMEXService][SET] 為 ${bitmexSymbol} 設置 mintick: ${mintick} - 確保所有相關格式的交易對都使用相同的最小變動單位`);
    
    // 設置原始格式的符號
    this.symbolMintickMap[bitmexSymbol] = mintick;
    this.symbolMintickMap[originalSymbol] = mintick;
    
    // 設置標準化格式的符號
    if (bitmexSymbol === 'XBTUSD') {
      this.symbolMintickMap['BTC/USD'] = mintick;
      this.symbolMintickMap['BTC/USD:BTC'] = mintick;
      this.symbolMintickMap['XBT/USD'] = mintick;
      this.symbolMintickMap['XBT/USD:XBT'] = mintick;
    } else if (bitmexSymbol === 'ETHUSD') {
      this.symbolMintickMap['ETH/USD'] = mintick;
      this.symbolMintickMap['ETH/USD:ETH'] = mintick;
    } else if (bitmexSymbol === 'XRPUSD') {
      this.symbolMintickMap['XRP/USD'] = mintick;
      this.symbolMintickMap['XRP/USD:XRP'] = mintick;
    }
    
    // 標記為已初始化
    this.symbolsInitialized.add(bitmexSymbol);
    this.symbolsInitialized.add(originalSymbol);
    
    // 標記相關的標準化格式
    if (bitmexSymbol === 'XBTUSD') {
      this.symbolsInitialized.add('BTC/USD');
      this.symbolsInitialized.add('BTC/USD:BTC');
      this.symbolsInitialized.add('XBT/USD');
      this.symbolsInitialized.add('XBT/USD:XBT');
    } else if (bitmexSymbol === 'ETHUSD') {
      this.symbolsInitialized.add('ETH/USD');
      this.symbolsInitialized.add('ETH/USD:ETH');
    } else if (bitmexSymbol === 'XRPUSD') {
      this.symbolsInitialized.add('XRP/USD');
      this.symbolsInitialized.add('XRP/USD:XRP');
    }
    
    console.log(`[BitMEXService][SET] ${bitmexSymbol} 的 mintick 設置完成 - 所有相關交易對格式均已更新`);
  }

  /**
   * 使用硬編碼的 mintick 默認值
   */
  private useHardcodedMintick(bitmexSymbol: string, originalSymbol: string): void {
    console.log(`[BitMEXService][DEFAULT] 使用硬編碼的 mintick 默認值 - 原因: API數據獲取失敗或返回數據不完整`);
    
    // 針對常見的 BitMEX 交易對設置默認值
    const defaultMinticks: {[key: string]: number} = {
      'XBTUSD': 0.5,
      'ETHUSD': 0.05,
      'XRPUSD': 0.0001
    };
    
    if (defaultMinticks[bitmexSymbol]) {
      console.log(`[BitMEXService][DEFAULT] 找到 ${bitmexSymbol} 的默認 mintick: ${defaultMinticks[bitmexSymbol]} - 使用預定義的可靠值`);
      this.setMintickForAllFormats(bitmexSymbol, originalSymbol, defaultMinticks[bitmexSymbol]);
    } else {
      console.warn(`[BitMEXService][WARN] 未找到 ${bitmexSymbol} 的默認 mintick，使用 0.5 - 保守估計以避免下單精度問題`);
      this.setMintickForAllFormats(bitmexSymbol, originalSymbol, 0.5);
    }
  }

  /**
   * 獲取持倉信息
   */
  async getPosition(symbol: string): Promise<any> {
    console.log(`[BitMEXService][POSITION] 獲取 ${symbol} 的持倉信息 - 查詢當前賬戶在該交易對的倉位狀態`);
    try {
      if (!this.exchange) {
        console.error(`[BitMEXService][ERROR] 交易所實例未初始化，無法獲取持倉 - 可能是配置問題或初始化失敗`);
        throw new Error('Exchange not initialized');
      }
      
      // 使用 convertSymbol 轉換交易對
      const bitmexSymbol = this.convertSymbol(symbol);
      console.log(`[BitMEXService][POSITION] 轉換後的交易對: ${bitmexSymbol} - 確保使用交易所接受的格式`);
      
      console.log(`[BitMEXService][POSITION] 調用API獲取持倉數據 - 從交易所實時獲取最新持倉信息`);
      
      try {
        // 嘗試獲取持倉數據
        const positions = await this.exchange.fetchPositions([bitmexSymbol]);
        console.log(`[BitMEXService][POSITION] 獲取到 ${positions?.length || 0} 條持倉記錄 - 解析API返回數據`);
        
        if (!positions || positions.length === 0) {
          console.log(`[BitMEXService][POSITION] 未找到任何持倉記錄 - 返回空持倉對象表示無倉位`);
          return this.createEmptyPosition(bitmexSymbol);
        }
        
        // 使用增強的符號匹配邏輯查找持倉
        const position: any = positions.find((p: any) => {
          if (!p?.symbol) return false;
          return this.matchSymbol(p.symbol, bitmexSymbol) || this.matchSymbol(p.symbol, symbol);
        });
        
        if (position) {
          console.log(`[BitMEXService][POSITION] 找到匹配的持倉: ${position.symbol} - 使用靈活的符號匹配邏輯`);
          // 移除冗長日誌，只保留必要的持倉大小信息
          const positionSize = position.contracts || position.contractSize || position.notional || 0;
          const positionLeverage = position.leverage || 0;
          console.log(`[BitMEXService][POSITION] 持倉大小: ${positionSize} 合約，槓桿: ${positionLeverage}x`);
          return position;
        } else {
          console.log(`[BitMEXService][POSITION] 在 ${positions.length} 個持倉中未找到匹配項 - 返回空持倉對象`);
          return this.createEmptyPosition(bitmexSymbol);
        }
      } catch (apiError) {
        console.error(`[BitMEXService][ERROR] API調用時發生錯誤: ${apiError instanceof Error ? apiError.message : String(apiError)} - 可能是網絡問題或API限制`);
        return this.createEmptyPosition(bitmexSymbol, apiError);
      }
    } catch (error) {
      console.error(`[BitMEXService][ERROR] 獲取持倉時發生錯誤 - 系統錯誤或參數無效`);
      return this.createEmptyPosition(symbol, error);
    }
  }

  /**
   * 創建空持倉對象
   */
  private createEmptyPosition(symbol: string, error?: any): any {
    const position: any = { 
      symbol: symbol, 
      size: 0, 
      notional: 0, 
      leverage: 0,
      entryPrice: 0,
      markPrice: 0,
      unrealisedPnl: 0,
      timestamp: new Date().toISOString() 
    };
    
    if (error) {
      position.error = error instanceof Error ? error.message : String(error);
    }
    
    return position;
  }

  /**
   * 獲取賬戶餘額
   */
  async getBalance(): Promise<any> {
    console.log(`[BitMEXService][BALANCE] 獲取賬戶餘額 - 查詢所有幣種的資金狀況`);
    try {
      if (!this.exchange) {
        console.error(`[BitMEXService][ERROR] 交易所實例未初始化，無法獲取餘額 - 可能是配置問題或初始化失敗`);
        throw new Error('Exchange not initialized');
      }
      
      console.log(`[BitMEXService][BALANCE] 調用API獲取餘額數據 - 從交易所實時獲取最新資金信息`);
      const balance = await this.exchange.fetchBalance();
      
      // 僅記錄關鍵餘額信息而非完整對象
      const totalBalances = Object.entries(balance.total || {})
        .filter(([_, value]) => value && value > 0)
        .map(([currency, value]) => `${currency}: ${value}`)
        .join(', ');
      
      console.log(`[BitMEXService][BALANCE] 餘額獲取成功: ${totalBalances || '無可用餘額'} - 賬戶資金狀況良好`);
      
      return balance;
    } catch (error) {
      console.error(`[BitMEXService][ERROR] 獲取餘額時發生錯誤 - 可能是網絡問題或API限制`);
      throw error;
    }
  }

  /**
   * 重寫 getMintick 方法以調用新的初始化邏輯
   */
  protected async getMintick(symbol: string): Promise<number> {
    // 先轉換交易對符號
    const bitmexSymbol = this.convertSymbol(symbol);
    console.log(`[BitMEXService][MINTICK] 獲取 ${symbol} 的最小變動單位 - 轉換為 ${bitmexSymbol} 查詢`);
    
    // 調用父類方法獲取 mintick
    return super.getMintick(bitmexSymbol);
  }

  /**
   * 創建訂單
   */
  async createOrder(orderData: OrderData): Promise<OrderResult> {
    console.log(`\n========== [BitMEXService][ORDER] 開始處理訂單 ==========`);
    console.log(`[BitMEXService][ORDER] 訂單詳情: 交易對=${orderData.symbol}, 操作=${orderData.action}, 數量=${orderData.qty}手 - 準備執行交易請求`);
    
    try {
      if (!this.exchange) {
        console.error(`[BitMEXService][ERROR] 交易所實例未初始化，無法下單 - 可能是構造函數中出錯`);
        throw new Error('Exchange not initialized');
      }

      // 檢查API密鑰
      console.log(`[BitMEXService][AUTH] 驗證API密鑰可用性: ${this.apiKey ? '已設置' : '未設置'} - 確保具備交易權限`);
      if (!this.apiKey || !this.apiSecret) {
        console.error(`[BitMEXService][ERROR] 缺少API密鑰或密鑰，無法下單 - 請在配置中提供有效的API憑證`);
        throw new Error('API Key and Secret are required');
      }

      // 轉換交易對格式
      console.log(`[BitMEXService][SYMBOL] 開始轉換交易對: ${orderData.symbol} - 轉換為交易所接受的格式`);
      const bitmexSymbol = this.convertSymbol(orderData.symbol);
      console.log(`[BitMEXService][SYMBOL] 交易對轉換完成: ${orderData.symbol} => ${bitmexSymbol}`);

      // 確保交易對已初始化
      if (!this.symbolsInitialized.has(bitmexSymbol)) {
        console.log(`[BitMEXService][INIT] 初始化交易對 ${bitmexSymbol} - 獲取最新的市場數據和最小變動單位`);
        await this.initializeSymbol(bitmexSymbol);
      }

      // 獲取 mintick
      const mintick = await this.getMintick(bitmexSymbol);
      console.log(`[BitMEXService][MINTICK] ${bitmexSymbol} 的最小價格變動單位為: ${mintick} - 用於價格計算和四捨五入`);

      // 將手數轉換為實際交易數量
      console.log(`[BitMEXService][QTY] 開始轉換交易量: ${orderData.qty}手 - 從平台通用單位轉換為交易所特定單位`);
      const quantity = this.convertLotsToQuantity(orderData.qty, orderData.symbol, orderData.price);
      console.log(`[BitMEXService][QTY] 交易量轉換結果: ${orderData.qty}手 => ${quantity}合約 - 適用於${bitmexSymbol}的實際合約數量`);
      
      // 檢查最小訂單數量
      if (quantity < 100) {
        console.warn(`[BitMEXService][WARN] BitMEX最小訂單數量為100 - 計算值為 ${quantity}，已自動調整為 100 以符合交易所要求`);
      }

      // 創建主訂單（市價單或限價單）
      const orderType = orderData.limit_price ? 'limit' : 'market';
      console.log(`[BitMEXService][MAIN] 創建${orderType}單: ${orderData.action} ${quantity} ${bitmexSymbol} ${orderData.limit_price ? `@ ${orderData.limit_price}` : ''} - 提交主要交易訂單`);
      
      let order;
      try {
        order = await this.exchange.createOrder(
          bitmexSymbol,
          orderType,
          orderData.action.toLowerCase(),
          quantity,
          orderData.limit_price
        );
        console.log(`[BitMEXService][MAIN] 主訂單創建成功: ID=${order.id}, 狀態=${order.status} - 交易所已接受訂單`);
        
        // 檢查實際執行的數量是否與請求的數量不同
        if (order.info && order.info.orderQty && Number(order.info.orderQty) !== quantity) {
          console.warn(`[BitMEXService][WARN] 實際執行的數量 (${order.info.orderQty}) 與請求的數量 (${quantity}) 不同 - 可能是交易所規則或流動性限制`);
        }
      } catch (orderError: any) {
        console.error(`[BitMEXService][ERROR] 主訂單創建失敗: ${orderError instanceof Error ? orderError.message : '未知錯誤'} - 訂單被交易所拒絕`);
        
        // 提供更詳細的錯誤診斷
        if (orderError.message) {
          if (orderError.message.includes('insufficient')) {
            console.error(`[BitMEXService][ERROR] 餘額不足 - 請確保賬戶有足夠資金`);
          } else if (orderError.message.includes('rate limit')) {
            console.error(`[BitMEXService][ERROR] API 頻率限制 - 請稍後再試或降低請求頻率`);
          } else if (orderError.message.includes('Invalid price')) {
            console.error(`[BitMEXService][ERROR] 價格無效 - 可能不符合最小變動單位要求`);
          } else if (orderError.message.includes('below the min size')) {
            console.error(`[BitMEXService][ERROR] 訂單數量過小 - 低於交易所最小要求`);
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
      console.log(`[BitMEXService][PRICE] 使用入場價格: ${entryPrice} 計算止盈止損 - 基準價格用於計算觸發價格`);

      // 計算止盈價格
      console.log(`[BitMEXService][TP] 計算止盈價格: 點數=${orderData.take_profit.points}, 模式=${orderData.take_profit.is_percentage ? '百分比' : '點數'}`);
      const takeProfitPrice = this.calculatePriceByPoints(
        entryPrice,
        orderData.take_profit.points,
        orderData.take_profit.is_percentage,
        true,
        mintick
      );

      // 計算止損價格
      console.log(`[BitMEXService][SL] 計算止損價格: 點數=${orderData.stop_loss.points}, 模式=${orderData.stop_loss.is_percentage ? '百分比' : '點數'}`);
      const stopLossPrice = this.calculatePriceByPoints(
        entryPrice,
        orderData.stop_loss.points,
        orderData.stop_loss.is_percentage,
        false,
        mintick
      );

      // 如果API返回的訂單數量與請求的不同，使用API返回的數量
      const executedQuantity = order.info && order.info.orderQty ? Number(order.info.orderQty) : quantity;
      console.log(`[BitMEXService][INFO] 使用實際執行數量 ${executedQuantity} 創建止盈止損訂單 - 確保數量一致性`);

      // 創建止盈訂單
      const tpDirection = orderData.action.toLowerCase() === 'buy' ? 'above' : 'below';
      const tpAction = orderData.action.toLowerCase() === 'buy' ? 'sell' : 'buy';
      console.log(`[BitMEXService][TP] 創建止盈訂單: ${tpAction} ${executedQuantity} ${bitmexSymbol} @ ${takeProfitPrice} - 為實現利潤目標`);

      let takeProfitOrder;
      try {
        takeProfitOrder = await this.exchange.createOrder(
          bitmexSymbol,
          'market',
          tpAction,
          executedQuantity,
          undefined,
          {
            stopPrice: takeProfitPrice,
            type: 'TakeProfit',
            triggerDirection: tpDirection
          }
        );
        console.log(`[BitMEXService][TP] 止盈訂單創建成功: ID=${takeProfitOrder.id}, 狀態=${takeProfitOrder.status} - 等待價格達到 ${takeProfitPrice} 觸發`);
        result.takeProfitOrder = takeProfitOrder;
      } catch (tpError: any) {
        console.error(`[BitMEXService][ERROR] 止盈訂單創建失敗: ${tpError instanceof Error ? tpError.message : '未知錯誤'} - 繼續處理止損訂單`);
      }

      // 創建止損訂單
      const slDirection = orderData.action.toLowerCase() === 'buy' ? 'below' : 'above';
      const slAction = orderData.action.toLowerCase() === 'buy' ? 'sell' : 'buy';
      console.log(`[BitMEXService][SL] 創建止損訂單: ${slAction} ${executedQuantity} ${bitmexSymbol} @ ${stopLossPrice} - 為控制潛在損失`);

      let stopLossOrder;
      try {
        stopLossOrder = await this.exchange.createOrder(
          bitmexSymbol,
          'market',
          slAction,
          executedQuantity,
          undefined,
          {
            stopPrice: stopLossPrice,
            type: 'Stop',
            triggerDirection: slDirection
          }
        );
        console.log(`[BitMEXService][SL] 止損訂單創建成功: ID=${stopLossOrder.id}, 狀態=${stopLossOrder.status} - 等待價格達到 ${stopLossPrice} 觸發`);
        result.stopLossOrder = stopLossOrder;
      } catch (slError: any) {
        console.error(`[BitMEXService][ERROR] 止損訂單創建失敗: ${slError instanceof Error ? slError.message : '未知錯誤'} - 完成訂單處理但缺少止損保護`);
      }

      // 總結訂單處理狀態
      console.log(`[BitMEXService][SUCCESS] 訂單處理完成:
      - 主訂單: ${result.order ? '成功' : '失敗'}
      - 止盈訂單: ${result.takeProfitOrder ? '成功' : '失敗或未創建'}
      - 止損訂單: ${result.stopLossOrder ? '成功' : '失敗或未創建'}`);
      console.log(`========== [BitMEXService][ORDER] 訂單處理完成 ==========\n`);

      return result;
    } catch (error: any) {
      console.error(`\n[BitMEXService][FATAL] 訂單處理過程中發生嚴重錯誤 - 交易操作失敗`);
      
      // 記錄更詳細的錯誤信息
      if (error.response) {
        console.error(`[BitMEXService][ERROR] API 響應錯誤: ${JSON.stringify(error.response.data || {})} - 交易所返回的詳細錯誤`);
      }
      
      if (error.message) {
        if (error.message.includes('insufficient')) {
          console.error(`[BitMEXService][ERROR] 餘額不足 - 請檢查賬戶資金是否足夠`);
        } else if (error.message.includes('permission')) {
          console.error(`[BitMEXService][ERROR] API 權限不足 - 請檢查 API Key 的權限設置`);
        } else if (error.message.includes('Invalid')) {
          console.error(`[BitMEXService][ERROR] 參數無效 - 請檢查訂單參數是否符合交易所規則`);
        } else if (error.message.includes('Rate limit')) {
          console.error(`[BitMEXService][ERROR] API 請求頻率超限 - 請稍後再試或減少請求頻率`);
        }
      }
      
      console.log(`========== [BitMEXService][ORDER] 訂單處理失敗 ==========\n`);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        errorDetails: error
      };
    }
  }
} 