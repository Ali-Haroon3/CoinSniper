const { logger } = require('../utils/logger');
const { TechnicalAnalyzer } = require('./technicalAnalyzer');
const { MarketAnalyzer } = require('./marketAnalyzer');
const { SentimentAnalyzer } = require('./sentimentAnalyzer');

class ProfitCalculator {
  constructor() {
    this.technicalAnalyzer = new TechnicalAnalyzer();
    this.marketAnalyzer = new MarketAnalyzer();
    this.sentimentAnalyzer = new SentimentAnalyzer();
    
    // Profit optimization strategies
    this.strategies = {
      momentum: { weight: 0.3, enabled: true },
      meanReversion: { weight: 0.25, enabled: true },
      breakout: { weight: 0.25, enabled: true },
      sentiment: { weight: 0.2, enabled: true }
    };
    
    // Historical performance tracking
    this.performanceHistory = new Map();
    this.maxHistorySize = 1000;
    
    // Dynamic parameters
    this.dynamicParams = {
      volatilityAdjustment: 1.0,
      marketSentimentMultiplier: 1.0,
      riskAppetite: 0.7, // 0-1 scale
      profitAggressiveness: 0.8 // 0-1 scale
    };
  }

  async calculatePotential(token, analysis, network) {
    try {
      logger.info(`📊 Calculating profit potential for ${token.symbol}`);
      
      // Base potential calculation
      let basePotential = this.calculateBasePotential(analysis);
      
      // Apply market conditions
      const marketConditions = await this.analyzeMarketConditions(network);
      basePotential *= marketConditions.multiplier;
      
      // Apply technical analysis
      const technicalSignal = await this.analyzeTechnicalSignals(token, network);
      basePotential *= technicalSignal.multiplier;
      
      // Apply sentiment analysis
      const sentimentSignal = await this.analyzeSentimentSignals(token, network);
      basePotential *= sentimentSignal.multiplier;
      
      // Apply volatility adjustment
      const volatilityAdjustment = this.calculateVolatilityAdjustment(analysis);
      basePotential *= volatilityAdjustment;
      
      // Apply risk adjustment
      const riskAdjustment = this.calculateRiskAdjustment(analysis);
      basePotential *= riskAdjustment;
      
      // Apply momentum analysis
      const momentumSignal = await this.analyzeMomentum(token, network);
      basePotential *= momentumSignal.multiplier;
      
      // Final adjustments
      const finalPotential = this.applyFinalAdjustments(basePotential, analysis);
      
      logger.info(`✅ Profit potential calculated: ${finalPotential.toFixed(2)}x for ${token.symbol}`);
      
      return Math.round(finalPotential);
      
    } catch (error) {
      logger.error(`Error calculating profit potential for ${token.symbol}:`, error);
      return 200; // Default 2x potential
    }
  }

  calculateBasePotential(analysis) {
    let potential = 200; // Base 2x potential
    
    // Contract quality adjustments
    if (analysis.contract.isVerified) potential *= 1.2;
    if (analysis.contract.isAudited) potential *= 1.3;
    if (analysis.contract.ownership.renounced) potential *= 1.15;
    
    // Liquidity quality adjustments
    switch (analysis.liquidity.quality) {
      case 'excellent':
        potential *= 1.4;
        break;
      case 'good':
        potential *= 1.2;
        break;
      case 'fair':
        potential *= 1.0;
        break;
      case 'poor':
        potential *= 0.7;
        break;
    }
    
    // Social metrics adjustments
    if (analysis.social.score > 80) potential *= 1.3;
    else if (analysis.social.score > 60) potential *= 1.1;
    else if (analysis.social.score < 40) potential *= 0.8;
    
    // Risk factor adjustments
    const riskPenalty = analysis.risk.length * 0.1;
    potential *= Math.max(0.5, 1 - riskPenalty);
    
    return potential;
  }

