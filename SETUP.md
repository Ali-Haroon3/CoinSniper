# CoinSniper Setup Guide

This guide will walk you through setting up the CoinSniper memecoin sniper bot for maximum profit optimization.

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **Python 3.9+** - [Download here](https://www.python.org/)
- **Git** - [Download here](https://git-scm.com/)
- **MongoDB** - [Download here](https://www.mongodb.com/try/download/community) or use MongoDB Atlas
- **Redis** - [Download here](https://redis.io/download) or use Redis Cloud

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/yourusername/coinsniper.git
cd coinsniper

# Install Node.js dependencies
npm install

# Install Python dependencies
pip install -r requirements.txt
```

### 2. Configuration

```bash
# Copy configuration template
cp config.example.json config.json

# Edit configuration file
nano config.json  # or use your preferred editor
```

#### Essential Configuration Steps:

1. **Add RPC Endpoints**
   ```json
   "networks": {
     "ethereum": {
       "rpc": "https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
     },
     "bsc": {
       "rpc": "https://bsc-dataseed.binance.org/"
     }
   }
   ```

2. **Add Wallet Private Keys**
   ```json
   "wallets": [
     {
       "name": "Main Wallet",
       "privateKey": "YOUR_PRIVATE_KEY_HERE",
       "address": "YOUR_WALLET_ADDRESS",
       "maxAllocation": 50
     }
   ]
   ```

3. **Configure Trading Parameters**
   ```json
   "trading": {
     "maxSlippage": 15,
     "minLiquidity": 1000,
     "maxBuyAmount": 0.1,
     "takeProfit": 300,
     "stopLoss": 50
   }
   ```

4. **Set Up Notifications (Optional)**
   ```json
   "notifications": {
     "telegram": {
       "enabled": true,
       "botToken": "YOUR_BOT_TOKEN",
       "chatId": "YOUR_CHAT_ID"
     }
   }
   ```

### 3. Environment Variables

Create a `.env` file:

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/coinsniper
REDIS_URL=redis://localhost:6379

# API Keys (if using external services)
ALCHEMY_API_KEY=your_alchemy_key
ETHERSCAN_API_KEY=your_etherscan_key
BSCSCAN_API_KEY=your_bscscan_key

# Security
JWT_SECRET=your_jwt_secret_key
ENCRYPTION_KEY=your_encryption_key

# Optional: OpenAI API for AI analysis
OPENAI_API_KEY=your_openai_key
```

### 4. Database Setup

#### MongoDB
```bash
# Start MongoDB
mongod

# Create database and user
mongosh
use coinsniper
db.createUser({
  user: "coinsniper",
  pwd: "your_password",
  roles: ["readWrite"]
})
```

#### Redis
```bash
# Start Redis
redis-server

# Test connection
redis-cli ping
```

### 5. Start the Bot

```bash
# Development mode
npm run dev

# Production mode
npm start

# Build and run
npm run build
npm start
```

## 🔧 Advanced Configuration

### Profit Maximization Settings

```json
{
  "profitOptimization": {
    "enabled": true,
    "strategies": {
      "momentum": { "weight": 0.3, "enabled": true },
      "meanReversion": { "weight": 0.25, "enabled": true },
      "breakout": { "weight": 0.25, "enabled": true },
      "sentiment": { "weight": 0.2, "enabled": true }
    },
    "dynamicPositionSizing": true,
    "kellyCriterion": true,
    "trailingStops": true
  }
}
```

### Risk Management

```json
{
  "riskManagement": {
    "maxDailyLoss": 5,
    "maxSingleLoss": 2,
    "maxPortfolioRisk": 10,
    "emergencyStop": true,
    "correlationAnalysis": true,
    "volatilityAdjustment": true
  }
}
```

### Multi-Chain Configuration

```json
{
  "networks": {
    "ethereum": {
      "enabled": true,
      "priority": 1,
      "gasOptimization": true
    },
    "bsc": {
      "enabled": true,
      "priority": 2,
      "gasOptimization": true
    },
    "polygon": {
      "enabled": true,
      "priority": 3,
      "gasOptimization": true
    }
  }
}
```

## 📊 Dashboard Access

Once running, access the dashboard at:
- **Local**: http://localhost:3000
- **API**: http://localhost:3000/api
- **Health Check**: http://localhost:3000/health

## 🚨 Security Considerations

### Private Key Security
- **NEVER** commit private keys to version control
- Use environment variables for sensitive data
- Consider using hardware wallets for large amounts
- Implement IP whitelisting for API access

### Network Security
```bash
# Firewall rules (example for Ubuntu)
sudo ufw allow 3000/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

### API Security
```json
{
  "api": {
    "rateLimit": {
      "windowMs": 15 * 60 * 1000,
      "max": 100
    },
    "cors": {
      "origin": ["http://localhost:3000"],
      "credentials": true
    }
  }
}
```

## 🔍 Monitoring and Maintenance

### Log Management
```bash
# View logs
tail -f logs/combined.log
tail -f logs/error.log

# Log rotation (automatic)
# Logs are automatically rotated when they reach 5MB
```

### Performance Monitoring
```bash
# Check system resources
htop
nvidia-smi  # if using GPU

# Monitor database performance
mongosh --eval "db.stats()"
redis-cli info memory
```

### Backup Strategy
```bash
# MongoDB backup
mongodump --db coinsniper --out ./backups/$(date +%Y%m%d)

# Redis backup
redis-cli BGSAVE

# Configuration backup
cp config.json ./backups/config_$(date +%Y%m%d).json
```

## 🚀 Deployment Options

### Local Development
```bash
npm run dev
# Uses nodemon for auto-restart
```

### Production Server
```bash
# Build the application
npm run build

# Use PM2 for process management
npm install -g pm2
pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

### Docker Deployment
```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
# Build and run
docker build -t coinsniper .
docker run -p 3000:3000 coinsniper
```

### Cloud Deployment

#### AWS EC2
```bash
# Install dependencies
sudo yum update -y
sudo yum install -y nodejs npm python3

# Clone and setup
git clone https://github.com/yourusername/coinsniper.git
cd coinsniper
npm install
pip3 install -r requirements.txt

# Use systemd service
sudo systemctl enable coinsniper
sudo systemctl start coinsniper
```

#### DigitalOcean Droplet
```bash
# Similar to AWS setup
# Consider using Docker for easier deployment
```

## 📈 Performance Optimization

### Database Optimization
```json
{
  "database": {
    "mongoUri": "mongodb://localhost:27017/coinsniper",
    "options": {
      "maxPoolSize": 50,
      "minPoolSize": 10,
      "maxIdleTimeMS": 30000
    }
  }
}
```

### Caching Strategy
```json
{
  "caching": {
    "enabled": true,
    "redis": {
      "maxMemory": "256mb",
      "maxMemoryPolicy": "allkeys-lru"
    },
    "inMemory": {
      "maxSize": 1000,
      "ttl": 300000
    }
  }
}
```

### Network Optimization
```json
{
  "networks": {
    "ethereum": {
      "rpc": "https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY",
      "ws": "wss://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY",
      "batchSize": 100,
      "timeout": 30000
    }
  }
}
```

## 🐛 Troubleshooting

### Common Issues

#### Connection Errors
```bash
# Check RPC endpoints
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
```

#### Database Connection
```bash
# Test MongoDB connection
mongosh "mongodb://localhost:27017/coinsniper"

# Test Redis connection
redis-cli ping
```

#### Gas Price Issues
```json
{
  "networks": {
    "ethereum": {
      "gasPrice": "auto",
      "maxGasPrice": "100",
      "priorityFee": "2",
      "gasMultiplier": 1.2
    }
  }
}
```

### Debug Mode
```bash
# Enable debug logging
export LOG_LEVEL=debug
npm start

# Or set in config
{
  "logging": {
    "level": "debug",
    "enableConsole": true,
    "enableFile": true
  }
}
```

## 📚 Additional Resources

### Documentation
- [Ethers.js Documentation](https://docs.ethers.org/)
- [Web3.js Documentation](https://web3js.org/docs/)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Redis Documentation](https://redis.io/documentation)

### Community
- [Discord Server](https://discord.gg/coinsniper)
- [Telegram Group](https://t.me/coinsniper)
- [GitHub Issues](https://github.com/yourusername/coinsniper/issues)

### Support
For technical support or questions:
- Create a GitHub issue
- Join our Discord server
- Contact: support@coinsniper.com

## ⚠️ Disclaimer

This software is for educational purposes only. Trading cryptocurrencies involves significant risk and can result in the loss of your capital. Always do your own research and never invest more than you can afford to lose.

The developers are not responsible for any financial losses incurred through the use of this software.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Happy Sniping! 🚀💰**
