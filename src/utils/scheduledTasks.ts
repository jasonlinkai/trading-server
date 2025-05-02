import * as cron from 'node-cron';
import { TradingServiceFactory } from '../factories/TradingServiceFactory';
import { ExchangeType } from '../enums';
import { BINANCE_API_KEY, BINANCE_API_SECRET, BITMEX_API_KEY, BITMEX_API_SECRET, IS_TESTNET } from '../constants';

// Common trading symbols to check
// This can be extended or made configurable
const COMMON_SYMBOLS = [
  'BTCUSD',
];

/**
 * Initializes the scheduled tasks for the trading server
 */
export function initScheduledTasks() {
  console.log('[排程] 初始化排程任務 - 設置自動檢查持倉和清理訂單的排程');

  // Schedule task to run at minute 4, 8, 12, 16, ... of each hour
  cron.schedule('4,9,14,19,24,29,34,39,44,49,54,59 * * * *', async () => {
    const currentTime = new Date();
    console.log(`\n[排程] 執行定時任務 - ${currentTime.toISOString()} - 檢查持倉和清理訂單`);
    
    try {
      // Check positions and clear orders for Binance
      // await checkPositionsAndClearOrders(ExchangeType.BINANCE, BINANCE_API_KEY, BINANCE_API_SECRET, IS_TESTNET);
      
      // Check positions and clear orders for BitMEX
      await checkPositionsAndClearOrders(ExchangeType.BITMEX, BITMEX_API_KEY, BITMEX_API_SECRET, IS_TESTNET);
      
      console.log(`[排程] 定時任務執行完成 - ${new Date().toISOString()}`);
    } catch (error) {
      console.error('[排程][錯誤] 執行定時任務時發生錯誤:', error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Taipei" // Adjust timezone as needed
  });

  console.log('[排程] 已成功設置排程任務');
}

/**
 * Checks positions for all common symbols and clears orders if no positions exist
 */
async function checkPositionsAndClearOrders(
  exchangeType: ExchangeType,
  apiKey: string,
  apiSecret: string,
  isTestnet: boolean
) {
  console.log(`[排程][${exchangeType}] 開始檢查持倉和清理訂單`);
  
  // Create trading service instance
  const tradingService = TradingServiceFactory.createService(
    exchangeType,
    apiKey, 
    apiSecret,
    isTestnet
  );
  
  // Check each symbol
  for (const symbol of COMMON_SYMBOLS) {
    try {
      console.log(`[排程][${exchangeType}] 檢查交易對 ${symbol}`);
      
      // Fetch position for this symbol
      const position = await tradingService.fetchPosition(symbol);
      
      if (!position) {
        console.log(`[排程][${exchangeType}] 交易對 ${symbol} 無持倉，檢查並清理訂單`);
        
        // No position exists, cancel all orders for this symbol
        await tradingService.cancelAllOrders(symbol);
        console.log(`[排程][${exchangeType}] 已清理交易對 ${symbol} 的所有訂單`);
      } else {
        console.log(`[排程][${exchangeType}] 交易對 ${symbol} 有持倉，保留所有訂單`);
      }
    } catch (error) {
      console.error(`[排程][${exchangeType}][錯誤] 處理交易對 ${symbol} 時發生錯誤:`, error);
      // Continue with next symbol despite error
    }
  }
  
  console.log(`[排程][${exchangeType}] 檢查持倉和清理訂單完成`);
} 