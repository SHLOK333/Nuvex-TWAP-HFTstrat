/**
 * Trading Bot Configuration
 * Centralized configuration for the TWAP trading bot
 */

import dotenv from 'dotenv';
dotenv.config();

export const botConfig = {
    // Basic trading parameters
    symbol: 'ETH/USDT',
    quoteInterval: 10000, // 10 seconds
    orderDuration: 300000, // 5 minutes per order
    maxOrderParts: 10,
    
    // Network configuration
    network: {
        chainId: 42161, // Arbitrum One
        rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
        privateKey: process.env.PRIVATE_KEY
    },
    
    // Contract addresses
    contracts: {
        delegatedWalletAddress: process.env.DELEGATED_WALLET_ADDRESS || '0xaa3b89a93560F1AC6F2cad0B1aefe75623495a7b',
        usdtAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        ethAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
        oneInchAddress: '0x1111111254eeb25477b68fb85ed929f73a960582'
    },
    
    // Avellaneda-Stoikov model parameters
    model: {
        riskAversion: parseFloat(process.env.RISK_AVERSION) || 0.1,
        timeHorizon: parseFloat(process.env.TIME_HORIZON) || 1.0, // 1 hour
        tickSize: parseFloat(process.env.TICK_SIZE) || 0.01,
        lotSize: parseFloat(process.env.LOT_SIZE) || 0.001,
        
        // Model tuning parameters
        arrivalIntensity: 100, // trades per hour
        spreadMultiplier: 1.0,
        inventoryPenalty: 0.5,
        adaptationRate: 0.1
    },
    
    // Market data configuration
    marketData: {
        sources: ['coingecko', 'dexscreener', '1inch'],
        updateInterval: 5000, // 5 seconds
        priceHistoryLength: 100,
        volatilityWindow: 20,
        
        // API keys
        coingeckoApiKey: process.env.COINGECKO_API_KEY,
        dexscreenerApiKey: process.env.DEXSCREENER_API_KEY,
        oneInchApiKey: process.env.ONEINCH_API_KEY
    },
    
    // Execution parameters
    execution: {
        minOrderSize: parseFloat(process.env.MIN_ORDER_SIZE) || 0.01, // ETH
        maxOrderSize: parseFloat(process.env.MAX_ORDER_SIZE) || 1.0,  // ETH
        maxSlippage: parseFloat(process.env.MAX_SLIPPAGE) || 0.005,   // 0.5%
        gasMultiplier: 1.2,
        
        // Contract ABIs (simplified - in production would be full ABIs)
        delegatedWalletABI: [
            'function execute(address target, bytes calldata data) external returns (bytes memory)',
            'function executeWithSignature(address target, bytes calldata data, bytes calldata signature) external returns (bytes memory)',
            'function owner() view returns (address)',
            'function delegated() view returns (address)'
        ],
        erc20ABI: [
            'function balanceOf(address owner) view returns (uint256)',
            'function transfer(address to, uint256 amount) returns (bool)',
            'function approve(address spender, uint256 amount) returns (bool)',
            'function allowance(address owner, address spender) view returns (uint256)'
        ]
    },
    
    // Risk management parameters
    risk: {
        maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS) || 1000, // USD
        maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE) || 10, // ETH
        maxOrderSize: parseFloat(process.env.MAX_ORDER_SIZE) || 1, // ETH per order
        maxSlippage: parseFloat(process.env.MAX_SLIPPAGE) || 0.005, // 0.5%
        maxDrawdown: parseFloat(process.env.MAX_DRAWDOWN) || 0.1, // 10%
        
        // Portfolio limits
        maxPortfolioValue: parseFloat(process.env.MAX_PORTFOLIO_VALUE) || 50000, // USD
        minCashReserve: parseFloat(process.env.MIN_CASH_RESERVE) || 1000, // USD
        
        // Dynamic risk adjustments
        volatilityAdjustment: true,
        inventoryAdjustment: true,
        timeDecayAdjustment: true
    },
    
    // Logging and monitoring
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        enableFileLogging: process.env.ENABLE_FILE_LOGGING === 'true',
        logDirectory: process.env.LOG_DIRECTORY || './logs',
        enableMetrics: process.env.ENABLE_METRICS === 'true'
    },
    
    // Web interface configuration
    webInterface: {
        enabled: process.env.WEB_INTERFACE_ENABLED !== 'false',
        port: parseInt(process.env.WEB_PORT) || 3001,
        enableAuth: process.env.ENABLE_AUTH === 'true',
        username: process.env.WEB_USERNAME || 'admin',
        password: process.env.WEB_PASSWORD || 'password123'
    },
    
    // Database configuration (for trade history)
    database: {
        enabled: process.env.DATABASE_ENABLED === 'true',
        type: process.env.DATABASE_TYPE || 'sqlite',
        path: process.env.DATABASE_PATH || './data/trades.db',
        host: process.env.DATABASE_HOST,
        port: process.env.DATABASE_PORT,
        username: process.env.DATABASE_USERNAME,
        password: process.env.DATABASE_PASSWORD
    },
    
    // Notification configuration
    notifications: {
        enabled: process.env.NOTIFICATIONS_ENABLED === 'true',
        
        // Discord webhook
        discord: {
            enabled: process.env.DISCORD_ENABLED === 'true',
            webhookUrl: process.env.DISCORD_WEBHOOK_URL
        },
        
        // Slack webhook
        slack: {
            enabled: process.env.SLACK_ENABLED === 'true',
            webhookUrl: process.env.SLACK_WEBHOOK_URL
        },
        
        // Email notifications
        email: {
            enabled: process.env.EMAIL_ENABLED === 'true',
            smtp: {
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT,
                username: process.env.SMTP_USERNAME,
                password: process.env.SMTP_PASSWORD
            },
            from: process.env.EMAIL_FROM,
            to: process.env.EMAIL_TO
        }
    }
};

