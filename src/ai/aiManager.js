const { logger } = require('../utils/logger');
const { cacheSet, cacheGet } = require('../database/redis');
const Token = require('../database/models/Token');
const Trade = require('../database/models/Trade');

class AIManager {
  constructor() {
    this.isInitialized = false;
    this.marketSentiment = 'NEUTRAL';
    this.riskTolerance = 'MEDIUM';
    this.strategyMode = 'CONSERVATIVE';
  }

  async initialize() {
    try {
      logger.info('🤖 Initializing AI Manager...');
      
      // Load AI models and configurations
      await this.loadAIModels();
      
      // Initialize market analysis
      await this.initializeMarketAnalysis();
      
      this.isInitialized = true;
      logger.info('✅ AI Manager initialized successfully');
      
    } catch (error) {
      logger.error('❌ Failed to initialize AI Manager:', error);
      throw error;
    }
  }

  async loadAIModels() {
    // Load pre-trained models for market prediction
    // This would integrate with external AI services like OpenAI, TensorFlow, etc.
    logger.info('📊 Loading AI models...');
    
    // For now, we'll use rule-based systems
    // In production, this would load actual ML models
  }

  async initializeMarketAnalysis() {
    // Initialize market sentiment analysis
    await this.updateMarketSentiment();
    
    // Start periodic market analysis
    setInterval(async () => {
      await this.updateMarketSentiment();
    }, 300000); // Every 5 minutes
  }

  async updateMarketSentiment() {
    try {
      // Analyze recent trades and market conditions
      const recentTrades = await Trade.find({
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });

      if (recentTrades.length === 0) {
        this.marketSentiment = 'NEUTRAL';
        return;
      }

      const profitableTrades = recentTrades.filter(trade => trade.profitLoss > 0);
      const profitRatio = profitableTrades.length / recentTrades.length;

      if (profitRatio >= 0.7) {
        this.marketSentiment = 'BULLISH';
      } else if (profitRatio <= 0.3) {
        this.marketSentiment = 'BEARISH';
      } else {
        this.marketSentiment = 'NEUTRAL';
      }

      logger.info(`📈 Market sentiment updated: ${this.marketSentiment} (${(profitRatio * 100).toFixed(1)}% profitable)`);
      
    } catch (error) {
      logger.error('Failed to update market sentiment:', error);
    }
  }

  async analyzeToken(tokenData) {
    try {
      if (!this.isInitialized) {
        throw new Error('AI Manager not initialized');
      }

      const analysis = {
        tokenAddress: tokenData.address,
        timestamp: new Date(),
        aiScore: 0,
        recommendation: 'HOLD',
        confidence: 0,
        riskFactors: [],
        opportunities: [],
        strategy: null
      };

      // Analyze liquidity patterns
      const liquidityScore = await this.analyzeLiquidity(tokenData);
      
      // Analyze volume patterns
      const volumeScore = await this.analyzeVolume(tokenData);
      
      // Analyze social sentiment
      const socialScore = await this.analyzeSocialMetrics(tokenData);
      
      // Analyze contract security
      const securityScore = await this.analyzeContractSecurity(tokenData);
      
      // Calculate composite AI score
      analysis.aiScore = this.calculateCompositeScore({
        liquidity: liquidityScore,
        volume: volumeScore,
        social: socialScore,
        security: securityScore
      });

      // Generate recommendation
      analysis.recommendation = this.generateRecommendation(analysis.aiScore);
      
      // Calculate confidence level
      analysis.confidence = this.calculateConfidence(tokenData);
      
      // Generate trading strategy
      analysis.strategy = await this.generateTradingStrategy(tokenData, analysis);
      
      // Cache analysis results
      await cacheSet(`ai_analysis_${tokenData.address}`, analysis, 1800); // 30 minutes
      
      return analysis;
      
    } catch (error) {
      logger.error('AI analysis failed:', error);
      throw error;
    }
  }

  async analyzeLiquidity(tokenData) {
    let score = 50; // Base score
    
    if (!tokenData.liquidityUSD) return 0;
    
    // Liquidity amount scoring
    if (tokenData.liquidityUSD >= 100000) score += 30;
    else if (tokenData.liquidityUSD >= 50000) score += 20;
    else if (tokenData.liquidityUSD >= 10000) score += 10;
    else if (tokenData.liquidityUSD < 1000) score -= 20;
    
    // Liquidity stability
    if (tokenData.liquidityLocked) score += 15;
    if (tokenData.liquidityRemoved) score -= 30;
    
    // Liquidity distribution (if available)
    if (tokenData.holders && tokenData.holders > 100) score += 5;
    
    return Math.max(0, Math.min(100, score));
  }

  async analyzeVolume(tokenData) {
    let score = 50;
    
    if (!tokenData.volume24h) return 0;
    
    // Volume scoring
    if (tokenData.volume24h >= 100000) score += 30;
    else if (tokenData.volume24h >= 50000) score += 20;
    else if (tokenData.volume24h >= 10000) score += 10;
    else if (tokenData.volume24h < 1000) score -= 20;
    
    // Volume to liquidity ratio
    if (tokenData.liquidityUSD && tokenData.volume24h) {
      const volumeLiquidityRatio = tokenData.volume24h / tokenData.liquidityUSD;
      if (volumeLiquidityRatio >= 2) score += 15; // High volume relative to liquidity
      else if (volumeLiquidityRatio < 0.1) score -= 15; // Low volume relative to liquidity
    }
    
    return Math.max(0, Math.min(100, score));
  }

