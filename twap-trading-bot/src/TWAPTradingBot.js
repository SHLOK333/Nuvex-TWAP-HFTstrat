/**
 * Main Trading Bot Application
 * Orchestrates all components for TWAP trading with Avellaneda-Stoikov model
 */

import { EventEmitter } from 'events';
import { AvellanedaStoikovModel } from './models/AvellanedaStoikovModel.js';
import { MarketDataProvider } from './data/MarketDataProvider.js';
import { TWAPExecutor } from './execution/TWAPExecutor.js';
import { RiskManager } from './risk/RiskManager.js';

export class TWAPTradingBot extends EventEmitter {
    constructor(config) {
        super();
        
        this.config = config;
        this.isRunning = false;
        this.orderCounter = 0;
        
        // Initialize components
        this.model = new AvellanedaStoikovModel(config.model);
        this.marketData = new MarketDataProvider(config.marketData);
        this.executor = new TWAPExecutor(config.execution);
        this.riskManager = new RiskManager(config.risk);
        
        // Trading state
        this.currentQuotes = null;
        this.lastQuoteUpdate = 0;
        this.activeStrategies = new Map();
        
        // Performance tracking
        this.stats = {
            totalOrders: 0,
            successfulOrders: 0,
            totalVolume: 0,
            totalPnL: 0,
            startTime: null,
            lastUpdateTime: null
        };
        
        this.setupEventHandlers();
        
        console.log('🤖 TWAP Trading Bot initialized');
        console.log('📊 Config:', {
            symbol: config.symbol,
            quoteInterval: config.quoteInterval,
            orderMinSize: config.execution.minOrderSize,
            orderMaxSize: config.execution.maxOrderSize
        });
    }
    
    /**
     * Setup event handlers between components
     */
    setupEventHandlers() {
        // Market data events
        this.marketData.on('priceUpdate', (data) => {
            this.handlePriceUpdate(data);
        });
        
        this.marketData.on('error', (error) => {
            console.error('📡 Market data error:', error);
            this.emit('error', { component: 'marketData', error });
        });
        
        // Executor events
        this.executor.on('orderStarted', (data) => {
            console.log('🚀 Order started:', data.orderId);
            this.emit('orderStarted', data);
        });
        
        this.executor.on('partExecuted', (data) => {
            console.log('✅ Part executed:', data.orderId, data.partIndex);
            this.updateStats(data);
            this.emit('partExecuted', data);
        });
        
        this.executor.on('orderCompleted', (data) => {
            console.log('🎯 Order completed:', data.orderId);
            this.stats.successfulOrders++;
            this.stats.totalVolume += data.totalSize;
            this.stats.totalPnL += data.totalPnL;
            this.emit('orderCompleted', data);
        });
        
        this.executor.on('orderFailed', (data) => {
            console.error('❌ Order failed:', data.orderId, data.error);
            this.emit('orderFailed', data);
        });
        
        this.executor.on('balanceUpdate', (inventory) => {
            this.handleBalanceUpdate(inventory);
        });
        
        // Model events
        this.model.on('quotesUpdated', (quotes) => {
            this.currentQuotes = quotes;
            this.lastQuoteUpdate = Date.now();
            this.emit('quotesUpdated', quotes);
        });
    }
    
    /**
     * Start the trading bot
     */
    async start() {
        if (this.isRunning) {
            console.log('⚠️  Bot already running');
            return;
        }
        
        try {
            console.log('🚀 Starting TWAP Trading Bot...');
            
            // Initialize all components
            await this.marketData.initialize();
            await this.executor.initialize();
            
            // Start market data feeds
            await this.marketData.startRealTimeData();
            
            // Start quote generation
            this.startQuoteGeneration();
            
            this.isRunning = true;
            this.stats.startTime = Date.now();
            
            console.log('✅ TWAP Trading Bot started successfully');
            this.emit('started');
            
        } catch (error) {
            console.error('❌ Failed to start trading bot:', error);
            this.emit('error', { component: 'startup', error });
            throw error;
        }
    }
    
