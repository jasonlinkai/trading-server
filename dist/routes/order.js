"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderRouter = void 0;
const express_1 = require("express");
const tradingServiceFactory_1 = require("../services/tradingServiceFactory");
const formatting_1 = require("../utils/formatting");
const constants_1 = require("../constants");
// 創建 Express 路由處理器
exports.orderRouter = (0, express_1.Router)();
// 創建交易服務實例，用於與交易所 API 交互
const tradingService = tradingServiceFactory_1.TradingServiceFactory.createService(constants_1.EXCHANGE_TYPE, constants_1.API_KEY || '', constants_1.API_SECRET || '', constants_1.IS_TESTNET);
// 定義 POST /api/order 路由，處理交易訂單的創建請求
exports.orderRouter.post('/', async (req, res) => {
    try {
        // 打印請求信息到控制台，便於調試和監控
        console.log(`\n[請求信息] API 請求詳情：`);
        console.log(`請求時間：${new Date().toISOString()}`);
        console.log(`請求方法：${req.method}`);
        console.log(`請求路徑：${req.path}`);
        console.log(`Content-Type：${req.headers['content-type']}`);
        console.log(`請求參數：\n${(0, formatting_1.formatResponse)(req.body)}\n`);
        // 從請求體中提取訂單數據
        const orderData = req.body;
        // 驗證必填字段
        if (!orderData.action || !orderData.symbol || !orderData.qty) {
            const error = `${constants_1.ERROR_MESSAGES.MISSING_FIELDS}: action, symbol, qty`;
            console.error(`[驗證錯誤] ${error}`);
            return res.status(constants_1.HTTP_STATUS.BAD_REQUEST).json({ error });
        }
        // 驗證止盈和止損參數
        if (!orderData.take_profit?.points || !orderData.stop_loss?.points) {
            const error = `${constants_1.ERROR_MESSAGES.MISSING_FIELDS}: take_profit.points, stop_loss.points`;
            console.error(`[驗證錯誤] ${error}`);
            return res.status(constants_1.HTTP_STATUS.BAD_REQUEST).json({ error });
        }
        // 驗證交易動作值必須是 buy 或 sell
        if (![constants_1.TRADE_ACTIONS.BUY, constants_1.TRADE_ACTIONS.SELL].includes(orderData.action.toLowerCase())) {
            const error = constants_1.ERROR_MESSAGES.INVALID_ACTION;
            console.error(`[驗證錯誤] ${error}`);
            return res.status(constants_1.HTTP_STATUS.BAD_REQUEST).json({ error });
        }
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
            return res.status(constants_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: result.error });
        }
        // 訂單創建成功，打印訂單信息
        console.log(`\n[訂單成功] 主訂單已成功創建`);
        console.log(`[訂單詳情] 主訂單信息：\n${(0, formatting_1.formatResponse)(result.order)}\n`);
        // 如果創建了止盈訂單，打印止盈訂單信息
        if (result.takeProfitOrder) {
            console.log(`[止盈訂單] 止盈訂單信息：\n${(0, formatting_1.formatResponse)(result.takeProfitOrder)}\n`);
        }
        // 如果創建了止損訂單，打印止損訂單信息
        if (result.stopLossOrder) {
            console.log(`[止損訂單] 止損訂單信息：\n${(0, formatting_1.formatResponse)(result.stopLossOrder)}\n`);
        }
        // 獲取交易後的當前持倉信息
        const position = await tradingService.getPosition(orderData.symbol);
        console.log(`[持倉信息] 當前持倉：\n${(0, formatting_1.formatResponse)(position)}\n`);
        // 獲取交易後的賬戶餘額
        const balance = await tradingService.getBalance();
        console.log(`[賬戶餘額] 當前餘額：\n${(0, formatting_1.formatResponse)(balance)}\n`);
        // 構建返回給客戶端的響應數據
        const response = {
            message: 'Order executed successfully',
            order: result.order, // 主訂單信息
            takeProfitOrder: result.takeProfitOrder, // 止盈訂單信息
            stopLossOrder: result.stopLossOrder, // 止損訂單信息
            position: position, // 當前持倉
            balance: balance, // 當前餘額
            timestamp: new Date().toISOString() // 響應時間戳
        };
        console.log(`\n[請求完成] 訂單處理完成`);
        // 返回成功響應和數據
        res.status(constants_1.HTTP_STATUS.OK).json(response);
    }
    catch (error) {
        // 捕獲並處理處理過程中的任何錯誤
        console.error(`[系統錯誤] 處理訂單時發生錯誤：`, error);
        res.status(constants_1.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            error: constants_1.ERROR_MESSAGES.FAILED_TO_PROCESS,
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
