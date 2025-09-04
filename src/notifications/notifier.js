const TelegramBot = require('node-telegram-bot-api');
const { logger } = require('../utils/logger');
const { cacheSet, cacheGet } = require('../database/redis');

class Notifier {
  constructor() {
    this.isInitialized = false;
    this.telegramBot = null;
    this.notificationChannels = new Map();
    this.notificationQueue = [];
    this.isProcessingQueue = false;
  }

  async initialize() {
    try {
      logger.info('🔔 Initializing Notification System...');
      
      // Initialize Telegram bot
      await this.initializeTelegram();
      
      // Initialize other notification channels
      await this.initializeChannels();
      
      // Start notification queue processor
      this.startQueueProcessor();
      
      this.isInitialized = true;
      logger.info('✅ Notification System initialized successfully');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Notification System:', error);
      throw error;
    }
  }

  async initializeTelegram() {
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;
    
    if (!telegramToken || !telegramChatId) {
      logger.warn('⚠️ Telegram credentials not provided, Telegram notifications disabled');
      return;
    }
    
    try {
      this.telegramBot = new TelegramBot(telegramToken, { polling: false });
      
      // Test bot connection
      const botInfo = await this.telegramBot.getMe();
      logger.info(`✅ Telegram bot initialized: @${botInfo.username}`);
      
      // Store chat ID
      this.notificationChannels.set('telegram', {
        type: 'telegram',
        chatId: telegramChatId,
        enabled: true
      });
      
    } catch (error) {
      logger.error('Failed to initialize Telegram bot:', error);
      this.notificationChannels.set('telegram', {
        type: 'telegram',
        enabled: false,
        error: error.message
      });
    }
  }

  async initializeChannels() {
    // Initialize Discord (if configured)
    if (process.env.DISCORD_WEBHOOK_URL) {
      this.notificationChannels.set('discord', {
        type: 'discord',
        webhookUrl: process.env.DISCORD_WEBHOOK_URL,
        enabled: true
      });
      logger.info('✅ Discord notifications enabled');
    }
    
    // Initialize email (if configured)
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      this.notificationChannels.set('email', {
        type: 'email',
        smtp: {
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT || 587,
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        enabled: true
      });
      logger.info('✅ Email notifications enabled');
    }
    
    // Initialize webhook (if configured)
    if (process.env.WEBHOOK_URL) {
      this.notificationChannels.set('webhook', {
        type: 'webhook',
        url: process.env.WEBHOOK_URL,
        enabled: true
      });
      logger.info('✅ Webhook notifications enabled');
    }
  }

  startQueueProcessor() {
    setInterval(async () => {
      if (this.notificationQueue.length > 0 && !this.isProcessingQueue) {
        await this.processNotificationQueue();
      }
    }, 1000); // Check every second
  }

