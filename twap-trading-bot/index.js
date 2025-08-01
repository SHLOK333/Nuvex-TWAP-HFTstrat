/**
 * Main application entry point
 * Initializes and runs the TWAP trading bot
 */

import { TWAPTradingBot } from './src/TWAPTradingBot.js';
import { botConfig, validateConfig, getEnvironmentConfig, getConfigSummary } from './src/config/config.js';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global error handling
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

class Application {
    constructor() {
        this.bot = null;
        this.webServer = null;
        this.isShuttingDown = false;
    }
    
    /**
     * Initialize the application
     */
    async initialize() {
        try {
            console.log('🚀 Initializing TWAP Trading Bot Application...');
            console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
            
            // Validate configuration
            validateConfig();
            
            // Get environment-specific configuration
            const config = getEnvironmentConfig();
            
            // Log configuration summary
            console.log('⚙️  Configuration:', getConfigSummary());
            
            // Initialize trading bot
            this.bot = new TWAPTradingBot(config);
            
            // Setup bot event handlers
            this.setupBotEventHandlers();
            
            // Initialize web interface if enabled
            if (config.webInterface.enabled) {
                await this.initializeWebInterface(config);
            }
            
            console.log('✅ Application initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize application:', error);
            throw error;
        }
    }
    
    /**
     * Start the application
     */
    async start() {
        try {
            console.log('🎯 Starting TWAP Trading Bot...');
            
            // Start the trading bot
            await this.bot.start();
            
            // Start web server if configured
            if (this.webServer && botConfig.webInterface.enabled) {
                await this.startWebServer();
            }
            
            console.log('🎉 TWAP Trading Bot Application started successfully!');
            console.log('📊 Bot Status: Active');
            console.log('💰 Ready to trade ETH/USDT on Arbitrum');
            
            // Setup graceful shutdown
            this.setupGracefulShutdown();
            
        } catch (error) {
            console.error('❌ Failed to start application:', error);
            throw error;
        }
    }
    
    /**
     * Setup bot event handlers
     */
    setupBotEventHandlers() {
        this.bot.on('started', () => {
            console.log('🤖 Trading bot started');
        });
        
        this.bot.on('stopped', () => {
            console.log('🤖 Trading bot stopped');
        });
        
        this.bot.on('error', (data) => {
            console.error(`❌ Bot error [${data.component}]:`, data.error);
        });
        
        this.bot.on('orderStarted', (data) => {
            console.log(`📋 Order started: ${data.orderId}`);
        });
        
        this.bot.on('orderCompleted', (data) => {
            console.log(`✅ Order completed: ${data.orderId} | Size: ${data.totalSize} | PnL: ${data.totalPnL.toFixed(4)}`);
        });
        
        this.bot.on('orderFailed', (data) => {
            console.error(`❌ Order failed: ${data.orderId} | Error: ${data.error}`);
        });
        
        this.bot.on('quotesUpdated', (quotes) => {
            console.log(`💰 Quotes updated | Reservation: ${quotes.reservationPrice.toFixed(4)} | Spread: ${quotes.optimalSpread.toFixed(6)}`);
        });
        
        this.bot.on('emergencyStop', (data) => {
            console.error(`🚨 EMERGENCY STOP: ${data.reason}`);
        });
    }
    
