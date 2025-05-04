import * as cron from 'node-cron';
import { Router, Request, Response } from 'express';
import { TradingServiceFactory } from '../factories/TradingServiceFactory';
import { formatResponse } from '../utils/formatting';
import { OrderRequest, OrderRequestData } from '../interfaces/order';
import { ExchangeType, HTTP_STATUS, ERROR_MESSAGES, TRADE_ACTIONS, ETickerToSymbol, SymbolType } from '../enums';
import logger from '../utils/logger';

/**
 * Data adapter: Convert string fields in OrderRequest to number types
  */
function adaptOrderRequest(orderData: OrderRequestData) {
  return {
    ...orderData,
    exchange: orderData.exchange.toLowerCase() as ExchangeType,
    symbol: ETickerToSymbol[orderData.symbol] as unknown as SymbolType,
    action: orderData.action.toLowerCase() as TRADE_ACTIONS,
    qty: parseFloat(orderData.qty),
    price: parseFloat(orderData.price),
    limit_price: orderData.limit_price ? parseFloat(orderData.limit_price) : undefined,
    leverage: orderData.leverage || 1,
    take_profit: {
      points: orderData.take_profit.points,
      is_percentage: orderData.take_profit.is_percentage || false
    },
    stop_loss: {
      points: orderData.stop_loss.points,
      is_percentage: orderData.stop_loss.is_percentage || false
    }
  };
}

