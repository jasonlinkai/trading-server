import { Request, Response, NextFunction } from 'express';

export const validateIp = (req: Request, res: Response, next: NextFunction) => {
  // 允許 /api/format 端點繞過 IP 限制
  if (req.path === '/api/format') {
    console.log(`[IP BYPASS] 允許訪問 API 格式說明端點: ${req.ip || req.connection.remoteAddress}`);
    return next();
  }

  // 允許健康檢查端點繞過 IP 限制
  if (req.path === '/health') {
    return next();
  }

  const clientIp = req.ip || req.connection.remoteAddress;
  const allowedIps = process.env.ALLOWED_IPS?.split(',') || [];
  console.log(`[IP CHECK] 檢查 IP: ${clientIp} 是否在白名單中: ${allowedIps}`);
  // 檢查是否是 localhost 或 127.0.0.1
  if (clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === 'localhost') {
    return next();
  }

  if (!clientIp || !allowedIps.includes(clientIp)) {
    return res.status(403).json({ error: 'Access denied. IP not in whitelist.' });
  }

  next();
}; 