  async processNotificationQueue() {
    if (this.isProcessingQueue) return;
    
    this.isProcessingQueue = true;
    
    try {
      while (this.notificationQueue.length > 0) {
        const notification = this.notificationQueue.shift();
        await this.sendNotification(notification);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      logger.error('Error processing notification queue:', error);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  async sendNotification(notification) {
    try {
      const promises = [];
      
      // Send to all enabled channels
      for (const [channelName, channel] of this.notificationChannels) {
        if (channel.enabled) {
          switch (channel.type) {
            case 'telegram':
              promises.push(this.sendTelegramNotification(notification, channel));
              break;
            case 'discord':
              promises.push(this.sendDiscordNotification(notification, channel));
              break;
            case 'email':
              promises.push(this.sendEmailNotification(notification, channel));
              break;
            case 'webhook':
              promises.push(this.sendWebhookNotification(notification, channel));
              break;
          }
        }
      }
      
      // Wait for all notifications to be sent
      await Promise.allSettled(promises);
      
      // Log notification
      logger.info(`🔔 Notification sent: ${notification.type} - ${notification.title}`);
      
    } catch (error) {
      logger.error('Failed to send notification:', error);
    }
  }

  async sendTelegramNotification(notification, channel) {
    if (!this.telegramBot || !channel.enabled) return;
    
    try {
      const message = this.formatTelegramMessage(notification);
      
      await this.telegramBot.sendMessage(channel.chatId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });
      
    } catch (error) {
      logger.error('Telegram notification failed:', error);
      channel.enabled = false;
      channel.error = error.message;
    }
  }

  async sendDiscordNotification(notification, channel) {
    if (!channel.enabled) return;
    
    try {
      const payload = this.formatDiscordPayload(notification);
      
      const response = await fetch(channel.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Discord API error: ${response.status}`);
      }
      
    } catch (error) {
      logger.error('Discord notification failed:', error);
      channel.enabled = false;
      channel.error = error.message;
    }
  }

  async sendEmailNotification(notification, channel) {
    if (!channel.enabled) return;
    
    try {
      // This would integrate with a proper email service
      // For now, just log that email would be sent
      logger.info(`📧 Email notification would be sent: ${notification.title}`);
      
    } catch (error) {
      logger.error('Email notification failed:', error);
      channel.enabled = false;
      channel.error = error.message;
    }
  }

  async sendWebhookNotification(notification, channel) {
    if (!channel.enabled) return;
    
    try {
      const response = await fetch(channel.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'CoinSniper/1.0'
        },
        body: JSON.stringify(notification)
      });
      
      if (!response.ok) {
        throw new Error(`Webhook error: ${response.status}`);
      }
      
    } catch (error) {
      logger.error('Webhook notification failed:', error);
      channel.enabled = false;
      channel.error = error.message;
    }
  }

  formatTelegramMessage(notification) {
    let message = '';
    
    // Add emoji based on type
    const emojis = {
      'TRADE': '💰',
      'ALERT': '🚨',
      'INFO': 'ℹ️',
      'SUCCESS': '✅',
      'WARNING': '⚠️',
      'ERROR': '❌'
    };
    
    const emoji = emojis[notification.type] || '🔔';
    
    message += `${emoji} <b>${notification.title}</b>\n\n`;
    
    if (notification.message) {
      message += `${notification.message}\n\n`;
    }
    
    if (notification.data) {
      for (const [key, value] of Object.entries(notification.data)) {
        if (typeof value === 'object') {
          message += `<b>${key}:</b> ${JSON.stringify(value)}\n`;
        } else {
          message += `<b>${key}:</b> ${value}\n`;
        }
      }
    }
    
    if (notification.timestamp) {
      message += `\n⏰ ${new Date(notification.timestamp).toLocaleString()}`;
    }
    
    return message;
  }

  formatDiscordPayload(notification) {
    const colors = {
      'TRADE': 0x00ff00, // Green
      'ALERT': 0xff0000, // Red
      'INFO': 0x0099ff,  // Blue
      'SUCCESS': 0x00ff00, // Green
      'WARNING': 0xffaa00, // Orange
      'ERROR': 0xff0000   // Red
    };
    
    const embed = {
      title: notification.title,
      description: notification.message || '',
      color: colors[notification.type] || 0x99aab5,
      timestamp: notification.timestamp || new Date().toISOString(),
      fields: []
    };
    
    if (notification.data) {
      for (const [key, value] of Object.entries(notification.data)) {
        embed.fields.push({
          name: key,
          value: typeof value === 'object' ? JSON.stringify(value) : String(value),
          inline: true
        });
      }
    }
    
    return {
      embeds: [embed]
    };
  }

  // High-level notification methods
  async notifyTrade(tradeData) {
    const notification = {
      type: 'TRADE',
      title: 'New Trade Executed',
      message: `Trade executed for ${tradeData.tokenSymbol}`,
      data: {
        'Token': tradeData.tokenSymbol,
        'Type': tradeData.tradeType,
        'Amount': tradeData.amount,
        'Price': tradeData.price,
        'Gas Used': tradeData.gasUsed,
        'Status': tradeData.status
      },
      timestamp: new Date(),
      priority: 'HIGH'
    };
    
    await this.queueNotification(notification);
  }

  async notifyAlert(alertData) {
    const notification = {
      type: 'ALERT',
      title: 'Risk Alert',
      message: alertData.message,
      data: {
        'Severity': alertData.severity,
        'Type': alertData.type,
        'Value': alertData.value
      },
      timestamp: new Date(),
      priority: 'HIGH'
    };
    
    await this.queueNotification(notification);
  }

  async notifyOpportunity(tokenData, aiScore) {
    const notification = {
      type: 'INFO',
      title: 'New Trading Opportunity',
      message: `High-scoring token detected: ${tokenData.symbol}`,
      data: {
        'Token': tokenData.symbol,
        'AI Score': aiScore,
        'Liquidity': tokenData.formattedLiquidity,
        'Risk Score': tokenData.riskScore,
        'Recommendation': tokenData.sniperRecommendation
      },
      timestamp: new Date(),
      priority: 'MEDIUM'
    };
    
    await this.queueNotification(notification);
  }

  async notifyError(error, context = '') {
    const notification = {
      type: 'ERROR',
      title: 'System Error',
      message: error.message || 'An error occurred',
      data: {
        'Context': context,
        'Stack': error.stack?.split('\n')[0] || 'N/A',
        'Timestamp': new Date().toISOString()
      },
      timestamp: new Date(),
      priority: 'HIGH'
    };
    
    await this.queueNotification(notification);
  }

  async queueNotification(notification) {
    // Add priority-based ordering
    if (notification.priority === 'HIGH') {
      this.notificationQueue.unshift(notification);
    } else {
      this.notificationQueue.push(notification);
    }
    
    // Limit queue size
    if (this.notificationQueue.length > 100) {
      this.notificationQueue = this.notificationQueue.slice(0, 100);
    }
    
    logger.debug(`Notification queued: ${notification.type} - ${notification.title}`);
  }

  async getNotificationStatus() {
    return {
      isInitialized: this.isInitialized,
      channels: Object.fromEntries(this.notificationChannels),
      queueLength: this.notificationQueue.length,
      isProcessingQueue: this.isProcessingQueue
    };
  }

  async testNotification(channelName = 'telegram') {
    const testNotification = {
      type: 'INFO',
      title: 'Test Notification',
      message: 'This is a test notification from CoinSniper',
      data: {
        'Test': 'Success',
        'Channel': channelName,
        'Timestamp': new Date().toISOString()
      },
      timestamp: new Date(),
      priority: 'LOW'
    };
    
    await this.queueNotification(testNotification);
    return { success: true, message: 'Test notification queued' };
  }
}

module.exports = {
  Notifier,
  initializeNotifier: async () => {
    const notifier = new Notifier();
    await notifier.initialize();
    return notifier;
  }
};
