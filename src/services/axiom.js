const { Axiom } = require('@axiomhq/axiom-node');
const { logger } = require('../utils/logger');
const config = require('../../config.json');

class AxiomService {
  constructor() {
    this.axiom = null;
    this.isInitialized = false;
    this.cache = new Map();
    this.cacheTTL = config.axiom?.cacheTTL || 300; // 5 minutes default
  }

  async initialize() {
    try {
      if (!config.axiom?.apiKey) {
        throw new Error('Axiom API key not configured');
      }

      this.axiom = new Axiom({
        token: config.axiom.apiKey,
        orgId: config.axiom.orgId,
        timeout: config.axiom.timeout || 30000
      });

      // Test connection
      await this.testConnection();
      
      this.isInitialized = true;
      logger.info('✅ Axiom service initialized successfully');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Axiom service:', error);
      throw error;
    }
  }

  async testConnection() {
    try {
      // Test with a simple query
      const result = await this.axiom.query('SELECT 1 as test');
      logger.info('✅ Axiom connection test successful');
      return true;
    } catch (error) {
      logger.error('❌ Axiom connection test failed:', error);
      throw error;
    }
  }

  // Token monitoring queries
  async getNewTokens(network, timeRange = '5m') {
    try {
      const query = `
        SELECT 
          address,
          block_number,
          block_timestamp,
          transaction_hash,
          log_index
        FROM ${network}_logs 
        WHERE 
          topic0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' -- Transfer event
          AND block_timestamp >= NOW() - INTERVAL '${timeRange}'
        ORDER BY block_timestamp DESC
        LIMIT 100
      `;

      const result = await this.axiom.query(query);
      return this.processTokenResults(result);
    } catch (error) {
      logger.error(`❌ Failed to get new tokens for ${network}:`, error);
      return [];
    }
  }

  // Liquidity monitoring
  async getLiquidityEvents(network, tokenAddress, timeRange = '1h') {
    try {
      const query = `
        SELECT 
          address,
          block_number,
          block_timestamp,
          transaction_hash,
          topic0,
          data
        FROM ${network}_logs 
        WHERE 
          address = '${tokenAddress}'
          AND (topic0 = '0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f' -- AddLiquidity
              OR topic0 = '0x8b5a9614406d4c8c3e3893d74c6c4b3c8f3b6c8f3b6c8f3b6c8f3b6c8f3b6c8f') -- RemoveLiquidity
          AND block_timestamp >= NOW() - INTERVAL '${timeRange}'
        ORDER BY block_timestamp DESC
      `;

      const result = await this.axiom.query(query);
      return this.processLiquidityResults(result);
    } catch (error) {
      logger.error(`❌ Failed to get liquidity events for ${tokenAddress}:`, error);
      return [];
    }
  }

  // Contract analysis
  async analyzeContract(network, tokenAddress) {
    try {
      const query = `
        SELECT 
          address,
          block_number,
          block_timestamp,
          transaction_hash,
          topic0,
          data,
          log_index
        FROM ${network}_logs 
        WHERE 
          address = '${tokenAddress}'
          AND block_timestamp >= NOW() - INTERVAL '24h'
        ORDER BY block_timestamp DESC
        LIMIT 1000
      `;

      const result = await this.axiom.query(query);
      return this.analyzeContractData(result, tokenAddress);
    } catch (error) {
      logger.error(`❌ Failed to analyze contract for ${tokenAddress}:`, error);
      return null;
    }
  }

  // Trading volume analysis
  async getTradingVolume(network, tokenAddress, timeRange = '1h') {
    try {
      const query = `
        SELECT 
          DATE_TRUNC('minute', block_timestamp) as minute,
          COUNT(*) as transaction_count,
          SUM(CAST(data AS DECIMAL)) as volume
        FROM ${network}_logs 
        WHERE 
          address = '${tokenAddress}'
          AND topic0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          AND block_timestamp >= NOW() - INTERVAL '${timeRange}'
        GROUP BY minute
        ORDER BY minute DESC
      `;

      const result = await this.axiom.query(query);
      return this.processVolumeResults(result);
    } catch (error) {
      logger.error(`❌ Failed to get trading volume for ${tokenAddress}:`, error);
      return [];
    }
  }

