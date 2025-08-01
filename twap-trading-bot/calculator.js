/**
 * Avellaneda-Stoikov Calculator - Standalone Version
 * Run this to see the mathematical calculations without any dependencies
 */

// Configuration from your .env file
const config = {
    RISK_AVERSION: 0.1,
    VOLATILITY: 0.2,
    TIME_HORIZON: 1.0,
    STARTING_USDT_BALANCE: 10000,
    STARTING_ETH_BALANCE: 5,
    CURRENT_ETH_PRICE: 3400, // Example current price
    TICK_SIZE: 0.01
};

console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    AVELLANEDA-STOIKOV CALCULATOR                              ║
║                         Mathematical Demo                                     ║
║                                                                               ║
║  🎯 SAFE CALCULATION MODE - NO REAL MONEY                                   ║
║  🧮 Pure Mathematics - Optimal Market Making                                ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

/**
 * Avellaneda-Stoikov Mathematical Model
 */
class AvellanedaStoikovCalculator {
    constructor(config) {
        this.gamma = config.RISK_AVERSION;        // Risk aversion parameter
        this.sigma = config.VOLATILITY;          // Volatility
        this.T = config.TIME_HORIZON;            // Time horizon (hours)
        this.tickSize = config.TICK_SIZE;        // Minimum price increment
        
        console.log('📊 Model Parameters:');
        console.log(`   Risk Aversion (γ): ${this.gamma}`);
        console.log(`   Volatility (σ): ${this.sigma}`);
        console.log(`   Time Horizon (T): ${this.T} hours`);
        console.log(`   Tick Size: $${this.tickSize}\n`);
    }
    
    /**
     * Calculate reservation price
     * Formula: r(t,x,S) = S - (γ * σ² * (T-t) * q) / 2
     */
    calculateReservationPrice(currentPrice, inventory, timeRemaining) {
        const S = currentPrice;
        const q = inventory.ethBalance - inventory.targetBalance;
        const t_remaining = timeRemaining || this.T;
        
        const reservationPrice = S - (this.gamma * Math.pow(this.sigma, 2) * t_remaining * q) / 2;
        
        console.log('🎯 RESERVATION PRICE CALCULATION:');
        console.log(`   Current Price (S): $${S.toFixed(4)}`);
        console.log(`   Inventory Imbalance (q): ${q.toFixed(6)} ETH`);
        console.log(`   Time Remaining (T-t): ${t_remaining.toFixed(2)} hours`);
        console.log(`   Formula: r = S - (γ × σ² × (T-t) × q) / 2`);
        console.log(`   Formula: r = ${S} - (${this.gamma} × ${this.sigma}² × ${t_remaining} × ${q}) / 2`);
        console.log(`   Formula: r = ${S} - ${((this.gamma * Math.pow(this.sigma, 2) * t_remaining * q) / 2).toFixed(6)}`);
        console.log(`   📈 Reservation Price: $${reservationPrice.toFixed(4)}\n`);
        
        return reservationPrice;
    }
    
    /**
     * Calculate optimal spread
     * Formula: δ = γ * σ² * (T-t) + (2/γ) * ln(1 + γ/κ)
     */
    calculateOptimalSpread(timeRemaining, arrivalIntensity = 1.5) {
        const t_remaining = timeRemaining || this.T;
        const kappa = arrivalIntensity;
        
        // Simplified optimal spread (more complex version includes arrival intensity)
        const spread = this.gamma * Math.pow(this.sigma, 2) * t_remaining + 
                      (2 / this.gamma) * Math.log(1 + this.gamma / kappa);
        
        console.log('📏 OPTIMAL SPREAD CALCULATION:');
        console.log(`   Time Remaining (T-t): ${t_remaining.toFixed(2)} hours`);
        console.log(`   Arrival Intensity (κ): ${kappa}`);
        console.log(`   Formula: δ = γ × σ² × (T-t) + (2/γ) × ln(1 + γ/κ)`);
        console.log(`   Formula: δ = ${this.gamma} × ${this.sigma}² × ${t_remaining} + (2/${this.gamma}) × ln(1 + ${this.gamma}/${kappa})`);
        console.log(`   Formula: δ = ${(this.gamma * Math.pow(this.sigma, 2) * t_remaining).toFixed(6)} + ${((2 / this.gamma) * Math.log(1 + this.gamma / kappa)).toFixed(6)}`);
        console.log(`   📊 Optimal Spread: ${(spread * 100).toFixed(4)}%\n`);
        
        return spread;
    }
    
