const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  // Basic trade info
  tokenAddress: {
    type: String,
    required: true,
    index: true
  },
  tokenSymbol: {
    type: String,
    required: true
  },
  tokenName: String,
  chainId: {
    type: Number,
    required: true,
    index: true
  },
  
  // Trade details
  tradeType: {
    type: String,
    enum: ['BUY', 'SELL'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  gasUsed: Number,
  gasPrice: Number,
  
  // Wallet info
  walletAddress: {
    type: String,
    required: true,
    index: true
  },
  txHash: {
    type: String,
    required: true,
    unique: true
  },
  
  // Timing
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  blockNumber: Number,
  
  // Performance metrics
  profitLoss: Number,
  roi: Number,
  holdingTime: Number, // in seconds
  
  // Status
  status: {
    type: String,
    enum: ['PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED'],
    default: 'PENDING'
  },
  
  // Risk metrics
  riskScore: Number,
  honeypotDetected: {
    type: Boolean,
    default: false
  },
  
  // Metadata
  sniperStrategy: String,
  marketConditions: String,
  notes: String,
  
  // Axiom data
  axiomQueryId: String,
  liquidityData: Object,
  volumeData: Object
}, {
  timestamps: true,
  indexes: [
    { tokenAddress: 1, timestamp: -1 },
    { walletAddress: 1, timestamp: -1 },
    { status: 1, timestamp: -1 },
    { profitLoss: 1, timestamp: -1 }
  ]
});

// Virtual for formatted amount
tradeSchema.virtual('formattedAmount').get(function() {
  return this.amount.toFixed(6);
});

// Virtual for formatted price
tradeSchema.virtual('formattedPrice').get(function() {
  return this.price.toFixed(8);
});

// Method to calculate ROI
tradeSchema.methods.calculateROI = function(buyPrice, sellPrice) {
  if (buyPrice && sellPrice) {
    return ((sellPrice - buyPrice) / buyPrice) * 100;
  }
  return 0;
};

// Static method to get profitable trades
tradeSchema.statics.getProfitableTrades = function() {
  return this.find({ profitLoss: { $gt: 0 } });
};

// Static method to get trades by time range
tradeSchema.statics.getTradesByTimeRange = function(startDate, endDate) {
  return this.find({
    timestamp: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ timestamp: -1 });
};

// Static method to get performance summary
tradeSchema.statics.getPerformanceSummary = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalTrades: { $sum: 1 },
        profitableTrades: {
          $sum: { $cond: [{ $gt: ['$profitLoss', 0] }, 1, 0] }
        },
        totalProfit: { $sum: '$profitLoss' },
        avgROI: { $avg: '$roi' },
        maxProfit: { $max: '$profitLoss' },
        maxLoss: { $min: '$profitLoss' }
      }
    }
  ]);
};

module.exports = mongoose.model('Trade', tradeSchema);
