const { ethers } = require('ethers');
const { logger } = require('../utils/logger');
const { HoneypotDetector } = require('./honeypotDetector');
const { ContractAnalyzer } = require('./contractAnalyzer');
const { LiquidityAnalyzer } = require('./liquidityAnalyzer');
const { SocialAnalyzer } = require('./socialAnalyzer');

class TokenAnalyzer {
  constructor(provider, network) {
    this.provider = provider;
    this.network = network;
    this.honeypotDetector = new HoneypotDetector(provider, network);
    this.contractAnalyzer = new ContractAnalyzer(provider, network);
    this.liquidityAnalyzer = new LiquidityAnalyzer(provider, network);
    this.socialAnalyzer = new SocialAnalyzer();
    
    // Cache for analysis results
    this.analysisCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    
    // Known contract patterns
    this.contractPatterns = {
      honeypot: [
        '0x0000000000000000000000000000000000000000',
        '0x1111111111111111111111111111111111111111'
      ],
      blacklisted: [],
      whitelisted: []
    };
  }

  async scanForNewTokens() {
    try {
      const newTokens = [];
      
      // Scan for new token creation events
      const factoryAddresses = this.getFactoryAddresses();
      
      for (const factoryAddress of factoryAddresses) {
        const tokens = await this.scanFactoryForNewTokens(factoryAddress);
        newTokens.push(...tokens);
      }
      
      // Filter out duplicates and sort by timestamp
      const uniqueTokens = this.filterUniqueTokens(newTokens);
      
      logger.info(`🔍 Found ${uniqueTokens.length} new tokens on ${this.network}`);
      
      return uniqueTokens;
      
    } catch (error) {
      logger.error(`Error scanning for new tokens on ${this.network}:`, error);
      return [];
    }
  }

  getFactoryAddresses() {
    const config = require('../../config.json');
    const dexes = config.dexes;
    
    const addresses = [];
    
    if (this.network === 'ethereum' && dexes.uniswap?.enabled) {
      addresses.push(dexes.uniswap.factory);
    }
    
    if (this.network === 'bsc' && dexes.pancakeswap?.enabled) {
      addresses.push(dexes.pancakeswap.factory);
    }
    
    if (this.network === 'polygon' && dexes.quickswap?.enabled) {
      addresses.push(dexes.quickswap.factory);
    }
    
    return addresses;
  }

