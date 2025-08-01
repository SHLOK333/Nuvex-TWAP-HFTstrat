/**
 * Sepolia Market Data Provider
 * Provides market data for Ethereum Sepolia testnet using 1inch API
 */

import axios from 'axios';
import { EventEmitter } from 'events';

export class SepoliaMarketDataProvider extends EventEmitter {
    constructor(config) {
        super();
        
        this.config = config;
        this.oneInchApiKey = config.ONEINCH_API_KEY;
        this.chainId = 11155111; // Sepolia
        
        // Sepolia token addresses
        this.tokens = {
            WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
            USDT: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06'
        };
        
        this.currentPrice = null;
        this.priceHistory = [];
        this.isRunning = false;
        
        console.log('📡 Sepolia Market Data Provider initialized');
        console.log('🌍 Network: Ethereum Sepolia Testnet');
        console.log('🏪 Tokens: WETH/USDT');
    }
    
    /**
     * Initialize the market data provider
     */
    async initialize() {
        try {
            console.log('🚀 Initializing Sepolia market data...');
            
            // Test 1inch API connection
            await this.test1inchConnection();
            
            // Get initial price
            await this.updatePrice();
            
            console.log('✅ Sepolia market data initialized');
            this.emit('initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize Sepolia market data:', error);
            throw error;
        }
    }
    