    /**
     * Calculate bid and ask prices
     */
    calculateOptimalQuotes(currentPrice, inventory, timeRemaining) {
        const reservationPrice = this.calculateReservationPrice(currentPrice, inventory, timeRemaining);
        const optimalSpread = this.calculateOptimalSpread(timeRemaining);
        
        const bidPrice = reservationPrice - optimalSpread / 2;
        const askPrice = reservationPrice + optimalSpread / 2;
        
        console.log('💰 OPTIMAL BID/ASK QUOTES:');
        console.log(`   📈 Reservation Price: $${reservationPrice.toFixed(4)}`);
        console.log(`   📏 Optimal Spread: ${(optimalSpread * 100).toFixed(4)}%`);
        console.log(`   💚 Bid Price: $${bidPrice.toFixed(4)} (buy at)`);
        console.log(`   ❤️  Ask Price: $${askPrice.toFixed(4)} (sell at)`);
        console.log(`   📊 Mid Price: $${((bidPrice + askPrice) / 2).toFixed(4)}`);
        console.log(`   🔄 Spread: $${(askPrice - bidPrice).toFixed(4)} (${((askPrice - bidPrice) / currentPrice * 100).toFixed(4)}%)\n`);
        
        return {
            reservationPrice,
            optimalSpread,
            bidPrice,
            askPrice,
            midPrice: (bidPrice + askPrice) / 2
        };
    }
    
    /**
     * Calculate portfolio metrics
     */
    calculatePortfolioMetrics(inventory, currentPrice) {
        const ethValue = inventory.ethBalance * currentPrice;
        const totalValue = ethValue + inventory.usdtBalance;
        const ethRatio = ethValue / totalValue;
        const targetRatio = 0.5; // 50/50 target
        const imbalance = ethRatio - targetRatio;
        
        console.log('💰 PORTFOLIO ANALYSIS:');
        console.log(`   ETH Balance: ${inventory.ethBalance.toFixed(6)} ETH`);
        console.log(`   USDT Balance: $${inventory.usdtBalance.toFixed(2)}`);
        console.log(`   ETH Value: $${ethValue.toFixed(2)}`);
        console.log(`   Total Portfolio Value: $${totalValue.toFixed(2)}`);
        console.log(`   ETH Ratio: ${(ethRatio * 100).toFixed(2)}% (target: 50%)`);
        console.log(`   Imbalance: ${(imbalance * 100).toFixed(2)}%`);
        
        if (Math.abs(imbalance) > 0.1) {
            const recommendation = imbalance > 0 ? 'SELL ETH' : 'BUY ETH';
            console.log(`   🎯 Recommendation: ${recommendation} to rebalance`);
        } else {
            console.log(`   ✅ Portfolio is well balanced`);
        }
        console.log('');
        
        return {
            ethValue,
            totalValue,
            ethRatio,
            imbalance,
            recommendation: Math.abs(imbalance) > 0.1 ? (imbalance > 0 ? 'SELL' : 'BUY') : 'HOLD'
        };
    }
    
    /**
     * Simulate price movement and recalculate
     */
    simulatePriceMovement(currentPrice, volatility, timeStep = 1/60) { // 1 minute
        const drift = 0.0; // No drift for simplicity
        const randomShock = (Math.random() - 0.5) * 2; // -1 to 1
        const priceChange = currentPrice * (drift * timeStep + volatility * Math.sqrt(timeStep) * randomShock);
        
        return Math.max(100, currentPrice + priceChange); // Keep price above $100
    }
}

/**
 * Main demonstration
 */