export const registerOrderRoute = (exchangeType: ExchangeType, apiKey: string = '', apiSecret: string = '', isTestnet: boolean = false, needClearOrder: boolean = false) => {
  // Create Express router
  const router = Router();

  // Create trading service instance
  const tradingService = TradingServiceFactory.createService(
    exchangeType,
    apiKey,
    apiSecret,
    isTestnet
  );

  // GET /api/[ExchangeType]/position - Get position information
  router.get('/position', async (req: Request, res: Response) => {
    try {
      // Get symbol from query parameters
      const symbol = req.query.symbol as string;

      if (!symbol) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Missing symbol parameter'
        });
      }

      logger.info(`[持倉查詢] 查詢交易對 ${symbol} 的持倉信息`);
      const position = await tradingService.fetchPosition(symbol);
      logger.info(`[持倉查詢] 交易對 ${symbol} 的持倉信息: \n${formatResponse(position)}`);

      res.status(HTTP_STATUS.OK).json(position);
    } catch (error) {
      logger.error(`[系統錯誤] 查詢持倉時發生錯誤: `, error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to query position',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // POST /api/[ExchangeType]/position/close - Close a position
  router.post('/position/close', async (req: Request, res: Response) => {
    try {
      // Get symbol from request body
      const { symbol } = req.body;

      // Log request information
      logger.info(`[請求信息] API 請求詳情：`);
      logger.info(`請求時間：${new Date().toISOString()}`);
      logger.info(`請求方法：${req.method}`);
      logger.info(`請求路徑：${req.path}`);
      logger.info(`Content-Type：${req.headers['content-type']}`);
      logger.debug(`請求參數：\n${formatResponse(req.body)}\n`);

      // Validate required fields
      if (!symbol) {
        const error = `${ERROR_MESSAGES.MISSING_FIELDS}: symbol`;
        logger.error(`[驗證錯誤] ${error}`);
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error });
      }

      logger.info(`[平倉操作] 開始對 ${symbol} 執行平倉操作`);
      const result = await tradingService.closePosition(symbol);
      logger.info(`[平倉成功] ${symbol} 平倉操作完成`);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Position closed successfully',
        result
      });
    } catch (error) {
      logger.error(`[系統錯誤] 執行平倉操作時發生錯誤: `, error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Failed to close position',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // POST /api/[ExchangeType]/order - Create a new order
  router.post('/order', async (req: Request, res: Response) => {
    try {
      // Print request information to console for debugging and monitoring
      logger.info(`[請求信息] API 請求詳情：`);
      logger.info(`請求時間：${new Date().toISOString()}`);
      logger.info(`請求方法：${req.method}`);
      logger.info(`請求路徑：${req.path}`);
      logger.info(`Content-Type：${req.headers['content-type']}`);
      logger.debug(`請求參數：\n${formatResponse(req.body)}\n`);

      // Check if request body is empty
      if (!req.body || Object.keys(req.body).length === 0) {
        logger.error(`[請求錯誤] 請求體為空或格式無效`);
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Empty or invalid request body. Please provide order details in JSON format.'
        });
      }

      // Extract order data from request body
      const orderData: OrderRequest = adaptOrderRequest(req.body);

      // Validate required fields
      if (!orderData.action) {
        const error = `${ERROR_MESSAGES.MISSING_FIELDS}: action, symbol, qty`;
        logger.error(`[驗證錯誤] ${error}`);
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error });
      }
      if (!orderData.symbol) {
        const error = `${ERROR_MESSAGES.MISSING_FIELDS}: symbol`;
        logger.error(`[驗證錯誤] ${error}`);
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error });
      }
      if (!orderData.qty) {
        const error = `${ERROR_MESSAGES.MISSING_FIELDS}: qty`;
        logger.error(`[驗證錯誤] ${error}`);
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error });
      }

      // Validate take-profit and stop-loss parameters
      if (!orderData.take_profit?.points || !orderData.stop_loss?.points) {
        const error = `${ERROR_MESSAGES.MISSING_FIELDS}: take_profit.points, stop_loss.points`;
        logger.error(`[驗證錯誤] ${error}`);
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error });
      }

      // Validate that trade action must be 'buy' or 'sell'
      if (![TRADE_ACTIONS.BUY, TRADE_ACTIONS.SELL].includes(orderData.action as TRADE_ACTIONS)) {
        const error = ERROR_MESSAGES.INVALID_ACTION;
        logger.error(`[驗證錯誤] ${error}`);
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ error });
      }

      // Check if position already exists for this symbol
      logger.info(`[持倉檢查] 檢查交易對 ${orderData.symbol} 是否已有持倉...`);
      const position = await tradingService.fetchPosition(orderData.symbol);
      logger.info(`[持倉檢查] 現有持倉信息：\n${formatResponse(position)}\n`);

      // If position exists, reject new order
      if (position) {
        logger.warn(`[訂單拒絕] 檢測到現有持倉，拒絕處理新訂單 - 請先平倉現有持倉`);
        const error = ERROR_MESSAGES.POSITION_EXISTS;
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error,
          position,
        });
      }

      // If no position exists, cancel any existing take-profit and stop-loss orders first
      if (needClearOrder && !position) {
        logger.info(`[訂單處理] 未檢測到持倉，正在關閉可能存在的hp、lp訂單...`);
        try {
          await tradingService.cancelAllOrders(orderData.symbol);
          logger.info(`[訂單處理] 已關閉交易對 ${orderData.symbol} 的所有訂單`);
        } catch (error) {
          logger.error(`[訂單處理] 關閉訂單時發生錯誤: ${error instanceof Error ? error.message : '未知錯誤'}`);
          // Continue despite errors in canceling orders
        }
      }

      logger.info(`[持倉檢查] 未檢測到已有持倉，允許創建新訂單`);
      logger.info(`[訂單處理] 開始處理訂單...`);

      // Print order parameters to console
      logger.debug(`[訂單參數]`);
      logger.debug(`交易所：${orderData.exchange}`);
      logger.debug(`時間週期：${orderData.interval}`);
      logger.debug(`信號時間：${orderData.now}`);
      logger.debug(`交易對：${orderData.symbol}`);
      logger.debug(`操作：${orderData.action.toUpperCase()}`);
      logger.debug(`數量：${orderData.qty}`);
      logger.debug(`當前價格：${orderData.price}`);
      logger.debug(`限價：${orderData.limit_price}`);
      logger.debug(`止盈設置：${orderData.take_profit.points} 點${orderData.take_profit.is_percentage ? ' (百分比)' : ''}`);
      logger.debug(`止損設置：${orderData.stop_loss.points} 點${orderData.stop_loss.is_percentage ? ' (百分比)' : ''}\n`);

      // Call trading service to create order (including main order, take-profit order, and stop-loss order)
      const result = await tradingService.createOrder(orderData);

      // Check order creation result, return error if failed
      if (!result.success) {
        logger.error(`[訂單錯誤] ${result.error || 'Unknown error'}`);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: result.error });
      }

      // Return success response
      logger.info(`[訂單成功] 訂單創建成功`);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Order created successfully',
        orderResult: result
      });
    } catch (error) {
      logger.error(`[系統錯誤] 處理訂單時發生錯誤: `, error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to process order',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  function initScheduledTasks() {
    logger.info('[排程] 初始化排程任務 - 設置自動檢查持倉和清理訂單的排程');

    // Schedule task to run at minute 4, 8, 12, 16, ... of each hour
    cron.schedule('4,9,14,19,24,29,34,39,44,49,54,59 * * * *', async () => {
      const currentTime = new Date();
      logger.info(`[排程] 執行定時任務 - ${currentTime.toISOString()} - 檢查持倉和清理訂單`);

      try {
        // Check positions and clear orders
        await tradingService.checkPositionsAndClearOrders(Object.values(SymbolType));

        logger.info(`[排程] 定時任務執行完成 - ${new Date().toISOString()}`);
      } catch (error) {
        logger.error('[排程][錯誤] 執行定時任務時發生錯誤:', error);
      }
    }, {
      scheduled: true,
      timezone: "Asia/Taipei" // Adjust timezone as needed
    });

    logger.info('[排程] 已成功設置排程任務');
  }

  if (needClearOrder) {
    initScheduledTasks();
  }

  return router;
}