/**
 * Risk Management System
 * Implements comprehensive risk controls for the TWAP trading bot
 */

export class RiskManager {
    constructor(config) {
        this.config = config;
        
        // Risk limits
        this.maxDailyLoss = config.maxDailyLoss || 1000; // USD
        this.maxPositionSize = config.maxPositionSize || 10; // ETH
        this.maxOrderSize = config.maxOrderSize || 1; // ETH per order
        this.maxSlippage = config.maxSlippage || 0.005; // 0.5%
        this.maxDrawdown = config.maxDrawdown || 0.1; // 10%
        
        // Risk tracking
        this.dailyPnL = 0;
        this.currentPosition = 0;
        this.peakValue = 0;
        this.lastResetDate = new Date().toDateString();
        
        // Circuit breakers
        this.emergencyStop = false;
        this.tradingPaused = false;
        
        console.log('🛡️  Risk Manager initialized with limits:', {
            maxDailyLoss: this.maxDailyLoss,
            maxPositionSize: this.maxPositionSize,
            maxOrderSize: this.maxOrderSize,
            maxSlippage: this.maxSlippage
        });
    }
    
    /**
     * Check if trading is allowed
     */
    isTradingAllowed() {
        if (this.emergencyStop) {
            console.log('⛔ Trading blocked: Emergency stop activated');
            return false;
        }
        
        if (this.tradingPaused) {
            console.log('⏸️  Trading blocked: Trading paused');
            return false;
        }
        
        return true;
    }
    
    /**
     * Validate order before execution
     */
    validateOrder(order, currentInventory, marketData) {
        console.log('🔍 Validating order:', order.id);
        
        try {
            // Reset daily PnL if new day
            this.resetDailyPnLIfNeeded();
            
            // Check basic trading permission
            if (!this.isTradingAllowed()) {
                throw new Error('Trading not allowed - risk controls active');
            }
            
            // Check order size
            if (order.totalSize > this.maxOrderSize) {
                throw new Error(`Order size ${order.totalSize} exceeds maximum ${this.maxOrderSize}`);
            }
            
            // Check position limits
            const newPosition = this.calculateNewPosition(order, currentInventory);
            if (Math.abs(newPosition) > this.maxPositionSize) {
                throw new Error(`New position ${newPosition} would exceed maximum ${this.maxPositionSize}`);
            }
            
            // Check daily loss limit
            const estimatedPnL = this.estimateOrderPnL(order, marketData);
            if (this.dailyPnL + estimatedPnL < -this.maxDailyLoss) {
                throw new Error(`Order would exceed daily loss limit. Current: ${this.dailyPnL}, Estimated: ${estimatedPnL}`);
            }
            
            // Check market conditions
            this.validateMarketConditions(marketData);
            
            // Check slippage
            this.validateSlippage(order, marketData);
            
            console.log('✅ Order validation passed');
            return true;
            
        } catch (error) {
            console.error('❌ Order validation failed:', error.message);
            throw error;
        }
    }
    
    /**
     * Calculate new position after order
     */
    calculateNewPosition(order, currentInventory) {
        const currentEthPosition = currentInventory.ETH || 0;
        
        if (order.direction === 'buy') {
            return currentEthPosition + order.totalSize;
        } else {
            return currentEthPosition - order.totalSize;
        }
    }
    
    /**
     * Estimate order PnL based on current market
     */
    estimateOrderPnL(order, marketData) {
        // Conservative estimate assuming some slippage
        const currentPrice = marketData.currentPrice;
        const slippageAdjustment = order.direction === 'buy' ? 1.002 : 0.998; // 0.2% slippage
        const executionPrice = currentPrice * slippageAdjustment;
        
        // Estimate based on spread vs market
        const spread = Math.abs(order.targetPrice - currentPrice) / currentPrice;
        
        if (order.direction === 'buy') {
            // Buying: negative if buying above market
            return order.totalSize * (currentPrice - executionPrice);
        } else {
            // Selling: negative if selling below market
            return order.totalSize * (executionPrice - currentPrice);
        }
    }
    
