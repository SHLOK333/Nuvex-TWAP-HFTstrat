/**
 * Sepolia Testnet Bot - Real blockchain interaction with testnet
 * Safe testing with real 1inch API and Ethereum Sepolia
 */

import { SepoliaMarketDataProvider } from './src/data/SepoliaMarketDataProvider.js';
import { AvellanedaStoikovModel } from './src/models/AvellanedaStoikovModel.js';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

class SepoliaTestnetBot {
    constructor() {
        // Validate required environment variables
        this.validateConfig();
        
        this.config = this.loadConfig();
        
        // Initialize components
        this.marketData = new SepoliaMarketDataProvider(this.config);
        this.model = new AvellanedaStoikovModel({
            riskAversion: this.config.RISK_AVERSION,
            timeHorizon: this.config.TIME_HORIZON,
            volatility: this.config.VOLATILITY
        });
        
        // Initialize wallet
        this.initializeWallet();
        
        this.isRunning = false;
        this.stats = {
            quotesGenerated: 0,
            priceUpdates: 0,
            startTime: null
        };
        
        console.log('🧪 Sepolia Testnet Bot initialized');
        console.log('⚠️  This uses REAL blockchain but TESTNET tokens');
    }
    
    /**
     * Validate configuration
     */
    validateConfig() {
        const required = [
            'PRIVATE_KEY',
            'WALLET_ADDRESS',
            'ONEINCH_API_KEY',
            'INFURA_API_KEY'
        ];
        
        const missing = required.filter(key => !process.env[key] || process.env[key] === 'your_' + key.toLowerCase() + '_here');
        
        if (missing.length > 0) {
            console.error('❌ Missing required environment variables:');
            missing.forEach(key => console.error(`   - ${key}`));
            console.error('\n📋 Please update your .env file with real values');
            console.error('📖 See SEPOLIA-SETUP.md for detailed instructions');
            throw new Error('Configuration incomplete');
        }
        
        // Validate private key format
        if (!process.env.PRIVATE_KEY.startsWith('0x')) {
            throw new Error('Private key must start with 0x');
        }
        
        console.log('✅ Configuration validated');
    }
    
    /**
     * Load configuration
     */
    loadConfig() {
        return {
            // Network
            CHAIN_ID: 11155111,
            RPC_URL: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
            
            // Wallet
            PRIVATE_KEY: process.env.PRIVATE_KEY,
            WALLET_ADDRESS: process.env.WALLET_ADDRESS,
            
            // API Keys
            ONEINCH_API_KEY: process.env.ONEINCH_API_KEY,
            INFURA_API_KEY: process.env.INFURA_API_KEY,
            COINGECKO_API_KEY: process.env.COINGECKO_API_KEY,
            
            // Trading parameters
            RISK_AVERSION: parseFloat(process.env.RISK_AVERSION) || 0.2,
            VOLATILITY: parseFloat(process.env.VOLATILITY) || 0.3,
            TIME_HORIZON: parseFloat(process.env.TIME_HORIZON) || 0.5,
            
            // Testnet limits
            MIN_ORDER_SIZE: parseFloat(process.env.MIN_TRADE_SIZE_USDT) / 3400 || 0.0003, // ~$1 worth
            MAX_ORDER_SIZE: parseFloat(process.env.MAX_ORDER_SIZE) || 0.1,
            
            // Update intervals
            QUOTE_INTERVAL: 30000, // 30 seconds
            PRICE_UPDATE_INTERVAL: 30000
        };
    }
    
    /**
     * Initialize wallet connection
     */
    initializeWallet() {
        try {
            this.provider = new ethers.JsonRpcProvider(this.config.RPC_URL);
            this.wallet = new ethers.Wallet(this.config.PRIVATE_KEY, this.provider);
            
            console.log('👛 Wallet initialized:', this.wallet.address);
            console.log('🌐 Network: Ethereum Sepolia Testnet');
            
        } catch (error) {
            console.error('❌ Failed to initialize wallet:', error);
            throw error;
        }
    }
    