    /**
     * Stop the trading bot
     */
    async stop() {
        if (!this.isRunning) {
            console.log('⚠️  Bot not running');
            return;
        }
        
        try {
            console.log('⏹️  Stopping TWAP Trading Bot...');
            
            this.isRunning = false;
            
            // Stop quote generation
            this.stopQuoteGeneration();
            
            // Stop market data
            await this.marketData.stop();
            
            // Wait for active orders to complete (with timeout)
            await this.waitForActiveOrders(30000); // 30 seconds timeout
            
            console.log('✅ TWAP Trading Bot stopped');
            this.emit('stopped');
            
        } catch (error) {
            console.error('❌ Error stopping trading bot:', error);
            this.emit('error', { component: 'shutdown', error });
        }
    }
    
    /**
     * Handle price updates from market data
     */
    handlePriceUpdate(marketData) {
        try {
            // Update model with new market data
            this.model.updateMarketData(marketData);
            
            // Check if we should generate new quotes
            const timeSinceLastQuote = Date.now() - this.lastQuoteUpdate;
            if (timeSinceLastQuote >= this.config.quoteInterval) {
                this.generateQuotes(marketData);
            }
            
        } catch (error) {
            console.error('❌ Error handling price update:', error);
        }
    }
    
    /**
     * Handle balance updates
     */
    handleBalanceUpdate(inventory) {
        try {
            // Update model with new inventory
            this.model.updateInventory(inventory);
            
            // Update risk manager
            const currentPrice = this.marketData.getCurrentPrice();
            if (currentPrice) {
                this.riskManager.updateRiskMetrics({
                    currentInventory: inventory,
                    currentPrice: currentPrice.price
                });
            }
            
            this.emit('balanceUpdate', inventory);
            
        } catch (error) {
            console.error('❌ Error handling balance update:', error);
        }
    }
    
    /**
     * Start automatic quote generation
     */
    startQuoteGeneration() {
        this.quoteInterval = setInterval(() => {
            try {
                const currentData = this.marketData.getCurrentPrice();
                if (currentData) {
                    this.generateQuotes(currentData);
                }
            } catch (error) {
                console.error('❌ Error in quote generation:', error);
            }
        }, this.config.quoteInterval);
        
        console.log('📊 Quote generation started');
    }
    
    /**
     * Stop quote generation
     */
    stopQuoteGeneration() {
        if (this.quoteInterval) {
            clearInterval(this.quoteInterval);
            this.quoteInterval = null;
            console.log('⏹️  Quote generation stopped');
        }
    }
    
    /**
     * Generate new quotes using Avellaneda-Stoikov model
     */
    generateQuotes(marketData) {
        try {
            console.log('📊 Generating quotes...');
            
            // Generate optimal quotes
            const quotes = this.model.generateOptimalQuotes(marketData);
            
            if (!quotes) {
                console.log('⚠️  No quotes generated - insufficient data');
                return;
            }
            
            console.log('💰 New quotes generated:', {
                reservationPrice: quotes.reservationPrice.toFixed(4),
                optimalSpread: quotes.optimalSpread.toFixed(6),
                bidPrice: quotes.bidPrice.toFixed(4),
                askPrice: quotes.askPrice.toFixed(4)
            });
            
            // Check if quotes are significantly different or it's time for new orders
            if (this.shouldCreateNewOrders(quotes, marketData)) {
                this.evaluateOrderCreation(quotes, marketData);
            }
            
        } catch (error) {
            console.error('❌ Error generating quotes:', error);
        }
    }
    