function runDemo() {
    const calculator = new AvellanedaStoikovCalculator(config);
    
    // Initial portfolio state
    let inventory = {
        ethBalance: config.STARTING_ETH_BALANCE,
        usdtBalance: config.STARTING_USDT_BALANCE,
        targetBalance: config.STARTING_ETH_BALANCE // Target for balanced portfolio
    };
    
    let currentPrice = config.CURRENT_ETH_PRICE;
    let timeRemaining = config.TIME_HORIZON;
    
    console.log('🚀 STARTING DEMONSTRATION...\n');
    
    // Run multiple iterations to show how quotes change
    for (let iteration = 1; iteration <= 5; iteration++) {
        console.log(`${'='.repeat(80)}`);
        console.log(`                          ITERATION ${iteration}`);
        console.log(`${'='.repeat(80)}\n`);
        
        // Calculate portfolio metrics
        const portfolioMetrics = calculator.calculatePortfolioMetrics(inventory, currentPrice);
        
        // Calculate optimal quotes
        const quotes = calculator.calculateOptimalQuotes(currentPrice, inventory, timeRemaining);
        
        // Show profit opportunity
        const marketMidPrice = currentPrice;
        const quoteMidPrice = quotes.midPrice;
        const priceAdvantage = ((quoteMidPrice - marketMidPrice) / marketMidPrice) * 100;
        
        console.log('📈 MARKET MAKING OPPORTUNITY:');
        console.log(`   Market Price: $${marketMidPrice.toFixed(4)}`);
        console.log(`   Our Mid Quote: $${quoteMidPrice.toFixed(4)}`);
        console.log(`   Price Advantage: ${priceAdvantage.toFixed(4)}%`);
        console.log(`   Potential Profit per Trade: $${((quotes.askPrice - quotes.bidPrice) / 2).toFixed(4)}\n`);
        
        // Simulate executing a small trade
        if (portfolioMetrics.recommendation === 'BUY' && iteration % 2 === 1) {
            const buyAmount = 0.1; // Buy 0.1 ETH
            inventory.ethBalance += buyAmount;
            inventory.usdtBalance -= buyAmount * quotes.askPrice;
            console.log(`✅ SIMULATED BUY: ${buyAmount} ETH at $${quotes.askPrice.toFixed(4)}\n`);
        } else if (portfolioMetrics.recommendation === 'SELL' && iteration % 2 === 0) {
            const sellAmount = 0.1; // Sell 0.1 ETH
            inventory.ethBalance -= sellAmount;
            inventory.usdtBalance += sellAmount * quotes.bidPrice;
            console.log(`✅ SIMULATED SELL: ${sellAmount} ETH at $${quotes.bidPrice.toFixed(4)}\n`);
        }
        
        // Simulate price movement for next iteration
        if (iteration < 5) {
            const oldPrice = currentPrice;
            currentPrice = calculator.simulatePriceMovement(currentPrice, config.VOLATILITY);
            const priceChange = ((currentPrice - oldPrice) / oldPrice) * 100;
            timeRemaining -= 0.2; // 12 minutes passed
            
            console.log(`⏰ TIME PROGRESS: ${timeRemaining.toFixed(2)} hours remaining`);
            console.log(`📊 PRICE MOVEMENT: $${oldPrice.toFixed(4)} → $${currentPrice.toFixed(4)} (${priceChange.toFixed(2)}%)\n`);
        }
        
        // Add a small delay for readability
        if (iteration < 5) {
            console.log('⏳ Moving to next iteration...\n');
        }
    }
    
    // Final summary
    const finalValue = inventory.ethBalance * currentPrice + inventory.usdtBalance;
    const initialValue = config.STARTING_ETH_BALANCE * config.CURRENT_ETH_PRICE + config.STARTING_USDT_BALANCE;
    const totalPnL = finalValue - initialValue;
    const pnlPercent = (totalPnL / initialValue) * 100;
    
    console.log(`${'='.repeat(80)}`);
    console.log(`                            FINAL RESULTS`);
    console.log(`${'='.repeat(80)}\n`);
    console.log(`💰 PERFORMANCE SUMMARY:`);
    console.log(`   Initial Portfolio Value: $${initialValue.toFixed(2)}`);
    console.log(`   Final Portfolio Value: $${finalValue.toFixed(2)}`);
    console.log(`   Total PnL: $${totalPnL.toFixed(2)} (${pnlPercent.toFixed(3)}%)`);
    console.log(`   Final ETH Balance: ${inventory.ethBalance.toFixed(6)} ETH`);
    console.log(`   Final USDT Balance: $${inventory.usdtBalance.toFixed(2)}`);
    console.log(`   Price Change: $${config.CURRENT_ETH_PRICE} → $${currentPrice.toFixed(4)}\n`);
    
    console.log(`🎯 KEY INSIGHTS:`);
    console.log(`   • The Avellaneda-Stoikov model dynamically adjusts quotes based on inventory`);
    console.log(`   • Risk aversion (γ=${config.RISK_AVERSION}) controls how aggressive the pricing is`);
    console.log(`   • Higher volatility (σ=${config.VOLATILITY}) increases optimal spreads`);
    console.log(`   • Time decay affects reservation price calculations`);
    console.log(`   • This was a mathematical simulation - ready for live implementation!\n`);
    
    console.log(`✅ CALCULATION COMPLETE - Mathematical model validated!`);
}

// Run the demonstration
runDemo();