    /**
     * Test 1inch API connection
     */
    async test1inchConnection() {
        try {
            const url = `https://api.1inch.dev/swap/v5.2/${this.chainId}/healthcheck`;
            
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${this.oneInchApiKey}`,
                    'accept': 'application/json'
                }
            });
            
            if (response.status === 200) {
                console.log('✅ 1inch API connection successful');
                return true;
            }
            
        } catch (error) {
            console.error('❌ 1inch API test failed:', error.response?.data || error.message);
            throw new Error('1inch API connection failed - check your API key');
        }
    }
    
    /**
     * Get price quote from 1inch
     */
    async get1inchQuote(fromToken, toToken, amount) {
        try {
            const url = `https://api.1inch.dev/swap/v5.2/${this.chainId}/quote`;
            
            const params = {
                src: fromToken,
                dst: toToken,
                amount: amount.toString()
            };
            
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${this.oneInchApiKey}`,
                    'accept': 'application/json'
                },
                params
            });
            
            return response.data;
            
        } catch (error) {
            console.error('❌ 1inch quote failed:', error.response?.data || error.message);
            throw error;
        }
    }
    
    /**
     * Update current price
     */
    async updatePrice() {
        try {
            // Get ETH/USDT price using 1inch
            // Quote 1 WETH for USDT
            const oneEth = '1000000000000000000'; // 1 ETH in wei
            
            const quote = await this.get1inchQuote(
                this.tokens.WETH,
                this.tokens.USDT,
                oneEth
            );
            
            // Convert USDT amount (6 decimals) to price
            const usdtAmount = parseInt(quote.dstAmount);
            const price = usdtAmount / 1000000; // Convert from 6 decimals to actual USDT
            
            // Fallback to CoinGecko if 1inch fails or gives unrealistic price
            let finalPrice = price;
            if (price < 1000 || price > 10000) {
                console.log('⚠️  1inch price seems off, using CoinGecko fallback');
                finalPrice = await this.getCoinGeckoPrice();
            }
            
            const timestamp = Date.now();
            
            const marketData = {
                timestamp,
                price: finalPrice,
                source: price === finalPrice ? '1inch' : 'coingecko_fallback',
                volume24h: 0, // Not available on testnet
                priceChange24h: this.calculatePriceChange(finalPrice),
                volatility: this.calculateVolatility(),
                bidAskSpread: this.estimateBidAskSpread(),
                chainId: this.chainId,
                network: 'sepolia'
            };
            
            this.currentPrice = marketData;
            this.priceHistory.push(marketData);
            
            // Keep only last 100 price points
            if (this.priceHistory.length > 100) {
                this.priceHistory.shift();
            }
            
            this.emit('priceUpdate', marketData);
            
            console.log(`💰 Price updated: $${finalPrice.toFixed(4)} (${marketData.source})`);
            
            return marketData;
            
        } catch (error) {
            console.error('❌ Failed to update price:', error);
            
            // Use CoinGecko as fallback
            try {
                const fallbackPrice = await this.getCoinGeckoPrice();
                const fallbackData = {
                    timestamp: Date.now(),
                    price: fallbackPrice,
                    source: 'coingecko_fallback',
                    volume24h: 0,
                    priceChange24h: 0,
                    volatility: 0.02,
                    bidAskSpread: 0.005,
                    chainId: this.chainId,
                    network: 'sepolia'
                };
                
                this.currentPrice = fallbackData;
                this.emit('priceUpdate', fallbackData);
                
                return fallbackData;
                
            } catch (fallbackError) {
                console.error('❌ Fallback price also failed:', fallbackError);
                throw error;
            }
        }
    }
    
    /**
     * Get ETH price from CoinGecko as fallback
     */
    async getCoinGeckoPrice() {
        try {
            const url = 'https://api.coingecko.com/api/v3/simple/price';
            const params = {
                ids: 'ethereum',
                vs_currencies: 'usd'
            };
            
            if (this.config.COINGECKO_API_KEY && this.config.COINGECKO_API_KEY !== 'demo_key') {
                params.x_cg_pro_api_key = this.config.COINGECKO_API_KEY;
            }
            
            const response = await axios.get(url, { params });
            
            return response.data.ethereum.usd;
            
        } catch (error) {
            console.error('❌ CoinGecko fallback failed:', error);
            return 3400; // Hardcoded fallback
        }
    }
    
    /**
     * Calculate price change percentage
     */
    calculatePriceChange(currentPrice) {
        if (this.priceHistory.length < 2) return 0;
        
        const previousPrice = this.priceHistory[this.priceHistory.length - 1].price;
        return (currentPrice - previousPrice) / previousPrice;
    }
    
    /**
     * Calculate volatility from price history
     */
    calculateVolatility() {
        if (this.priceHistory.length < 10) return 0.02; // Default 2%
        
        const returns = [];
        for (let i = 1; i < this.priceHistory.length; i++) {
            const currentPrice = this.priceHistory[i].price;
            const previousPrice = this.priceHistory[i - 1].price;
            const return_ = Math.log(currentPrice / previousPrice);
            returns.push(return_);
        }
        
        // Calculate standard deviation
        const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
        const volatility = Math.sqrt(variance);
        
        // Annualize (assuming 5-minute intervals)
        const annualizedVolatility = volatility * Math.sqrt(365 * 24 * 12);
        
        return Math.min(1.0, Math.max(0.01, annualizedVolatility)); // Clamp between 1% and 100%
    }
    
    /**
     * Estimate bid-ask spread for testnet
     */
    estimateBidAskSpread() {
        // Testnet typically has wider spreads due to lower liquidity
        return 0.01; // 1% spread estimate
    }
    
    /**
     * Start real-time data updates
     */
    async startRealTimeData() {
        if (this.isRunning) {
            console.log('⚠️  Market data already running');
            return;
        }
        
        console.log('📡 Starting real-time market data...');
        this.isRunning = true;
        
        // Update every 30 seconds (more conservative for testnet)
        this.updateInterval = setInterval(async () => {
            try {
                await this.updatePrice();
            } catch (error) {
                console.error('❌ Error updating price:', error);
            }
        }, 30000);
        
        console.log('✅ Real-time market data started');
    }
    
    /**
     * Stop real-time data updates
     */
    async stop() {
        if (!this.isRunning) return;
        
        console.log('⏹️  Stopping market data...');
        this.isRunning = false;
        
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        console.log('✅ Market data stopped');
    }
    
    /**
     * Get current price data
     */
    getCurrentPrice() {
        return this.currentPrice;
    }
    
    /**
     * Get price history
     */
    getPriceHistory(length = 50) {
        return this.priceHistory.slice(-length);
    }
    
    /**
     * Get liquidity information from 1inch
     */
    async getLiquidityInfo() {
        try {
            const url = `https://api.1inch.dev/swap/v5.2/${this.chainId}/liquidity-sources`;
            
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${this.oneInchApiKey}`,
                    'accept': 'application/json'
                }
            });
            
            return response.data;
            
        } catch (error) {
            console.error('❌ Failed to get liquidity info:', error);
            return { protocols: [] };
        }
    }
    
    /**
     * Test a small swap to verify everything works
     */
    async testSmallSwap(fromToken, toToken, amount) {
        try {
            console.log('🧪 Testing small swap...');
            
            const quote = await this.get1inchQuote(fromToken, toToken, amount);
            
            console.log('✅ Test swap quote successful:', {
                srcAmount: quote.srcAmount,
                dstAmount: quote.dstAmount,
                estimatedGas: quote.estimatedGas
            });
            
            return quote;
            
        } catch (error) {
            console.error('❌ Test swap failed:', error);
            throw error;
        }
    }
}

export default SepoliaMarketDataProvider;
