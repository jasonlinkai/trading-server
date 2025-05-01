import { TradingService } from './tradingService';
import { BinanceService } from './binanceService';
import { BitMEXService } from './bitmexService';

export type ExchangeType = 'binance' | 'bitmex';

export class TradingServiceFactory {
  /**
   * 創建交易服務實例
   */
  static createService(
    exchange: ExchangeType,
    apiKey: string,
    apiSecret: string,
    isTestnet: boolean = false
  ): TradingService {
    console.log(`\n[TradingServiceFactory][CREATE] ========== 開始創建交易服務 ==========`);
    console.log(`[TradingServiceFactory][CREATE] 請求創建交易服務，參數:`);
    console.log(`  - 交易所類型: ${exchange}`);
    console.log(`  - API密鑰狀態: ${apiKey ? '已提供' : '未提供'} (${apiKey ? `長度: ${apiKey.length}` : '空'})`);
    console.log(`  - API密碼狀態: ${apiSecret ? '已提供' : '未提供'} (${apiSecret ? `長度: ${apiSecret.length}` : '空'})`);
    console.log(`  - 測試網模式: ${isTestnet}`);

    // 將 exchange 轉換為小寫進行匹配
    const exchangeType = exchange.toLowerCase() as ExchangeType;

    let service: TradingService;

    console.log(`[TradingServiceFactory][CREATE] 根據交易所類型創建具體服務實例...`);
    switch (exchangeType) {
      case 'binance':
        console.log(`[TradingServiceFactory][CREATE] 創建 Binance 交易服務實例`);
        service = new BinanceService(exchangeType, apiKey, apiSecret, isTestnet);
        break;
      case 'bitmex':
        console.log(`[TradingServiceFactory][CREATE] 創建 BitMEX 交易服務實例`);
        service = new BitMEXService(exchangeType, apiKey, apiSecret, isTestnet);
        break;
      default:
        console.error(`[TradingServiceFactory][ERROR] 不支持的交易所類型: ${exchange}`);
        throw new Error(`Unsupported exchange type: ${exchange}`);
    }

    console.log(`[TradingServiceFactory][CREATE] 交易服務創建成功: ${exchangeType}`);
    console.log(`[TradingServiceFactory][CREATE] ========== 交易服務創建完成 ==========\n`);
    return service;
  }
} 