    /**
     * Determine if new orders should be created
     */
    shouldCreateNewOrders(quotes, marketData) {
        // Always allow if no current quotes
        if (!this.currentQuotes) return true;
        
        // Check price movement threshold
        const priceChange = Math.abs(quotes.reservationPrice - this.currentQuotes.reservationPrice) / this.currentQuotes.reservationPrice;
        if (priceChange > 0.005) { // 0.5% price movement
            console.log('📈 Significant price movement detected:', (priceChange * 100).toFixed(2) + '%');
            return true;
        }
        
        // Check spread change
        const spreadChange = Math.abs(quotes.optimalSpread - this.currentQuotes.optimalSpread) / this.currentQuotes.optimalSpread;
        if (spreadChange > 0.1) { // 10% spread change
            console.log('📊 Significant spread change detected:', (spreadChange * 100).toFixed(2) + '%');
            return true;
        }
        
        // Time-based ordering (every few minutes regardless)
        const timeSinceLastOrder = Date.now() - (this.lastOrderTime || 0);
        if (timeSinceLastOrder > 300000) { // 5 minutes
            console.log('⏰ Time-based order trigger');
            return true;
        }
        
        return false;
    }
    
    /**
     * Evaluate and potentially create new orders
     */
    async evaluateOrderCreation(quotes, marketData) {
        try {
            // Get current inventory
            const inventory = this.executor.currentInventory;
            
            // Determine order direction and size
            const orderDirection = this.determineOrderDirection(quotes, inventory);
            if (!orderDirection) {
                console.log('⚠️  No order direction determined');
                return;
            }
            
            // Calculate order size
            const baseSize = this.calculateBaseOrderSize(quotes, marketData);
            const adjustedSize = this.riskManager.recommendPositionSize(
                baseSize,
                marketData.volatility,
                inventory
            );
            
            // Create order specification
            const order = {
                id: `twap_${++this.orderCounter}_${Date.now()}`,
                symbol: this.config.symbol,
                direction: orderDirection,
                totalSize: adjustedSize,
                targetPrice: orderDirection === 'buy' ? quotes.bidPrice : quotes.askPrice,
                duration: this.config.orderDuration || 300000, // 5 minutes default
                maxParts: this.config.maxOrderParts || 10,
                quotes: quotes
            };
            
            // Validate order with risk manager
            this.riskManager.validateOrder(order, inventory, marketData);
            
            // Execute the order
            console.log('📋 Creating new TWAP order:', {
                id: order.id,
                direction: order.direction,
                size: order.totalSize,
                targetPrice: order.targetPrice
            });
            
            await this.executor.executeTWAPOrder(order);
            
            this.stats.totalOrders++;
            this.lastOrderTime = Date.now();
            
        } catch (error) {
            console.error('❌ Error evaluating order creation:', error);
            
            // If risk limits hit, pause briefly
            if (error.message.includes('risk') || error.message.includes('limit')) {
                console.log('⏸️  Pausing order creation due to risk limits');
                setTimeout(() => {
                    console.log('▶️  Resuming order evaluation');
                }, 60000); // 1 minute pause
            }
        }
    }
    
    /**
     * Determine order direction based on model signals
     */
    determineOrderDirection(quotes, inventory) {
        const currentPrice = quotes.reservationPrice;
        const midPrice = (quotes.bidPrice + quotes.askPrice) / 2;
        
        // Simple strategy: trade towards reservation price
        if (currentPrice > midPrice * 1.002) {
            // Price above mid, consider selling
            if (inventory.ETH > 0.1) { // Have ETH to sell
                return 'sell';
            }
        } else if (currentPrice < midPrice * 0.998) {
            // Price below mid, consider buying
            if (inventory.USDT > currentPrice * 0.1) { // Have USDT to buy
                return 'buy';
            }
        }
        
        // Mean reversion strategy based on inventory
        const targetInventoryRatio = 0.5; // 50% ETH, 50% USDT value
        const totalValue = inventory.ETH * currentPrice + inventory.USDT;
        const currentEthRatio = (inventory.ETH * currentPrice) / totalValue;
        
        if (currentEthRatio < targetInventoryRatio - 0.1) {
            return 'buy'; // Need more ETH
        } else if (currentEthRatio > targetInventoryRatio + 0.1) {
            return 'sell'; // Need more USDT
        }
        
        return null; // No clear direction
    }
    