    /**
     * Start the testnet bot
     */
    async start() {
        if (this.isRunning) {
            console.log('⚠️  Bot already running');
            return;
        }
        
        try {
            console.log('🚀 Starting Sepolia Testnet Bot...');
            
            // Check wallet balance
            await this.checkWalletBalance();
            
            // Initialize market data
            await this.marketData.initialize();
            
            // Setup event handlers
            this.setupEventHandlers();
            
            // Start real-time data
            await this.marketData.startRealTimeData();
            
            // Start quote generation
            this.startQuoteGeneration();
            
            this.isRunning = true;
            this.stats.startTime = Date.now();
            
            console.log('✅ Sepolia Testnet Bot started successfully!');
            console.log('📊 Generating quotes and monitoring prices...');
            console.log('💡 This is real blockchain interaction with testnet tokens');
            
            this.showInstructions();
            
        } catch (error) {
            console.error('❌ Failed to start testnet bot:', error);
            throw error;
        }
    }
    
    /**
     * Check wallet balance
     */
    async checkWalletBalance() {
        try {
            const balance = await this.provider.getBalance(this.wallet.address);
            const ethBalance = ethers.formatEther(balance);
            
            console.log('💰 Wallet Balance Check:');
            console.log(`   Address: ${this.wallet.address}`);
            console.log(`   ETH Balance: ${parseFloat(ethBalance).toFixed(6)} ETH`);
            
            if (parseFloat(ethBalance) < 0.01) {
                console.warn('⚠️  Low ETH balance! Get more from Sepolia faucet:');
                console.warn('   🚰 https://sepoliafaucet.com');
                console.warn('   🚰 https://sepolia-faucet.pk910.de');
            }
            
            // TODO: Check USDT and WETH balances
            
        } catch (error) {
            console.error('❌ Failed to check wallet balance:', error);
            throw error;
        }
    }
    
    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        this.marketData.on('priceUpdate', (data) => {
            this.handlePriceUpdate(data);
        });
        
        this.marketData.on('error', (error) => {
            console.error('📡 Market data error:', error);
        });
        
