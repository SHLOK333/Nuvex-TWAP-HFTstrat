/**
 * TWAP Execution Engine
 * Implements Time-Weighted Average Price execution using Avellaneda-Stoikov optimal quotes
 */

import { EventEmitter } from 'events';
import { ethers } from 'ethers';

export class TWAPExecutor extends EventEmitter {
    constructor(config) {
        super();
        
        this.config = config;
        this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
        this.wallet = new ethers.Wallet(config.privateKey, this.provider);
        
        // Contract instances
        this.delegatedWallet = null;
        this.usdtContract = null;
        this.ethContract = null;
        
        // Execution state
        this.activeOrders = new Map();
        this.executionHistory = [];
        this.currentInventory = {
            USDT: 0,
            ETH: 0
        };
        
        // Execution parameters
        this.minOrderSize = config.minOrderSize || 0.01; // ETH
        this.maxOrderSize = config.maxOrderSize || 1.0;  // ETH
        this.maxSlippage = config.maxSlippage || 0.005;  // 0.5%
        
        console.log('🎯 TWAP Executor initialized for wallet:', this.wallet.address);
    }
    
    /**
     * Initialize contracts
     */
    async initialize() {
        try {
            // Load contract ABIs and initialize
            this.delegatedWallet = new ethers.Contract(
                this.config.delegatedWalletAddress,
                this.config.delegatedWalletABI,
                this.wallet
            );
            
            this.usdtContract = new ethers.Contract(
                this.config.usdtAddress,
                this.config.erc20ABI,
                this.wallet
            );
            
            this.ethContract = new ethers.Contract(
                this.config.ethAddress,
                this.config.erc20ABI,
                this.wallet
            );
            
            // Get initial balances
            await this.updateBalances();
            
            console.log('✅ TWAP Executor contracts initialized');
            this.emit('initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize TWAP Executor:', error);
            throw error;
        }
    }
    
    /**
     * Execute TWAP order based on Avellaneda-Stoikov quotes
     */
    async executeTWAPOrder(order) {
        console.log('📋 Executing TWAP order:', order.id);
        
        try {
            const {
                symbol,
                totalSize,
                duration,
                direction, // 'buy' or 'sell'
                quotes,
                maxParts
            } = order;
            
            // Calculate execution schedule
            const executionPlan = this.calculateExecutionPlan(totalSize, duration, maxParts, quotes);
            
            // Store active order
            this.activeOrders.set(order.id, {
                ...order,
                executionPlan,
                executedParts: 0,
                executedSize: 0,
                totalPnL: 0,
                startTime: Date.now(),
                status: 'active'
            });
            
            // Start execution
            this.scheduleExecution(order.id);
            
            this.emit('orderStarted', {
                orderId: order.id,
                executionPlan,
                estimatedCompletion: Date.now() + duration
            });
            
        } catch (error) {
            console.error('❌ Failed to execute TWAP order:', error);
            this.emit('orderFailed', { orderId: order.id, error: error.message });
        }
    }
    
    /**
     * Calculate optimal execution plan
     */
    calculateExecutionPlan(totalSize, duration, maxParts, quotes) {
        const plan = [];
        const timePerPart = duration / maxParts;
        
        // Use Avellaneda-Stoikov model to determine optimal sizes
        const baseSize = totalSize / maxParts;
        
        for (let i = 0; i < maxParts; i++) {
            const executionTime = Date.now() + (i * timePerPart);
            
            // Adjust size based on market conditions and inventory
            let partSize = baseSize;
            
            // Apply inventory adjustment from quotes
            if (quotes && quotes.inventoryAdjustment) {
                partSize *= (1 + quotes.inventoryAdjustment * 0.1);
            }
            
            // Ensure size is within bounds
            partSize = Math.max(this.minOrderSize, Math.min(this.maxOrderSize, partSize));
            
            plan.push({
                partIndex: i,
                size: partSize,
                executionTime,
                status: 'pending',
                targetPrice: quotes ? quotes.reservationPrice : 0
            });
        }
        
        return plan;
    }
    