  // Gas price monitoring
  async getGasPrices(network, timeRange = '10m') {
    try {
      const query = `
        SELECT 
          block_number,
          block_timestamp,
          gas_price,
          gas_used,
          gas_limit
        FROM ${network}_blocks 
        WHERE 
          block_timestamp >= NOW() - INTERVAL '${timeRange}'
        ORDER BY block_timestamp DESC
        LIMIT 100
      `;

      const result = await this.axiom.query(query);
      return this.processGasResults(result);
    } catch (error) {
      logger.error(`❌ Failed to get gas prices for ${network}:`, error);
      return null;
    }
  }

  // Social sentiment data (if available)
  async getSocialMetrics(tokenAddress, timeRange = '24h') {
    try {
      // This would depend on what social data is available in Axiom
      // For now, return basic structure
      return {
        mentions: 0,
        sentiment: 'neutral',
        engagement: 0,
        influencers: []
      };
    } catch (error) {
      logger.error(`❌ Failed to get social metrics for ${tokenAddress}:`, error);
      return null;
    }
  }

  // Market data aggregation
  async getMarketData(network, timeRange = '1h') {
    try {
      const query = `
        SELECT 
          DATE_TRUNC('minute', block_timestamp) as minute,
          COUNT(DISTINCT address) as new_tokens,
          COUNT(*) as total_transactions,
          AVG(CAST(data AS DECIMAL)) as avg_transaction_value
        FROM ${network}_logs 
        WHERE 
          topic0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          AND block_timestamp >= NOW() - INTERVAL '${timeRange}'
        GROUP BY minute
        ORDER BY minute DESC
      `;

      const result = await this.axiom.query(query);
      return this.processMarketResults(result);
    } catch (error) {
      logger.error(`❌ Failed to get market data for ${network}:`, error);
      return null;
    }
  }

  // Helper methods for processing results
  processTokenResults(result) {
    // Process and format token results
    return result.rows || [];
  }

  processLiquidityResults(result) {
    // Process and format liquidity results
    return result.rows || [];
  }

  analyzeContractData(result, tokenAddress) {
    // Analyze contract data for risk assessment
    const analysis = {
      address: tokenAddress,
      totalTransactions: result.rows?.length || 0,
      riskFactors: [],
      suspiciousPatterns: []
    };

    // Add analysis logic here
    return analysis;
  }

  processVolumeResults(result) {
    // Process and format volume results
    return result.rows || [];
  }

  processGasResults(result) {
    // Process and format gas results
    return result.rows || [];
  }

  processMarketResults(result) {
    // Process and format market results
    return result.rows || [];
  }

  // Cache management
  setCache(key, value, ttl = this.cacheTTL) {
    if (!config.axiom?.cacheEnabled) return;
    
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl * 1000
    });
  }

  getCache(key) {
    if (!config.axiom?.cacheEnabled) return null;
    
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > cached.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.value;
  }

  clearCache() {
    this.cache.clear();
  }

  // Health check
  async healthCheck() {
    try {
      if (!this.isInitialized) {
        return { status: 'not_initialized', error: 'Service not initialized' };
      }

      await this.testConnection();
      return { status: 'healthy', timestamp: new Date().toISOString() };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  // Get service status
  getStatus() {
    return {
      initialized: this.isInitialized,
      cacheEnabled: config.axiom?.cacheEnabled || false,
      cacheSize: this.cache.size,
      cacheTTL: this.cacheTTL
    };
  }
}

// Singleton instance
let axiomService = null;

const initializeAxiom = async () => {
  if (!axiomService) {
    axiomService = new AxiomService();
    await axiomService.initialize();
  }
  return axiomService;
};

const getAxiomService = () => {
  if (!axiomService) {
    throw new Error('Axiom service not initialized. Call initializeAxiom() first.');
  }
  return axiomService;
};

module.exports = {
  AxiomService,
  initializeAxiom,
  getAxiomService
};
