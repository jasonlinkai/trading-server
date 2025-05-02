import { TradingService } from '../services/TradingService';
import { BinanceService } from '../services/TradingService/binance';
import { BitMEXService } from '../services/TradingService/bitmex';
import { ExchangeType } from '../enums';

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

    let service: TradingService;

    console.log(`[TradingServiceFactory][CREATE] 根據交易所類型創建具體服務實例...`);
    console.log(`[TradingServiceFactory][CREATE] 創建 ${exchange} 交易服務實例`);
    switch (exchange) {
      case ExchangeType.BINANCE:
        service = new BinanceService(exchange, apiKey, apiSecret, isTestnet);
        break;
      case ExchangeType.BITMEX:
        service = new BitMEXService(exchange, apiKey, apiSecret, isTestnet);
        break;
      default:
        console.error(`[TradingServiceFactory][ERROR] 不支持的交易所類型: ${exchange}`);
        throw new Error(`Unsupported exchange type: ${exchange}`);
    }

    console.log(`[TradingServiceFactory][CREATE] 交易服務創建成功: ${exchange}`);
    console.log(`[TradingServiceFactory][CREATE] ========== 交易服務創建完成 ==========\n`);
    return service;
  }
} 