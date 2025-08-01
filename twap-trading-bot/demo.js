/**
 * Demo Trading Bot - Simulation Only Version
 * Runs mathematical calculations and paper trading without real wallet
 */

import { AvellanedaStoikovModel } from './src/models/AvellanedaStoikovModel.js';
import { SimulationMode } from './src/simulation/SimulationMode.js';
import dotenv from 'dotenv';

dotenv.config();

class DemoTradingBot {
    constructor() {
        // Check if we're in simulation mode
        if (process.env.SIMULATION_MODE !== 'true') {
            throw new Error('This demo requires SIMULATION_MODE=true in .env file');
        }
        
        this.config = this.loadConfig();
        this.simulation = new SimulationMode(this.config);
        this.model = new AvellanedaStoikovModel({
            riskAversion: this.config.RISK_AVERSION,
            timeHorizon: this.config.TIME_HORIZON,
            volatility: this.config.VOLATILITY
        });
        
        this.isRunning = false;
        this.quoteInterval = null;
        this.orderCounter = 0;
        
        console.log('🤖 Demo TWAP Trading Bot initialized (SIMULATION MODE)');
        console.log('📊 Safe to run - no real money involved!');
    }
    
    /**
     * Load configuration from environment
     */
    loadConfig() {
        return {
            SIMULATION_MODE: process.env.SIMULATION_MODE === 'true',
            STARTING_USDT_BALANCE: process.env.STARTING_USDT_BALANCE,
            STARTING_ETH_BALANCE: process.env.STARTING_ETH_BALANCE,
            RISK_AVERSION: parseFloat(process.env.RISK_AVERSION) || 0.1,
            VOLATILITY: parseFloat(process.env.VOLATILITY) || 0.2,
            TIME_HORIZON: parseFloat(process.env.TIME_HORIZON) || 1.0,
            UPDATE_INTERVAL: parseInt(process.env.UPDATE_INTERVAL) || 5000,
            QUOTE_INTERVAL: parseInt(process.env.QUOTE_INTERVAL) || 10000,
            MIN_ORDER_SIZE: parseFloat(process.env.MIN_TRADE_SIZE_USDT) / 2000 || 0.005, // Convert USDT to ETH
            MAX_ORDER_SIZE: parseFloat(process.env.MAX_TRADE_SIZE_USDT) / 2000 || 0.5,
            SHOW_MATHEMATICAL_CALCULATIONS: process.env.SHOW_MATHEMATICAL_CALCULATIONS === 'true'
        };
    }
    
    /**
     * Start the demo bot
     */
    async start() {
        if (this.isRunning) {
            console.log('⚠️  Demo bot already running');
            return;
        }
        
        console.log('🚀 Starting Demo TWAP Trading Bot...');
        console.log('💰 Initial Portfolio:', this.simulation.getSimulatedInventory());
        console.log('📈 Portfolio Value:', this.simulation.getPortfolioValue());
        
        this.isRunning = true;
        
        // Start quote generation
        this.startQuoteGeneration();
        
        // Start price simulation
        this.startPriceSimulation();
        
        console.log('✅ Demo bot started successfully!');
        console.log('📊 Generating quotes and simulating trades...');
        console.log('🌐 Web dashboard available at http://localhost:3001 (if enabled)');
        
        this.displayInstructions();
    }
    
    /**
     * Stop the demo bot
     */
    stop() {
        if (!this.isRunning) {
            console.log('⚠️  Demo bot not running');
            return;
        }
        
        console.log('⏹️  Stopping Demo TWAP Trading Bot...');
        
        this.isRunning = false;
        
        if (this.quoteInterval) {
            clearInterval(this.quoteInterval);
        }
        
        if (this.priceInterval) {
            clearInterval(this.priceInterval);
        }
        
        console.log('✅ Demo bot stopped');
        this.displayResults();
    }
    
    /**
     * Start automatic quote generation
     */
    startQuoteGeneration() {
        this.quoteInterval = setInterval(() => {
            try {
                this.generateAndDisplayQuotes();
            } catch (error) {
                console.error('❌ Error generating quotes:', error);
            }
        }, this.config.QUOTE_INTERVAL);
        
        console.log('📊 Quote generation started');
    }
    
    /**
     * Start price simulation
     */
    startPriceSimulation() {
        this.priceInterval = setInterval(() => {
            try {
                const marketData = this.simulation.getCurrentMarketData();
                this.model.updateMarketData(marketData);
                
                // Occasionally create simulated orders
                if (Math.random() < 0.3) { // 30% chance per interval
                    this.createSimulatedOrder(marketData);
                }
                
            } catch (error) {
                console.error('❌ Error in price simulation:', error);
            }
        }, this.config.UPDATE_INTERVAL);
        
        console.log('📈 Price simulation started');
    }
    
    /**
     * Generate and display quotes
     */
    generateAndDisplayQuotes() {
        const marketData = this.simulation.getCurrentMarketData();
        const inventory = this.simulation.getSimulatedInventory();
        
        // Update model with current data
        this.model.updateInventory(inventory);
        
        // Generate optimal quotes
        const quotes = this.model.generateOptimalQuotes(marketData);
        
        if (quotes) {
            console.log('\n💰 NEW QUOTES GENERATED:');
            console.log(`📊 Current Market Price: $${marketData.price.toFixed(4)}`);
            console.log(`🎯 Reservation Price: $${quotes.reservationPrice.toFixed(4)}`);
            console.log(`📏 Optimal Spread: ${(quotes.optimalSpread * 100).toFixed(4)}%`);
            console.log(`💚 Bid Price: $${quotes.bidPrice.toFixed(4)}`);
            console.log(`❤️  Ask Price: $${quotes.askPrice.toFixed(4)}`);
            console.log(`📈 Current Portfolio Value: $${this.simulation.getPortfolioValue().totalValue.toFixed(2)}\n`);
            
            // Show mathematical calculations if enabled
            this.simulation.showCalculations(quotes);
        }
    }
    