    /**
     * Validate market conditions
     */
    validateMarketConditions(marketData) {
        // Check volatility
        if (marketData.volatility > 0.1) { // 10% volatility threshold
            console.warn('⚠️  High volatility detected:', marketData.volatility);
            // Don't throw error, just warn - high vol can be profitable
        }
        
        // Check bid-ask spread
        if (marketData.bidAskSpread > 0.01) { // 1% spread threshold
            throw new Error(`Bid-ask spread too wide: ${(marketData.bidAskSpread * 100).toFixed(2)}%`);
        }
        
        // Check if price is stale
        const priceAge = Date.now() - marketData.timestamp;
        if (priceAge > 30000) { // 30 seconds
            throw new Error(`Market data too stale: ${priceAge}ms old`);
        }
        
        // Check for flash crash conditions
        if (marketData.priceChange24h < -0.2) { // 20% drop
            console.warn('⚠️  Flash crash conditions detected, reducing order size');
            throw new Error('Extreme market conditions - trading suspended');
        }
    }
    
    /**
     * Validate slippage limits
     */
    validateSlippage(order, marketData) {
        const currentPrice = marketData.currentPrice;
        const targetPrice = order.targetPrice;
        
        const slippage = Math.abs(targetPrice - currentPrice) / currentPrice;
        
        if (slippage > this.maxSlippage) {
            throw new Error(`Expected slippage ${(slippage * 100).toFixed(2)}% exceeds maximum ${(this.maxSlippage * 100).toFixed(2)}%`);
        }
    }
    
    /**
     * Update risk metrics after trade execution
     */
    updateRiskMetrics(executionResult) {
        console.log('📊 Updating risk metrics after execution');
        
        // Update daily PnL
        this.dailyPnL += executionResult.pnl || 0;
        
        // Update position
        if (executionResult.direction === 'buy') {
            this.currentPosition += executionResult.size;
        } else {
            this.currentPosition -= executionResult.size;
        }
        
        // Update peak value for drawdown calculation
        const portfolioValue = this.calculatePortfolioValue(executionResult.currentInventory, executionResult.currentPrice);
        if (portfolioValue > this.peakValue) {
            this.peakValue = portfolioValue;
        }
        
        // Check for risk limit breaches
        this.checkRiskLimits(portfolioValue);
        
        console.log('📈 Risk metrics updated:', {
            dailyPnL: this.dailyPnL,
            currentPosition: this.currentPosition,
            portfolioValue,
            drawdown: this.calculateDrawdown(portfolioValue)
        });
    }
    
    /**
     * Calculate current portfolio value
     */
    calculatePortfolioValue(inventory, currentPrice) {
        const ethValue = inventory.ETH * currentPrice;
        const usdtValue = inventory.USDT;
        return ethValue + usdtValue;
    }
    
    /**
     * Calculate current drawdown
     */
    calculateDrawdown(currentValue) {
        if (this.peakValue === 0) return 0;
        return (this.peakValue - currentValue) / this.peakValue;
    }
    
    /**
     * Check risk limits and activate circuit breakers
     */
    checkRiskLimits(portfolioValue) {
        // Check daily loss limit
        if (this.dailyPnL < -this.maxDailyLoss) {
            console.error('🚨 Daily loss limit exceeded!');
            this.activateEmergencyStop('Daily loss limit exceeded');
            return;
        }
        
        // Check drawdown limit
        const drawdown = this.calculateDrawdown(portfolioValue);
        if (drawdown > this.maxDrawdown) {
            console.error('🚨 Maximum drawdown exceeded!');
            this.activateEmergencyStop('Maximum drawdown exceeded');
            return;
        }
        
        // Check position limit
        if (Math.abs(this.currentPosition) > this.maxPositionSize) {
            console.error('🚨 Position size limit exceeded!');
            this.pauseTrading('Position size limit exceeded');
            return;
        }
        
        // Warning levels (80% of limits)
        if (this.dailyPnL < -this.maxDailyLoss * 0.8) {
            console.warn('⚠️  Approaching daily loss limit');
        }
        
        if (drawdown > this.maxDrawdown * 0.8) {
            console.warn('⚠️  Approaching maximum drawdown');
        }
    }
    
