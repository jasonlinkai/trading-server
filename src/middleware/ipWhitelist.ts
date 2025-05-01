import { Request, Response, NextFunction } from 'express';

export const validateIp = (req: Request, res: Response, next: NextFunction) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  const allowedIps = process.env.ALLOWED_IPS?.split(',') || [];

  // 檢查是否是 localhost 或 127.0.0.1
  if (clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === 'localhost') {
    return next();
  }

  if (!clientIp || !allowedIps.includes(clientIp)) {
    return res.status(403).json({ error: 'Access denied. IP not in whitelist.' });
  }

  next();
}; 