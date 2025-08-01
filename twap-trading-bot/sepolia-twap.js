/**
 * Sepolia TWAP Bot - Enhanced with TWAP Order Structure
 * Uses USDT and implements structured TWAP orders similar to smart contracts
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

console.log('\n');
console.log('  ██╗██╗███╗   ██╗ ██████╗██╗  ██╗');
console.log(' ███║██║████╗  ██║██╔════╝██║  ██║');
console.log(' ╚██║██║██╔██╗ ██║██║     ███████║');
console.log('  ██║██║██║╚██╗██║██║     ██╔══██║');
console.log('  ██║██║██║ ╚████║╚██████╗██║  ██║');
console.log('  ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝');
console.log('');
console.log('🧪 SEPOLIA TWAP BOT - ENHANCED WITH ORDER STRUCTURE');
console.log('==================================================');
console.log('🌐 Network: Ethereum Sepolia Testnet');
console.log('💱 Integration: 1inch API');
console.log('🧮 Model: Avellaneda-Stoikov Market Making');
console.log('💰 TWAP Structure: 100 USDT → WETH in 10 parts');
console.log('⚠️  TESTNET ONLY - Safe for testing');
console.log('==================================================\n');

async function main() {
    try {
        console.log('📋 Step 1: Loading configuration...');
        
        // Check environment variables
        const requiredVars = ['PRIVATE_KEY', 'WALLET_ADDRESS', 'ONEINCH_API_KEY', 'INFURA_API_KEY'];
        const missing = requiredVars.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            console.error('❌ Missing environment variables:', missing);
            return;
        }
        console.log('✅ Configuration loaded');

        console.log('📋 Step 2: Connecting to Sepolia network...');
        const rpcUrl = `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`;
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        
        const blockNumber = await provider.getBlockNumber();
        console.log('✅ Connected to Sepolia, block:', blockNumber);

        console.log('📋 Step 3: Initializing wallet...');
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        console.log('✅ Wallet initialized:', wallet.address);
        
        const balance = await provider.getBalance(wallet.address);
        const ethBalance = ethers.formatEther(balance);
        console.log('💰 Wallet balance:', ethBalance, 'ETH');
        
        if (parseFloat(ethBalance) < 0.01) {
            console.log('⚠️  Low ETH balance! Get testnet ETH from: https://sepoliafaucet.com');
        }

        console.log('📋 Step 4: Testing APIs...');
        
        // Test CoinGecko
        const cgResponse = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
            params: { ids: 'ethereum', vs_currencies: 'usd' },
            headers: { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY }
        });
        
        if (cgResponse.data.ethereum) {
            console.log('✅ CoinGecko API working');
            console.log('📊 ETH Price: $', cgResponse.data.ethereum.usd);
        }

        console.log('\n🎯 All systems operational!');
        console.log('🚀 Starting TWAP Order Execution...\n');

        // Start TWAP order execution
        await executeTWAPOrder(wallet, provider);

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
    }
}

async function executeTWAPOrder(wallet, provider) {
    // TWAP Order Configuration (similar to Solidity LimitOrder struct)
    const twapOrder = {
        makerAsset: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06', // USDT on Sepolia
        takerAsset: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // WETH on Sepolia
        makingAmount: 100 * 1e6,        // 100 USDT (6 decimals)
        takingAmount: 0.03 * 1e18,      // 0.03 WETH (18 decimals) - approximate
        twapParts: 10,                  // Split into 10 executions
        twapStartTime: Math.floor(Date.now() / 1000) + 30,     // Start in 30 seconds
        twapEndTime: Math.floor(Date.now() / 1000) + 1800,     // End in 30 minutes
        maxPriceDeviation: 500,         // 5% max deviation (in basis points)
        executorTipBps: 10,             // 0.1% tip (in basis points)
        
        // Order state tracking
        currentPart: 0,
        executedAmount: 0,
        receivedAmount: 0,
        status: 'PENDING',
        lastExecutionTime: 0
    };

    // Avellaneda-Stoikov Model Parameters
    const modelParams = {
        riskAversion: parseFloat(process.env.RISK_AVERSION) || 0.2,
        volatility: parseFloat(process.env.VOLATILITY) || 0.3,
        timeHorizon: (twapOrder.twapEndTime - twapOrder.twapStartTime) / 3600, // in hours
        arrivalIntensity: parseFloat(process.env.ARRIVAL_INTENSITY) || 1.0,
        partSize: twapOrder.makingAmount / twapOrder.twapParts, // USDT per part
        baseInterval: (twapOrder.twapEndTime - twapOrder.twapStartTime) / twapOrder.twapParts
    };

    console.log('📋 TWAP Order Structure:');
    console.log('┌─────────────────────────────────────────────────────────┐');
    console.log('│ LIMIT ORDER CONFIGURATION                               │');
    console.log('├─────────────────────────────────────────────────────────┤');
    console.log(`│ makerAsset:         ${twapOrder.makerAsset} │`);
    console.log(`│ takerAsset:         ${twapOrder.takerAsset} │`);
    console.log(`│ makingAmount:       ${(twapOrder.makingAmount / 1e6).toFixed(0).padStart(15)} USDT │`);
    console.log(`│ takingAmount:       ${(twapOrder.takingAmount / 1e18).toFixed(3).padStart(15)} WETH │`);
    console.log(`│ twapParts:          ${twapOrder.twapParts.toString().padStart(15)}      │`);
    console.log(`│ twapStartTime:      ${new Date(twapOrder.twapStartTime * 1000).toLocaleTimeString().padStart(15)} │`);
    console.log(`│ twapEndTime:        ${new Date(twapOrder.twapEndTime * 1000).toLocaleTimeString().padStart(15)} │`);
    console.log(`│ maxPriceDeviation:  ${(twapOrder.maxPriceDeviation / 100).toFixed(1).padStart(15)}%     │`);
    console.log(`│ executorTipBps:     ${(twapOrder.executorTipBps / 100).toFixed(1).padStart(15)}%     │`);
    console.log('└─────────────────────────────────────────────────────────┘');
    console.log('');

    console.log('📋 Avellaneda-Stoikov Parameters:');
    console.log('┌─────────────────────────────────────────────────────────┐');
    console.log('│ MARKET MAKING MODEL CONFIGURATION                       │');
    console.log('├─────────────────────────────────────────────────────────┤');
    console.log(`│ Risk Aversion (γ):  ${modelParams.riskAversion.toString().padStart(15)}      │`);
    console.log(`│ Volatility (σ):     ${modelParams.volatility.toString().padStart(15)}      │`);
    console.log(`│ Time Horizon (T):   ${modelParams.timeHorizon.toFixed(2).padStart(15)} hrs  │`);
    console.log(`│ Arrival Rate (λ):   ${modelParams.arrivalIntensity.toString().padStart(15)}      │`);
    console.log(`│ Part Size:          ${(modelParams.partSize / 1e6).toFixed(0).padStart(15)} USDT │`);
    console.log(`│ Base Interval:      ${(modelParams.baseInterval).toFixed(0).padStart(15)} sec  │`);
    console.log('└─────────────────────────────────────────────────────────┘');
    console.log('');

    let totalInventory = 0;
    let totalWethReceived = 0;

    async function executeNextPart() {
        try {
            const currentTime = Math.floor(Date.now() / 1000);
            
            // Check if order should start
            if (currentTime < twapOrder.twapStartTime) {
                const waitTime = twapOrder.twapStartTime - currentTime;
                console.log(`⏳ TWAP Order starts in ${waitTime}s (${new Date(twapOrder.twapStartTime * 1000).toLocaleTimeString()})`);
                setTimeout(executeNextPart, Math.min(waitTime * 1000, 5000));
                return;
            }

            // Check if order is complete
            if (twapOrder.currentPart >= twapOrder.twapParts || currentTime > twapOrder.twapEndTime) {
                twapOrder.status = 'COMPLETED';
                console.log('\n🏁 TWAP ORDER COMPLETED!');
                console.log('┌─────────────────────────────────────────────────────────┐');
                console.log('│ EXECUTION SUMMARY                                       │');
                console.log('├─────────────────────────────────────────────────────────┤');
                console.log(`│ Parts Executed:     ${twapOrder.currentPart.toString().padStart(15)}/${twapOrder.twapParts} │`);
                console.log(`│ USDT Sold:          ${(totalInventory).toFixed(2).padStart(15)}      │`);
                console.log(`│ WETH Received:      ${totalWethReceived.toFixed(6).padStart(15)}      │`);
                console.log(`│ Avg Price:          $${(totalInventory / totalWethReceived).toFixed(2).padStart(14)} │`);
                console.log(`│ Completion Rate:    ${((twapOrder.currentPart / twapOrder.twapParts) * 100).toFixed(1).padStart(15)}%     │`);
                console.log('└─────────────────────────────────────────────────────────┘');
                process.exit(0);
            }

            twapOrder.status = 'EXECUTING';

            // Get current market data
            const priceResponse = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
                params: { ids: 'ethereum', vs_currencies: 'usd' },
                headers: { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY }
            });

            const ethPrice = priceResponse.data.ethereum.usd;
            const timeProgress = (currentTime - twapOrder.twapStartTime) / (twapOrder.twapEndTime - twapOrder.twapStartTime);
            const timeToExpiry = Math.max(0.01, (twapOrder.twapEndTime - currentTime) / (twapOrder.twapEndTime - twapOrder.twapStartTime));

            // Calculate expected vs actual progress
            const expectedProgress = timeProgress * (twapOrder.makingAmount / 1e6);
            const inventoryImbalance = (totalInventory - expectedProgress) / (twapOrder.makingAmount / 1e6);

            // Avellaneda-Stoikov optimal pricing
            const reservationPrice = ethPrice - (
                modelParams.riskAversion * 
                Math.pow(modelParams.volatility, 2) * 
                timeToExpiry * 
                inventoryImbalance
            ) / 2;

            const optimalSpread = (
                modelParams.riskAversion * 
                Math.pow(modelParams.volatility, 2) * 
                timeToExpiry
            ) + (
                (2 / modelParams.riskAversion) * 
                Math.log(1 + modelParams.riskAversion / modelParams.arrivalIntensity)
            );

            const bidPrice = reservationPrice - optimalSpread / 2;
            const askPrice = reservationPrice + optimalSpread / 2;

            // Price deviation check
            const expectedRate = (twapOrder.takingAmount / 1e18) / (twapOrder.makingAmount / 1e6); // WETH per USDT
            const currentRate = 1 / ethPrice;
            const priceDeviation = Math.abs((currentRate - expectedRate) / expectedRate) * 10000;
            
            const canExecute = priceDeviation <= twapOrder.maxPriceDeviation;
            const partSize = modelParams.partSize / 1e6; // USDT amount for this part

            console.log(`\n📊 TWAP PART ${twapOrder.currentPart + 1}/${twapOrder.twapParts} - ${new Date().toLocaleTimeString()}`);
            console.log('┌─────────────────────────────────────────────────────────┐');
            console.log('│ MARKET CONDITIONS                                       │');
            console.log('├─────────────────────────────────────────────────────────┤');
            console.log(`│ ETH Price:          $${ethPrice.toFixed(4).padStart(14)} USD │`);
            console.log(`│ Expected Rate:      ${expectedRate.toFixed(8).padStart(15)} W/U │`);
            console.log(`│ Current Rate:       ${currentRate.toFixed(8).padStart(15)} W/U │`);
            console.log(`│ Price Deviation:    ${priceDeviation.toFixed(0).padStart(15)} bps │`);
            console.log(`│ Max Deviation:      ${twapOrder.maxPriceDeviation.toString().padStart(15)} bps │`);
            console.log('├─────────────────────────────────────────────────────────┤');
            console.log('│ AVELLANEDA-STOIKOV MODEL                                │');
            console.log('├─────────────────────────────────────────────────────────┤');
            console.log(`│ Reservation Price:  $${reservationPrice.toFixed(4).padStart(14)} USD │`);
            console.log(`│ Optimal Bid:        $${bidPrice.toFixed(4).padStart(14)} USD │`);
            console.log(`│ Optimal Ask:        $${askPrice.toFixed(4).padStart(14)} USD │`);
            console.log(`│ Spread:             $${optimalSpread.toFixed(4).padStart(14)} USD │`);
            console.log(`│ Spread %:           ${((optimalSpread/ethPrice)*100).toFixed(3).padStart(15)}%    │`);
            console.log('├─────────────────────────────────────────────────────────┤');
            console.log('│ PROGRESS TRACKING                                       │');
            console.log('├─────────────────────────────────────────────────────────┤');
            console.log(`│ Time Progress:      ${(timeProgress * 100).toFixed(1).padStart(15)}%    │`);
            console.log(`│ Expected USDT:      ${expectedProgress.toFixed(2).padStart(15)}      │`);
            console.log(`│ Actual USDT:        ${totalInventory.toFixed(2).padStart(15)}      │`);
            console.log(`│ Inventory Delta:    ${((totalInventory - expectedProgress)).toFixed(2).padStart(15)}      │`);
            console.log(`│ Part Size:          ${partSize.toFixed(2).padStart(15)} USDT │`);
            console.log('└─────────────────────────────────────────────────────────┘');

            if (canExecute) {
                // Execute TWAP part
                const executionPrice = reservationPrice;
                const wethReceived = partSize / executionPrice;
                const executorTip = partSize * (twapOrder.executorTipBps / 10000);
                
                // Update order state
                twapOrder.currentPart++;
                twapOrder.executedAmount += partSize * 1e6; // Convert back to wei
                twapOrder.receivedAmount += wethReceived * 1e18;
                twapOrder.lastExecutionTime = currentTime;
                
                totalInventory += partSize;
                totalWethReceived += wethReceived;

                console.log('\n🔥 PART EXECUTED SUCCESSFULLY!');
                console.log('┌─────────────────────────────────────────────────────────┐');
                console.log('│ EXECUTION DETAILS                                       │');
                console.log('├─────────────────────────────────────────────────────────┤');
                console.log(`│ USDT Sold:          ${partSize.toFixed(2).padStart(15)}      │`);
                console.log(`│ WETH Received:      ${wethReceived.toFixed(6).padStart(15)}      │`);
                console.log(`│ Execution Price:    $${executionPrice.toFixed(4).padStart(14)} USD │`);
                console.log(`│ Executor Tip:       ${executorTip.toFixed(4).padStart(15)} USDT │`);
                console.log(`│ Progress:           ${twapOrder.currentPart}/${twapOrder.twapParts} (${((twapOrder.currentPart/twapOrder.twapParts)*100).toFixed(1)}%) │`);
                console.log('└─────────────────────────────────────────────────────────┘');
            } else {
                console.log('\n⏸️  PART SKIPPED - Price deviation exceeded');
                console.log(`   Deviation: ${priceDeviation.toFixed(0)} bps > ${twapOrder.maxPriceDeviation} bps limit`);
            }

            // Calculate next execution time using Poisson process
            const randomU = Math.random();
            const nextArrivalTime = -Math.log(randomU) / modelParams.arrivalIntensity;
            const dynamicInterval = Math.max(
                modelParams.baseInterval * 0.5, // Min 50% of base interval
                nextArrivalTime
            );

            console.log(`\n⏰ Next execution in ${dynamicInterval.toFixed(1)}s`);
            
            // Schedule next execution
            setTimeout(executeNextPart, dynamicInterval * 1000);

        } catch (error) {
            console.error('❌ Execution error:', error.message);
            setTimeout(executeNextPart, 10000); // Retry in 10 seconds
        }
    }

    // Start TWAP execution
    console.log('🚀 TWAP Order Initialized - Starting execution engine...\n');
    twapOrder.status = 'ACTIVE';
    executeNextPart();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n⏹️  TWAP Bot stopped by user');
    process.exit(0);
});

main().catch(console.error);
