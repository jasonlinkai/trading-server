import * as ccxt from 'ccxt';
import { TradingService } from '.';
import { ExchangeType, OrderType } from '../../enums';
import { OrderRequest, OrderResult } from '../../interfaces/order';

export class BinanceService extends TradingService {
  constructor(exchangeType: ExchangeType, apiKey: string, apiSecret: string, isTestnet: boolean = false) {
    super(exchangeType, apiKey, apiSecret, isTestnet);

    this.initSymbolMappingsForExchange();

    this.exchange = new ccxt.binance({
      apiKey: this.apiKey,
      secret: this.apiSecret,
      enableRateLimit: true,
    });

    if (this.isTestnet) {
      console.log(`[${this.exchangeType}][subclass][INIT] 設置測試網模式 - 避免在生產環境意外下單`);
      this.exchange.setSandboxMode(true);
    }

    this.fetchMarketData();
    console.log(`[${this.exchangeType}][subclass][INIT] 服務初始化完成，交易所基礎 URL: ${this.exchange.urls.api} - 已建立交易所連接`);
  }
  initSymbolMappingsForExchange() {
    this.symbolMappingsForExchange = {
      'BTC/USD': 'BTC/USD',
      'ETH/USD': 'ETH/USD',
    };
  }
  checkQuantity(quantity: number): number {
    return quantity;
  }
} 
