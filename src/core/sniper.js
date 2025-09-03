const { ethers } = require('ethers');
const { logger } = require('../utils/logger');
const { TokenAnalyzer } = require('./tokenAnalyzer');
const { TradeExecutor } = require('./tradeExecutor');
const { LiquidityMonitor } = require('./liquidityMonitor');
const { ProfitCalculator } = require('./profitCalculator');
const { RiskAssessor } = require('./riskAssessor');
const { NotificationManager } = require('../notifications/notificationManager');
const { DatabaseManager } = require('../database/databaseManager');
const { AISentimentAnalyzer } = require('../ai/sentimentAnalyzer');

class MemecoinSniper {
  constructor() {
    this.isRunning = false;
    this.activeTrades = new Map();
    this.tokenQueue = [];
    this.providers = new Map();
    this.analyzers = new Map();
    this.executors = new Map();
    this.monitors = new Map();
    this.profitCalculator = new ProfitCalculator();
    this.riskAssessor = new RiskAssessor();
    this.notificationManager = new NotificationManager();
    this.databaseManager = new DatabaseManager();
    this.sentimentAnalyzer = new AISentimentAnalyzer();
    
    this.config = require('../../config.json');
    this.scanInterval = null;
    this.profitTargets = new Map();
    this.stopLosses = new Map();
  }

  async initialize() {
    try {
      logger.info('🔍 Initializing Memecoin Sniper...');
      
      // Initialize providers for each network
      await this.initializeProviders();
      
      // Initialize analyzers and executors
      await this.initializeComponents();
      
      // Load existing trades from database
      await this.loadExistingTrades();
      
      logger.info('✅ Memecoin Sniper initialized successfully');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Memecoin Sniper:', error);
      throw error;
    }
  }

  async initializeProviders() {
    for (const [network, config] of Object.entries(this.config.networks)) {
      try {
        const provider = new ethers.JsonRpcProvider(config.rpc);
        this.providers.set(network, provider);
        
        // Test connection
        await provider.getNetwork();
        logger.info(`✅ ${network} provider initialized`);
        
      } catch (error) {
        logger.error(`❌ Failed to initialize ${network} provider:`, error);
      }
    }
  }

  async initializeComponents() {
    for (const [network, provider] of this.providers) {
      // Initialize token analyzer
      const analyzer = new TokenAnalyzer(provider, network);
      this.analyzers.set(network, analyzer);
      
      // Initialize trade executor
      const executor = new TradeExecutor(provider, network, this.config);
      this.executors.set(network, executor);
      
      // Initialize liquidity monitor
      const monitor = new LiquidityMonitor(provider, network);
      this.monitors.set(network, monitor);
      
      logger.info(`✅ ${network} components initialized`);
    }
  }

  async start() {
    if (this.isRunning) {
      logger.warn('⚠️ Sniper is already running');
      return;
    }

    try {
      this.isRunning = true;
      logger.info('🚀 Starting Memecoin Sniper...');
      
      // Start scanning for new tokens
      this.startScanning();
      
      // Start monitoring active trades
      this.startTradeMonitoring();
      
      // Start profit optimization
      this.startProfitOptimization();
      
      logger.info('✅ Memecoin Sniper started successfully');
      
    } catch (error) {
      this.isRunning = false;
      logger.error('❌ Failed to start Memecoin Sniper:', error);
      throw error;
    }
  }

  async stop() {
    if (!this.isRunning) {
      logger.warn('⚠️ Sniper is not running');
      return;
    }

    try {
      this.isRunning = false;
      logger.info('🛑 Stopping Memecoin Sniper...');
      
      // Clear intervals
      if (this.scanInterval) {
        clearInterval(this.scanInterval);
        this.scanInterval = null;
      }
      
      // Close active trades
      await this.closeAllTrades();
      
      logger.info('✅ Memecoin Sniper stopped successfully');
      
    } catch (error) {
      logger.error('❌ Error stopping Memecoin Sniper:', error);
    }
  }

