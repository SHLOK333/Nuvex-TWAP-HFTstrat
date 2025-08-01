/**
 * Avellaneda-Stoikov Market Making Model Implementation
 * 
 * This model implements the mathematical framework for optimal market making
 * as described in "High-frequency trading in a limit order book" by Avellaneda & Stoikov
 * 
 * Key Mathematical Components:
 * 1. Optimal bid/ask spread calculation
 * 2. Inventory risk management
 * 3. Adverse selection protection
 * 4. Dynamic reservation price adjustment
 */

import { EventEmitter } from 'events';
import { create, all } from 'mathjs';

const math = create(all);

export class AvellanedaStoikovModel extends EventEmitter {
    constructor(params = {}) {
        super();
        
        // Model Parameters
        this.γ = params.gamma || 0.1;           // Risk aversion parameter
        this.σ = params.sigma || 0.2;          // Price volatility
        this.T = params.T || 1.0;              // Time horizon (normalized)
        this.k = params.k || 1.5;              // Liquidity parameter
        this.A = params.A || 100;              // Order arrival intensity
        
        // State Variables
        this.q = 0;                            // Current inventory
        this.q_target = 0;                     // Target inventory
        this.S = 0;                            // Current mid price
        this.t = 0;                            // Current time
        
        // Historical data for parameter estimation
        this.priceHistory = [];
        this.spreadHistory = [];
        this.volumeHistory = [];
        this.inventoryHistory = [];
        
        // Statistics
        this.stats = {
            totalTrades: 0,
            totalVolume: 0,
            totalPnL: 0,
            sharpeRatio: 0,
            maxDrawdown: 0,
            inventoryTurnover: 0
        };
        
        console.log('🧮 Avellaneda-Stoikov model initialized with parameters:', {
            gamma: this.γ,
            sigma: this.σ,
            T: this.T,
            k: this.k,
            A: this.A
        });
    }
    
    /**
     * Calculate the optimal reservation price
     * r(t,x,S) = S - (γ * σ² * (T-t) * q) / 2
     */
    calculateReservationPrice(S, q, t) {
        const timeToMaturity = this.T - t;
        const inventoryPenalty = (this.γ * Math.pow(this.σ, 2) * timeToMaturity * q) / 2;
        const reservationPrice = S - inventoryPenalty;
        
        return reservationPrice;
    }
    
    /**
     * Calculate the optimal half-spread
     * δ = (γ * σ² * (T-t)) / 2 + (2/γ) * ln(1 + γ/k)
     */
    calculateOptimalSpread(t) {
        const timeToMaturity = this.T - t;
        const riskComponent = (this.γ * Math.pow(this.σ, 2) * timeToMaturity) / 2;
        const liquidityComponent = (2 / this.γ) * Math.log(1 + this.γ / this.k);
        
        const halfSpread = riskComponent + liquidityComponent;
        return halfSpread * 2; // Return full spread
    }
    
    /**
     * Calculate arrival intensities for bid and ask orders
     * λ^a(δ^a) = A * e^(-k*δ^a)
     * λ^b(δ^b) = A * e^(-k*δ^b)
     */
    calculateArrivalIntensities(bidSpread, askSpread) {
        const bidIntensity = this.A * Math.exp(-this.k * bidSpread);
        const askIntensity = this.A * Math.exp(-this.k * askSpread);
        
        return { bidIntensity, askIntensity };
    }
    
    /**
     * Calculate optimal bid and ask prices
     */
    calculateOptimalQuotes(S, q, t) {
        // Calculate reservation price
        const r = this.calculateReservationPrice(S, q, t);
        
        // Calculate optimal spread
        const optimalSpread = this.calculateOptimalSpread(t);
        const halfSpread = optimalSpread / 2;
        
        // Adjust spread based on inventory
        const inventoryAdjustment = this.calculateInventoryAdjustment(q);
        
        // Calculate bid and ask prices
        const bidPrice = r - halfSpread - inventoryAdjustment;
        const askPrice = r + halfSpread + inventoryAdjustment;
        
        // Calculate arrival intensities
        const bidSpread = S - bidPrice;
        const askSpread = askPrice - S;
        const intensities = this.calculateArrivalIntensities(bidSpread, askSpread);
        
        return {
            bidPrice: Math.max(bidPrice, S * 0.95), // Safety bounds
            askPrice: Math.min(askPrice, S * 1.05),
            reservationPrice: r,
            spread: optimalSpread,
            bidIntensity: intensities.bidIntensity,
            askIntensity: intensities.askIntensity,
            inventoryAdjustment
        };
    }
    