  async analyzeMarketConditions(network) {
    try {
      const marketData = await this.marketAnalyzer.getMarketData(network);
      
      let multiplier = 1.0;
      
      // Market trend analysis
      if (marketData.trend === 'bullish') multiplier *= 1.2;
      else if (marketData.trend === 'bearish') multiplier *= 0.8;
      
      // Volatility analysis
      if (marketData.volatility === 'high') multiplier *= 1.1;
      else if (marketData.volatility === 'low') multiplier *= 0.9;
      
      // Market cap analysis
      if (marketData.totalMarketCap > 1000000000000) { // >$1T
        multiplier *= 1.1; // Bull market
      } else if (marketData.totalMarketCap < 500000000000) { // <$500B
        multiplier *= 0.9; // Bear market
      }
      
      // Fear & Greed index
      if (marketData.fearGreedIndex < 25) multiplier *= 1.2; // Extreme fear = opportunity
      else if (marketData.fearGreedIndex > 75) multiplier *= 0.9; // Extreme greed = caution
      
      return { multiplier, data: marketData };
      
    } catch (error) {
      logger.error(`Market conditions analysis failed:`, error);
      return { multiplier: 1.0, data: {} };
    }
  }

  async analyzeTechnicalSignals(token, network) {
    try {
      const technicalData = await this.technicalAnalyzer.analyzeToken(token.address, network);
      
      let multiplier = 1.0;
      
      // RSI analysis
      if (technicalData.rsi < 30) multiplier *= 1.2; // Oversold
      else if (technicalData.rsi > 70) multiplier *= 0.8; // Overbought
      
      // MACD analysis
      if (technicalData.macd.signal === 'bullish') multiplier *= 1.15;
      else if (technicalData.macd.signal === 'bearish') multiplier *= 0.85;
      
      // Moving averages
      if (technicalData.ma.signal === 'bullish') multiplier *= 1.1;
      else if (technicalData.ma.signal === 'bearish') multiplier *= 0.9;
      
      // Volume analysis
      if (technicalData.volume.signal === 'high') multiplier *= 1.1;
      else if (technicalData.volume.signal === 'low') multiplier *= 0.9;
      
      // Support/resistance levels
      if (technicalData.supportResistance.signal === 'near_support') multiplier *= 1.2;
      else if (technicalData.supportResistance.signal === 'near_resistance') multiplier *= 0.8;
      
      return { multiplier, data: technicalData };
      
    } catch (error) {
      logger.error(`Technical analysis failed for ${token.symbol}:`, error);
      return { multiplier: 1.0, data: {} };
    }
  }

  async analyzeSentimentSignals(token, network) {
    try {
      const sentimentData = await this.sentimentAnalyzer.analyzeToken(token, network);
      
      let multiplier = 1.0;
      
      // Overall sentiment score
      if (sentimentData.score > 80) multiplier *= 1.3;
      else if (sentimentData.score > 60) multiplier *= 1.1;
      else if (sentimentData.score < 40) multiplier *= 0.8;
      
      // Social media growth
      if (sentimentData.telegramGrowth > 50) multiplier *= 1.2;
      if (sentimentData.twitterGrowth > 30) multiplier *= 1.15;
      
      // Community engagement
      if (sentimentData.engagement > 0.8) multiplier *= 1.1;
      else if (sentimentData.engagement < 0.3) multiplier *= 0.9;
      
      // News sentiment
      if (sentimentData.newsSentiment === 'positive') multiplier *= 1.2;
      else if (sentimentData.newsSentiment === 'negative') multiplier *= 0.8;
      
      // Influencer mentions
      if (sentimentData.influencerMentions > 5) multiplier *= 1.15;
      
      return { multiplier, data: sentimentData };
      
    } catch (error) {
      logger.error(`Sentiment analysis failed for ${token.symbol}:`, error);
      return { multiplier: 1.0, data: {} };
    }
  }