        this.model.on('quotesUpdated', (quotes) => {
            this.handleNewQuotes(quotes);
        });
    }
    
    /**
     * Handle price updates
     */
    handlePriceUpdate(marketData) {
        this.stats.priceUpdates++;
        
        console.log(`📈 Price Update #${this.stats.priceUpdates}:`);
        console.log(`   Price: $${marketData.price.toFixed(4)}`);
        console.log(`   Source: ${marketData.source}`);
        console.log(`   Volatility: ${(marketData.volatility * 100).toFixed(2)}%`);
        
        // Update the model with new market data
        this.model.updateMarketData(marketData);
    }
    
    /**
     * Start quote generation
     */
    startQuoteGeneration() {
        this.quoteInterval = setInterval(() => {
            try {
                this.generateQuotes();
            } catch (error) {
                console.error('❌ Error generating quotes:', error);
            }
        }, this.config.QUOTE_INTERVAL);
        
        console.log('📊 Quote generation started (every 30 seconds)');
    }
    
    /**
     * Generate optimal quotes
     */
    generateQuotes() {
        const currentPrice = this.marketData.getCurrentPrice();
        if (!currentPrice) {
            console.log('⚠️  No price data available for quote generation');
            return;
        }
        
        // Mock inventory for testing (in real implementation, get from blockchain)
        const mockInventory = {
            ETH: 0.5,
            USDT: 1000
        };
        
        this.model.updateInventory(mockInventory);
        
        // Generate quotes
        const quotes = this.model.generateOptimalQuotes(currentPrice);
        
        if (quotes) {
            this.stats.quotesGenerated++;
            
            console.log('\n💰 NEW QUOTES GENERATED:');
            console.log(`   📊 Market Price: $${currentPrice.price.toFixed(4)}`);
            console.log(`   🎯 Reservation Price: $${quotes.reservationPrice.toFixed(4)}`);
            console.log(`   📏 Optimal Spread: ${(quotes.optimalSpread * 100).toFixed(4)}%`);
            console.log(`   💚 Bid Price: $${quotes.bidPrice.toFixed(4)}`);
            console.log(`   ❤️  Ask Price: $${quotes.askPrice.toFixed(4)}`);
            
            // Show potential 1inch integration
            this.showPotentialTrades(quotes, currentPrice);
        }
    }
    
    /**
     * Show potential trades with 1inch
     */
    async showPotentialTrades(quotes, marketData) {
        try {
            // Example: Show what a small buy order would look like
            const oneEthInWei = '1000000000000000000'; // 1 ETH
            const quote = await this.marketData.get1inchQuote(
                '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // WETH
                '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06', // USDT
                oneEthInWei
            );
            
            const usdtAmount = parseInt(quote.dstAmount) / 1000000; // Convert from 6 decimals
            const effectivePrice = usdtAmount;
            const slippage = Math.abs(effectivePrice - marketData.price) / marketData.price;
            
            console.log(`   🔄 1inch Quote (1 WETH → USDT):`);
            console.log(`      Effective Price: $${effectivePrice.toFixed(4)}`);
            console.log(`      Slippage: ${(slippage * 100).toFixed(3)}%`);
            console.log(`      Gas Estimate: ${quote.estimatedGas}`);
            
        } catch (error) {
            console.log(`   ⚠️  1inch quote unavailable: ${error.message}`);
        }
        
        console.log(''); // Add spacing
    }
    
    /**
     * Handle new quotes
     */
    handleNewQuotes(quotes) {
        // In a real implementation, this would:
        // 1. Check if we should place orders
        // 2. Calculate order sizes
        // 3. Submit orders to 1inch
        // 4. Track execution
        
        console.log('🎯 New optimal quotes calculated');
    }
    
    /**
     * Stop the bot
     */
    async stop() {
        if (!this.isRunning) return;
        
        console.log('⏹️  Stopping Sepolia Testnet Bot...');
        
        this.isRunning = false;
        
        // Stop quote generation
        if (this.quoteInterval) {
            clearInterval(this.quoteInterval);
        }
        
        // Stop market data
        await this.marketData.stop();
        
        this.showFinalStats();
        
        console.log('✅ Sepolia Testnet Bot stopped');
    }
    
    /**
     * Show instructions
     */
    showInstructions() {
        console.log('\n📋 TESTNET BOT INSTRUCTIONS:');
        console.log('==============================');
        console.log('• This bot uses REAL Ethereum Sepolia testnet');
        console.log('• All calculations are live with actual market data');
        console.log('• 1inch API integration is active');
        console.log('• No real money is at risk (testnet only)');
        console.log('• Press Ctrl+C to stop and see statistics');
        console.log('• Monitor gas fees and transaction costs');
        console.log('==============================\n');
    }
    
    /**
     * Show final statistics
     */
    showFinalStats() {
        const uptime = Date.now() - this.stats.startTime;
        const uptimeMinutes = uptime / 60000;
        
        console.log('\n📊 TESTNET SESSION RESULTS:');
        console.log('============================');
        console.log(`Session Duration: ${uptimeMinutes.toFixed(1)} minutes`);
        console.log(`Price Updates: ${this.stats.priceUpdates}`);
        console.log(`Quotes Generated: ${this.stats.quotesGenerated}`);
        console.log(`Average Quote Frequency: ${(this.stats.quotesGenerated / uptimeMinutes).toFixed(1)}/min`);
        console.log('============================');
        console.log('🧪 Testnet session complete!');
        console.log('🚀 Ready for mainnet when you are!');
        console.log('============================\n');
    }
    
    /**
     * Get current status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            network: 'sepolia',
            walletAddress: this.wallet?.address,
            stats: this.stats,
            currentPrice: this.marketData.getCurrentPrice(),
            config: {
                riskAversion: this.config.RISK_AVERSION,
                volatility: this.config.VOLATILITY,
                timeHorizon: this.config.TIME_HORIZON
            }
        };
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Received interrupt signal...');
    if (global.sepoliaBot) {
        await global.sepoliaBot.stop();
    }
    process.exit(0);
});

// Auto-start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('\n🧪 SEPOLIA TESTNET BOT');
    console.log('======================');
    console.log('🌐 Network: Ethereum Sepolia Testnet');
    console.log('💱 Integration: 1inch API');
    console.log('🧮 Model: Avellaneda-Stoikov');
    console.log('⚠️  TESTNET ONLY - Safe for testing');
    console.log('======================\n');
    
    try {
        const sepoliaBot = new SepoliaTestnetBot();
        global.sepoliaBot = sepoliaBot;
        
        sepoliaBot.start().catch(console.error);
        
    } catch (error) {
        console.error('💥 Failed to start Sepolia bot:', error.message);
        console.error('\n📖 Please check SEPOLIA-SETUP.md for configuration help');
        process.exit(1);
    }
}

export { SepoliaTestnetBot };
export default SepoliaTestnetBot;