    /**
     * Calculate inventory adjustment to push towards target
     */
    calculateInventoryAdjustment(q) {
        const inventoryImbalance = q - this.q_target;
        const maxAdjustment = this.σ * 0.1; // Max 10% of volatility
        
        // Scale adjustment based on inventory distance from target
        const adjustment = Math.tanh(inventoryImbalance * 2) * maxAdjustment;
        
        return adjustment;
    }
    
    /**
     * Update model parameters based on recent market data
     */
    updateParameters(marketData) {
        this.S = marketData.midPrice;
        this.t = marketData.timestamp;
        this.q = marketData.inventory;
        
        // Add to history
        this.priceHistory.push({ price: this.S, timestamp: this.t });
        this.inventoryHistory.push({ inventory: this.q, timestamp: this.t });
        
        // Keep only recent history (last 1000 points)
        if (this.priceHistory.length > 1000) {
            this.priceHistory = this.priceHistory.slice(-1000);
            this.inventoryHistory = this.inventoryHistory.slice(-1000);
        }
        
        // Recalibrate volatility if enough data
        if (this.priceHistory.length > 50) {
            this.σ = this.estimateVolatility();
        }
        
        // Emit updated quotes
        const quotes = this.calculateOptimalQuotes(this.S, this.q, this.t);
        this.emit('quotesUpdated', quotes);
        
        return quotes;
    }
    
    /**
     * Estimate volatility from price history using EWMA
     */
    estimateVolatility() {
        if (this.priceHistory.length < 2) return this.σ;
        
        const returns = [];
        for (let i = 1; i < this.priceHistory.length; i++) {
            const return_ = Math.log(this.priceHistory[i].price / this.priceHistory[i-1].price);
            returns.push(return_);
        }
        
        // EWMA volatility estimation
        const lambda = 0.94; // Decay factor
        let ewmaVar = Math.pow(returns[0], 2);
        
        for (let i = 1; i < returns.length; i++) {
            ewmaVar = lambda * ewmaVar + (1 - lambda) * Math.pow(returns[i], 2);
        }
        
        // Annualized volatility (assuming 5-second intervals)
        const volatility = Math.sqrt(ewmaVar * (365 * 24 * 60 * 60 / 5));
        
        // Smooth the transition
        const smoothingFactor = 0.1;
        return this.σ * (1 - smoothingFactor) + volatility * smoothingFactor;
    }
    
    /**
     * Calculate expected PnL from current strategy
     */
    calculateExpectedPnL(quotes, timeHorizon = 0.01) {
        const { bidPrice, askPrice, bidIntensity, askIntensity } = quotes;
        
        // Expected profit from bid orders
        const bidProfit = (this.S - bidPrice) * bidIntensity * timeHorizon;
        
        // Expected profit from ask orders  
        const askProfit = (askPrice - this.S) * askIntensity * timeHorizon;
        
        // Risk penalty from inventory
        const inventoryRisk = -0.5 * this.γ * Math.pow(this.σ * this.q, 2) * timeHorizon;
        
        return bidProfit + askProfit + inventoryRisk;
    }
    
    /**
     * Update statistics after a trade
     */
    updateStats(trade) {
        this.stats.totalTrades++;
        this.stats.totalVolume += trade.size;
        this.stats.totalPnL += trade.pnl;
        
        // Update max drawdown
        if (trade.pnl < 0) {
            this.stats.maxDrawdown = Math.min(this.stats.maxDrawdown, trade.pnl);
        }
        
        // Calculate inventory turnover
        if (this.stats.totalVolume > 0) {
            this.stats.inventoryTurnover = this.stats.totalVolume / Math.abs(this.q || 1);
        }
        
        this.emit('statsUpdated', this.stats);
    }
    
    /**
     * Get model diagnostics
     */
    getDiagnostics() {
        return {
            parameters: {
                gamma: this.γ,
                sigma: this.σ,
                T: this.T,
                k: this.k,
                A: this.A
            },
            state: {
                inventory: this.q,
                targetInventory: this.q_target,
                midPrice: this.S,
                time: this.t
            },
            statistics: this.stats,
            dataPoints: {
                priceHistory: this.priceHistory.length,
                spreadHistory: this.spreadHistory.length,
                volumeHistory: this.volumeHistory.length
            }
        };
    }
}

export default AvellanedaStoikovModel;