  async scanFactoryForNewTokens(factoryAddress) {
    try {
      // Factory ABI for PairCreated event
      const factoryABI = [
        'event PairCreated(address indexed token0, address indexed token1, address pair, uint)'
      ];
      
      const factory = new ethers.Contract(factoryAddress, factoryABI, this.provider);
      
      // Get recent events (last 100 blocks)
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 100);
      
      const events = await factory.queryFilter('PairCreated', fromBlock, currentBlock);
      
      const tokens = [];
      
      for (const event of events) {
        const [token0, token1, pair] = event.args;
        
        // Check if either token is a new memecoin (not WETH/WBNB/etc.)
        const nativeToken = this.getNativeTokenAddress();
        
        if (token0 !== nativeToken && token1 !== nativeToken) {
          // Determine which token is the new one
          const newTokenAddress = token0 === nativeToken ? token1 : token0;
          
          try {
            const tokenInfo = await this.getBasicTokenInfo(newTokenAddress);
            if (tokenInfo) {
              tokens.push({
                ...tokenInfo,
                pairAddress: pair,
                blockNumber: event.blockNumber,
                timestamp: Date.now()
              });
            }
          } catch (error) {
            // Skip tokens that can't be analyzed
            continue;
          }
        }
      }
      
      return tokens;
      
    } catch (error) {
      logger.error(`Error scanning factory ${factoryAddress}:`, error);
      return [];
    }
  }

  getNativeTokenAddress() {
    const nativeTokens = {
      ethereum: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      bsc: '0xbb4CdB9CBd36B01bD1cBaEF60aF14c8c3A565C6C', // WBNB
      polygon: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
      arbitrum: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
      base: '0x4200000000000000000000000000000000000006' // WETH
    };
    
    return nativeTokens[this.network] || nativeTokens.ethereum;
  }

  async getBasicTokenInfo(tokenAddress) {
    try {
      // Basic ERC20 ABI
      const basicABI = [
        'function name() view returns (string)',
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
        'function totalSupply() view returns (uint256)'
      ];
      
      const token = new ethers.Contract(tokenAddress, basicABI, this.provider);
      
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        token.name(),
        token.symbol(),
        token.decimals(),
        token.totalSupply()
      ]);
      
      return {
        address: tokenAddress,
        name,
        symbol,
        decimals: Number(decimals),
        totalSupply: totalSupply.toString(),
        network: this.network
      };
      
    } catch (error) {
      // Token might not be ERC20 compliant
      return null;
    }
  }

  filterUniqueTokens(tokens) {
    const uniqueMap = new Map();
    
    for (const token of tokens) {
      if (!uniqueMap.has(token.address)) {
        uniqueMap.set(token.address, token);
      } else {
        // Keep the earliest one
        const existing = uniqueMap.get(token.address);
        if (token.timestamp < existing.timestamp) {
          uniqueMap.set(token.address, token);
        }
      }
    }
    
    return Array.from(uniqueMap.values())
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async checkHoneypot(tokenAddress) {
    try {
      return await this.honeypotDetector.detectHoneypot(tokenAddress);
    } catch (error) {
      logger.error(`Honeypot check failed for ${tokenAddress}:`, error);
      return true; // Assume honeypot if check fails
    }
  }

  async checkLiquidity(tokenAddress) {
    try {
      return await this.liquidityAnalyzer.hasLiquidity(tokenAddress);
    } catch (error) {
      logger.error(`Liquidity check failed for ${tokenAddress}:`, error);
      return false;
    }
  }

  async checkContractAge(tokenAddress) {
    try {
      const code = await this.provider.getCode(tokenAddress);
      if (code === '0x') return Infinity; // Contract doesn't exist
      
      // Get contract creation block
      const creationBlock = await this.findContractCreationBlock(tokenAddress);
      if (!creationBlock) return Infinity;
      
      const currentBlock = await this.provider.getBlockNumber();
      const blockAge = currentBlock - creationBlock;
      
      // Convert blocks to seconds (approximate)
      const blockTime = this.getBlockTime();
      const ageInSeconds = blockAge * blockTime;
      
      return ageInSeconds;
      
    } catch (error) {
      logger.error(`Contract age check failed for ${tokenAddress}:`, error);
      return Infinity;
    }
  }

  async findContractCreationBlock(tokenAddress) {
    try {
      // Binary search for contract creation block
      let left = 0;
      let right = await this.provider.getBlockNumber();
      let result = null;
      
      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        
        try {
          const code = await this.provider.getCode(tokenAddress, mid);
          
          if (code === '0x') {
            left = mid + 1;
          } else {
            result = mid;
            right = mid - 1;
          }
        } catch (error) {
          // Block might not exist, try next
          left = mid + 1;
        }
      }
      
      return result;
      
    } catch (error) {
      logger.error(`Error finding creation block for ${tokenAddress}:`, error);
      return null;
    }
  }

  getBlockTime() {
    const blockTimes = {
      ethereum: 12,
      bsc: 3,
      polygon: 2,
      arbitrum: 1,
      base: 2
    };
    
    return blockTimes[this.network] || 12;
  }

  async checkOwnership(tokenAddress) {
    try {
      return await this.contractAnalyzer.checkOwnership(tokenAddress);
    } catch (error) {
      logger.error(`Ownership check failed for ${tokenAddress}:`, error);
      return { renounced: false, owner: null };
    }
  }

  async performFullAnalysis(tokenAddress) {
    try {
      // Check cache first
      const cached = this.analysisCache.get(tokenAddress);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.analysis;
      }
      
      logger.info(`🔍 Performing full analysis for ${tokenAddress}`);
      
      // Perform comprehensive analysis
      const analysis = await Promise.all([
        this.analyzeContract(tokenAddress),
        this.analyzeLiquidity(tokenAddress),
        this.analyzeSocialMetrics(tokenAddress),
        this.analyzeTradingMetrics(tokenAddress),
        this.analyzeRiskFactors(tokenAddress)
      ]);
      
      const [contract, liquidity, social, trading, risk] = analysis;
      
      const fullAnalysis = {
        contract,
        liquidity,
        social,
        trading,
        risk,
        timestamp: Date.now(),
        network: this.network
      };
      
      // Calculate overall score
      fullAnalysis.score = this.calculateAnalysisScore(fullAnalysis);
      fullAnalysis.risk = this.calculateRiskScore(fullAnalysis);
      fullAnalysis.profitPotential = this.calculateProfitPotential(fullAnalysis);
      
      // Cache the result
      this.analysisCache.set(tokenAddress, {
        analysis: fullAnalysis,
        timestamp: Date.now()
      });
      
      logger.info(`✅ Analysis complete for ${tokenAddress} - Score: ${fullAnalysis.score}, Risk: ${fullAnalysis.risk}, Potential: ${fullAnalysis.profitPotential}`);
      
      return fullAnalysis;
      
    } catch (error) {
      logger.error(`Full analysis failed for ${tokenAddress}:`, error);
      throw error;
    }
  }

  async analyzeContract(tokenAddress) {
    try {
      const [
        isHoneypot,
        ownership,
        age,
        verification,
        audit,
        functions
      ] = await Promise.all([
        this.honeypotDetector.detectHoneypot(tokenAddress),
        this.contractAnalyzer.checkOwnership(tokenAddress),
        this.checkContractAge(tokenAddress),
        this.contractAnalyzer.checkVerification(tokenAddress),
        this.contractAnalyzer.checkAudit(tokenAddress),
        this.contractAnalyzer.analyzeFunctions(tokenAddress)
      ]);
      
      return {
        isHoneypot,
        ownership,
        age,
        isVerified: verification.isVerified,
        isAudited: audit.isAudited,
        auditScore: audit.score,
        functions,
        riskFactors: this.identifyContractRiskFactors(ownership, functions, age)
      };
      
    } catch (error) {
      logger.error(`Contract analysis failed for ${tokenAddress}:`, error);
      return {
        isHoneypot: true,
        ownership: { renounced: false, owner: null },
        age: Infinity,
        isVerified: false,
        isAudited: false,
        auditScore: 0,
        functions: [],
        riskFactors: ['analysis_failed']
      };
    }
  }

  async analyzeLiquidity(tokenAddress) {
    try {
      const [
        hasLiquidity,
        liquidityAmount,
        liquidityDistribution,
        liquidityLocks,
        priceImpact
      ] = await Promise.all([
        this.liquidityAnalyzer.hasLiquidity(tokenAddress),
        this.liquidityAnalyzer.getLiquidityAmount(tokenAddress),
        this.liquidityAnalyzer.getLiquidityDistribution(tokenAddress),
        this.liquidityAnalyzer.getLiquidityLocks(tokenAddress),
        this.liquidityAnalyzer.calculatePriceImpact(tokenAddress)
      ]);
      
      return {
        hasLiquidity,
        amount: liquidityAmount,
        distribution: liquidityDistribution,
        locks: liquidityLocks,
        priceImpact,
        quality: this.assessLiquidityQuality(liquidityAmount, liquidityDistribution, liquidityLocks)
      };
      
    } catch (error) {
      logger.error(`Liquidity analysis failed for ${tokenAddress}:`, error);
      return {
        hasLiquidity: false,
        amount: 0,
        distribution: {},
        locks: [],
        priceImpact: 100,
        quality: 'poor'
      };
    }
  }

  async analyzeSocialMetrics(tokenAddress) {
    try {
      return await this.socialAnalyzer.analyzeToken(tokenAddress, this.network);
    } catch (error) {
      logger.error(`Social analysis failed for ${tokenAddress}:`, error);
      return {
        telegramMembers: 0,
        telegramGrowth: 0,
        twitterFollowers: 0,
        twitterGrowth: 0,
        redditMentions: 0,
        sentiment: 'neutral',
        score: 50
      };
    }
  }

  async analyzeTradingMetrics(tokenAddress) {
    try {
      // This would integrate with DEX APIs to get trading data
      // For now, return placeholder data
      return {
        volume24h: 0,
        volumeChange: 0,
        priceChange24h: 0,
        priceChange1h: 0,
        marketCap: 0,
        holders: 0,
        transactions: 0
      };
    } catch (error) {
      logger.error(`Trading analysis failed for ${tokenAddress}:`, error);
      return {
        volume24h: 0,
        volumeChange: 0,
        priceChange24h: 0,
        priceChange1h: 0,
        marketCap: 0,
        holders: 0,
        transactions: 0
      };
    }
  }

  async analyzeRiskFactors(tokenAddress) {
    try {
      const riskFactors = [];
      
      // Check for common scam patterns
      const patterns = await this.detectScamPatterns(tokenAddress);
      riskFactors.push(...patterns);
      
      // Check for suspicious transactions
      const suspiciousTx = await this.detectSuspiciousTransactions(tokenAddress);
      if (suspiciousTx) riskFactors.push('suspicious_transactions');
      
      // Check for rug pull indicators
      const rugPull = await this.detectRugPullIndicators(tokenAddress);
      if (rugPull) riskFactors.push('rug_pull_risk');
      
      return riskFactors;
      
    } catch (error) {
      logger.error(`Risk analysis failed for ${tokenAddress}:`, error);
      return ['risk_analysis_failed'];
    }
  }

  async detectScamPatterns(tokenAddress) {
    const patterns = [];
    
    try {
      // Check for known scam addresses
      if (this.contractPatterns.blacklisted.includes(tokenAddress.toLowerCase())) {
        patterns.push('blacklisted_address');
      }
      
      // Check for suspicious function names
      const code = await this.provider.getCode(tokenAddress);
      if (code.includes('0x0000000000000000000000000000000000000000')) {
        patterns.push('suspicious_code_patterns');
      }
      
      // Check for excessive fees
      const fees = await this.checkExcessiveFees(tokenAddress);
      if (fees.excessive) {
        patterns.push('excessive_fees');
      }
      
    } catch (error) {
      logger.error(`Scam pattern detection failed for ${tokenAddress}:`, error);
    }
    
    return patterns;
  }

  async checkExcessiveFees(tokenAddress) {
    try {
      // This would check for excessive buy/sell fees
      // For now, return default values
      return {
        excessive: false,
        buyFee: 0,
        sellFee: 0
      };
    } catch (error) {
      return { excessive: false, buyFee: 0, sellFee: 0 };
    }
  }

  async detectSuspiciousTransactions(tokenAddress) {
    try {
      // Check recent transactions for suspicious patterns
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 100);
      
      const logs = await this.provider.getLogs({
        address: tokenAddress,
        fromBlock,
        toBlock: currentBlock
      });
      
      // Analyze transaction patterns
      // This is a simplified version
      return logs.length > 1000; // Suspicious if too many transactions
      
    } catch (error) {
      return false;
    }
  }

  async detectRugPullIndicators(tokenAddress) {
    try {
      // Check for rug pull indicators
      const [
        liquidityRemoved,
        largeTransfers,
        ownerActivity
      ] = await Promise.all([
        this.checkLiquidityRemoval(tokenAddress),
        this.checkLargeTransfers(tokenAddress),
        this.checkOwnerActivity(tokenAddress)
      ]);
      
      return liquidityRemoved || largeTransfers || ownerActivity;
      
    } catch (error) {
      return false;
    }
  }

  async checkLiquidityRemoval(tokenAddress) {
    // Check if liquidity was recently removed
    return false; // Simplified
  }

  async checkLargeTransfers(tokenAddress) {
    // Check for large token transfers to suspicious addresses
    return false; // Simplified
  }

  async checkOwnerActivity(tokenAddress) {
    // Check if owner is actively trading
    return false; // Simplified
  }

  identifyContractRiskFactors(ownership, functions, age) {
    const riskFactors = [];
    
    if (!ownership.renounced) {
      riskFactors.push('owner_not_renounced');
    }
    
    if (age < 60) { // Less than 1 minute
      riskFactors.push('very_new_contract');
    }
    
    if (functions.includes('pause') || functions.includes('blacklist')) {
      riskFactors.push('pausable_contract');
    }
    
    return riskFactors;
  }

  assessLiquidityQuality(amount, distribution, locks) {
    if (amount < 1000) return 'poor';
    if (amount < 10000) return 'fair';
    if (amount < 100000) return 'good';
    return 'excellent';
  }

  calculateAnalysisScore(analysis) {
    let score = 0;
    
    // Contract quality (40%)
    if (!analysis.contract.isHoneypot) score += 40;
    if (analysis.contract.isVerified) score += 10;
    if (analysis.contract.isAudited) score += 10;
    if (analysis.contract.ownership.renounced) score += 10;
    
    // Liquidity quality (30%)
    if (analysis.liquidity.hasLiquidity) score += 30;
    if (analysis.liquidity.quality === 'excellent') score += 10;
    if (analysis.liquidity.quality === 'good') score += 5;
    
    // Social metrics (20%)
    score += Math.min(analysis.social.score / 5, 20);
    
    // Risk factors (10%)
    score -= analysis.risk.length * 2;
    
    return Math.max(0, Math.min(100, score));
  }

  calculateRiskScore(analysis) {
    let riskScore = 0;
    
    // Contract risks
    if (analysis.contract.isHoneypot) riskScore += 50;
    if (!analysis.contract.ownership.renounced) riskScore += 20;
    if (analysis.contract.age < 300) riskScore += 15;
    
    // Liquidity risks
    if (!analysis.liquidity.hasLiquidity) riskScore += 30;
    if (analysis.liquidity.quality === 'poor') riskScore += 20;
    
    // Risk factors
    riskScore += analysis.risk.length * 5;
    
    return Math.min(100, riskScore);
  }

  calculateProfitPotential(analysis) {
    let potential = 200; // Base 2x potential
    
    // Adjust based on score
    if (analysis.score > 80) potential *= 2;
    if (analysis.score > 90) potential *= 1.5;
    
    // Adjust based on social metrics
    if (analysis.social.score > 80) potential *= 1.3;
    
    // Adjust based on risk
    if (analysis.risk < 20) potential *= 1.2;
    
    return Math.round(potential);
  }

  clearCache() {
    this.analysisCache.clear();
    logger.info('🧹 Token analysis cache cleared');
  }

  getCacheStats() {
    return {
      size: this.analysisCache.size,
      networks: [this.network]
    };
  }
}

module.exports = { TokenAnalyzer };
