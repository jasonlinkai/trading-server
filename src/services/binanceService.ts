import * as ccxt from 'ccxt';
import { TradingService, OrderData, OrderResult } from './tradingService';
import { ExchangeType } from './tradingServiceFactory';

export class BinanceService extends TradingService {
  protected symbolMintickMap: { [key: string]: number } = {
    'BTC/USDT': 0.1,    // Binance BTC/USDT 的最小價格變動單位
    'ETH/USDT': 0.01,   // Binance ETH/USDT 的最小價格變動單位
    'BNB/USDT': 0.01    // Binance BNB/USDT 的最小價格變動單位
  };

  constructor(exchangeType: string, apiKey: string, apiSecret: string, isTestnet: boolean = false) {
    super(exchangeType, apiKey, apiSecret, isTestnet);
    
    console.log(`[BinanceService][INIT] 初始化 Binance 交易服務`);
    console.log(`[BinanceService][INIT] 參數: API密鑰狀態=${apiKey ? '已提供' : '未提供'}, 密鑰狀態=${apiSecret ? '已提供' : '未提供'}, 測試網=${isTestnet}`);
    
    this.exchange = new ccxt.binance({
      apiKey: this.apiKey,
      secret: this.apiSecret,
      enableRateLimit: true,
    });

    if (this.isTestnet) {
      console.log(`[BinanceService][INIT] 設置 Binance 沙盒模式（測試網）`);
      this.exchange.setSandboxMode(true);
    }
    
    console.log(`[BinanceService][INIT] Binance 交易服務初始化完成`);
  }

  protected calculatePriceByPoints(
    entryPrice: number, 
    points: number, 
    isPercentage: boolean, 
    isTakeProfit: boolean,
    mintick: number = 1  // 默認值為 1
  ): number {
    if (isPercentage) {
      const multiplier = isTakeProfit ? (1 + points / 100) : (1 - points / 100);
      return entryPrice * multiplier;
    } else {
      const adjustment = points * mintick;  // 使用 mintick 調整點數
      return isTakeProfit ? entryPrice + adjustment : entryPrice - adjustment;
    }
  }

  async createOrder(orderData: OrderData): Promise<OrderResult> {
    try {
      console.log(`[BinanceService] Processing order for ${orderData.symbol}, action: ${orderData.action}, qty: ${orderData.qty}`);
      console.log(`[BinanceService][DEBUG] 下單參數: ${JSON.stringify(orderData)}`);
      
      if (!this.exchange) {
        throw new Error('Exchange not initialized');
      }

      // 確保交易對已初始化
      if (!this.symbolsInitialized.has(orderData.symbol)) {
        console.log(`[BinanceService][DEBUG] 初始化交易對 ${orderData.symbol} 來獲取最新 mintick...`);
        await this.initializeSymbol(orderData.symbol);
      }

      // 獲取 mintick
      const mintick = await this.getMintick(orderData.symbol);
      console.log(`[BinanceService][DEBUG] 使用 mintick=${mintick} 進行價格計算`);

      // 將手數轉換為實際交易數量
      const quantity = this.convertLotsToQuantity(orderData.qty, orderData.symbol);
      console.log(`[BinanceService][DEBUG] 手數轉換: ${orderData.qty} 手 => ${quantity} 單位`);

      // 創建主訂單（市價單或限價單）
      console.log(`[BinanceService][DEBUG] 創建主訂單: ${orderData.action} ${quantity} ${orderData.symbol} at ${orderData.limit_price || 'market price'}`);
      const order = await this.exchange.createOrder(
        orderData.symbol,
        orderData.limit_price ? 'limit' : 'market',
        orderData.action.toLowerCase(),
        quantity,
        orderData.limit_price
      );
      console.log(`[BinanceService][DEBUG] 主訂單創建成功: ${order.id}`);

      const result: OrderResult = {
        success: true,
        order: order
      };

      // 使用訂單價格計算止盈止損
      const entryPrice = orderData.price;
      console.log(`[BinanceService][DEBUG] 使用入場價格進行止盈止損計算: ${entryPrice}`);

      // 計算止盈價格
      const takeProfitPrice = this.calculatePriceByPoints(
        entryPrice,
        orderData.take_profit.points,
        orderData.take_profit.is_percentage,
        true,
        mintick
      );
      console.log(`[BinanceService][DEBUG] 計算止盈價格: ${takeProfitPrice} (原始點數: ${orderData.take_profit.points}, 百分比模式: ${orderData.take_profit.is_percentage})`);

      // 計算止損價格
      const stopLossPrice = this.calculatePriceByPoints(
        entryPrice,
        orderData.stop_loss.points,
        orderData.stop_loss.is_percentage,
        false,
        mintick
      );
      console.log(`[BinanceService][DEBUG] 計算止損價格: ${stopLossPrice} (原始點數: ${orderData.stop_loss.points}, 百分比模式: ${orderData.stop_loss.is_percentage})`);

      // 創建止盈訂單
      console.log(`[BinanceService][DEBUG] 創建止盈訂單於價格 ${takeProfitPrice}`);
      const takeProfitOrder = await this.exchange.createOrder(
        orderData.symbol,
        'market',
        orderData.action.toLowerCase() === 'buy' ? 'sell' : 'buy',
        quantity,
        undefined,
        {
          stopPrice: takeProfitPrice,
          type: 'TAKE_PROFIT_MARKET'
        }
      );
      console.log(`[BinanceService][DEBUG] 止盈訂單創建成功: ${takeProfitOrder.id}`);
      result.takeProfitOrder = takeProfitOrder;

      // 創建止損訂單
      console.log(`[BinanceService][DEBUG] 創建止損訂單於價格 ${stopLossPrice}`);
      const stopLossOrder = await this.exchange.createOrder(
        orderData.symbol,
        'market',
        orderData.action.toLowerCase() === 'buy' ? 'sell' : 'buy',
        quantity,
        undefined,
        {
          stopPrice: stopLossPrice,
          type: 'STOP_MARKET'
        }
      );
      console.log(`[BinanceService][DEBUG] 止損訂單創建成功: ${stopLossOrder.id}`);
      result.stopLossOrder = stopLossOrder;

      return result;
    } catch (error) {
      console.error('[BinanceService][ERROR] 創建訂單時發生錯誤:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async getPosition(symbol: string): Promise<any> {
    try {
      const positions = await this.exchange.fetchPositions([symbol]);
      return positions.find((p: any) => p.symbol === symbol) || null;
    } catch (error) {
      console.error('Error fetching position:', error);
      throw error;
    }
  }

  async getBalance(): Promise<any> {
    try {
      return await this.exchange.fetchBalance();
    } catch (error) {
      console.error('Error fetching balance:', error);
      throw error;
    }
  }
} 