/**
 * Simulation Mode Manager
 * Handles paper trading and mathematical calculations without real blockchain interaction
 */

export class SimulationMode {
    constructor(config) {
        this.config = config;
        this.simulatedInventory = {
            USDT: parseFloat(config.STARTING_USDT_BALANCE) || 10000,
            ETH: parseFloat(config.STARTING_ETH_BALANCE) || 5
        };
        
        this.simulatedTrades = [];
        this.mockPriceData = [];
        this.currentMockPrice = 2000; // Starting ETH price
        this.priceVolatility = parseFloat(config.VOLATILITY) || 0.2;
        
        console.log('📊 Simulation Mode Initialized');
        console.log('💰 Starting Portfolio:', this.simulatedInventory);
        console.log('💵 Starting ETH Price: $' + this.currentMockPrice);
    }
    
    /**
     * Generate mock price data with realistic movements
     */
    generateMockPriceData() {
        // Geometric Brownian Motion for realistic price simulation
        const dt = 1 / (24 * 60); // 1 minute time step
        const drift = 0.1; // 10% annual drift
        const volatility = this.priceVolatility;
        
        // Random walk with drift
        const randomShock = (Math.random() - 0.5) * 2; // -1 to 1
        const priceChange = this.currentMockPrice * (
            drift * dt + volatility * Math.sqrt(dt) * randomShock
        );
        
        this.currentMockPrice += priceChange;
        
        // Keep price within reasonable bounds
        this.currentMockPrice = Math.max(500, Math.min(10000, this.currentMockPrice));
        
        const timestamp = Date.now();
        const mockData = {
            timestamp,
            price: this.currentMockPrice,
            volume24h: 1000000 + Math.random() * 500000,
            priceChange24h: (Math.random() - 0.5) * 0.1, // ±5%
            volatility: this.priceVolatility,
            bidAskSpread: 0.001 + Math.random() * 0.002, // 0.1-0.3%
            source: 'simulation'
        };
        
        this.mockPriceData.push(mockData);
        
        // Keep only last 100 data points
        if (this.mockPriceData.length > 100) {
            this.mockPriceData.shift();
        }
        
        return mockData;
    }
    
    /**
     * Simulate order execution
     */
    simulateOrderExecution(order) {
        console.log('📋 Simulating order execution:', order.id);
        
        const executionParts = [];
        const timePerPart = order.duration / order.maxParts;
        
        for (let i = 0; i < order.maxParts; i++) {
            // Generate slightly different price for each part
            const priceVariation = (Math.random() - 0.5) * 0.01; // ±0.5%
            const executionPrice = this.currentMockPrice * (1 + priceVariation);
            const partSize = order.totalSize / order.maxParts;
            
            const part = {
                partIndex: i,
                executionTime: Date.now() + (i * timePerPart),
                size: partSize,
                price: executionPrice,
                direction: order.direction,
                simulated: true
            };
            
            // Update simulated inventory
            if (order.direction === 'buy') {
                this.simulatedInventory.USDT -= partSize * executionPrice;
                this.simulatedInventory.ETH += partSize;
            } else {
                this.simulatedInventory.ETH -= partSize;
                this.simulatedInventory.USDT += partSize * executionPrice;
            }
            
            executionParts.push(part);
            this.simulatedTrades.push(part);
        }
        
        const totalValue = partSize * this.currentMockPrice * order.maxParts;
        const avgPrice = executionParts.reduce((sum, part) => sum + part.price, 0) / executionParts.length;
        
        console.log('✅ Simulated execution complete:', {
            orderId: order.id,
            parts: executionParts.length,
            avgPrice: avgPrice.toFixed(4),
            totalValue: totalValue.toFixed(2),
            newInventory: this.simulatedInventory
        });
        
        return {
            success: true,
            executionParts,
            averagePrice: avgPrice,
            totalValue,
            newInventory: { ...this.simulatedInventory }
        };
    }
    
    /**
     * Get current simulated market data
     */
    getCurrentMarketData() {
        return this.generateMockPriceData();
    }
    