    /**
     * Schedule execution of order parts
     */
    scheduleExecution(orderId) {
        const order = this.activeOrders.get(orderId);
        if (!order) return;
        
        const executeNextPart = async () => {
            try {
                const currentPart = order.executionPlan[order.executedParts];
                if (!currentPart || currentPart.status !== 'pending') {
                    return this.completeOrder(orderId);
                }
                
                // Check if it's time to execute
                if (Date.now() < currentPart.executionTime) {
                    setTimeout(executeNextPart, currentPart.executionTime - Date.now());
                    return;
                }
                
                // Execute the part
                await this.executePart(orderId, currentPart);
                
                // Schedule next part
                order.executedParts++;
                if (order.executedParts < order.executionPlan.length) {
                    setTimeout(executeNextPart, 1000); // Small delay between parts
                } else {
                    this.completeOrder(orderId);
                }
                
            } catch (error) {
                console.error('❌ Error executing order part:', error);
                this.failOrder(orderId, error);
            }
        };
        
        executeNextPart();
    }
    
    /**
     * Execute individual order part
     */
    async executePart(orderId, part) {
        const order = this.activeOrders.get(orderId);
        console.log(`🔄 Executing part ${part.partIndex + 1} of order ${orderId}`);
        
        try {
            let txResult;
            
            if (order.direction === 'buy') {
                // Buy ETH with USDT
                txResult = await this.executeBuyOrder(part);
            } else {
                // Sell ETH for USDT
                txResult = await this.executeSellOrder(part);
            }
            
            // Update part status
            part.status = 'executed';
            part.executedPrice = txResult.price;
            part.executedSize = txResult.size;
            part.gasUsed = txResult.gasUsed;
            part.txHash = txResult.txHash;
            part.timestamp = Date.now();
            
            // Update order totals
            order.executedSize += txResult.size;
            order.totalPnL += txResult.pnl;
            
            // Update inventory
            await this.updateBalances();
            
            this.emit('partExecuted', {
                orderId,
                partIndex: part.partIndex,
                executedPrice: txResult.price,
                executedSize: txResult.size,
                pnl: txResult.pnl,
                txHash: txResult.txHash
            });
            
            // Store in execution history
            this.executionHistory.push({
                orderId,
                partIndex: part.partIndex,
                timestamp: part.timestamp,
                price: txResult.price,
                size: txResult.size,
                direction: order.direction,
                pnl: txResult.pnl
            });
            
        } catch (error) {
            part.status = 'failed';
            part.error = error.message;
            throw error;
        }
    }
    
    /**
     * Execute buy order (USDT -> ETH)
     */
    async executeBuyOrder(part) {
        // Get current price from 1inch
        const quote = await this.get1inchQuote(
            this.config.usdtAddress,  // USDT
            this.config.ethAddress,   // WETH
            ethers.parseUnits((part.size * part.targetPrice).toString(), 6) // USDT amount
        );
        
        // Check slippage
        const expectedEth = part.size;
        const quotedEth = parseFloat(ethers.formatEther(quote.dstAmount));
        const slippage = Math.abs(quotedEth - expectedEth) / expectedEth;
        
        if (slippage > this.maxSlippage) {
            throw new Error(`Slippage too high: ${(slippage * 100).toFixed(2)}%`);
        }
        
        // Execute swap via 1inch
        const swapData = await this.get1inchSwap(
            this.config.usdtAddress,
            this.config.ethAddress,
            quote.srcAmount,
            this.wallet.address
        );
        
        // Send transaction
        const tx = await this.wallet.sendTransaction({
            to: swapData.tx.to,
            data: swapData.tx.data,
            value: swapData.tx.value,
            gasLimit: Math.ceil(swapData.tx.gas * 1.2) // 20% buffer
        });
        
        const receipt = await tx.wait();
        
        return {
            price: part.targetPrice,
            size: quotedEth,
            pnl: 0, // PnL calculated later
            gasUsed: receipt.gasUsed,
            txHash: receipt.hash
        };
    }
    
    /**
     * Execute sell order (ETH -> USDT)
     */
    async executeSellOrder(part) {
        // Get current price from 1inch
        const quote = await this.get1inchQuote(
            this.config.ethAddress,   // WETH
            this.config.usdtAddress,  // USDT
            ethers.parseEther(part.size.toString()) // ETH amount
        );
        
        // Check slippage
        const expectedUsdt = part.size * part.targetPrice;
        const quotedUsdt = parseFloat(ethers.formatUnits(quote.dstAmount, 6));
        const slippage = Math.abs(quotedUsdt - expectedUsdt) / expectedUsdt;
        
        if (slippage > this.maxSlippage) {
            throw new Error(`Slippage too high: ${(slippage * 100).toFixed(2)}%`);
        }
        
        // Execute swap via 1inch
        const swapData = await this.get1inchSwap(
            this.config.ethAddress,
            this.config.usdtAddress,
            ethers.parseEther(part.size.toString()),
            this.wallet.address
        );
        
        // Send transaction
        const tx = await this.wallet.sendTransaction({
            to: swapData.tx.to,
            data: swapData.tx.data,
            value: swapData.tx.value,
            gasLimit: Math.ceil(swapData.tx.gas * 1.2)
        });
        
        const receipt = await tx.wait();
        
        return {
            price: quotedUsdt / part.size,
            size: part.size,
            pnl: 0, // PnL calculated later
            gasUsed: receipt.gasUsed,
            txHash: receipt.hash
        };
    }
    
