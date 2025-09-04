const { logger } = require('../utils/logger');
const { cacheSet, cacheGet } = require('../database/redis');
const Trade = require('../database/models/Trade');
const Token = require('../database/models/Token');

class RiskManager {
  constructor() {
    this.isInitialized = false;
    this.maxPortfolioRisk = 0.05; // 5% max portfolio risk per trade
    this.maxDailyLoss = 0.10; // 10% max daily loss
    this.maxDrawdown = 0.25; // 25% max drawdown
    this.positionSizing = 'KELLY'; // KELLY, FIXED, PERCENTAGE
    this.stopLossStrategy = 'TRAILING'; // TRAILING, FIXED, ATR
    this.riskMetrics = {};
  }

  async initialize() {
    try {
      logger.info('🛡️ Initializing Risk Manager...');
      
      // Load risk configurations
      await this.loadRiskConfigurations();
      
      // Initialize risk monitoring
      await this.initializeRiskMonitoring();
      
      this.isInitialized = true;
      logger.info('✅ Risk Manager initialized successfully');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Risk Manager:', error);
      throw error;
    }
  }

  async loadRiskConfigurations() {
    // Load risk configurations from environment or config file
    this.maxPortfolioRisk = parseFloat(process.env.MAX_PORTFOLIO_RISK) || 0.05;
    this.maxDailyLoss = parseFloat(process.env.MAX_DAILY_LOSS) || 0.10;
    this.maxDrawdown = parseFloat(process.env.MAX_DRAWDOWN) || 0.25;
    this.positionSizing = process.env.POSITION_SIZING || 'KELLY';
    this.stopLossStrategy = process.env.STOP_LOSS_STRATEGY || 'TRAILING';
    
    logger.info(`🛡️ Risk configurations loaded: Portfolio Risk: ${this.maxPortfolioRisk * 100}%, Daily Loss: ${this.maxDailyLoss * 100}%, Drawdown: ${this.maxDrawdown * 100}%`);
  }

  async initializeRiskMonitoring() {
    // Start periodic risk monitoring
    setInterval(async () => {
      await this.updateRiskMetrics();
    }, 60000); // Every minute
    
    // Initial risk metrics update
    await this.updateRiskMetrics();
  }

  async updateRiskMetrics() {
    try {
      const metrics = await this.calculateRiskMetrics();
      this.riskMetrics = metrics;
      
      // Cache risk metrics
      await cacheSet('risk_metrics', metrics, 300); // 5 minutes
      
      // Check for risk alerts
      await this.checkRiskAlerts(metrics);
      
    } catch (error) {
      logger.error('Failed to update risk metrics:', error);
    }
  }