  startScanning() {
    const scanInterval = this.config.sniper.scanInterval || 1000;
    
    this.scanInterval = setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        await this.scanForNewTokens();
      } catch (error) {
        logger.error('Error during token scanning:', error);
      }
    }, scanInterval);
    
    logger.info(`🔍 Token scanning started (${scanInterval}ms interval)`);
  }

  async scanForNewTokens() {
    for (const [network, provider] of this.providers) {
      try {
        const analyzer = this.analyzers.get(network);
        const newTokens = await analyzer.scanForNewTokens();
        
        for (const token of newTokens) {
          await this.analyzeAndQueueToken(token, network);
        }
        
      } catch (error) {
        logger.error(`Error scanning ${network}:`, error);
      }
    }
  }

  async analyzeAndQueueToken(token, network) {
    try {
      // Skip if already in queue or analyzed
      if (this.tokenQueue.some(t => t.address === token.address)) {
        return;
      }
      
      // Quick initial analysis
      const initialAnalysis = await this.performQuickAnalysis(token, network);
      
      if (initialAnalysis.isPromising) {
        // Add to queue for detailed analysis
        this.tokenQueue.push({
          token,
          network,
          timestamp: Date.now(),
          initialScore: initialAnalysis.score
        });
        
        logger.info(`🎯 Token queued: ${token.symbol} (${network}) - Score: ${initialAnalysis.score}`);
        
        // Process queue if not at capacity
        if (this.tokenQueue.length <= this.config.sniper.maxConcurrentTrades) {
          this.processTokenQueue();
        }
      }
      
    } catch (error) {
      logger.error(`Error analyzing token ${token.address}:`, error);
    }
  }

  async performQuickAnalysis(token, network) {
    try {
      const analyzer = this.analyzers.get(network);
      
      // Perform quick checks
      const checks = await Promise.all([
        analyzer.checkHoneypot(token.address),
        analyzer.checkLiquidity(token.address),
        analyzer.checkContractAge(token.address),
        analyzer.checkOwnership(token.address)
      ]);
      
      const [isHoneypot, hasLiquidity, contractAge, ownership] = checks;
      
      // Calculate quick score
      let score = 0;
      
      if (!isHoneypot) score += 30;
      if (hasLiquidity) score += 25;
      if (contractAge <= 300) score += 20; // Prefer newer contracts
      if (ownership.renounced) score += 25;
      
      const isPromising = score >= 70 && !isHoneypot && hasLiquidity;
      
      return { isPromising, score, checks };
      
    } catch (error) {
      logger.error(`Quick analysis failed for ${token.address}:`, error);
      return { isPromising: false, score: 0, checks: {} };
    }
  }

  async processTokenQueue() {
    if (this.tokenQueue.length === 0) return;
    
    // Sort by score and timestamp
    this.tokenQueue.sort((a, b) => {
      if (b.initialScore !== a.initialScore) {
        return b.initialScore - a.initialScore;
      }
      return a.timestamp - b.timestamp;
    });
    
    const tokenData = this.tokenQueue.shift();
    
    try {
      await this.performDetailedAnalysis(tokenData);
    } catch (error) {
      logger.error(`Detailed analysis failed for ${tokenData.token.address}:`, error);
    }
  }

  async performDetailedAnalysis(tokenData) {
    const { token, network } = tokenData;
    
    try {
      const analyzer = this.analyzers.get(network);
      
      // Perform comprehensive analysis
      const analysis = await analyzer.performFullAnalysis(token.address);
      
      // AI sentiment analysis
      const sentiment = await this.sentimentAnalyzer.analyzeToken(token, network);
      
      // Risk assessment
      const riskScore = await this.riskAssessor.assessToken(token, analysis, network);
      
      // Profit potential calculation
      const profitPotential = await this.profitCalculator.calculatePotential(token, analysis, network);
      
      // Final decision
      const shouldTrade = this.makeTradingDecision(analysis, sentiment, riskScore, profitPotential);
      
      if (shouldTrade) {
        await this.executeTrade(token, network, analysis, profitPotential);
      } else {
        logger.info(`❌ Token rejected: ${token.symbol} - Risk: ${riskScore}, Profit: ${profitPotential}`);
      }
      
    } catch (error) {
      logger.error(`Detailed analysis failed for ${token.address}:`, error);
    }
  }

  makeTradingDecision(analysis, sentiment, riskScore, profitPotential) {
    // Risk threshold
    if (riskScore > 70) return false;
    
    // Minimum profit threshold
    if (profitPotential < 200) return false; // 2x minimum
    
    // Sentiment threshold
    if (sentiment.score < 60) return false;
    
    // Contract quality checks
    if (!analysis.isVerified && !analysis.isAudited) return false;
    
    // Liquidity checks
    if (analysis.liquidity < this.config.trading.minLiquidity) return false;
    
    return true;
  }

  async executeTrade(token, network, analysis, profitPotential) {
    try {
      const executor = this.executors.get(network);
      
      // Calculate position size
      const positionSize = this.calculatePositionSize(profitPotential, analysis.risk);
      
      // Execute buy order
      const trade = await executor.executeBuy(token.address, positionSize, {
        slippage: this.config.trading.maxSlippage,
        gasPrice: this.getOptimalGasPrice(network),
        deadline: Math.floor(Date.now() / 1000) + 300 // 5 minutes
      });
      
      if (trade.success) {
        // Add to active trades
        this.activeTrades.set(trade.hash, {
          token,
          network,
          trade,
          entryPrice: trade.price,
          positionSize,
          timestamp: Date.now(),
          analysis,
          profitPotential
        });
        
        // Set profit targets and stop loss
        this.setProfitTargets(trade.hash, trade.price, profitPotential);
        
        // Notify
        await this.notificationManager.notifyTradeEntry(trade, token, network);
        
        logger.info(`✅ Trade executed: ${token.symbol} - Hash: ${trade.hash}`);
        
        // Save to database
        await this.databaseManager.saveTrade(trade, token, network);
        
      } else {
        logger.error(`❌ Trade failed: ${token.symbol} - ${trade.error}`);
      }
      
    } catch (error) {
      logger.error(`Error executing trade for ${token.symbol}:`, error);
    }
  }

  calculatePositionSize(profitPotential, risk) {
    const baseSize = this.config.trading.minBuyAmount;
    const maxSize = this.config.trading.maxBuyAmount;
    
    // Adjust size based on profit potential and risk
    let size = baseSize;
    
    if (profitPotential > 500) size *= 1.5; // 5x+ potential
    if (profitPotential > 1000) size *= 2; // 10x+ potential
    
    if (risk < 30) size *= 1.2; // Low risk
    if (risk > 50) size *= 0.8; // High risk
    
    return Math.min(size, maxSize);
  }

  getOptimalGasPrice(network) {
    const networkConfig = this.config.networks[network];
    const baseGasPrice = networkConfig.gasPrice;
    
    if (baseGasPrice === 'auto') {
      // Implement dynamic gas price calculation
      return 'auto';
    }
    
    return ethers.parseUnits(baseGasPrice, 'gwei');
  }

  setProfitTargets(tradeHash, entryPrice, profitPotential) {
    const trade = this.activeTrades.get(tradeHash);
    if (!trade) return;
    
    // Set multiple profit targets
    const targets = [
      { percentage: 50, size: 0.3 }, // Take 30% profit at 50% gain
      { percentage: 100, size: 0.3 }, // Take 30% profit at 100% gain
      { percentage: profitPotential * 0.7, size: 0.4 } // Take remaining at 70% of potential
    ];
    
    this.profitTargets.set(tradeHash, targets);
    
    // Set stop loss
    const stopLoss = entryPrice * (1 - this.config.trading.stopLoss / 100);
    this.stopLosses.set(tradeHash, stopLoss);
  }

  startTradeMonitoring() {
    setInterval(async () => {
      if (!this.isRunning) return;
      
      for (const [tradeHash, trade] of this.activeTrades) {
        try {
          await this.monitorTrade(tradeHash, trade);
        } catch (error) {
          logger.error(`Error monitoring trade ${tradeHash}:`, error);
        }
      }
    }, 5000); // Check every 5 seconds
    
    logger.info('📊 Trade monitoring started');
  }

  async monitorTrade(tradeHash, trade) {
    try {
      const monitor = this.monitors.get(trade.network);
      const currentPrice = await monitor.getCurrentPrice(trade.token.address);
      
      if (!currentPrice) return;
      
      const entryPrice = trade.entryPrice;
      const currentProfit = ((currentPrice - entryPrice) / entryPrice) * 100;
      
      // Check profit targets
      await this.checkProfitTargets(tradeHash, trade, currentPrice, currentProfit);
      
      // Check stop loss
      await this.checkStopLoss(tradeHash, trade, currentPrice, currentProfit);
      
      // Update trade data
      trade.currentPrice = currentPrice;
      trade.currentProfit = currentProfit;
      
    } catch (error) {
      logger.error(`Error monitoring trade ${tradeHash}:`, error);
    }
  }

  async checkProfitTargets(tradeHash, trade, currentPrice, currentProfit) {
    const targets = this.profitTargets.get(tradeHash);
    if (!targets) return;
    
    for (const target of targets) {
      if (currentProfit >= target.percentage && !target.hit) {
        await this.executePartialSell(tradeHash, trade, target.size);
        target.hit = true;
      }
    }
  }

  async checkStopLoss(tradeHash, trade, currentPrice, currentProfit) {
    const stopLoss = this.stopLosses.get(tradeHash);
    if (!stopLoss) return;
    
    if (currentPrice <= stopLoss) {
      await this.executeStopLoss(tradeHash, trade);
    }
  }

  async executePartialSell(tradeHash, trade, percentage) {
    try {
      const executor = this.executors.get(trade.network);
      const sellAmount = trade.positionSize * percentage;
      
      const sellTrade = await executor.executeSell(trade.token.address, sellAmount, {
        slippage: this.config.trading.maxSlippage,
        gasPrice: this.getOptimalGasPrice(trade.network)
      });
      
      if (sellTrade.success) {
        logger.info(`💰 Partial profit taken: ${trade.token.symbol} - ${percentage * 100}% at ${trade.currentProfit.toFixed(2)}% gain`);
        
        // Update position size
        trade.positionSize -= sellAmount;
        
        // Notify
        await this.notificationManager.notifyPartialSell(sellTrade, trade, percentage);
        
      } else {
        logger.error(`❌ Partial sell failed: ${trade.token.symbol}`);
      }
      
    } catch (error) {
      logger.error(`Error executing partial sell for ${trade.token.symbol}:`, error);
    }
  }

  async executeStopLoss(tradeHash, trade) {
    try {
      const executor = this.executors.get(trade.network);
      
      const sellTrade = await executor.executeSell(trade.token.address, trade.positionSize, {
        slippage: this.config.trading.maxSlippage,
        gasPrice: this.getOptimalGasPrice(trade.network)
      });
      
      if (sellTrade.success) {
        logger.info(`🛑 Stop loss executed: ${trade.token.symbol} at ${trade.currentProfit.toFixed(2)}% loss`);
        
        // Close trade
        this.closeTrade(tradeHash);
        
        // Notify
        await this.notificationManager.notifyStopLoss(sellTrade, trade);
        
      } else {
        logger.error(`❌ Stop loss failed: ${trade.token.symbol}`);
      }
      
    } catch (error) {
      logger.error(`Error executing stop loss for ${trade.token.symbol}:`, error);
    }
  }

  closeTrade(tradeHash) {
    this.activeTrades.delete(tradeHash);
    this.profitTargets.delete(tradeHash);
    this.stopLosses.delete(tradeHash);
  }

  async closeAllTrades() {
    logger.info('🔄 Closing all active trades...');
    
    for (const [tradeHash, trade] of this.activeTrades) {
      try {
        await this.executeStopLoss(tradeHash, trade);
      } catch (error) {
        logger.error(`Error closing trade ${tradeHash}:`, error);
      }
    }
  }

  startProfitOptimization() {
    setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        await this.optimizeProfits();
      } catch (error) {
        logger.error('Error during profit optimization:', error);
      }
    }, 30000); // Every 30 seconds
    
    logger.info('📈 Profit optimization started');
  }

  async optimizeProfits() {
    // Implement advanced profit optimization strategies
    // This could include:
    // - Dynamic position sizing based on market conditions
    // - Trend following and momentum analysis
    // - Correlation analysis with other assets
    // - Market sentiment integration
  }

  async loadExistingTrades() {
    try {
      const trades = await this.databaseManager.getActiveTrades();
      
      for (const trade of trades) {
        this.activeTrades.set(trade.hash, trade);
        this.setProfitTargets(trade.hash, trade.entryPrice, trade.profitPotential);
      }
      
      logger.info(`📊 Loaded ${trades.length} existing trades`);
      
    } catch (error) {
      logger.error('Error loading existing trades:', error);
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      activeTrades: this.activeTrades.size,
      queuedTokens: this.tokenQueue.length,
      networks: Array.from(this.providers.keys()),
      uptime: process.uptime()
    };
  }

  getActiveTrades() {
    return Array.from(this.activeTrades.values());
  }

  getTokenQueue() {
    return this.tokenQueue;
  }
}

// Singleton instance
let sniperInstance = null;

const initializeSniper = async () => {
  if (!sniperInstance) {
    sniperInstance = new MemecoinSniper();
    await sniperInstance.initialize();
  }
  return sniperInstance;
};

const getSniper = () => {
  if (!sniperInstance) {
    throw new Error('Sniper not initialized. Call initializeSniper() first.');
  }
  return sniperInstance;
};

module.exports = {
  MemecoinSniper,
  initializeSniper,
  getSniper
};
