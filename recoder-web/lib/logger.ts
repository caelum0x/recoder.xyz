import winston from 'winston';

const isDevelopment = process.env.NODE_ENV === 'development';

const logger = winston.createLogger({
  level: isDevelopment ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'recoder-web' },
  transports: [
    new winston.transports.Console({
      format: isDevelopment
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        : winston.format.json()
    })
  ]
});

export default logger;