  async calculateRiskMetrics() {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Get recent trades
    const recentTrades = await Trade.find({
      timestamp: { $gte: oneDayAgo }
    });
    
    const weeklyTrades = await Trade.find({
      timestamp: { $gte: oneWeekAgo }
    });
    
    // Calculate daily P&L
    const dailyPnL = recentTrades.reduce((sum, trade) => sum + (trade.profitLoss || 0), 0);
    
    // Calculate weekly P&L
    const weeklyPnL = weeklyTrades.reduce((sum, trade) => sum + (trade.profitLoss || 0), 0);
    
    // Calculate portfolio value (simplified)
    const portfolioValue = 10000; // This would come from actual wallet balances
    const dailyReturn = dailyPnL / portfolioValue;
    const weeklyReturn = weeklyPnL / portfolioValue;
    
    // Calculate drawdown
    const drawdown = await this.calculateDrawdown(weeklyTrades);
    
    // Calculate VaR (Value at Risk)
    const var95 = await this.calculateVaR(recentTrades, 0.95);
    
    // Calculate Sharpe ratio
    const sharpeRatio = await this.calculateSharpeRatio(weeklyTrades);
    
    // Calculate max position size
    const maxPositionSize = this.calculateMaxPositionSize(portfolioValue);
    
    return {
      timestamp: now,
      portfolioValue,
      dailyPnL,
      dailyReturn,
      weeklyPnL,
      weeklyReturn,
      drawdown,
      var95,
      sharpeRatio,
      maxPositionSize,
      riskLevel: this.assessRiskLevel(dailyReturn, drawdown),
      alerts: []
    };
    
  } catch (error) {
    logger.error('Failed to calculate risk metrics:', error);
    throw error;
  }
}

  async calculateDrawdown(trades) {
    if (trades.length === 0) return 0;
    
    let peak = 0;
    let current = 0;
    let maxDrawdown = 0;
    
    for (const trade of trades) {
      current += trade.profitLoss || 0;
      if (current > peak) {
        peak = current;
      }
      
      const drawdown = (peak - current) / Math.max(peak, 1);
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    return maxDrawdown;
  }

  async calculateVaR(trades, confidence) {
    if (trades.length === 0) return 0;
    
    const returns = trades.map(trade => (trade.profitLoss || 0) / 10000); // Normalized returns
    returns.sort((a, b) => a - b);
    
    const index = Math.floor((1 - confidence) * returns.length);
    return returns[index] || 0;
  }

  async calculateSharpeRatio(trades) {
    if (trades.length === 0) return 0;
    
    const returns = trades.map(trade => (trade.profitLoss || 0) / 10000);
    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    // Assuming risk-free rate of 0 for simplicity
    return stdDev > 0 ? avgReturn / stdDev : 0;
  }

  calculateMaxPositionSize(portfolioValue) {
    switch (this.positionSizing) {
      case 'KELLY':
        // Kelly Criterion for position sizing
        const winRate = 0.6; // This would be calculated from actual trade history
        const avgWin = 0.1; // 10% average win
        const avgLoss = 0.05; // 5% average loss
        const kellyFraction = (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin;
        return Math.max(0, Math.min(kellyFraction, 0.25)); // Cap at 25%
        
      case 'FIXED':
        return 0.05; // 5% fixed position size
        
      case 'PERCENTAGE':
        return this.maxPortfolioRisk; // Use portfolio risk limit
        
      default:
        return 0.05;
    }
  }

  assessRiskLevel(dailyReturn, drawdown) {
    if (dailyReturn < -this.maxDailyLoss || drawdown > this.maxDrawdown) {
      return 'CRITICAL';
    } else if (dailyReturn < -this.maxDailyLoss * 0.5 || drawdown > this.maxDrawdown * 0.8) {
      return 'HIGH';
    } else if (dailyReturn < 0 || drawdown > this.maxDrawdown * 0.5) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  async checkRiskAlerts(metrics) {
    const alerts = [];
    
    // Daily loss alert
    if (metrics.dailyReturn < -this.maxDailyLoss) {
      alerts.push({
        type: 'DAILY_LOSS_LIMIT',
        severity: 'HIGH',
        message: `Daily loss limit exceeded: ${(metrics.dailyReturn * 100).toFixed(2)}%`,
        timestamp: new Date()
      });
    }
    
    // Drawdown alert
    if (metrics.drawdown > this.maxDrawdown) {
      alerts.push({
        type: 'DRAWDOWN_LIMIT',
        severity: 'CRITICAL',
        message: `Maximum drawdown exceeded: ${(metrics.drawdown * 100).toFixed(2)}%`,
        timestamp: new Date()
      });
    }
    
    // VaR alert
    if (Math.abs(metrics.var95) > this.maxPortfolioRisk) {
      alerts.push({
        type: 'VAR_LIMIT',
        severity: 'MEDIUM',
        message: `VaR limit exceeded: ${(Math.abs(metrics.var95) * 100).toFixed(2)}%`,
        timestamp: new Date()
      });
    }
    
    // Update metrics with alerts
    metrics.alerts = alerts;
    
    // Log alerts
    for (const alert of alerts) {
      logger.warn(`🚨 Risk Alert [${alert.severity}]: ${alert.message}`);
    }
    
    return alerts;
  }

  async validateTrade(tokenData, tradeAmount, walletBalance) {
    try {
      if (!this.isInitialized) {
        throw new Error('Risk Manager not initialized');
      }

      const validation = {
        isAllowed: true,
        riskScore: 0,
        warnings: [],
        recommendations: []
      };

      // Check portfolio risk limit
      const portfolioRisk = tradeAmount / walletBalance;
      if (portfolioRisk > this.maxPortfolioRisk) {
        validation.isAllowed = false;
        validation.warnings.push(`Trade exceeds portfolio risk limit: ${(portfolioRisk * 100).toFixed(2)}% > ${(this.maxPortfolioRisk * 100).toFixed(2)}%`);
      }

      // Check token risk score
      if (tokenData.riskScore < 30) {
        validation.warnings.push(`Token has high risk score: ${tokenData.riskScore}`);
        validation.riskScore += 20;
      }

      // Check honeypot detection
      if (tokenData.honeypotDetected) {
        validation.isAllowed = false;
        validation.warnings.push('Token detected as honeypot');
        validation.riskScore += 50;
      }

      // Check liquidity
      if (tokenData.liquidityUSD < 1000) {
        validation.warnings.push('Low liquidity token');
        validation.riskScore += 15;
      }

      // Check daily loss limit
      const currentMetrics = await cacheGet('risk_metrics');
      if (currentMetrics && currentMetrics.dailyReturn < -this.maxDailyLoss * 0.8) {
        validation.warnings.push('Approaching daily loss limit');
        validation.riskScore += 10;
      }

      // Generate recommendations
      if (validation.riskScore > 50) {
        validation.recommendations.push('Consider reducing position size');
        validation.recommendations.push('Implement tighter stop-loss');
      }

      if (tokenData.riskScore < 40) {
        validation.recommendations.push('Perform additional due diligence');
        validation.recommendations.push('Consider waiting for better entry');
      }

      return validation;

    } catch (error) {
      logger.error('Trade validation failed:', error);
      throw error;
    }
  }

  async calculateOptimalPositionSize(tokenData, walletBalance, riskTolerance = 'MEDIUM') {
    try {
      const basePositionSize = this.calculateMaxPositionSize(walletBalance);
      
      // Adjust based on token risk
      let adjustedSize = basePositionSize;
      
      if (tokenData.riskScore < 30) {
        adjustedSize *= 0.5; // Reduce position for high-risk tokens
      } else if (tokenData.riskScore > 70) {
        adjustedSize *= 1.2; // Increase position for low-risk tokens
      }
      
      // Adjust based on risk tolerance
      switch (riskTolerance) {
        case 'CONSERVATIVE':
          adjustedSize *= 0.7;
          break;
        case 'AGGRESSIVE':
          adjustedSize *= 1.3;
          break;
        default:
          // BALANCED - no adjustment
          break;
      }
      
      // Ensure within limits
      adjustedSize = Math.max(0.01, Math.min(adjustedSize, this.maxPortfolioRisk));
      
      return {
        percentage: adjustedSize,
        amount: walletBalance * adjustedSize,
        riskLevel: this.assessRiskLevel(0, 0), // Simplified
        reasoning: `Base: ${(basePositionSize * 100).toFixed(1)}%, Adjusted: ${(adjustedSize * 100).toFixed(1)}%`
      };
      
    } catch (error) {
      logger.error('Position size calculation failed:', error);
      throw error;
    }
  }

  async getRiskReport() {
    try {
      const metrics = await cacheGet('risk_metrics') || this.riskMetrics;
      
      return {
        ...metrics,
        riskLimits: {
          maxPortfolioRisk: this.maxPortfolioRisk,
          maxDailyLoss: this.maxDailyLoss,
          maxDrawdown: this.maxDrawdown
        },
        positionSizing: this.positionSizing,
        stopLossStrategy: this.stopLossStrategy
      };
      
    } catch (error) {
      logger.error('Failed to get risk report:', error);
      throw error;
    }
  }

  async updateRiskLimits(newLimits) {
    try {
      if (newLimits.maxPortfolioRisk !== undefined) {
        this.maxPortfolioRisk = Math.max(0.01, Math.min(0.20, newLimits.maxPortfolioRisk));
      }
      
      if (newLimits.maxDailyLoss !== undefined) {
        this.maxDailyLoss = Math.max(0.05, Math.min(0.30, newLimits.maxDailyLoss));
      }
      
      if (newLimits.maxDrawdown !== undefined) {
        this.maxDrawdown = Math.max(0.10, Math.min(0.50, newLimits.maxDrawdown));
      }
      
      logger.info(`🛡️ Risk limits updated: Portfolio: ${(this.maxPortfolioRisk * 100).toFixed(1)}%, Daily: ${(this.maxDailyLoss * 100).toFixed(1)}%, Drawdown: ${(this.maxDrawdown * 100).toFixed(1)}%`);
      
      // Save to cache
      await cacheSet('risk_limits', {
        maxPortfolioRisk: this.maxPortfolioRisk,
        maxDailyLoss: this.maxDailyLoss,
        maxDrawdown: this.maxDrawdown
      }, 86400); // 24 hours
      
    } catch (error) {
      logger.error('Failed to update risk limits:', error);
      throw error;
    }
  }
}

module.exports = {
  RiskManager,
  initializeRiskManager: async () => {
    const riskManager = new RiskManager();
    await riskManager.initialize();
    return riskManager;
  }
};
