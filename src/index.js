const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { logger } = require('./utils/logger');
const { connectDB } = require('./database/connection');
const { initializeRedis } = require('./database/redis');
const { initializeAxiom } = require('./services/axiom');
const { initializeSniper } = require('./core/sniper');
const { initializeNotifier } = require('./notifications/notifier');
const { initializeAI } = require('./ai/aiManager');
const { initializeRiskManager } = require('./risk/riskManager');

const apiRoutes = require('./api/routes');
const { errorHandler } = require('./middleware/errorHandler');

class CoinSniper {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      logger.info('🚀 Initializing CoinSniper...');

      // Initialize core services
      await this.initializeServices();
      
      // Setup middleware
      this.setupMiddleware();
      
      // Setup routes
      this.setupRoutes();
      
      // Setup error handling
      this.setupErrorHandling();
      
      this.isInitialized = true;
      logger.info('✅ CoinSniper initialized successfully');
      
    } catch (error) {
      logger.error('❌ Failed to initialize CoinSniper:', error);
      process.exit(1);
    }
  }

  async initializeServices() {
    // Initialize database connections
    await connectDB();
    await initializeRedis();
    
    // Initialize Axiom service (primary data source)
    await initializeAxiom();
    
    // Initialize core components
    await initializeSniper();
    await initializeNotifier();
    await initializeAI();
    await initializeRiskManager();
    
    logger.info('✅ All services initialized');
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(compression());
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.'
    });
    this.app.use('/api/', limiter);
    
    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });
    
    // Serve static files (dashboard)
    this.app.use(express.static('public'));
    
    // API routes
    this.app.use('/api', apiRoutes);
    
    // Dashboard route
    this.app.get('/', (req, res) => {
      res.sendFile(__dirname + '/../public/dashboard.html');
    });
    
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Route not found' });
    });
  }

  setupErrorHandling() {
    this.app.use(errorHandler);
  }

  async start() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    this.server = this.app.listen(this.port, () => {
      logger.info(`🚀 CoinSniper running on port ${this.port}`);
      logger.info(`📊 Dashboard: http://localhost:${this.port}`);
      logger.info(`🔍 API: http://localhost:${this.port}/api`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());
  }

  async gracefulShutdown() {
    logger.info('🛑 Shutting down CoinSniper...');
    
    if (this.server) {
      this.server.close(() => {
        logger.info('✅ HTTP server closed');
        process.exit(0);
      });
    }
    
    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('❌ Forced shutdown');
      process.exit(1);
    }, 10000);
  }
}

// Start the application
const coinSniper = new CoinSniper();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the bot
coinSniper.start().catch((error) => {
  logger.error('Failed to start CoinSniper:', error);
  process.exit(1);
});

module.exports = coinSniper;
