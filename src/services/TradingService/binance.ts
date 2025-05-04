import * as ccxt from 'ccxt';
import { TradingService } from '.';
import { ExchangeType, OrderType, TRADE_ACTIONS } from '../../enums';
import { OrderRequest, OrderResult } from '../../interfaces/order';
import axios, { AxiosError } from 'axios';
import { Dictionary } from 'ccxt';
import cryptoJs from 'crypto-js';
import WebSocket from 'ws';

export class BinanceService extends TradingService {
  private ws: WebSocket | null = null;
  private reconnectCount: number = 0;
  private updateListenerKeyInterval: NodeJS.Timeout | null = null;
  private fapiEndpoint: string = '';
  private wsEndpoint: string = '';
  constructor(exchangeType: ExchangeType, apiKey: string, apiSecret: string, isTestnet: boolean = false) {
    super(exchangeType, apiKey, apiSecret, isTestnet);
    this.init();
  }
  async init() {
    this.initSymbolMappingsForExchange();

    // binance是現貨市場, binanceusdm 是期貨合約市場
    this.exchange = new ccxt.binanceusdm({
      apiKey: this.apiKey,
      secret: this.apiSecret,
      enableRateLimit: true,
    });

    if (this.isTestnet) {
      this.wsEndpoint = this.isTestnet ? 'wss://stream.binancefuture.com/ws' : 'wss://fstream.binance.com/ws';
      console.log(`[${this.exchangeType}][INIT] 設置測試網模式 - 避免在生產環境意外下單`);
      this.exchange.setSandboxMode(true);
    }

    await this.fetchMarketData();
    console.log(`[${this.exchangeType}][INIT] 服務初始化完成，交易所基礎 URL: ${JSON.stringify(this.exchange.urls)} - 已建立交易所連接`);

    const api = this.exchange.urls?.api as Dictionary<string>;
    this.fapiEndpoint = api.fapiPublic;

    await this.initWebSocket();
  }
  async initWebSocket() {
    const listenKey = await this.getListenerKey();
    this.ws = new WebSocket(`${this.wsEndpoint}/${listenKey}`);
    this.ws.on('open', () => {
      this.reconnectCount = 0;
      console.log(`[${this.exchangeType}][SOCKET] 連線成功`);
      this.updateListenerKeyInterval = setInterval(async () => {
        await this.updateListenerKey();
      }, 1000 * 60 * 55);
    });
    this.ws.on('message', (buffer) => {
      const decoder = new TextDecoder('utf-8');
      const jsonString = decoder.decode(buffer as Buffer);
      const message = JSON.parse(jsonString);
      console.info(`[${this.exchangeType}][SOCKET] 收到訊息:`, JSON.stringify(message));
      if (message.e === 'ORDER_TRADE_UPDATE') {
        if ((message.o.c.startsWith('hp-order') || message.o.c.startsWith('lp-order'))) {
          if (message.o.X === 'FILLED') {
            this.cancelAllOrders(message.o.s);
          }
        }
      }
    });
    this.ws.on('error', (error) => {
      console.log(`[${this.exchangeType}][SOCKET] 錯誤: ${error.message}`);
    });
    this.ws.on('close', async () => {
      console.log(`[${this.exchangeType}][SOCKET] 斷線`);
      if (this.reconnectCount < 3) {
        console.log(`[${this.exchangeType}][SOCKET] 嘗試重連第${this.reconnectCount + 1}次`);
        this.initWebSocket();
        this.reconnectCount++;
      } else {
        console.error(`[${this.exchangeType}][SOCKET] 斷線次數過多，不再嘗試重連, 關閉程序`);
        await this.closeAllPositions();
        process.exit(1);
      }
    });
  }
  async getListenerKey() {
    try {
      const res = await axios.post(`${this.fapiEndpoint}/listenKey`,
        {
          signature: cryptoJs.HmacSHA256(`${Date.now()}`, this.apiSecret).toString(cryptoJs.enc.Hex)
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-MBX-APIKEY': this.apiKey
          },
          params: {
            timestamp: Date.now(),
          },
        }
      );
      console.log(`[${this.exchangeType}][INIT] 獲取聽鍵成功: ${JSON.stringify(res.data)}`);
      return res.data.listenKey;
    } catch (error: unknown) {
      console.error(`[${this.exchangeType}][ERROR] 獲取聽鍵失敗: ${error}`);
      throw error;
    }
  }
  async updateListenerKey() {
    try {
      const res = await axios.put(`${this.fapiEndpoint}/listenKey`,
        {
          signature: cryptoJs.HmacSHA256(`${Date.now()}`, this.apiSecret).toString(cryptoJs.enc.Hex)
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-MBX-APIKEY': this.apiKey
          },
          params: {
            timestamp: Date.now(),
          },
        }
      );
      console.log(`[${this.exchangeType}][INIT] 更新聽鍵成功: ${JSON.stringify(res.data)}`);
      return res.data.listenKey;
    } catch (error: unknown) {
      console.error(`[${this.exchangeType}][ERROR] 更新聽鍵失敗: ${error}`);
      throw error;
    }
  }
  initSymbolMappingsForExchange() {
    this.symbolMappingsForExchange = {
      'BTCUSD': 'BTC/USD',
      'BTCUSDT': 'BTC/USDT'
    };
  }
  async createOrder(orderData: OrderRequest): Promise<OrderResult> {
    console.log(`\n========== [${this.exchangeType}][ORDER] 開始處理訂單 ==========`);
    console.log(`[${this.exchangeType}][ORDER] 訂單詳情: 交易對=${orderData.symbol}, 操作=${orderData.action}, 數量=${orderData.qty}手 - 準備執行交易請求`);

    try {
      if (!this.exchange) {
        console.error(`[${this.exchangeType}][ERROR] 交易所實例未初始化，無法下單`);
        throw new Error('Exchange not initialized');
      }
      const orderUUID = `order-${orderData.symbol}-001`;
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
        console.log(`[${this.exchangeType}][MAIN] 設置槓桿: ${exchangeSymbol}`);
        const response = await this.exchange.setLeverage(orderData.leverage, exchangeSymbol);
        console.log(`[${this.exchangeType}][MAIN] 設置槓桿成功: ${JSON.stringify(response)}`);
      } catch (error: any) {
        console.error(`[${this.exchangeType}][ERROR] 設置槓桿失敗: ${error.message} - 可能是網絡問題或參數無效`);
        throw error;
      }
      try {

        order = await this.exchange.createOrder(
          exchangeSymbol,
          orderType,
          orderData.action.toLowerCase(),
          quantity,
          orderData.limit_price,
          {
            newClientOrderId: `main-${orderUUID}`,
          }
        );
        console.log(`[${this.exchangeType}][MAIN] 主訂單創建成功: ${JSON.stringify(order)}`);

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
          orderData.action.toLowerCase() === TRADE_ACTIONS.BUY ? OrderType.LIMIT : OrderType.STOP,
          orderData.action.toLowerCase() === TRADE_ACTIONS.BUY ? TRADE_ACTIONS.SELL : TRADE_ACTIONS.BUY,
          executedQuantity,
          hightPrice,
          {
            newClientOrderId: `hp-${orderUUID}`,
            clOrdLinkID: `cl-${orderUUID}`,
            triggerPrice: orderData.action.toLowerCase() === TRADE_ACTIONS.BUY ? undefined : hightPrice,
            stopPx: orderData.action.toLowerCase() === TRADE_ACTIONS.BUY ? undefined : hightPrice,
            execInst: orderData.action.toLowerCase() === TRADE_ACTIONS.BUY ? 'ReduceOnly' : 'ReduceOnly,LastPrice',
            contingencyType: 'OneCancelsTheOther',
          }
        );
        console.log(`[${this.exchangeType}] 創建HP訂單成功: ${JSON.stringify(takeProfitOrder)}`);
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
          orderData.action.toLowerCase() === TRADE_ACTIONS.BUY ? OrderType.STOP : OrderType.LIMIT,
          orderData.action.toLowerCase() === TRADE_ACTIONS.BUY ? TRADE_ACTIONS.SELL : TRADE_ACTIONS.BUY,
          executedQuantity,
          lowPrice,
          {
            newClientOrderId: `lp-${orderUUID}`,
            clOrdLinkID: `cl-${orderUUID}`,
            triggerPrice: orderData.action.toLowerCase() === TRADE_ACTIONS.BUY ? lowPrice : undefined,
            stopPx: orderData.action.toLowerCase() === TRADE_ACTIONS.BUY ? lowPrice : undefined,
            execInst: orderData.action.toLowerCase() === TRADE_ACTIONS.BUY ? 'ReduceOnly,LastPrice' : 'ReduceOnly',
            contingencyType: 'OneCancelsTheOther',
          }
        );
        console.log(`[${this.exchangeType}] 創建LP訂單成功: ${JSON.stringify(stopLossOrder)}`);
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
  checkQuantity(quantity: number): number {
    return quantity;
  }
} 
