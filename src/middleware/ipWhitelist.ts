import { Request, Response, NextFunction } from 'express';
import { API_PATHS } from '../enums';
import logger from '../utils/logger';

export const validateIp = (req: Request, res: Response, next: NextFunction) => {
  // 允許不受限制訪問的端點
  if (req.path === API_PATHS.FORMAT || req.path === API_PATHS.HEALTH) {
    logger.debug(`[IP BYPASS] 允許訪問 API 格式說明端點: ${req.ip || req.connection.remoteAddress}`);
    return next();
  }

  // 從環境變數獲取允許的 IP 列表
  const allowedIps = process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',') : [];

  // 支持 Cloudflare, Nginx, 和標準代理設置
  const clientIp = req.headers['cf-connecting-ip'] as string || // Cloudflare
    req.headers['x-real-ip'] as string || // Nginx
    req.headers['x-forwarded-for'] as string || // 標準代理頭
    req.ip || req.connection.remoteAddress || ''; // 直接連接

  logger.debug(`[IP CHECK] 檢查 IP: ${clientIp} 是否在白名單中: ${allowedIps}`);

  // 檢查 IP 是否在允許列表中
  // 在開發環境或未配置白名單時，允許所有連接
  if (process.env.NODE_ENV !== 'production' || allowedIps.length === 0 || allowedIps.includes(clientIp)) {
    return next();
  }

  // 如果 IP 不在允許列表中，返回 403 錯誤
  return res.status(403).json({
    error: 'Access denied',
    message: 'Your IP is not allowed to access this resource'
  });
}; 