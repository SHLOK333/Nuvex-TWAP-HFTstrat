/**
 * Sepolia TWAP Manual Execution Guide
 * Provides exact timestamps for manual trade execution
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
console.log('📋 MANUAL EXECUTION GUIDE');
console.log('========================');
console.log('🌐 Network: Ethereum Sepolia Testnet');
console.log('💱 Integration: 1inch API');
console.log('🧮 Model: Avellaneda-Stoikov');
console.log('💰 Trade Size: 0.1 USDT per execution');
console.log('⏱️  MANUAL EXECUTION TIMESTAMPS');
console.log('========================\n');

async function generateExecutionSchedule() {
    try {
        console.log('📋 Generating TWAP execution schedule...\n');
        
        // Get current ETH price
        const priceResponse = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
            params: { ids: 'ethereum', vs_currencies: 'usd' },
            headers: { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY }
        });
        
        const ethPrice = priceResponse.data.ethereum.usd;
        
        // TWAP Order Configuration (like your Solidity example)
        const twapOrder = {
            makerAsset: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06", // USDT on Sepolia
            takerAsset: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH on Sepolia
            makingAmount: ethers.parseUnits("1.0", 6), // 1.0 USDT total
            takingAmount: ethers.parseEther((1.0 / ethPrice).toFixed(6)), // Equivalent ETH
            twapParts: 10, // 10 executions
            twapStartTime: Math.floor(Date.now() / 1000) + 60, // Start in 1 minute
            twapEndTime: Math.floor(Date.now() / 1000) + 3600, // End in 1 hour
            maxPriceDeviation: 500, // 5% max deviation
            executorTipBps: 10, // 0.1% tip
            tradeSize: 0.1 // 0.1 USDT per execution
        };
        
        console.log('📊 TWAP ORDER DETAILS:');
        console.log('======================');
        console.log(`Maker Asset (USDT): ${twapOrder.makerAsset}`);
        console.log(`Taker Asset (WETH): ${twapOrder.takerAsset}`);
        console.log(`Total Amount: ${ethers.formatUnits(twapOrder.makingAmount, 6)} USDT`);
        console.log(`Expected ETH: ${ethers.formatEther(twapOrder.takingAmount)} WETH`);
        console.log(`TWAP Parts: ${twapOrder.twapParts} executions`);
        console.log(`Per Execution: ${twapOrder.tradeSize} USDT`);
        console.log(`Max Price Deviation: ${twapOrder.maxPriceDeviation/100}%`);
        console.log(`Executor Tip: ${twapOrder.executorTipBps/100}%`);
        console.log(`Current ETH Price: $${ethPrice.toFixed(2)}\n`);
        
        // Generate execution timestamps
        const executionInterval = (twapOrder.twapEndTime - twapOrder.twapStartTime) / twapOrder.twapParts;
        
        console.log('⏰ EXECUTION SCHEDULE:');
        console.log('======================');
        console.log('Execute exactly at these timestamps:\n');
        
        for (let i = 0; i < twapOrder.twapParts; i++) {
            const executionTime = twapOrder.twapStartTime + (i * executionInterval);
            const executionDate = new Date(executionTime * 1000);
            const timeFromNow = Math.floor((executionTime * 1000 - Date.now()) / 1000);
            
            // Calculate Avellaneda-Stoikov prices for each execution
            const timeToExpiry = (twapOrder.twapEndTime - executionTime) / 3600; // Hours
            const riskAversion = 0.2;
            const volatility = 0.3;
            const inventoryImbalance = (i - twapOrder.twapParts/2) / twapOrder.twapParts; // -0.5 to 0.5
            
            const reservationPrice = ethPrice - (riskAversion * volatility * volatility * timeToExpiry * inventoryImbalance) / 2;
            const spread = riskAversion * volatility * volatility * timeToExpiry + (2 / riskAversion) * Math.log(1 + riskAversion / 1.0);
            const bidPrice = reservationPrice - spread / 2;
            const askPrice = reservationPrice + spread / 2;
            
            console.log(`📅 Execution #${i + 1}:`);
            console.log(`   ⏰ Timestamp: ${executionTime}`);
            console.log(`   📅 Date/Time: ${executionDate.toLocaleString()}`);
            console.log(`   ⏳ In: ${timeFromNow > 0 ? `${Math.floor(timeFromNow/60)}m ${timeFromNow%60}s` : 'NOW'}`);
            console.log(`   💰 Amount: ${twapOrder.tradeSize} USDT`);
            console.log(`   📊 Target Price: $${reservationPrice.toFixed(4)}`);
            console.log(`   📈 Max Buy: $${askPrice.toFixed(4)}`);
            console.log(`   📉 Min Sell: $${bidPrice.toFixed(4)}`);
            console.log(`   🎯 Slippage: ±${((spread/ethPrice)*100).toFixed(2)}%`);
            console.log('');
        }
        
        console.log('🚀 MANUAL EXECUTION INSTRUCTIONS:');
        console.log('================================');
        console.log('1. Open 1inch.io in your browser');
        console.log('2. Connect your Sepolia testnet wallet');
        console.log('3. At each timestamp above, execute the trade:');
        console.log(`   - From: ${twapOrder.tradeSize} USDT`);
        console.log('   - To: WETH');
        console.log('   - Use the target price as reference');
        console.log('   - Accept trades within the slippage range');
        console.log('4. Record actual execution price and time');
        console.log('5. Wait for next timestamp\n');
        
        console.log('⚠️  IMPORTANT NOTES:');
        console.log('- Execute trades as close to the timestamp as possible');
        console.log('- Adjust for gas fees in your calculations');
        console.log('- Monitor price impact before confirming');
        console.log('- Skip execution if price is outside deviation range');
        console.log('- This is testnet - perfect for practice!\n');
        
        // Set up real-time countdown
        console.log('🕐 REAL-TIME COUNTDOWN:');
        console.log('=======================');
        startCountdown(twapOrder);
        
    } catch (error) {
        console.error('❌ Error generating schedule:', error.message);
    }
}

function startCountdown(twapOrder) {
    let currentExecution = 0;
    const executionInterval = (twapOrder.twapEndTime - twapOrder.twapStartTime) / twapOrder.twapParts;
    
    const countdownInterval = setInterval(() => {
        const now = Math.floor(Date.now() / 1000);
        const nextExecutionTime = twapOrder.twapStartTime + (currentExecution * executionInterval);
        const timeToNext = nextExecutionTime - now;
        
        if (timeToNext <= 0 && currentExecution < twapOrder.twapParts) {
            console.log(`🔔 EXECUTE NOW! Trade #${currentExecution + 1} - ${twapOrder.tradeSize} USDT`);
            console.log(`⏰ Exact time: ${new Date().toLocaleTimeString()}`);
            console.log('🚀 Go to 1inch.io and execute the trade NOW!\n');
            currentExecution++;
        } else if (currentExecution < twapOrder.twapParts) {
            const minutes = Math.floor(timeToNext / 60);
            const seconds = timeToNext % 60;
            process.stdout.write(`⏳ Next execution #${currentExecution + 1} in: ${minutes}m ${seconds}s\r`);
        } else {
            console.log('\n🏁 All executions complete!');
            console.log('📊 TWAP order finished successfully.');
            console.log('📈 Review your trades and calculate performance.');
            clearInterval(countdownInterval);
            process.exit(0);
        }
    }, 1000);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n⏹️  Manual execution guide stopped');
    process.exit(0);
});

generateExecutionSchedule().catch(console.error);