/**
 * Validate configuration
 */
export function validateConfig() {
    const requiredEnvVars = [
        'PRIVATE_KEY',
        'ARBITRUM_RPC_URL'
    ];
    
    const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
    
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    
    // Validate private key format
    if (!process.env.PRIVATE_KEY.startsWith('0x')) {
        throw new Error('Private key must start with 0x');
    }
    
    // Validate risk parameters
    if (botConfig.risk.maxDailyLoss <= 0) {
        throw new Error('Max daily loss must be positive');
    }
    
    if (botConfig.model.riskAversion <= 0) {
        throw new Error('Risk aversion must be positive');
    }
    
    if (botConfig.execution.maxSlippage >= 1) {
        throw new Error('Max slippage must be less than 100%');
    }
    
    console.log('✅ Configuration validated successfully');
    return true;
}

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig() {
    const env = process.env.NODE_ENV || 'development';
    
    const envConfigs = {
        development: {
            model: {
                ...botConfig.model,
                // More conservative parameters for development
                riskAversion: botConfig.model.riskAversion * 2,
                spreadMultiplier: 1.5
            },
            execution: {
                ...botConfig.execution,
                // Smaller order sizes for testing
                minOrderSize: 0.001,
                maxOrderSize: 0.1
            },
            risk: {
                ...botConfig.risk,
                // Lower limits for development
                maxDailyLoss: 100,
                maxPositionSize: 1
            }
        },
        
        production: {
            model: {
                ...botConfig.model,
                // Production-tuned parameters
                arrivalIntensity: 150,
                adaptationRate: 0.05
            },
            logging: {
                ...botConfig.logging,
                level: 'warn',
                enableFileLogging: true
            }
        },
        
        test: {
            model: {
                ...botConfig.model,
                // Very conservative for testing
                riskAversion: 1.0,
                spreadMultiplier: 3.0
            },
            execution: {
                ...botConfig.execution,
                minOrderSize: 0.0001,
                maxOrderSize: 0.01
            },
            marketData: {
                ...botConfig.marketData,
                // Faster updates for testing
                updateInterval: 1000
            }
        }
    };
    
    const envConfig = envConfigs[env] || {};
    
    // Deep merge with base config
    return mergeDeep(botConfig, envConfig);
}

/**
 * Deep merge utility function
 */
function mergeDeep(target, source) {
    const output = Object.assign({}, target);
    
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target)) {
                    Object.assign(output, { [key]: source[key] });
                } else {
                    output[key] = mergeDeep(target[key], source[key]);
                }
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    
    return output;
}

function isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Get configuration summary for logging
 */
export function getConfigSummary() {
    return {
        symbol: botConfig.symbol,
        quoteInterval: botConfig.quoteInterval,
        orderDuration: botConfig.orderDuration,
        riskAversion: botConfig.model.riskAversion,
        minOrderSize: botConfig.execution.minOrderSize,
        maxOrderSize: botConfig.execution.maxOrderSize,
        maxDailyLoss: botConfig.risk.maxDailyLoss,
        maxPositionSize: botConfig.risk.maxPositionSize,
        environment: process.env.NODE_ENV || 'development'
    };
}

export default botConfig;
