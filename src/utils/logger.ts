import winston from 'winston';
import 'winston-daily-rotate-file';

// 確保日誌目錄存在
const logDir = 'logs';

// 創建 Winston logger 實例
const logger = winston.createLogger({
    transports: [
        new winston.transports.DailyRotateFile({
            level: 'debug',
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
                winston.format.printf((info) => `${info.timestamp}[${info.level}] ${info.message}`)
            ),
            filename: `trading-server-%DATE%.log`,
            dirname: logDir,
            datePattern: 'YYYY-MM-DD-HH',
            frequency: '1h',
            maxSize: '20m',
            maxFiles: '3d'
        }),
        new winston.transports.Console({
            level: 'debug',
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
                winston.format.printf((info) => `${info.timestamp}[${info.level}] ${info.message}`)
            ),
        })
    ]
});

export default logger; 