    /**
     * Get quote from 1inch
     */
    async get1inchQuote(srcToken, dstToken, amount) {
        const response = await fetch(`https://api.1inch.dev/swap/v5.2/42161/quote?src=${srcToken}&dst=${dstToken}&amount=${amount}`, {
            headers: {
                'Authorization': `Bearer ${process.env.ONEINCH_API_KEY}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`1inch quote failed: ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    /**
     * Get swap data from 1inch
     */
    async get1inchSwap(srcToken, dstToken, amount, fromAddress) {
        const response = await fetch(`https://api.1inch.dev/swap/v5.2/42161/swap?src=${srcToken}&dst=${dstToken}&amount=${amount}&from=${fromAddress}&slippage=1`, {
            headers: {
                'Authorization': `Bearer ${process.env.ONEINCH_API_KEY}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`1inch swap failed: ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    /**
     * Update current balances
     */
    async updateBalances() {
        try {
            const [usdtBalance, ethBalance] = await Promise.all([
                this.usdtContract.balanceOf(this.wallet.address),
                this.ethContract.balanceOf(this.wallet.address)
            ]);
            
            this.currentInventory.USDT = parseFloat(ethers.formatUnits(usdtBalance, 6));
            this.currentInventory.ETH = parseFloat(ethers.formatEther(ethBalance));
            
            this.emit('balanceUpdate', this.currentInventory);
            
        } catch (error) {
            console.error('❌ Failed to update balances:', error);
        }
    }
    
    /**
     * Complete order execution
     */
    completeOrder(orderId) {
        const order = this.activeOrders.get(orderId);
        if (!order) return;
        
        order.status = 'completed';
        order.endTime = Date.now();
        
        // Calculate final statistics
        const executionTime = order.endTime - order.startTime;
        const averagePrice = this.calculateAveragePrice(order);
        const totalGasCost = this.calculateTotalGasCost(order);
        
        console.log(`✅ Order ${orderId} completed in ${executionTime}ms`);
        
        this.emit('orderCompleted', {
            orderId,
            executionTime,
            averagePrice,
            totalSize: order.executedSize,
            totalPnL: order.totalPnL,
            totalGasCost,
            parts: order.executionPlan.length
        });
        
        // Move to history
        this.activeOrders.delete(orderId);
    }
    
    /**
     * Fail order execution
     */
    failOrder(orderId, error) {
        const order = this.activeOrders.get(orderId);
        if (!order) return;
        
        order.status = 'failed';
        order.error = error.message;
        order.endTime = Date.now();
        
        console.log(`❌ Order ${orderId} failed:`, error.message);
        
        this.emit('orderFailed', { orderId, error: error.message });
        this.activeOrders.delete(orderId);
    }
    
    /**
     * Calculate average execution price
     */
    calculateAveragePrice(order) {
        const executedParts = order.executionPlan.filter(part => part.status === 'executed');
        if (executedParts.length === 0) return 0;
        
        const totalValue = executedParts.reduce((sum, part) => sum + (part.executedPrice * part.executedSize), 0);
        const totalSize = executedParts.reduce((sum, part) => sum + part.executedSize, 0);
        
        return totalValue / totalSize;
    }
    
    /**
     * Calculate total gas cost
     */
    calculateTotalGasCost(order) {
        return order.executionPlan
            .filter(part => part.status === 'executed')
            .reduce((sum, part) => sum + (part.gasUsed || 0), 0);
    }
    
    /**
     * Get execution statistics
     */
    getExecutionStats() {
        const totalOrders = this.executionHistory.length;
        const totalVolume = this.executionHistory.reduce((sum, trade) => sum + trade.size, 0);
        const totalPnL = this.executionHistory.reduce((sum, trade) => sum + trade.pnl, 0);
        
        return {
            totalOrders,
            totalVolume,
            totalPnL,
            activeOrders: this.activeOrders.size,
            currentInventory: this.currentInventory,
            averageOrderSize: totalVolume / totalOrders || 0
        };
    }
}

export default TWAPExecutor;
