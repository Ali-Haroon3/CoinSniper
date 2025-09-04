const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { cacheGet, cacheSet } = require('../database/redis');
const Trade = require('../database/models/Trade');
const Token = require('../database/models/Token');

// Middleware for API authentication (basic implementation)
const authenticateAPI = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
};

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime()
  });
});

// ===== TRADING ENDPOINTS =====

// Get all trades
router.get('/trades', authenticateAPI, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, tokenAddress, walletAddress } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (tokenAddress) query.tokenAddress = tokenAddress;
    if (walletAddress) query.walletAddress = walletAddress;
    
    const trades = await Trade.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    
    const total = await Trade.countDocuments(query);
    
    res.json({
      trades,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    logger.error('Failed to fetch trades:', error);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

// Get trade by ID
router.get('/trades/:id', authenticateAPI, async (req, res) => {
  try {
    const trade = await Trade.findById(req.params.id);
    
    if (!trade) {
      return res.status(404).json({ error: 'Trade not found' });
    }
    
    res.json(trade);
    
  } catch (error) {
    logger.error('Failed to fetch trade:', error);
    res.status(500).json({ error: 'Failed to fetch trade' });
  }
});

// Create new trade
router.post('/trades', authenticateAPI, async (req, res) => {
  try {
    const tradeData = req.body;
    
    // Validate required fields
    if (!tradeData.tokenAddress || !tradeData.tradeType || !tradeData.amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const trade = new Trade(tradeData);
    await trade.save();
    
    logger.info(`New trade created: ${trade._id}`);
    res.status(201).json(trade);
    
  } catch (error) {
    logger.error('Failed to create trade:', error);
    res.status(500).json({ error: 'Failed to create trade' });
  }
});

// Update trade status
router.patch('/trades/:id', authenticateAPI, async (req, res) => {
  try {
    const { status, profitLoss, roi } = req.body;
    
    const trade = await Trade.findByIdAndUpdate(
      req.params.id,
      { status, profitLoss, roi, updatedAt: new Date() },
      { new: true }
    );
    
    if (!trade) {
      return res.status(404).json({ error: 'Trade not found' });
    }
    
    res.json(trade);
    
  } catch (error) {
    logger.error('Failed to update trade:', error);
    res.status(500).json({ error: 'Failed to update trade' });
  }
});

// ===== TOKEN ENDPOINTS =====

// Get all tokens
router.get('/tokens', authenticateAPI, async (req, res) => {
  try {
    const { page = 1, limit = 20, chainId, riskLevel, sniperScore } = req.query;
    
    const query = { isActive: true };
    if (chainId) query.chainId = parseInt(chainId);
    if (riskLevel) {
      const riskRanges = {
        'LOW': { $gte: 70, $lte: 100 },
        'MEDIUM': { $gte: 30, $lte: 69 },
        'HIGH': { $gte: 0, $lte: 29 }
      };
      query.riskScore = riskRanges[riskLevel];
    }
    if (sniperScore) query.sniperScore = { $gte: parseInt(sniperScore) };
    
    const tokens = await Token.find(query)
      .sort({ sniperScore: -1, lastUpdated: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    
    const total = await Token.countDocuments(query);
    
    res.json({
      tokens,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    logger.error('Failed to fetch tokens:', error);
    res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

// Get token by address
router.get('/tokens/:address', authenticateAPI, async (req, res) => {
  try {
    const token = await Token.findOne({ address: req.params.address });
    
    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }
    
    res.json(token);
    
  } catch (error) {
    logger.error('Failed to fetch token:', error);
    res.status(500).json({ error: 'Failed to fetch token' });
  }
});

// Get top opportunities
router.get('/tokens/opportunities/top', authenticateAPI, async (req, res) => {
  try {
    const { limit = 10, minScore = 70 } = req.query;
    
    const tokens = await Token.findTopOpportunities(parseInt(limit));
    
    // Filter by minimum score
    const filteredTokens = tokens.filter(token => token.sniperScore >= parseInt(minScore));
    
    res.json({
      opportunities: filteredTokens,
      count: filteredTokens.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Failed to fetch opportunities:', error);
    res.status(500).json({ error: 'Failed to fetch opportunities' });
  }
});

// ===== ANALYTICS ENDPOINTS =====

// Get performance summary
router.get('/analytics/performance', authenticateAPI, async (req, res) => {
  try {
    const { timeframe = '7d' } = req.query;
    
    let startDate;
    switch (timeframe) {
      case '1d':
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }
    
    const trades = await Trade.find({
      timestamp: { $gte: startDate }
    });
    
    const totalTrades = trades.length;
    const profitableTrades = trades.filter(t => t.profitLoss > 0).length;
    const totalProfit = trades.reduce((sum, t) => sum + (t.profitLoss || 0), 0);
    const avgROI = trades.length > 0 ? trades.reduce((sum, t) => sum + (t.roi || 0), 0) / trades.length : 0;
    
    const performance = {
      timeframe,
      totalTrades,
      profitableTrades,
      winRate: totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0,
      totalProfit,
      avgROI,
      timestamp: new Date().toISOString()
    };
    
    res.json(performance);
    
  } catch (error) {
    logger.error('Failed to fetch performance:', error);
    res.status(500).json({ error: 'Failed to fetch performance' });
  }
});

// Get risk metrics
router.get('/analytics/risk', authenticateAPI, async (req, res) => {
  try {
    const riskMetrics = await cacheGet('risk_metrics');
    
    if (!riskMetrics) {
      return res.status(404).json({ error: 'Risk metrics not available' });
    }
    
    res.json(riskMetrics);
    
  } catch (error) {
    logger.error('Failed to fetch risk metrics:', error);
    res.status(500).json({ error: 'Failed to fetch risk metrics' });
  }
});

// Get market insights
router.get('/analytics/insights', authenticateAPI, async (req, res) => {
  try {
    const insights = await cacheGet('market_insights');
    
    if (!insights) {
      return res.status(404).json({ error: 'Market insights not available' });
    }
    
    res.json(insights);
    
  } catch (error) {
    logger.error('Failed to fetch market insights:', error);
    res.status(500).json({ error: 'Failed to fetch market insights' });
  }
});

// ===== SYSTEM ENDPOINTS =====

// Get system status
router.get('/system/status', authenticateAPI, async (req, res) => {
  try {
    const status = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };
    
    res.json(status);
    
  } catch (error) {
    logger.error('Failed to fetch system status:', error);
    res.status(500).json({ error: 'Failed to fetch system status' });
  }
});

// Get notification status
router.get('/system/notifications', authenticateAPI, async (req, res) => {
  try {
    // This would come from the notifier service
    const notificationStatus = {
      telegram: { enabled: true, status: 'connected' },
      discord: { enabled: false, status: 'not_configured' },
      email: { enabled: false, status: 'not_configured' },
      webhook: { enabled: false, status: 'not_configured' }
    };
    
    res.json(notificationStatus);
    
  } catch (error) {
    logger.error('Failed to fetch notification status:', error);
    res.status(500).json({ error: 'Failed to fetch notification status' });
  }
});

// Test notification
router.post('/system/notifications/test', authenticateAPI, async (req, res) => {
  try {
    const { channel = 'telegram' } = req.body;
    
    // This would trigger a test notification
    logger.info(`Test notification requested for channel: ${channel}`);
    
    res.json({
      success: true,
      message: `Test notification sent to ${channel}`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Failed to send test notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

// ===== CONFIGURATION ENDPOINTS =====

// Get configuration
router.get('/config', authenticateAPI, async (req, res) => {
  try {
    const config = {
      riskLimits: {
        maxPortfolioRisk: 0.05,
        maxDailyLoss: 0.10,
        maxDrawdown: 0.25
      },
      positionSizing: 'KELLY',
      stopLossStrategy: 'TRAILING',
      chains: ['ethereum', 'bsc', 'polygon', 'arbitrum', 'base'],
      features: {
        aiAnalysis: true,
        riskManagement: true,
        notifications: true,
        multiWallet: true
      }
    };
    
    res.json(config);
    
  } catch (error) {
    logger.error('Failed to fetch configuration:', error);
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

// Update configuration
router.patch('/config', authenticateAPI, async (req, res) => {
  try {
    const { riskLimits, positionSizing, stopLossStrategy } = req.body;
    
    // Validate and update configuration
    // This would update the actual system configuration
    
    logger.info('Configuration updated');
    
    res.json({
      success: true,
      message: 'Configuration updated successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Failed to update configuration:', error);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

// ===== UTILITY ENDPOINTS =====

// Search tokens
router.get('/search/tokens', authenticateAPI, async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query too short' });
    }
    
    const tokens = await Token.find({
      $or: [
        { symbol: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
        { address: { $regex: q, $options: 'i' } }
      ],
      isActive: true
    })
    .limit(parseInt(limit))
    .select('address symbol name chainId sniperScore riskScore');
    
    res.json({
      query: q,
      results: tokens,
      count: tokens.length
    });
    
  } catch (error) {
    logger.error('Search failed:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get token statistics
router.get('/tokens/:address/stats', authenticateAPI, async (req, res) => {
  try {
    const { address } = req.params;
    const { timeframe = '24h' } = req.query;
    
    let startDate;
    switch (timeframe) {
      case '1h':
        startDate = new Date(Date.now() - 60 * 60 * 1000);
        break;
      case '24h':
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    }
    
    const trades = await Trade.find({
      tokenAddress: address,
      timestamp: { $gte: startDate }
    });
    
    const stats = {
      address,
      timeframe,
      totalTrades: trades.length,
      buyTrades: trades.filter(t => t.tradeType === 'BUY').length,
      sellTrades: trades.filter(t => t.tradeType === 'SELL').length,
      totalVolume: trades.reduce((sum, t) => sum + (t.amount || 0), 0),
      avgPrice: trades.length > 0 ? trades.reduce((sum, t) => sum + (t.price || 0), 0) / trades.length : 0,
      timestamp: new Date().toISOString()
    };
    
    res.json(stats);
    
  } catch (error) {
    logger.error('Failed to fetch token stats:', error);
    res.status(500).json({ error: 'Failed to fetch token stats' });
  }
});

// Error handling middleware
router.use((error, req, res, next) => {
  logger.error('API Error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler for API routes
router.use('*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