    /**
     * Calculate base order size
     */
    calculateBaseOrderSize(quotes, marketData) {
        // Base size from config
        let baseSize = this.config.execution.minOrderSize;
        
        // Adjust based on volatility (higher vol = smaller orders)
        if (marketData.volatility) {
            baseSize *= Math.max(0.5, 1 - marketData.volatility * 2);
        }
        
        // Adjust based on spread (wider spread = larger orders for better average)
        const spreadRatio = quotes.optimalSpread / quotes.reservationPrice;
        if (spreadRatio > 0.001) { // 0.1% spread
            baseSize *= Math.min(2, 1 + spreadRatio * 100);
        }
        
        // Ensure within bounds
        baseSize = Math.max(this.config.execution.minOrderSize, baseSize);
        baseSize = Math.min(this.config.execution.maxOrderSize, baseSize);
        
        return baseSize;
    }
    
    /**
     * Wait for active orders to complete
     */
    async waitForActiveOrders(timeout = 30000) {
        const startTime = Date.now();
        
        while (this.executor.activeOrders.size > 0) {
            if (Date.now() - startTime > timeout) {
                console.warn('⚠️  Timeout waiting for active orders to complete');
                break;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    /**
     * Update trading statistics
     */
    updateStats(executionData) {
        this.stats.lastUpdateTime = Date.now();
        // Additional stats updates handled in individual event handlers
    }
    
    /**
     * Execute manual order
     */
    async executeManualOrder(orderSpec) {
        try {
            console.log('👤 Executing manual order:', orderSpec);
            
            // Add unique ID if not provided
            if (!orderSpec.id) {
                orderSpec.id = `manual_${++this.orderCounter}_${Date.now()}`;
            }
            
            // Get current market data
            const marketData = this.marketData.getCurrentPrice();
            const inventory = this.executor.currentInventory;
            
            // Validate with risk manager
            this.riskManager.validateOrder(orderSpec, inventory, marketData);
            
            // Execute the order
            await this.executor.executeTWAPOrder(orderSpec);
            
            this.stats.totalOrders++;
            
            return orderSpec.id;
            
        } catch (error) {
            console.error('❌ Manual order execution failed:', error);
            throw error;
        }
    }
    
    /**
     * Get current bot status
     */
    getStatus() {
        const uptime = this.stats.startTime ? Date.now() - this.stats.startTime : 0;
        
        return {
            isRunning: this.isRunning,
            uptime: uptime,
            stats: {
                ...this.stats,
                averageOrderSize: this.stats.totalOrders > 0 ? this.stats.totalVolume / this.stats.totalOrders : 0,
                successRate: this.stats.totalOrders > 0 ? (this.stats.successfulOrders / this.stats.totalOrders) * 100 : 0
            },
            activeOrders: this.executor.activeOrders.size,
            currentQuotes: this.currentQuotes,
            lastQuoteUpdate: this.lastQuoteUpdate,
            riskStatus: this.riskManager.getRiskStatus(),
            inventory: this.executor.currentInventory
        };
    }
    
    /**
     * Emergency stop all trading
     */
    emergencyStop(reason = 'Manual emergency stop') {
        console.error('🚨 EMERGENCY STOP TRIGGERED:', reason);
        
        this.riskManager.activateEmergencyStop(reason);
        this.stopQuoteGeneration();
        
        this.emit('emergencyStop', { reason });
    }
    
    /**
     * Reset emergency stop (admin function)
     */
    resetEmergencyStop() {
        console.log('🔄 Resetting emergency stop');
        this.riskManager.resetEmergencyStop();
        
        if (this.isRunning) {
            this.startQuoteGeneration();
        }
        
        this.emit('emergencyStopReset');
    }
}

export default TWAPTradingBot;
