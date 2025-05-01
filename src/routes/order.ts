import { Router, Request, Response } from 'express';
import { TradingServiceFactory, ExchangeType } from '../services/tradingServiceFactory';
import { formatResponse } from '../utils/formatting';
import { OrderRequest } from '../interfaces/order';
import {
  EXCHANGE_TYPE,
  IS_TESTNET,
  API_KEY,
  API_SECRET,
  TRADE_ACTIONS,
  ERROR_MESSAGES,
  HTTP_STATUS,
  API_PATHS
} from '../constants';

// 創建 Express 路由處理器
export const orderRouter = Router();

// 創建交易服務實例，用於與交易所 API 交互
const tradingService = TradingServiceFactory.createService(
  EXCHANGE_TYPE as ExchangeType,
  API_KEY || '',
  API_SECRET || '',
  IS_TESTNET
);

// 獲取持倉信息的API
orderRouter.get('/', async (req: Request, res: Response) => {
  try {
    // 從查詢參數中獲取交易對
    const symbol = req.query.symbol as string;
    
    if (!symbol) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        error: 'Missing symbol parameter'
      });
    }
    
    console.log(`\n[持倉查詢] 查詢交易對 ${symbol} 的持倉信息`);
    
    // 獲取持倉信息
    const position = await tradingService.getPosition(symbol);
    console.log(`[持倉查詢] 交易對 ${symbol} 的持倉信息: \n${formatResponse(position)}`);
    
    // 處理特殊標記
    let hasPosition = false;
    let positionSize = 0;
    let positionDirection = 'none';
    
    // 檢查交易所返回的特殊標記
    if (position && position._hasPosition === true) {
      hasPosition = true;
      positionSize = Math.abs(position._positionSize || 0);
      positionDirection = position._positionDirection || (position._positionSize > 0 ? '多頭' : '空頭');
    } 
    // 向後兼容處理
    else if (position && !Array.isArray(position)) {
      const size = position.size || position.currentQty || position.positionAmt || position.contracts || 0;
      if (typeof size === 'number' && Math.abs(size) > 0) {
        hasPosition = true;
        positionSize = Math.abs(size);
        positionDirection = size > 0 ? '多頭' : '空頭';
      }
    } 
    else if (Array.isArray(position)) {
      const nonZeroPositions = position.filter(pos => {
        if (!pos) return false;
        const size = pos.size || pos.currentQty || pos.positionAmt || pos.contracts || 0;
        return typeof size === 'number' && Math.abs(size) > 0;
      });
      
      if (nonZeroPositions.length > 0) {
        hasPosition = true;
        // 只返回第一個持倉的信息
        const firstPos = nonZeroPositions[0];
        const size = firstPos.size || firstPos.currentQty || firstPos.positionAmt || firstPos.contracts || 0;
        positionSize = Math.abs(size);
        positionDirection = size > 0 ? '多頭' : '空頭';
      }
    }
    
    // 構建響應
    const response = {
      symbol: symbol,
      hasPosition: hasPosition,
      position: position,
      summary: {
        hasPosition: hasPosition,
        size: positionSize,
        direction: positionDirection,
        timestamp: new Date().toISOString()
      }
    };
    
    console.log(`[持倉查詢] 響應: hasPosition=${hasPosition}, direction=${positionDirection}, size=${positionSize}`);
    res.status(HTTP_STATUS.OK).json(response);
  } catch (error) {
    console.error(`[系統錯誤] 查詢持倉時發生錯誤: `, error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Failed to query position',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 定義 POST /api/order 路由，處理交易訂單的創建請求
orderRouter.post('/', async (req: Request, res: Response) => {
  try {
    // 打印請求信息到控制台，便於調試和監控
    console.log(`\n[請求信息] API 請求詳情：`);
    console.log(`請求時間：${new Date().toISOString()}`);
    console.log(`請求方法：${req.method}`);
    console.log(`請求路徑：${req.path}`);
    console.log(`Content-Type：${req.headers['content-type']}`);
    console.log(`請求參數：\n${formatResponse(req.body)}\n`);
    
    // 檢查請求體是否為空
    if (!req.body || Object.keys(req.body).length === 0) {
      console.error(`[請求錯誤] 請求體為空或格式無效`);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        error: 'Empty or invalid request body. Please provide order details in JSON format.' 
      });
    }
    
    // 從請求體中提取訂單數據
    const orderData: OrderRequest = req.body;

    // 驗證必填字段
    if (!orderData.action || !orderData.symbol || !orderData.qty) {
      const error = `${ERROR_MESSAGES.MISSING_FIELDS}: action, symbol, qty`;
      console.error(`[驗證錯誤] ${error}`);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error });
    }

    // 驗證止盈和止損參數
    if (!orderData.take_profit?.points || !orderData.stop_loss?.points) {
      const error = `${ERROR_MESSAGES.MISSING_FIELDS}: take_profit.points, stop_loss.points`;
      console.error(`[驗證錯誤] ${error}`);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error });
    }

    // 驗證交易動作值必須是 buy 或 sell
    if (![TRADE_ACTIONS.BUY, TRADE_ACTIONS.SELL].includes(orderData.action.toLowerCase())) {
      const error = ERROR_MESSAGES.INVALID_ACTION;
      console.error(`[驗證錯誤] ${error}`);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ error });
    }

    // 檢查是否已有相同交易對的持倉存在
    console.log(`[持倉檢查] 檢查交易對 ${orderData.symbol} 是否已有持倉...`);
    const existingPosition = await tradingService.getPosition(orderData.symbol);
    console.log(`[持倉檢查] 現有持倉信息：\n${formatResponse(existingPosition)}\n`);
    
    // 使用增強的持倉檢測邏輯
    let hasPosition = false;
    
    // 檢查交易所返回的特殊標記 (BitMEXService增強版)
    if (existingPosition && existingPosition._hasPosition === true) {
      console.log(`[持倉檢查] 檢測到交易所確認的現有持倉: ${existingPosition._positionDirection || '未知方向'}, 數量: ${Math.abs(existingPosition._positionSize || 0)}`);
      hasPosition = true;
    } 
    // 向後兼容處理 - 檢查對象形式的持倉
    else if (existingPosition && !Array.isArray(existingPosition)) {
      // 檢查持倉數量 - 考慮多個可能的字段名
      const positionSize = existingPosition.size || existingPosition.currentQty || 
                          existingPosition.positionAmt || existingPosition.contracts || 0;
      
      if (typeof positionSize === 'number' && Math.abs(positionSize) > 0) {
        const positionDirection = positionSize > 0 ? 'buy' : 'sell';
        console.log(`[持倉檢查] 檢測到現有持倉，方向: ${positionDirection}, 數量: ${Math.abs(positionSize)}`);
        hasPosition = true;
      }
    } 
    // 檢查數組形式的持倉
    else if (Array.isArray(existingPosition) && existingPosition.length > 0) {
      // 過濾出非零持倉
      const nonZeroPositions = existingPosition.filter(pos => {
        if (!pos) return false;
        const size = pos.size || pos.currentQty || pos.positionAmt || pos.contracts || 0;
        return typeof size === 'number' && Math.abs(size) > 0;
      });
      
      if (nonZeroPositions.length > 0) {
        console.log(`[持倉檢查] 檢測到 ${nonZeroPositions.length} 個非零持倉`);
        hasPosition = true;
      }
    }

    // 如果有持倉，拒絕新訂單
    if (hasPosition) {
      console.log(`[訂單拒絕] 檢測到現有持倉，拒絕處理新訂單 - 請先平倉現有持倉`);
      const error = ERROR_MESSAGES.POSITION_EXISTS;
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        error, 
        position: existingPosition
      });
    }
    
    console.log(`[持倉檢查] 未檢測到已有持倉，允許創建新訂單`);
    console.log(`\n[訂單處理] 開始處理訂單...`);
    
    // 打印訂單參數到控制台
    console.log(`[訂單參數]`);
    console.log(`交易所：${orderData.exchange}`);
    console.log(`時間週期：${orderData.interval}`);
    console.log(`信號時間：${orderData.now}`);
    console.log(`交易對：${orderData.symbol}`);
    console.log(`操作：${orderData.action.toUpperCase()}`);
    console.log(`數量：${orderData.qty}`);
    console.log(`當前價格：${orderData.price}`);
    console.log(`止盈設置：${orderData.take_profit.points} 點${orderData.take_profit.is_percentage ? ' (百分比)' : ''}`);
    console.log(`止損設置：${orderData.stop_loss.points} 點${orderData.stop_loss.is_percentage ? ' (百分比)' : ''}\n`);
    
    // 調用交易服務創建訂單（包括主訂單、止盈訂單和止損訂單）
    const result = await tradingService.createOrder({
      exchange: orderData.exchange,
      interval: orderData.interval,
      now: orderData.now,
      action: orderData.action,
      symbol: orderData.symbol,
      qty: orderData.qty,
      price: orderData.price,
      take_profit: {
        points: orderData.take_profit.points,
        is_percentage: orderData.take_profit.is_percentage || false
      },
      stop_loss: {
        points: orderData.stop_loss.points,
        is_percentage: orderData.stop_loss.is_percentage || false
      }
    });

    // 檢查訂單創建結果，如果失敗則返回錯誤
    if (!result.success) {
      console.error(`[訂單錯誤] ${result.error || 'Unknown error'}`);
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: result.error });
    }

    // 訂單創建成功，打印訂單信息
    console.log(`\n[訂單成功] 主訂單已成功創建`);
    console.log(`[訂單詳情] 主訂單信息：\n${formatResponse(result.order)}\n`);
    
    // 如果創建了止盈訂單，打印止盈訂單信息
    if (result.takeProfitOrder) {
      console.log(`[止盈訂單] 止盈訂單信息：\n${formatResponse(result.takeProfitOrder)}\n`);
    }
    
    // 如果創建了止損訂單，打印止損訂單信息
    if (result.stopLossOrder) {
      console.log(`[止損訂單] 止損訂單信息：\n${formatResponse(result.stopLossOrder)}\n`);
    }

    // 獲取交易後的當前持倉信息
    const position = await tradingService.getPosition(orderData.symbol);
    console.log(`[持倉信息] 當前持倉：\n${formatResponse(position)}\n`);
    
    // 獲取交易後的賬戶餘額
    const balance = await tradingService.getBalance();
    console.log(`[賬戶餘額] 當前餘額：\n${formatResponse(balance)}\n`);

    // 構建返回給客戶端的響應數據
    const response = {
      message: 'Order executed successfully',
      order: result.order,               // 主訂單信息
      takeProfitOrder: result.takeProfitOrder, // 止盈訂單信息
      stopLossOrder: result.stopLossOrder,     // 止損訂單信息
      position: position,                // 當前持倉
      balance: balance,                  // 當前餘額
      timestamp: new Date().toISOString() // 響應時間戳
    };

    console.log(`\n[請求完成] 訂單處理完成`);
    // 返回成功響應和數據
    res.status(HTTP_STATUS.OK).json(response);
  } catch (error) {
    // 捕獲並處理處理過程中的任何錯誤
    console.error(`[系統錯誤] 處理訂單時發生錯誤：`, error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
      error: ERROR_MESSAGES.FAILED_TO_PROCESS,
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}); 