  calculateVolatilityAdjustment(analysis) {
    // Higher volatility can mean higher potential returns but also higher risk
    const volatility = analysis.liquidity.priceImpact || 10;
    
    if (volatility < 5) return 0.9; // Low volatility = lower potential
    if (volatility < 15) return 1.0; // Normal volatility
    if (volatility < 30) return 1.1; // High volatility = higher potential
    return 1.2; // Very high volatility = highest potential
  }

  calculateRiskAdjustment(analysis) {
    const riskScore = analysis.risk || 0;
    
    if (riskScore < 20) return 1.2; // Low risk = higher potential
    if (riskScore < 40) return 1.1; // Medium-low risk
    if (riskScore < 60) return 1.0; // Medium risk
    if (riskScore < 80) return 0.9; // Medium-high risk
    return 0.7; // High risk = lower potential
  }

  async analyzeMomentum(token, network) {
    try {
      const momentumData = await this.technicalAnalyzer.getMomentumData(token.address, network);
      
      let multiplier = 1.0;
      
      // Price momentum
      if (momentumData.priceMomentum > 0.1) multiplier *= 1.2; // Strong upward momentum
      else if (momentumData.priceMomentum < -0.1) multiplier *= 0.8; // Strong downward momentum
      
      // Volume momentum
      if (momentumData.volumeMomentum > 0.2) multiplier *= 1.15; // Increasing volume
      else if (momentumData.volumeMomentum < -0.2) multiplier *= 0.85; // Decreasing volume
      
      // Social momentum
      if (momentumData.socialMomentum > 0.3) multiplier *= 1.1; // Growing social presence
      
      // Network momentum
      if (momentumData.networkMomentum > 0.2) multiplier *= 1.1; // Growing network activity
      
      return { multiplier, data: momentumData };
      
    } catch (error) {
      logger.error(`Momentum analysis failed for ${token.symbol}:`, error);
      return { multiplier: 1.0, data: {} };
    }
  }

  applyFinalAdjustments(potential, analysis) {
    // Apply dynamic parameters
    potential *= this.dynamicParams.volatilityAdjustment;
    potential *= this.dynamicParams.marketSentimentMultiplier;
    
    // Apply risk appetite
    potential *= (0.5 + this.dynamicParams.riskAppetite * 0.5);
    
    // Apply profit aggressiveness
    potential *= (0.8 + this.dynamicParams.profitAggressiveness * 0.4);
    
    // Ensure minimum and maximum bounds
    potential = Math.max(100, Math.min(2000, potential)); // 1x to 20x
    
    return potential;
  }

  async calculateOptimalPositionSize(profitPotential, riskScore, availableCapital) {
    try {
      // Base position size calculation
      let positionSize = availableCapital * 0.1; // Start with 10%
      
      // Adjust based on profit potential
      if (profitPotential > 500) positionSize *= 1.5; // 5x+ potential
      if (profitPotential > 1000) positionSize *= 2.0; // 10x+ potential
      
      // Adjust based on risk
      if (riskScore < 20) positionSize *= 1.3; // Low risk
      else if (riskScore > 60) positionSize *= 0.7; // High risk
      
      // Adjust based on market conditions
      const marketConditions = await this.analyzeMarketConditions('ethereum'); // Default network
      positionSize *= marketConditions.multiplier;
      
      // Apply Kelly Criterion for optimal sizing
      const kellyFraction = this.calculateKellyCriterion(profitPotential, riskScore);
      positionSize *= kellyFraction;
      
      // Ensure position size is within bounds
      const minSize = availableCapital * 0.01; // Minimum 1%
      const maxSize = availableCapital * 0.5; // Maximum 50%
      
      return Math.max(minSize, Math.min(maxSize, positionSize));
      
    } catch (error) {
      logger.error('Error calculating optimal position size:', error);
      return availableCapital * 0.1; // Default 10%
    }
  }