    /**
     * Initialize web interface
     */
    async initializeWebInterface(config) {
        const app = express();
        
        // Middleware
        app.use(express.json());
        app.use(express.static(path.join(__dirname, 'public')));
        
        // Basic authentication if enabled
        if (config.webInterface.enableAuth) {
            app.use((req, res, next) => {
                const auth = req.headers.authorization;
                if (!auth) {
                    res.setHeader('WWW-Authenticate', 'Basic');
                    return res.status(401).send('Authentication required');
                }
                
                const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
                const username = credentials[0];
                const password = credentials[1];
                
                if (username === config.webInterface.username && password === config.webInterface.password) {
                    next();
                } else {
                    res.setHeader('WWW-Authenticate', 'Basic');
                    return res.status(401).send('Invalid credentials');
                }
            });
        }
        
        // API Routes
        this.setupAPIRoutes(app);
        
        // Serve main page
        app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });
        
        this.webServer = app;
        
        console.log('🌐 Web interface initialized');
    }
    
    /**
     * Setup API routes for web interface
     */
    setupAPIRoutes(app) {
        // Get bot status
        app.get('/api/status', (req, res) => {
            try {
                const status = this.bot.getStatus();
                res.json(status);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Get execution statistics
        app.get('/api/stats', (req, res) => {
            try {
                const execStats = this.bot.executor.getExecutionStats();
                const riskStatus = this.bot.riskManager.getRiskStatus();
                
                res.json({
                    execution: execStats,
                    risk: riskStatus,
                    quotes: this.bot.currentQuotes
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Execute manual order
        app.post('/api/order', async (req, res) => {
            try {
                const orderSpec = req.body;
                const orderId = await this.bot.executeManualOrder(orderSpec);
                res.json({ success: true, orderId });
            } catch (error) {
                res.status(400).json({ error: error.message });
            }
        });
        
        // Emergency stop
        app.post('/api/emergency-stop', (req, res) => {
            try {
                const reason = req.body.reason || 'Manual emergency stop via API';
                this.bot.emergencyStop(reason);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Reset emergency stop
        app.post('/api/reset-emergency', (req, res) => {
            try {
                this.bot.resetEmergencyStop();
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        
        // Get configuration
        app.get('/api/config', (req, res) => {
            res.json(getConfigSummary());
        });
        
        // Health check
        app.get('/api/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage()
            });
        });
    }
    
    /**
     * Start web server
     */
    async startWebServer() {
        return new Promise((resolve) => {
            const server = this.webServer.listen(botConfig.webInterface.port, () => {
                console.log(`🌐 Web interface available at http://localhost:${botConfig.webInterface.port}`);
                console.log(`📊 Dashboard: http://localhost:${botConfig.webInterface.port}`);
                console.log(`🔌 API: http://localhost:${botConfig.webInterface.port}/api/status`);
                resolve(server);
            });
            
            this.httpServer = server;
        });
    }
    
    /**
     * Setup graceful shutdown
     */
    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            if (this.isShuttingDown) return;
            this.isShuttingDown = true;
            
            console.log(`\n🛑 Received ${signal}. Gracefully shutting down...`);
            
            try {
                // Stop the trading bot
                if (this.bot) {
                    await this.bot.stop();
                }
                
                // Close web server
                if (this.httpServer) {
                    this.httpServer.close();
                }
                
                console.log('✅ Graceful shutdown completed');
                process.exit(0);
                
            } catch (error) {
                console.error('❌ Error during shutdown:', error);
                process.exit(1);
            }
        };
        
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }
    
    /**
     * Display startup banner
     */
    displayBanner() {
        console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                          TWAP TRADING BOT                                    ║
║                     Avellaneda-Stoikov Model                                 ║
║                                                                               ║
║  🎯 Symbol: ETH/USDT                                                         ║
║  🌐 Network: Arbitrum One                                                    ║
║  📊 Strategy: Time-Weighted Average Price with Optimal Market Making        ║
║  🧮 Model: Mathematical risk-adjusted pricing with inventory management      ║
║                                                                               ║
║  ⚠️  LIVE TRADING - USE AT YOUR OWN RISK                                    ║
╚═══════════════════════════════════════════════════════════════════════════════╝
        `);
    }
}

// Main execution
async function main() {
    try {
        const app = new Application();
        
        // Display banner
        app.displayBanner();
        
        // Initialize and start
        await app.initialize();
        await app.start();
        
    } catch (error) {
        console.error('💥 Application failed to start:', error);
        process.exit(1);
    }
}

// Run the application
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export { Application };
export default main;
