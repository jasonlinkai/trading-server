"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BitMEXService = void 0;
const ccxt = __importStar(require("ccxt"));
const tradingService_1 = require("./tradingService");
class BitMEXService extends tradingService_1.TradingService {
    constructor(exchangeType, apiKey, apiSecret, isTestnet = false) {
        console.log(`[BitMEXService][INIT] 初始化 BitMEX 服務 (API Key: ${apiKey ? '已設置' : '未設置'}, Testnet: ${isTestnet})`);
        super(exchangeType, apiKey, apiSecret, isTestnet);
        this.symbolMintickMap = {
            'BTC/USD': 0.5, // BitMEX XBTUSD 的最小價格變動單位
            'ETH/USD': 0.05, // BitMEX ETHUSD 的最小價格變動單位
            'XRP/USD': 0.0001 // BitMEX XRPUSD 的最小價格變動單位
        };
        this.exchange = new ccxt.bitmex({
            apiKey: this.apiKey,
            secret: this.apiSecret,
            enableRateLimit: true,
        });
        if (this.isTestnet) {
            console.log(`[BitMEXService][INIT] 設置 BitMEX 測試網模式`);
            this.exchange.setSandboxMode(true);
        }
        console.log(`[BitMEXService][INIT] BitMEX 服務初始化完成，交易所基礎 URL: ${this.exchange.urls.api}`);
    }
    convertSymbol(symbol) {
        console.log(`[BitMEXService][SYMBOL] 開始轉換交易對: ${symbol}`);
        // Convert BTC/USD to XBTUSD for BitMEX
        const result = symbol.replace('BTC/USD', 'XBTUSD');
        console.log(`[BitMEXService][SYMBOL] 交易對轉換結果: ${symbol} -> ${result}`);
        return result;
    }
    calculatePriceByPoints(entryPrice, points, isPercentage, isTakeProfit, mintick = 1 // 默認值為 1
    ) {
        console.log(`[BitMEXService][CALC] 開始計算價格, 入場價: ${entryPrice}, 點數: ${points}, 百分比模式: ${isPercentage}, 止盈模式: ${isTakeProfit}, Mintick: ${mintick}`);
        let result;
        if (isPercentage) {
            const multiplier = isTakeProfit ? (1 + points / 100) : (1 - points / 100);
            console.log(`[BitMEXService][CALC] 百分比模式計算, 乘數: ${multiplier} (${points}%)`);
            result = entryPrice * multiplier;
        }
        else {
            const adjustment = points * mintick; // 使用 mintick 調整點數
            console.log(`[BitMEXService][CALC] 點數模式計算, 調整值: ${adjustment} (${points} × ${mintick})`);
            result = isTakeProfit ? entryPrice + adjustment : entryPrice - adjustment;
        }
        console.log(`[BitMEXService][CALC] 價格計算結果: ${entryPrice} => ${result}`);
        return result;
    }
    async createOrder(orderData) {
        console.log(`\n========== [BitMEXService][ORDER] 開始處理訂單 ==========`);
        console.log(`[BitMEXService][ORDER] 訂單詳情: 交易對=${orderData.symbol}, 操作=${orderData.action}, 數量=${orderData.qty}手`);
        console.log(`[BitMEXService][ORDER] 請求參數詳情: ${JSON.stringify(orderData, null, 2)}`);
        try {
            if (!this.exchange) {
                console.error(`[BitMEXService][ERROR] 交易所實例未初始化，無法下單`);
                throw new Error('Exchange not initialized');
            }
            // 檢查API密鑰
            console.log(`[BitMEXService][AUTH] 驗證API密鑰可用性: ${this.apiKey ? '已設置' : '未設置'}, ${this.apiSecret ? '已設置密鑰' : '未設置密鑰'}`);
            if (!this.apiKey || !this.apiSecret) {
                console.error(`[BitMEXService][ERROR] 缺少API密鑰或密鑰，無法下單`);
                throw new Error('API Key and Secret are required');
            }
            // 轉換交易對格式
            console.log(`[BitMEXService][SYMBOL] 開始轉換交易對: ${orderData.symbol}`);
            const bitmexSymbol = this.convertSymbol(orderData.symbol);
            console.log(`[BitMEXService][SYMBOL] 交易對轉換完成: ${orderData.symbol} => ${bitmexSymbol}`);
            // 確保交易對已初始化
            console.log(`[BitMEXService][INIT] 檢查交易對是否已初始化: ${bitmexSymbol}, 狀態=${this.symbolsInitialized.has(bitmexSymbol) ? '已初始化' : '未初始化'}`);
            if (!this.symbolsInitialized.has(bitmexSymbol)) {
                console.log(`[BitMEXService][INIT] 初始化交易對 ${bitmexSymbol} 來獲取最新 mintick...`);
                await this.initializeSymbol(bitmexSymbol);
                console.log(`[BitMEXService][INIT] 交易對 ${bitmexSymbol} 初始化完成`);
            }
            // 獲取 mintick
            console.log(`[BitMEXService][MINTICK] 獲取 ${bitmexSymbol} 的最小價格變動單位`);
            const mintick = await this.getMintick(bitmexSymbol);
            console.log(`[BitMEXService][MINTICK] ${bitmexSymbol} 的最小價格變動單位為: ${mintick}`);
            // 將手數轉換為實際交易數量
            console.log(`[BitMEXService][QTY] 開始轉換交易量: ${orderData.qty}手, 交易對: ${orderData.symbol}, 價格: ${orderData.price}`);
            const quantity = this.convertLotsToQuantity(orderData.qty, orderData.symbol, orderData.price);
            console.log(`[BitMEXService][QTY] 交易量轉換結果: ${orderData.qty}手 => ${quantity}合約`);
            // 檢查最小訂單數量
            if (quantity < 100) {
                console.warn(`[BitMEXService][WARN] BitMEX最小訂單數量為100，當前計算值為 ${quantity}，可能導致下單失敗`);
            }
            // 創建主訂單（市價單或限價單）
            const orderType = orderData.limit_price ? 'limit' : 'market';
            console.log(`[BitMEXService][MAIN] 開始創建主訂單: ${orderData.action} ${quantity} ${bitmexSymbol} (${orderType}單)`);
            if (orderData.limit_price) {
                console.log(`[BitMEXService][MAIN] 限價單價格: ${orderData.limit_price}`);
            }
            // 模擬訂單，記錄參數
            console.log(`[BitMEXService][MAIN] 訂單API參數:
      - 交易對: ${bitmexSymbol}
      - 訂單類型: ${orderType}
      - 交易方向: ${orderData.action.toLowerCase()}
      - 數量: ${quantity}
      - 價格: ${orderData.limit_price || '市價'}`);
            let order;
            try {
                order = await this.exchange.createOrder(bitmexSymbol, orderType, orderData.action.toLowerCase(), quantity, orderData.limit_price);
                console.log(`[BitMEXService][MAIN] 主訂單創建成功: ID=${order.id}, 狀態=${order.status}`);
                console.log(`[BitMEXService][MAIN] 主訂單詳細信息: ${JSON.stringify(order, null, 2)}`);
            }
            catch (orderError) {
                console.error(`[BitMEXService][ERROR] 主訂單創建失敗: ${orderError instanceof Error ? orderError.message : 'Unknown error'}`);
                throw orderError;
            }
            const result = {
                success: true,
                order: order
            };
            // 使用訂單價格計算止盈止損
            const entryPrice = orderData.price;
            console.log(`[BitMEXService][PRICE] 使用入場價格: ${entryPrice} 計算止盈止損`);
            // 計算止盈價格
            console.log(`[BitMEXService][TP] 開始計算止盈價格, 點數: ${orderData.take_profit.points}, 百分比模式: ${orderData.take_profit.is_percentage}`);
            const takeProfitPrice = this.calculatePriceByPoints(entryPrice, orderData.take_profit.points, orderData.take_profit.is_percentage, true, mintick);
            console.log(`[BitMEXService][TP] 止盈價格計算結果: ${takeProfitPrice}`);
            // 計算止損價格
            console.log(`[BitMEXService][SL] 開始計算止損價格, 點數: ${orderData.stop_loss.points}, 百分比模式: ${orderData.stop_loss.is_percentage}`);
            const stopLossPrice = this.calculatePriceByPoints(entryPrice, orderData.stop_loss.points, orderData.stop_loss.is_percentage, false, mintick);
            console.log(`[BitMEXService][SL] 止損價格計算結果: ${stopLossPrice}`);
            // 創建止盈訂單
            const tpDirection = orderData.action.toLowerCase() === 'buy' ? 'above' : 'below';
            const tpAction = orderData.action.toLowerCase() === 'buy' ? 'sell' : 'buy';
            console.log(`[BitMEXService][TP] 開始創建止盈訂單:
      - 交易對: ${bitmexSymbol}
      - 方向: ${tpAction} (反向)
      - 數量: ${quantity}
      - 觸發價格: ${takeProfitPrice}
      - 觸發方向: ${tpDirection}`);
            let takeProfitOrder;
            try {
                takeProfitOrder = await this.exchange.createOrder(bitmexSymbol, 'market', tpAction, quantity, undefined, {
                    stopPrice: takeProfitPrice,
                    type: 'TakeProfit',
                    triggerDirection: tpDirection
                });
                console.log(`[BitMEXService][TP] 止盈訂單創建成功: ID=${takeProfitOrder.id}, 狀態=${takeProfitOrder.status}`);
                console.log(`[BitMEXService][TP] 止盈訂單詳細信息: ${JSON.stringify(takeProfitOrder, null, 2)}`);
                result.takeProfitOrder = takeProfitOrder;
            }
            catch (tpError) {
                console.error(`[BitMEXService][ERROR] 止盈訂單創建失敗: ${tpError instanceof Error ? tpError.message : 'Unknown error'}`);
                console.warn(`[BitMEXService][WARN] 主訂單已創建，但止盈訂單失敗，繼續創建止損訂單`);
            }
            // 創建止損訂單
            const slDirection = orderData.action.toLowerCase() === 'buy' ? 'below' : 'above';
            const slAction = orderData.action.toLowerCase() === 'buy' ? 'sell' : 'buy';
            console.log(`[BitMEXService][SL] 開始創建止損訂單:
      - 交易對: ${bitmexSymbol}
      - 方向: ${slAction} (反向)
      - 數量: ${quantity}
      - 觸發價格: ${stopLossPrice}
      - 觸發方向: ${slDirection}`);
            let stopLossOrder;
            try {
                stopLossOrder = await this.exchange.createOrder(bitmexSymbol, 'market', slAction, quantity, undefined, {
                    stopPrice: stopLossPrice,
                    type: 'Stop',
                    triggerDirection: slDirection
                });
                console.log(`[BitMEXService][SL] 止損訂單創建成功: ID=${stopLossOrder.id}, 狀態=${stopLossOrder.status}`);
                console.log(`[BitMEXService][SL] 止損訂單詳細信息: ${JSON.stringify(stopLossOrder, null, 2)}`);
                result.stopLossOrder = stopLossOrder;
            }
            catch (slError) {
                console.error(`[BitMEXService][ERROR] 止損訂單創建失敗: ${slError instanceof Error ? slError.message : 'Unknown error'}`);
                console.warn(`[BitMEXService][WARN] 主訂單已創建${result.takeProfitOrder ? '，止盈訂單已創建' : ''}，但止損訂單失敗`);
            }
            console.log(`[BitMEXService][SUCCESS] 訂單處理完成，所有訂單狀態:
      - 主訂單: ${result.order ? '成功' : '失敗'}
      - 止盈訂單: ${result.takeProfitOrder ? '成功' : '失敗或未創建'}
      - 止損訂單: ${result.stopLossOrder ? '成功' : '失敗或未創建'}`);
            console.log(`========== [BitMEXService][ORDER] 訂單處理完成 ==========\n`);
            return result;
        }
        catch (error) {
            console.error(`\n[BitMEXService][FATAL] 訂單處理過程中發生嚴重錯誤:`);
            console.error(error instanceof Error ? error.stack : error);
            console.log(`========== [BitMEXService][ORDER] 訂單處理失敗 ==========\n`);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }
    async getPosition(symbol) {
        console.log(`[BitMEXService][POSITION] 獲取 ${symbol} 的持倉信息`);
        try {
            if (!this.exchange) {
                console.error(`[BitMEXService][ERROR] 交易所實例未初始化，無法獲取持倉`);
                throw new Error('Exchange not initialized');
            }
            const bitmexSymbol = this.convertSymbol(symbol);
            console.log(`[BitMEXService][POSITION] 轉換後的交易對: ${bitmexSymbol}`);
            console.log(`[BitMEXService][POSITION] 調用API獲取持倉數據...`);
            const positions = await this.exchange.fetchPositions([bitmexSymbol]);
            console.log(`[BitMEXService][POSITION] 獲取到 ${positions.length} 條持倉記錄`);
            const position = positions.find((p) => p.symbol === bitmexSymbol);
            if (position) {
                console.log(`[BitMEXService][POSITION] 找到 ${bitmexSymbol} 的持倉: ${JSON.stringify(position, null, 2)}`);
            }
            else {
                console.log(`[BitMEXService][POSITION] 未找到 ${bitmexSymbol} 的持倉`);
            }
            return position;
        }
        catch (error) {
            console.error(`[BitMEXService][ERROR] 獲取持倉時發生錯誤:`, error);
            throw error;
        }
    }
    async getBalance() {
        console.log(`[BitMEXService][BALANCE] 獲取賬戶餘額`);
        try {
            if (!this.exchange) {
                console.error(`[BitMEXService][ERROR] 交易所實例未初始化，無法獲取餘額`);
                throw new Error('Exchange not initialized');
            }
            console.log(`[BitMEXService][BALANCE] 調用API獲取餘額數據...`);
            const balance = await this.exchange.fetchBalance();
            console.log(`[BitMEXService][BALANCE] 餘額獲取成功: ${JSON.stringify(balance.total, null, 2)}`);
            return balance;
        }
        catch (error) {
            console.error(`[BitMEXService][ERROR] 獲取餘額時發生錯誤:`, error);
            throw error;
        }
    }
}
exports.BitMEXService = BitMEXService;
