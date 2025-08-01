/**
 * Live Market Data Provider
 * Aggregates real-time price feeds from multiple sources for USDT/ETH on Arbitrum
 */

import WebSocket from 'ws';
import axios from 'axios';
import { EventEmitter } from 'events';

export class MarketDataProvider extends EventEmitter {
    constructor() {
        super();
        
        this.symbols = {
            'USDT/ETH': {
                coingecko: 'ethereum',
                dexscreener: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH on Arbitrum
                oneinch: 'ETH/USDT',
                uniswap: '0x17c14d2c404d167802b16c450d3c99f88f2c4f4d' // USDT/WETH pool
            }
        };
        
        this.currentPrices = new Map();
        this.orderBooks = new Map();
        this.trades = [];
        this.volumeData = new Map();
        
        // WebSocket connections
        this.wsConnections = new Map();
        
        // Update intervals
        this.updateInterval = 5000; // 5 seconds
        this.priceUpdateTimer = null;
        
        console.log('📊 Market Data Provider initialized');
    }
    
    /**
     * Start all data feeds
     */
    async start() {
        console.log('🚀 Starting market data feeds...');
        
        try {
            // Start price feeds
            await this.startCoinGeckoFeed();
            await this.startDexScreenerFeed();
            await this.startOneInchFeed();
            
            // Start order book feeds
            await this.startOrderBookFeed();
            
            // Start price update timer
            this.priceUpdateTimer = setInterval(() => {
                this.updateAggregatedPrice();
            }, this.updateInterval);
            
            console.log('✅ All market data feeds started successfully');
            this.emit('started');
            
        } catch (error) {
            console.error('❌ Failed to start market data feeds:', error);
            throw error;
        }
    }
    
    /**
     * Stop all data feeds
     */
    stop() {
        console.log('🛑 Stopping market data feeds...');
        
        // Close WebSocket connections
        for (const [name, ws] of this.wsConnections) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        }
        this.wsConnections.clear();
        
        // Clear intervals
        if (this.priceUpdateTimer) {
            clearInterval(this.priceUpdateTimer);
            this.priceUpdateTimer = null;
        }
        