    /**
     * Create simulated order
     */
    createSimulatedOrder(marketData) {
        const inventory = this.simulation.getSimulatedInventory();
        const totalValue = inventory.ETH * marketData.price + inventory.USDT;
        const ethRatio = (inventory.ETH * marketData.price) / totalValue;
        
        // Simple rebalancing strategy
        let direction, size;
        
        if (ethRatio < 0.4) {
            // Need more ETH
            direction = 'buy';
            size = Math.min(this.config.MAX_ORDER_SIZE, inventory.USDT / marketData.price * 0.1);
        } else if (ethRatio > 0.6) {
            // Need more USDT
            direction = 'sell';
            size = Math.min(this.config.MAX_ORDER_SIZE, inventory.ETH * 0.1);
        } else {
            return; // Portfolio balanced
        }
        
        if (size < this.config.MIN_ORDER_SIZE) return;
        
        const order = {
            id: `demo_${++this.orderCounter}_${Date.now()}`,
            direction,
            totalSize: size,
            targetPrice: marketData.price,
            duration: 60000, // 1 minute for demo
            maxParts: 5
        };
        
        console.log(`\n📋 Creating simulated ${direction.toUpperCase()} order:`);
        console.log(`   Order ID: ${order.id}`);
        console.log(`   Size: ${size.toFixed(6)} ETH`);
        console.log(`   Target Price: $${marketData.price.toFixed(4)}`);
        console.log(`   Reason: Portfolio rebalancing (ETH ratio: ${(ethRatio * 100).toFixed(1)}%)`);
        
        // Execute simulation
        const result = this.simulation.simulateOrderExecution(order);
        
        if (result.success) {
            console.log(`✅ Order executed successfully!`);
            console.log(`   Average Price: $${result.averagePrice.toFixed(4)}`);
            console.log(`   New ETH Balance: ${result.newInventory.ETH.toFixed(6)}`);
            console.log(`   New USDT Balance: ${result.newInventory.USDT.toFixed(2)}`);
            console.log(`   Portfolio Value: $${this.simulation.getPortfolioValue().totalValue.toFixed(2)}\n`);
        }
    }
    
    /**
     * Display instructions
     */
    displayInstructions() {
        console.log('\n📋 DEMO BOT INSTRUCTIONS:');
        console.log('==========================');
        console.log('• This bot runs in SIMULATION MODE - no real money');
        console.log('• Watch the mathematical calculations in real-time');
        console.log('• Portfolio rebalancing happens automatically');
        console.log('• Press Ctrl+C to stop and see results');
        console.log('• All calculations are based on Avellaneda-Stoikov model');
        console.log('==========================\n');
    }
    
    /**
     * Display final results
     */
    displayResults() {
        const stats = this.simulation.getTradingStats();
        const portfolio = this.simulation.getPortfolioValue();
        const initialValue = 10000 + (5 * 2000); // Starting values
        const pnl = portfolio.totalValue - initialValue;
        const pnlPercent = (pnl / initialValue) * 100;
        
        console.log('\n📊 DEMO TRADING RESULTS:');
        console.log('=========================');
        console.log(`Initial Portfolio Value: $${initialValue.toFixed(2)}`);
        console.log(`Final Portfolio Value: $${portfolio.totalValue.toFixed(2)}`);
        console.log(`Total PnL: $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
        console.log(`Total Trades: ${stats.totalTrades}`);
        console.log(`Total Volume: ${stats.totalVolume.toFixed(4)} ETH`);
        console.log(`Buy Trades: ${stats.buyTrades} (Avg: $${stats.avgBuyPrice.toFixed(4)})`);
        console.log(`Sell Trades: ${stats.sellTrades} (Avg: $${stats.avgSellPrice.toFixed(4)})`);
        console.log(`Price Change: ${(stats.priceChange * 100).toFixed(2)}%`);
        console.log('=========================');
        console.log('💡 This was a mathematical simulation!');
        console.log('📈 Ready to implement with real funds when you are!');
        console.log('=========================\n');
    }
    
    /**
     * Get current status (for API)
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            mode: 'simulation',
            portfolio: this.simulation.getPortfolioValue(),
            inventory: this.simulation.getSimulatedInventory(),
            stats: this.simulation.getTradingStats(),
            config: this.config
        };
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received interrupt signal...');
    if (global.demoBot) {
        global.demoBot.stop();
    }
    process.exit(0);
});

// Auto-start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('\n🎯 TWAP TRADING BOT - DEMO MODE');
    console.log('================================');
    console.log('🔒 SAFE SIMULATION - NO REAL MONEY');
    console.log('🧮 Mathematical Model Testing');
    console.log('📊 Avellaneda-Stoikov Implementation');
    console.log('================================\n');
    
    const demoBot = new DemoTradingBot();
    global.demoBot = demoBot;
    
    demoBot.start().catch(console.error);
}

export { DemoTradingBot };
export default DemoTradingBot;