    /**
     * Activate emergency stop
     */
    activateEmergencyStop(reason) {
        console.error('🚨 EMERGENCY STOP ACTIVATED:', reason);
        this.emergencyStop = true;
        this.tradingPaused = true;
        
        // Could send notifications here
        this.sendRiskAlert('EMERGENCY_STOP', reason);
    }
    
    /**
     * Pause trading
     */
    pauseTrading(reason) {
        console.warn('⏸️  TRADING PAUSED:', reason);
        this.tradingPaused = true;
        
        this.sendRiskAlert('TRADING_PAUSED', reason);
    }
    
    /**
     * Resume trading (manual override)
     */
    resumeTrading() {
        console.log('▶️  Trading resumed');
        this.tradingPaused = false;
    }
    
    /**
     * Reset emergency stop (manual override)
     */
    resetEmergencyStop() {
        console.log('🔄 Emergency stop reset');
        this.emergencyStop = false;
        this.tradingPaused = false;
    }
    
    /**
     * Reset daily PnL if new day
     */
    resetDailyPnLIfNeeded() {
        const today = new Date().toDateString();
        if (today !== this.lastResetDate) {
            console.log('📅 New day detected, resetting daily PnL');
            this.dailyPnL = 0;
            this.lastResetDate = today;
        }
    }
    
    /**
     * Send risk alert (placeholder for notifications)
     */
    sendRiskAlert(type, message) {
        console.log(`🚨 RISK ALERT [${type}]:`, message);
        
        // Here you could implement:
        // - Email notifications
        // - Slack/Discord alerts
        // - SMS alerts
        // - Dashboard notifications
        
        // For now, just log
        const alert = {
            timestamp: new Date().toISOString(),
            type,
            message,
            dailyPnL: this.dailyPnL,
            currentPosition: this.currentPosition
        };
        
        // Could store alerts in database or send to monitoring system
        console.log('Alert details:', alert);
    }
    
    /**
     * Get current risk status
     */
    getRiskStatus() {
        const portfolioValue = this.peakValue || 10000; // Default for calculation
        const drawdown = this.calculateDrawdown(portfolioValue);
        
        return {
            emergencyStop: this.emergencyStop,
            tradingPaused: this.tradingPaused,
            dailyPnL: this.dailyPnL,
            dailyPnLPercent: (this.dailyPnL / this.maxDailyLoss) * 100,
            currentPosition: this.currentPosition,
            positionPercent: (Math.abs(this.currentPosition) / this.maxPositionSize) * 100,
            drawdown: drawdown,
            drawdownPercent: (drawdown / this.maxDrawdown) * 100,
            portfolioValue: portfolioValue,
            riskLimits: {
                maxDailyLoss: this.maxDailyLoss,
                maxPositionSize: this.maxPositionSize,
                maxOrderSize: this.maxOrderSize,
                maxSlippage: this.maxSlippage,
                maxDrawdown: this.maxDrawdown
            }
        };
    }
    
    /**
     * Calculate position size recommendation based on risk
     */
    recommendPositionSize(baseSize, volatility, inventory) {
        let recommendedSize = baseSize;
        
        // Reduce size based on current risk exposure
        const riskStatus = this.getRiskStatus();
        
        // Reduce if approaching daily loss limit
        if (riskStatus.dailyPnLPercent > 60) {
            recommendedSize *= 0.5;
            console.log('🔽 Reducing position size due to daily PnL risk');
        }
        
        // Reduce if approaching position limit
        if (riskStatus.positionPercent > 60) {
            recommendedSize *= 0.7;
            console.log('🔽 Reducing position size due to position risk');
        }
        
        // Reduce if high volatility
        if (volatility > 0.05) {
            recommendedSize *= (1 - volatility);
            console.log('🔽 Reducing position size due to high volatility');
        }
        
        // Ensure within absolute limits
        recommendedSize = Math.min(recommendedSize, this.maxOrderSize);
        
        // Ensure minimum viable size
        recommendedSize = Math.max(recommendedSize, 0.01);
        
        return recommendedSize;
    }
}

export default RiskManager;
