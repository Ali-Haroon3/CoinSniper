const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = ` ${JSON.stringify(meta)}`;
    }
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: fileFormat,
  defaultMeta: { service: 'coinsniper' },
  transports: [
    // Error log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // Daily rotating file
    new winston.transports.File({
      filename: path.join(logsDir, 'daily.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 30
    })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Add production console transport with reduced verbosity
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.Console({
    level: 'warn',
    format: consoleFormat
  }));
}

// Create a stream object for Morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

// Helper methods for common logging patterns
logger.logTrade = (action, token, network, details = {}) => {
  logger.info(`💰 ${action.toUpperCase()}: ${token.symbol} (${network})`, {
    action,
    token: token.symbol,
    address: token.address,
    network,
    ...details
  });
};

logger.logAnalysis = (token, score, risk, potential) => {
  logger.info(`🔍 Analysis: ${token.symbol} - Score: ${score}, Risk: ${risk}, Potential: ${potential}x`, {
    token: token.symbol,
    address: token.address,
    score,
    risk,
    potential
  });
};

logger.logError = (error, context = {}) => {
  logger.error('❌ Error occurred', {
    error: error.message,
    stack: error.stack,
    ...context
  });
};

logger.logPerformance = (metric, value, details = {}) => {
  logger.info(`📊 Performance: ${metric} = ${value}`, {
    metric,
    value,
    ...details
  });
};

logger.logNetwork = (network, action, details = {}) => {
  logger.info(`🌐 ${network.toUpperCase()}: ${action}`, {
    network,
    action,
    ...details
  });
};

logger.logSecurity = (event, details = {}) => {
  logger.warn(`🔒 Security: ${event}`, {
    event,
    timestamp: new Date().toISOString(),
    ...details
  });
};

// Export the logger
module.exports = { logger };