        console.log('✅ Market data feeds stopped');
        this.emit('stopped');
    }
    
    /**
     * Start CoinGecko price feed
     */
    async startCoinGeckoFeed() {
        const updateCoinGeckoPrice = async () => {
            try {
                const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
                    params: {
                        ids: 'ethereum,tether',
                        vs_currencies: 'usd',
                        include_market_cap: 'true',
                        include_24hr_vol: 'true',
                        include_24hr_change: 'true'
                    }
                });
                
                const ethPrice = response.data.ethereum.usd;
                const usdtPrice = response.data.tether.usd;
                const ethUsdtPrice = ethPrice / usdtPrice;
                
                this.currentPrices.set('coingecko', {
                    price: ethUsdtPrice,
                    timestamp: Date.now(),
                    source: 'coingecko',
                    volume24h: response.data.ethereum.usd_24h_vol,
                    change24h: response.data.ethereum.usd_24h_change
                });
                
                this.emit('priceUpdate', {
                    source: 'coingecko',
                    symbol: 'ETH/USDT',
                    price: ethUsdtPrice,
                    timestamp: Date.now()
                });
                
            } catch (error) {
                console.error('CoinGecko API error:', error.message);
            }
        };
        
        // Initial fetch
        await updateCoinGeckoPrice();
        
        // Set up periodic updates (every 30 seconds to respect rate limits)
        setInterval(updateCoinGeckoPrice, 30000);
    }
    
    /**
     * Start DexScreener feed for Arbitrum DEX data
     */
    async startDexScreenerFeed() {
        const updateDexScreenerPrice = async () => {
            try {
                // Get WETH/USDT pools on Arbitrum
                const response = await axios.get('https://api.dexscreener.com/latest/dex/tokens/0x82af49447d8a07e3bd95bd0d56f35241523fbab1', {
                    params: {
                        chainId: 'arbitrum'
                    }
                });
                
                if (response.data && response.data.pairs && response.data.pairs.length > 0) {
                    // Find the most liquid WETH/USDT pair
                    const ethUsdtPairs = response.data.pairs
                        .filter(pair => 
                            (pair.baseToken.symbol === 'WETH' && pair.quoteToken.symbol === 'USDT') ||
                            (pair.baseToken.symbol === 'USDT' && pair.quoteToken.symbol === 'WETH')
                        )
                        .sort((a, b) => b.volume.h24 - a.volume.h24);
                    
                    if (ethUsdtPairs.length > 0) {
                        const topPair = ethUsdtPairs[0];
                        const price = parseFloat(topPair.priceUsd);
                        
                        this.currentPrices.set('dexscreener', {
                            price: price,
                            timestamp: Date.now(),
                            source: 'dexscreener',
                            volume24h: topPair.volume.h24,
                            liquidity: topPair.liquidity?.usd || 0,
                            dex: topPair.dexId
                        });
                        
                        this.emit('priceUpdate', {
                            source: 'dexscreener',
                            symbol: 'ETH/USDT',
                            price: price,
                            timestamp: Date.now(),
                            dex: topPair.dexId
                        });
                    }
                }
                
            } catch (error) {
                console.error('DexScreener API error:', error.message);
            }
        };
        
        // Initial fetch
        await updateDexScreenerPrice();
        
        // Set up periodic updates
        setInterval(updateDexScreenerPrice, 15000);
    }
    
    /**
     * Start 1inch API feed for swap rates
     */
    async startOneInchFeed() {
        const updateOneInchPrice = async () => {
            try {
                // Get swap quote from 1inch for 1 ETH -> USDT
                const oneEthInWei = '1000000000000000000'; // 1 ETH in wei
                
                const response = await axios.get(`https://api.1inch.dev/swap/v5.2/42161/quote`, {
                    params: {
                        src: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
                        dst: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT
                        amount: oneEthInWei
                    },
                    headers: {
                        'Authorization': `Bearer ${process.env.ONEINCH_API_KEY}`
                    }
                });
                
                if (response.data && response.data.dstAmount) {
                    // Convert USDT amount (6 decimals) to price
                    const usdtAmount = parseInt(response.data.dstAmount) / 1e6;
                    const ethUsdtPrice = usdtAmount; // 1 ETH = usdtAmount USDT
                    
                    this.currentPrices.set('1inch', {
                        price: ethUsdtPrice,
                        timestamp: Date.now(),
                        source: '1inch',
                        estimatedGas: response.data.estimatedGas,
                        protocols: response.data.protocols
                    });
                    
                    this.emit('priceUpdate', {
                        source: '1inch',
                        symbol: 'ETH/USDT',
                        price: ethUsdtPrice,
                        timestamp: Date.now()
                    });
                }
                
            } catch (error) {
                console.error('1inch API error:', error.message);
            }
        };
        
        // Initial fetch
        await updateOneInchPrice();
        
        // Set up periodic updates
        setInterval(updateOneInchPrice, 10000);
    }
    
    /**
     * Start order book feed (simulated for now, can integrate with DEX APIs)
     */
    async startOrderBookFeed() {
        // Simulate order book updates
        setInterval(() => {
            const midPrice = this.getAggregatedPrice();
            if (midPrice > 0) {
                const spread = midPrice * 0.001; // 0.1% spread
                const orderBook = this.generateOrderBook(midPrice, spread);
                
                this.orderBooks.set('aggregated', orderBook);
                
                this.emit('orderBookUpdate', {
                    symbol: 'ETH/USDT',
                    orderBook: orderBook,
                    timestamp: Date.now()
                });
            }
        }, 2000);
    }
    
    /**
     * Generate simulated order book around mid price
     */
    generateOrderBook(midPrice, spread) {
        const bids = [];
        const asks = [];
        
        const bidStart = midPrice - spread / 2;
        const askStart = midPrice + spread / 2;
        
        // Generate 10 levels each side
        for (let i = 0; i < 10; i++) {
            const bidPrice = bidStart - (i * midPrice * 0.0001);
            const askPrice = askStart + (i * midPrice * 0.0001);
            
            // Random sizes between 0.1 and 5 ETH
            const bidSize = 0.1 + Math.random() * 4.9;
            const askSize = 0.1 + Math.random() * 4.9;
            
            bids.push({ price: bidPrice, size: bidSize });
            asks.push({ price: askPrice, size: askSize });
        }
        
        return { bids, asks, midPrice, spread };
    }
    
    /**
     * Calculate aggregated price from all sources
     */
    updateAggregatedPrice() {
        const prices = Array.from(this.currentPrices.values())
            .filter(data => Date.now() - data.timestamp < 60000) // Only use prices from last minute
            .map(data => data.price);
        
        if (prices.length === 0) return;
        
        // Calculate weighted average (equal weights for now)
        const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
        
        // Calculate volatility
        const variance = prices.reduce((sum, price) => sum + Math.pow(price - avgPrice, 2), 0) / prices.length;
        const volatility = Math.sqrt(variance) / avgPrice;
        
        const aggregatedData = {
            midPrice: avgPrice,
            volatility: volatility,
            timestamp: Date.now(),
            sources: this.currentPrices.size,
            priceDeviation: Math.max(...prices) - Math.min(...prices)
        };
        
        this.emit('aggregatedPrice', aggregatedData);
        
        return aggregatedData;
    }
    
    /**
     * Get current aggregated price
     */
    getAggregatedPrice() {
        const prices = Array.from(this.currentPrices.values())
            .filter(data => Date.now() - data.timestamp < 60000)
            .map(data => data.price);
        
        if (prices.length === 0) return 0;
        
        return prices.reduce((sum, price) => sum + price, 0) / prices.length;
    }
    
    /**
     * Get current order book
     */
    getCurrentOrderBook() {
        return this.orderBooks.get('aggregated') || { bids: [], asks: [], midPrice: 0, spread: 0 };
    }
    
    /**
     * Get market statistics
     */
    getMarketStats() {
        const currentPrice = this.getAggregatedPrice();
        const orderBook = this.getCurrentOrderBook();
        
        return {
            currentPrice,
            spread: orderBook.spread,
            volatility: this.calculateVolatility(),
            volume24h: this.calculate24hVolume(),
            activeSources: this.currentPrices.size,
            lastUpdate: Math.max(...Array.from(this.currentPrices.values()).map(d => d.timestamp))
        };
    }
    
    /**
     * Calculate recent volatility
     */
    calculateVolatility() {
        if (this.trades.length < 2) return 0;
        
        const recentTrades = this.trades.slice(-100); // Last 100 trades
        const returns = [];
        
        for (let i = 1; i < recentTrades.length; i++) {
            const return_ = Math.log(recentTrades[i].price / recentTrades[i-1].price);
            returns.push(return_);
        }
        
        if (returns.length === 0) return 0;
        
        const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
        
        return Math.sqrt(variance);
    }
    
    /**
     * Calculate 24h volume
     */
    calculate24hVolume() {
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const recentTrades = this.trades.filter(trade => trade.timestamp > dayAgo);
        
        return recentTrades.reduce((sum, trade) => sum + trade.size, 0);
    }
}

export default MarketDataProvider;