  calculateKellyCriterion(profitPotential, riskScore) {
    // Simplified Kelly Criterion
    const winRate = this.estimateWinRate(profitPotential, riskScore);
    const avgWin = profitPotential / 100; // Convert to decimal
    const avgLoss = 0.5; // Assume 50% average loss
    
    const kelly = (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin;
    
    // Apply safety factor
    return Math.max(0, Math.min(0.25, kelly * 0.5));
  }

  estimateWinRate(profitPotential, riskScore) {
    // Estimate win rate based on profit potential and risk
    let baseWinRate = 0.5; // Base 50% win rate
    
    // Adjust based on profit potential
    if (profitPotential > 500) baseWinRate += 0.1;
    if (profitPotential > 1000) baseWinRate += 0.1;
    
    // Adjust based on risk
    if (riskScore < 20) baseWinRate += 0.2;
    else if (riskScore < 40) baseWinRate += 0.1;
    else if (riskScore > 60) baseWinRate -= 0.1;
    else if (riskScore > 80) baseWinRate -= 0.2;
    
    return Math.max(0.1, Math.min(0.9, baseWinRate));
  }

  async calculateOptimalExitStrategy(token, entryPrice, currentPrice, analysis) {
    try {
      const exitStrategy = {
        takeProfitLevels: [],
        stopLossLevel: 0,
        trailingStop: false,
        timeBasedExit: false,
        exitConditions: []
      };
      
      // Calculate take profit levels based on profit potential
      const profitPotential = analysis.profitPotential || 200;
      
      if (profitPotential > 1000) {
        // High potential: multiple profit levels
        exitStrategy.takeProfitLevels = [
          { percentage: 50, size: 0.2 }, // 20% at 50% gain
          { percentage: 100, size: 0.3 }, // 30% at 100% gain
          { percentage: 200, size: 0.3 }, // 30% at 200% gain
          { percentage: profitPotential * 0.7, size: 0.2 } // 20% at 70% of potential
        ];
      } else if (profitPotential > 500) {
        // Medium potential: fewer levels
        exitStrategy.takeProfitLevels = [
          { percentage: 100, size: 0.5 }, // 50% at 100% gain
          { percentage: profitPotential * 0.8, size: 0.5 } // 50% at 80% of potential
        ];
      } else {
        // Lower potential: single level
        exitStrategy.takeProfitLevels = [
          { percentage: profitPotential * 0.8, size: 1.0 } // 100% at 80% of potential
        ];
      }
      
      // Calculate stop loss based on risk
      const riskScore = analysis.risk || 50;
      let stopLossPercentage = 30; // Default 30%
      
      if (riskScore < 20) stopLossPercentage = 20; // Low risk: tighter stop
      else if (riskScore > 60) stopLossPercentage = 40; // High risk: wider stop
      
      exitStrategy.stopLossLevel = entryPrice * (1 - stopLossPercentage / 100);
      
      // Enable trailing stop for high potential tokens
      if (profitPotential > 500) {
        exitStrategy.trailingStop = true;
        exitStrategy.trailingStopPercentage = 15; // 15% trailing stop
      }
      
      // Add time-based exit for very new contracts
      if (analysis.contract.age < 300) { // Less than 5 minutes
        exitStrategy.timeBasedExit = true;
        exitStrategy.maxHoldTime = 3600; // 1 hour max hold
      }
      
      // Add exit conditions based on analysis
      if (analysis.liquidity.quality === 'poor') {
        exitStrategy.exitConditions.push('liquidity_decrease');
      }
      
      if (analysis.social.score < 40) {
        exitStrategy.exitConditions.push('social_decline');
      }
      
      return exitStrategy;
      
    } catch (error) {
      logger.error('Error calculating exit strategy:', error);
      return {
        takeProfitLevels: [{ percentage: 100, size: 1.0 }],
        stopLossLevel: entryPrice * 0.7,
        trailingStop: false,
        timeBasedExit: false,
        exitConditions: []
      };
    }
  }

  async updateDynamicParameters() {
    try {
      // Update parameters based on recent performance
      const recentPerformance = this.getRecentPerformance();
      
      if (recentPerformance.winRate > 0.7) {
        // High win rate: increase aggressiveness
        this.dynamicParams.riskAppetite = Math.min(1.0, this.dynamicParams.riskAppetite + 0.1);
        this.dynamicParams.profitAggressiveness = Math.min(1.0, this.dynamicParams.profitAggressiveness + 0.1);
      } else if (recentPerformance.winRate < 0.4) {
        // Low win rate: decrease aggressiveness
        this.dynamicParams.riskAppetite = Math.max(0.3, this.dynamicParams.riskAppetite - 0.1);
        this.dynamicParams.profitAggressiveness = Math.max(0.5, this.dynamicParams.profitAggressiveness - 0.1);
      }
      
      // Update market sentiment multiplier
      const marketSentiment = await this.getMarketSentiment();
      this.dynamicParams.marketSentimentMultiplier = marketSentiment;
      
      // Update volatility adjustment
      const marketVolatility = await this.getMarketVolatility();
      this.dynamicParams.volatilityAdjustment = 1.0 + (marketVolatility - 0.5) * 0.4;
      
      logger.info('✅ Dynamic parameters updated');
      
    } catch (error) {
      logger.error('Error updating dynamic parameters:', error);
    }
  }

  getRecentPerformance() {
    const trades = Array.from(this.performanceHistory.values());
    const recentTrades = trades.slice(-100); // Last 100 trades
    
    if (recentTrades.length === 0) {
      return { winRate: 0.5, avgProfit: 0, avgLoss: 0 };
    }
    
    const wins = recentTrades.filter(t => t.profit > 0);
    const losses = recentTrades.filter(t => t.profit < 0);
    
    const winRate = wins.length / recentTrades.length;
    const avgProfit = wins.length > 0 ? wins.reduce((sum, t) => sum + t.profit, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((sum, t) => sum + Math.abs(t.profit), 0) / losses.length : 0;
    
    return { winRate, avgProfit, avgLoss };
  }

  async getMarketSentiment() {
    try {
      // This would integrate with market sentiment APIs
      // For now, return a neutral value
      return 1.0;
    } catch (error) {
      return 1.0;
    }
  }

  async getMarketVolatility() {
    try {
      // This would calculate market volatility
      // For now, return a neutral value
      return 0.5;
    } catch (error) {
      return 0.5;
    }
  }

  recordTradePerformance(tradeHash, profit, analysis) {
    try {
      const performance = {
        tradeHash,
        profit,
        timestamp: Date.now(),
        analysis: {
          score: analysis.score,
          risk: analysis.risk,
          profitPotential: analysis.profitPotential
        }
      };
      
      this.performanceHistory.set(tradeHash, performance);
      
      // Maintain history size
      if (this.performanceHistory.size > this.maxHistorySize) {
        const oldestKey = this.performanceHistory.keys().next().value;
        this.performanceHistory.delete(oldestKey);
      }
      
    } catch (error) {
      logger.error('Error recording trade performance:', error);
    }
  }

  getPerformanceStats() {
    const trades = Array.from(this.performanceHistory.values());
    
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        avgProfit: 0,
        avgLoss: 0,
        totalProfit: 0,
        bestTrade: 0,
        worstTrade: 0
      };
    }
    
    const wins = trades.filter(t => t.profit > 0);
    const losses = trades.filter(t => t.profit < 0);
    
    return {
      totalTrades: trades.length,
      winRate: wins.length / trades.length,
      avgProfit: wins.length > 0 ? wins.reduce((sum, t) => sum + t.profit, 0) / wins.length : 0,
      avgLoss: losses.length > 0 ? losses.reduce((sum, t) => sum + Math.abs(t.profit), 0) / losses.length : 0,
      totalProfit: trades.reduce((sum, t) => sum + t.profit, 0),
      bestTrade: Math.max(...trades.map(t => t.profit)),
      worstTrade: Math.min(...trades.map(t => t.profit))
    };
  }

  resetPerformanceHistory() {
    this.performanceHistory.clear();
    logger.info('🧹 Performance history reset');
  }
}

module.exports = { ProfitCalculator };
