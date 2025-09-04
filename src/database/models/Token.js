const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  // Basic token info
  address: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  symbol: {
    type: String,
    required: true
  },
  name: String,
  decimals: {
    type: Number,
    default: 18
  },
  chainId: {
    type: Number,
    required: true,
    index: true
  },
  
  // Contract analysis
  contractVerified: {
    type: Boolean,
    default: false
  },
  contractSource: String,
  contractCreator: String,
  creationBlock: Number,
  creationTime: Date,
  
  // Security analysis
  honeypotScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 50
  },
  honeypotDetected: {
    type: Boolean,
    default: false
  },
  riskScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 50
  },
  securityIssues: [String],
  
  // Liquidity data
  liquidityUSD: Number,
  liquidityETH: Number,
  liquidityBNB: Number,
  liquidityRemoved: {
    type: Boolean,
    default: false
  },
  liquidityLocked: {
    type: Boolean,
    default: false
  },
  liquidityLockTime: Date,
  
  // Trading data
  priceUSD: Number,
  priceETH: Number,
  priceBNB: Number,
  marketCap: Number,
  volume24h: Number,
  holders: Number,
  
  // Social metrics
  socialScore: Number,
  telegramMembers: Number,
  twitterFollowers: Number,
  website: String,
  telegram: String,
  twitter: String,
  
  // Axiom analysis data
  axiomQueryId: String,
  axiomData: Object,
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  
  // Sniper analysis
  sniperScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  sniperRecommendation: {
    type: String,
    enum: ['STRONG_BUY', 'BUY', 'HOLD', 'SELL', 'STRONG_SELL'],
    default: 'HOLD'
  },
  
  // Metadata
  tags: [String],
  notes: String,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  indexes: [
    { address: 1, chainId: 1 },
    { sniperScore: -1 },
    { riskScore: 1 },
    { liquidityUSD: -1 },
    { volume24h: -1 },
    { lastUpdated: -1 }
  ]
});

// Virtual for formatted market cap
tokenSchema.virtual('formattedMarketCap').get(function() {
  if (!this.marketCap) return 'N/A';
  if (this.marketCap >= 1e9) return `$${(this.marketCap / 1e9).toFixed(2)}B`;
  if (this.marketCap >= 1e6) return `$${(this.marketCap / 1e6).toFixed(2)}M`;
  if (this.marketCap >= 1e3) return `$${(this.marketCap / 1e3).toFixed(2)}K`;
  return `$${this.marketCap.toFixed(2)}`;
});

// Virtual for formatted liquidity
tokenSchema.virtual('formattedLiquidity').get(function() {
  if (!this.liquidityUSD) return 'N/A';
  if (this.liquidityUSD >= 1e6) return `$${(this.liquidityUSD / 1e6).toFixed(2)}M`;
  if (this.liquidityUSD >= 1e3) return `$${(this.liquidityUSD / 1e3).toFixed(2)}K`;
  return `$${this.liquidityUSD.toFixed(2)}`;
});

// Method to update risk score
tokenSchema.methods.updateRiskScore = function() {
  let score = 50; // Base score
  
  // Honeypot detection
  if (this.honeypotDetected) score -= 30;
  
  // Liquidity checks
  if (this.liquidityRemoved) score -= 25;
  if (!this.liquidityLocked) score -= 15;
  
  // Contract verification
  if (!this.contractVerified) score -= 10;
  
  // Social presence
  if (this.telegramMembers < 100) score -= 5;
  if (this.twitterFollowers < 100) score -= 5;
  
  // Security issues
  score -= this.securityIssues.length * 5;
  
  this.riskScore = Math.max(0, Math.min(100, score));
  return this.riskScore;
};

// Method to calculate sniper score
tokenSchema.methods.calculateSniperScore = function() {
  let score = 0;
  
  // Liquidity score (40% weight)
  if (this.liquidityUSD >= 100000) score += 40;
  else if (this.liquidityUSD >= 50000) score += 30;
  else if (this.liquidityUSD >= 10000) score += 20;
  else if (this.liquidityUSD >= 1000) score += 10;
  
  // Volume score (25% weight)
  if (this.volume24h >= 100000) score += 25;
  else if (this.volume24h >= 50000) score += 20;
  else if (this.volume24h >= 10000) score += 15;
  else if (this.volume24h >= 1000) score += 10;
  
  // Security score (20% weight)
  score += (100 - this.riskScore) * 0.2;
  
  // Social score (15% weight)
  if (this.telegramMembers >= 1000) score += 15;
  else if (this.telegramMembers >= 500) score += 10;
  else if (this.telegramMembers >= 100) score += 5;
  
  this.sniperScore = Math.round(score);
  
  // Update recommendation based on score
  if (this.sniperScore >= 80) this.sniperRecommendation = 'STRONG_BUY';
  else if (this.sniperScore >= 60) this.sniperRecommendation = 'BUY';
  else if (this.sniperScore >= 40) this.sniperRecommendation = 'HOLD';
  else if (this.sniperScore >= 20) this.sniperRecommendation = 'SELL';
  else this.sniperRecommendation = 'STRONG_SELL';
  
  return this.sniperScore;
};

// Static method to find tokens by risk level
tokenSchema.statics.findByRiskLevel = function(level) {
  const riskRanges = {
    'LOW': { $gte: 70, $lte: 100 },
    'MEDIUM': { $gte: 30, $lte: 69 },
    'HIGH': { $gte: 0, $lte: 29 }
  };
  
  return this.find({ riskScore: riskRanges[level] || riskRanges.MEDIUM });
};

// Static method to find top sniper opportunities
tokenSchema.statics.findTopOpportunities = function(limit = 10) {
  return this.find({ 
    isActive: true,
    sniperScore: { $gte: 70 },
    riskScore: { $gte: 60 }
  })
  .sort({ sniperScore: -1, liquidityUSD: -1 })
  .limit(limit);
};

module.exports = mongoose.model('Token', tokenSchema);