  async analyzeSocialMetrics(tokenData) {
    let score = 50;
    
    // Telegram members
    if (tokenData.telegramMembers >= 10000) score += 25;
    else if (tokenData.telegramMembers >= 5000) score += 20;
    else if (tokenData.telegramMembers >= 1000) score += 15;
    else if (tokenData.telegramMembers >= 100) score += 10;
    else if (tokenData.telegramMembers < 50) score -= 20;
    
    // Twitter followers
    if (tokenData.twitterFollowers >= 5000) score += 15;
    else if (tokenData.twitterFollowers >= 1000) score += 10;
    else if (tokenData.twitterFollowers >= 100) score += 5;
    
    // Website presence
    if (tokenData.website) score += 5;
    
    return Math.max(0, Math.min(100, score));
  }

  async analyzeContractSecurity(tokenData) {
    let score = 50;
    
    // Contract verification
    if (tokenData.contractVerified) score += 20;
    else score -= 20;
    
    // Honeypot detection
    if (tokenData.honeypotDetected) score -= 50;
    
    // Risk score adjustment
    if (tokenData.riskScore) {
      score += (tokenData.riskScore - 50) * 0.6; // Adjust based on risk score
    }
    
    // Security issues
    if (tokenData.securityIssues && tokenData.securityIssues.length > 0) {
      score -= tokenData.securityIssues.length * 10;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  calculateCompositeScore(scores) {
    // Weighted average of all scores
    const weights = {
      liquidity: 0.35,
      volume: 0.25,
      social: 0.20,
      security: 0.20
    };
    
    let totalScore = 0;
    let totalWeight = 0;
    
    for (const [key, score] of Object.entries(scores)) {
      if (weights[key]) {
        totalScore += score * weights[key];
        totalWeight += weights[key];
      }
    }
    
    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
  }

  generateRecommendation(aiScore) {
    if (aiScore >= 80) return 'STRONG_BUY';
    if (aiScore >= 65) return 'BUY';
    if (aiScore >= 45) return 'HOLD';
    if (aiScore >= 30) return 'SELL';
    return 'STRONG_SELL';
  }

  calculateConfidence(tokenData) {
    let confidence = 50; // Base confidence
    
    // More data = higher confidence
    if (tokenData.liquidityUSD && tokenData.volume24h && tokenData.holders) confidence += 20;
    if (tokenData.telegramMembers && tokenData.twitterFollowers) confidence += 15;
    if (tokenData.contractVerified) confidence += 10;
    
    // Recent data = higher confidence
    if (tokenData.lastUpdated) {
      const hoursSinceUpdate = (Date.now() - new Date(tokenData.lastUpdated)) / (1000 * 60 * 60);
      if (hoursSinceUpdate < 1) confidence += 15;
      else if (hoursSinceUpdate < 6) confidence += 10;
      else if (hoursSinceUpdate > 24) confidence -= 10;
    }
    
    return Math.max(0, Math.min(100, confidence));
  }

  async generateTradingStrategy(tokenData, analysis) {
    const strategy = {
      entryPrice: null,
      targetPrice: null,
      stopLoss: null,
      positionSize: null,
      timing: null,
      riskLevel: this.riskTolerance
    };
    
    // Adjust strategy based on market sentiment
    if (this.marketSentiment === 'BULLISH') {
      strategy.riskLevel = 'HIGH';
      strategy.positionSize = 'LARGE';
    } else if (this.marketSentiment === 'BEARISH') {
      strategy.riskLevel = 'LOW';
      strategy.positionSize = 'SMALL';
    }
    
    // Adjust based on AI score
    if (analysis.aiScore >= 80) {
      strategy.timing = 'IMMEDIATE';
      strategy.positionSize = 'LARGE';
    } else if (analysis.aiScore >= 65) {
      strategy.timing = 'SOON';
      strategy.positionSize = 'MEDIUM';
    } else if (analysis.aiScore <= 30) {
      strategy.timing = 'AVOID';
      strategy.positionSize = 'NONE';
    }
    
    return strategy;
  }

  async getMarketInsights() {
    try {
      const insights = {
        sentiment: this.marketSentiment,
        riskTolerance: this.riskTolerance,
        strategyMode: this.strategyMode,
        timestamp: new Date(),
        recommendations: []
      };
      
      // Get top AI recommendations
      const topTokens = await Token.findTopOpportunities(5);
      
      for (const token of topTokens) {
        const analysis = await this.analyzeToken(token);
        insights.recommendations.push({
          tokenAddress: token.address,
          symbol: token.symbol,
          aiScore: analysis.aiScore,
          recommendation: analysis.recommendation,
          confidence: analysis.confidence
        });
      }
      
      return insights;
      
    } catch (error) {
      logger.error('Failed to get market insights:', error);
      throw error;
    }
  }

  async updateStrategyMode(mode) {
    const validModes = ['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'];
    if (!validModes.includes(mode)) {
      throw new Error('Invalid strategy mode');
    }
    
    this.strategyMode = mode;
    
    // Adjust risk tolerance based on strategy mode
    switch (mode) {
      case 'CONSERVATIVE':
        this.riskTolerance = 'LOW';
        break;
      case 'BALANCED':
        this.riskTolerance = 'MEDIUM';
        break;
      case 'AGGRESSIVE':
        this.riskTolerance = 'HIGH';
        break;
    }
    
    logger.info(`🤖 Strategy mode updated: ${mode} (Risk: ${this.riskTolerance})`);
  }
}

module.exports = {
  AIManager,
  initializeAI: async () => {
    const aiManager = new AIManager();
    await aiManager.initialize();
    return aiManager;
  }
};
