"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LotSizeConverter = void 0;
class LotSizeConverter {
    /**
     * 初始化合約規格
     * @param exchange CCXT exchange 實例
     * @param symbol 交易對
     */
    static async initializeContractSize(exchange, symbol) {
        const exchangeId = exchange.id.toLowerCase();
        console.log(`[LotSizeConverter][INIT] 開始初始化 ${symbol} 在 ${exchangeId} 的合約規格`);
        try {
            console.log(`[LotSizeConverter][INIT] 請求 ${exchangeId} 的市場數據...`);
            const markets = await exchange.fetchMarkets();
            console.log(`[LotSizeConverter][INIT] 成功獲取 ${markets.length} 個市場數據`);
            console.log(`[LotSizeConverter][SYMBOL] 在市場數據中搜索 ${symbol} 交易對...`);
            const market = markets.find(m => m?.symbol === symbol);
            if (!market) {
                console.error(`[LotSizeConverter][ERROR] 在 ${exchangeId} 中找不到 ${symbol} 交易對`);
                throw new Error(`Market not found for symbol: ${symbol}`);
            }
            console.log(`[LotSizeConverter][SYMBOL] 找到 ${symbol} 交易對的市場數據:`);
            console.log(`  - ID: ${market.id}`);
            console.log(`  - 基準貨幣/計價貨幣: ${market.base}/${market.quote}`);
            console.log(`  - 是否激活: ${market.active}`);
            console.log(`  - 合約規模: ${market.contractSize || '未指定'}`);
            // 初始化交易所的合約規格對象
            this.contractSizes[exchangeId] = this.contractSizes[exchangeId] || {};
            // 獲取合約規格
            const oldContractSize = this.contractSizes[exchangeId][symbol] || this.DEFAULT_CONTRACT_SIZES[exchangeId];
            console.log(`[LotSizeConverter][INIT] 當前 ${symbol} 在 ${exchangeId} 的合約規格: ${oldContractSize} (${oldContractSize === this.DEFAULT_CONTRACT_SIZES[exchangeId] ? '默認值' : '已配置'})`);
            if (market.contractSize) {
                this.contractSizes[exchangeId][symbol] = market.contractSize;
                console.log(`[LotSizeConverter][INIT] 使用市場數據中的合約規模: ${market.contractSize}`);
            }
            else {
                this.contractSizes[exchangeId][symbol] = this.DEFAULT_CONTRACT_SIZES[exchangeId];
                console.log(`[LotSizeConverter][INIT] 市場數據中無合約規模，使用默認值: ${this.DEFAULT_CONTRACT_SIZES[exchangeId]}`);
            }
            if (oldContractSize !== this.contractSizes[exchangeId][symbol]) {
                console.log(`[LotSizeConverter][INIT] 合約規格已更新: ${oldContractSize} -> ${this.contractSizes[exchangeId][symbol]}`);
            }
            else {
                console.log(`[LotSizeConverter][INIT] 合約規格未變更: ${this.contractSizes[exchangeId][symbol]}`);
            }
        }
        catch (error) {
            console.error(`[LotSizeConverter][ERROR] 初始化合約規格時發生錯誤:`, error);
            // 使用默認值
            this.contractSizes[exchangeId] = this.contractSizes[exchangeId] || {};
            this.contractSizes[exchangeId][symbol] = this.DEFAULT_CONTRACT_SIZES[exchangeId];
            console.log(`[LotSizeConverter][INIT] 由於錯誤，使用默認合約規格: ${this.DEFAULT_CONTRACT_SIZES[exchangeId]}`);
        }
    }
    /**
     * 獲取合約規格
     */
    static getContractSize(symbol, exchange) {
        const exchangeId = exchange.toLowerCase();
        console.log(`[LotSizeConverter][GET] 獲取 ${symbol} 在 ${exchangeId} 的合約規格`);
        const contractSize = this.contractSizes[exchangeId]?.[symbol] || this.DEFAULT_CONTRACT_SIZES[exchangeId];
        console.log(`[LotSizeConverter][GET] ${symbol} 在 ${exchangeId} 的合約規格: ${contractSize} (${contractSize === this.DEFAULT_CONTRACT_SIZES[exchangeId] ? '默認值' : '已配置'})`);
        return contractSize;
    }
    /**
     * 將手數轉換為實際交易數量
     * 統一使用 Binance 的手數邏輯：1手 = 0.001 BTC
     * @param lots 手數
     * @param symbol 交易對
     * @param exchange 交易所類型
     * @param price 當前價格 (僅 BitMEX 需要)
     * @returns 實際交易數量
     */
    static convertLotsToQuantity(lots, symbol, exchange, price) {
        const exchangeId = exchange.toLowerCase();
        console.log(`[LotSizeConverter][CONVERT] 開始轉換手數: ${lots} 手 -> ${symbol} 單位, 交易所: ${exchangeId}`);
        // 獲取 Binance 的合約規格作為標準
        console.log(`[LotSizeConverter][CONVERT] 獲取標準 Binance 合約規格...`);
        const standardContractSize = this.getContractSize(symbol, 'binance');
        console.log(`[LotSizeConverter][CONVERT] 標準合約大小 (Binance): ${standardContractSize}`);
        // 計算實際的幣數量（按照 Binance 標準）
        const actualCoinAmount = lots * standardContractSize;
        console.log(`[LotSizeConverter][CONVERT] 計算標準幣數量: ${lots} 手 × ${standardContractSize} = ${actualCoinAmount} ${symbol.split('/')[0]}`);
        let result;
        switch (exchangeId) {
            case 'binance':
                result = actualCoinAmount;
                console.log(`[LotSizeConverter][CONVERT] Binance 交易量計算: ${lots} 手 = ${result} ${symbol.split('/')[0]}`);
                break;
            case 'bitmex':
                if (!price) {
                    console.error(`[LotSizeConverter][ERROR] BitMEX 轉換需要價格參數，但未提供`);
                    throw new Error('Price is required for BitMEX lot conversion');
                }
                // 將幣數量轉換為等值的 USD 合約數量
                result = Math.round(actualCoinAmount * price);
                console.log(`[LotSizeConverter][CONVERT] BitMEX 交易量計算過程:`);
                console.log(`  - 幣數量: ${actualCoinAmount} ${symbol.split('/')[0]}`);
                console.log(`  - 當前價格: ${price} USD`);
                console.log(`  - 計算: ${actualCoinAmount} × ${price} = ${actualCoinAmount * price} USD (未四捨五入)`);
                console.log(`  - 最終結果: ${result} 合約 (四捨五入後)`);
                // 檢查最小訂單限制
                if (result < 100) {
                    console.warn(`[LotSizeConverter][WARN] BitMEX 訂單數量 ${result} 小於最小限制 100，可能導致下單失敗`);
                }
                break;
            default:
                console.error(`[LotSizeConverter][ERROR] 不支持的交易所: ${exchange}`);
                throw new Error(`Unsupported exchange: ${exchange}`);
        }
        console.log(`[LotSizeConverter][CONVERT] 手數轉換完成: ${lots} 手 => ${result} 單位 (${exchangeId}, ${symbol})`);
        return result;
    }
}
exports.LotSizeConverter = LotSizeConverter;
LotSizeConverter.contractSizes = {};
LotSizeConverter.DEFAULT_CONTRACT_SIZES = {
    binance: 0.001,
    bitmex: 1
};