    /**
     * Get simulated inventory
     */
    getSimulatedInventory() {
        return { ...this.simulatedInventory };
    }
    
    /**
     * Calculate portfolio value
     */
    getPortfolioValue() {
        const ethValue = this.simulatedInventory.ETH * this.currentMockPrice;
        const totalValue = ethValue + this.simulatedInventory.USDT;
        
        return {
            ethValue,
            usdtValue: this.simulatedInventory.USDT,
            totalValue,
            ethPrice: this.currentMockPrice
        };
    }
    
    /**
     * Get trading statistics
     */
    getTradingStats() {
        const totalTrades = this.simulatedTrades.length;
        const totalVolume = this.simulatedTrades.reduce((sum, trade) => sum + trade.size, 0);
        
        const buyTrades = this.simulatedTrades.filter(t => t.direction === 'buy');
        const sellTrades = this.simulatedTrades.filter(t => t.direction === 'sell');
        
        const avgBuyPrice = buyTrades.length > 0 
            ? buyTrades.reduce((sum, t) => sum + t.price, 0) / buyTrades.length 
            : 0;
            
        const avgSellPrice = sellTrades.length > 0
            ? sellTrades.reduce((sum, t) => sum + t.price, 0) / sellTrades.length
            : 0;
        
        return {
            totalTrades,
            totalVolume,
            buyTrades: buyTrades.length,
            sellTrades: sellTrades.length,
            avgBuyPrice,
            avgSellPrice,
            currentPrice: this.currentMockPrice,
            priceChange: this.calculatePriceChange()
        };
    }
    
    /**
     * Calculate price change since start
     */
    calculatePriceChange() {
        if (this.mockPriceData.length < 2) return 0;
        
        const firstPrice = this.mockPriceData[0].price;
        const currentPrice = this.currentMockPrice;
        
        return (currentPrice - firstPrice) / firstPrice;
    }
    
    /**
     * Reset simulation
     */
    resetSimulation() {
        this.simulatedInventory = {
            USDT: parseFloat(this.config.STARTING_USDT_BALANCE) || 10000,
            ETH: parseFloat(this.config.STARTING_ETH_BALANCE) || 5
        };
        
        this.simulatedTrades = [];
        this.mockPriceData = [];
        this.currentMockPrice = 2000;
        
        console.log('🔄 Simulation reset to initial state');
    }
    
    /**
     * Export simulation data
     */
    exportSimulationData() {
        return {
            config: this.config,
            currentInventory: this.simulatedInventory,
            currentPrice: this.currentMockPrice,
            trades: this.simulatedTrades,
            priceHistory: this.mockPriceData,
            stats: this.getTradingStats(),
            portfolioValue: this.getPortfolioValue()
        };
    }
    
    /**
     * Show mathematical calculations
     */
    showCalculations(quotes) {
        if (!this.config.SHOW_MATHEMATICAL_CALCULATIONS) return;
        
        console.log('\n📊 AVELLANEDA-STOIKOV CALCULATIONS:');
        console.log('=====================================');
        console.log(`Current Price (S): $${this.currentMockPrice.toFixed(4)}`);
        console.log(`Reservation Price (r): $${quotes.reservationPrice.toFixed(4)}`);
        console.log(`Optimal Spread (δ): ${(quotes.optimalSpread * 100).toFixed(4)}%`);
        console.log(`Bid Price: $${quotes.bidPrice.toFixed(4)}`);
        console.log(`Ask Price: $${quotes.askPrice.toFixed(4)}`);
        console.log(`Risk Aversion (γ): ${quotes.riskAversion}`);
        console.log(`Volatility (σ): ${quotes.volatility}`);
        console.log(`Time Horizon (T): ${quotes.timeHorizon}h`);
        console.log(`Inventory (q): ETH=${this.simulatedInventory.ETH.toFixed(4)}, USDT=${this.simulatedInventory.USDT.toFixed(2)}`);
        console.log('=====================================\n');
    }
}

export default SimulationMode;
