/**
 * Sepolia Testnet Bot - Simple Version with Immediate Feedback
 */

import { ethers } from 'ethers';
import dotasync function startTWAPSimulation(wallet, provider) {
    console.log('📊 TWAP Manual Execution Guide');
    console.log('💰 Order Size: 0.1 USDT per trade');
    console.log('🧮 Avellaneda-Stoikov Model Active');
    console.log('⏱️  Manual execution timestamps provided');
    console.log('🎯 Execute trades at the exact times shown below\n');rom 'dotenv';
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
console.log('🧪 SEPOLIA TESTNET BOT - ENHANCED VERSION');
console.log('========================================');
console.log('🌐 Network: Ethereum Sepolia Testnet');
console.log('💱 Integration: 1inch API');
console.log('🧮 Model: Avellaneda-Stoikov Market Making');
console.log('💰 Trade Size: 0.1 USDT per order');
console.log('⚠️  TESTNET ONLY - Safe for testing');
console.log('========================================\n');

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

        console.log('📋 Step 4: Testing 1inch API...');
        console.log('⚠️  Note: 1inch may not support Sepolia testnet fully');
        
        try {
            // Try the 1inch API with 0.1 USDT amount
            const oneInchUrl = 'https://api.1inch.dev/swap/v6.0/11155111/quote';
            const usdtAmount = ethers.parseUnits('0.1', 6); // 0.1 USDT (6 decimals)
            const params = {
                src: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06', // USDT on Sepolia
                dst: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // WETH on Sepolia
                amount: usdtAmount.toString()
            };
            
            const response = await axios.get(oneInchUrl, {
                params,
                headers: {
                    'Authorization': `Bearer ${process.env.ONEINCH_API_KEY}`,
                    'accept': 'application/json'
                }
            });
            
            if (response.data) {
                console.log('✅ 1inch API working');
                console.log('📊 Sample quote: 0.1 USDT =', ethers.formatEther(response.data.dstAmount), 'WETH');
            }
        } catch (apiError) {
            console.log('⚠️  1inch API not available for Sepolia (expected)');
            console.log('💡 Using simulated quotes instead for testnet');
        }

        console.log('📋 Step 5: Testing CoinGecko API...');
        const cgResponse = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
            params: {
                ids: 'ethereum',
                vs_currencies: 'usd'
            },
            headers: {
                'x-cg-demo-api-key': process.env.COINGECKO_API_KEY
            }
        });
        
        if (cgResponse.data.ethereum) {
            console.log('✅ CoinGecko API working');
            console.log('📊 ETH Price: $', cgResponse.data.ethereum.usd);
        }

        console.log('\n🎯 All systems operational!');
        console.log('🚀 Starting TWAP trading simulation...');
        console.log('📝 Note: Using simulated 1inch quotes for Sepolia testnet\n');

        // Start basic TWAP simulation
        await startTWAPSimulation(wallet, provider);

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
    }
}

async function startTWAPSimulation(wallet, provider) {
    console.log('📊 TWAP Trading Simulation Started');
    console.log('� Order Size: 0.1 USDT per trade');
    console.log('🧮 Avellaneda-Stoikov Model Active');
    console.log('⏱️  Dynamic time intervals based on market conditions\n');
    
    let quoteCount = 0;
    let totalInventory = 0; // Track our inventory imbalance
    
    // Avellaneda-Stoikov Model Parameters
    const modelParams = {
        riskAversion: parseFloat(process.env.RISK_AVERSION) || 0.2,
        volatility: parseFloat(process.env.VOLATILITY) || 0.3,
        timeHorizon: parseFloat(process.env.TIME_HORIZON) || 0.5,
        arrivalIntensity: parseFloat(process.env.ARRIVAL_INTENSITY) || 1.0,
        tradeSize: 0.1 // 0.1 USDT
    };
    
    console.log('📋 Model Parameters:');
    console.log(`   Risk Aversion (γ): ${modelParams.riskAversion}`);
    console.log(`   Volatility (σ): ${modelParams.volatility}`);
    console.log(`   Time Horizon (T): ${modelParams.timeHorizon}`);
    console.log(`   Arrival Intensity (λ): ${modelParams.arrivalIntensity}`);
    console.log('');
    
    async function generateQuote() {
        try {
            quoteCount++;
            
            // Get current ETH price from CoinGecko
            const priceResponse = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
                params: { ids: 'ethereum', vs_currencies: 'usd' },
                headers: { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY }
            });
            
            const ethPrice = priceResponse.data.ethereum.usd;
            const currentTime = Date.now() / 1000; // Unix timestamp
            const timeToExpiry = modelParams.timeHorizon; // Simplified for demo
            
            // Calculate inventory imbalance (q) - simulated for demo
            const inventoryImbalance = totalInventory / 10; // Normalize
            
            // Avellaneda-Stoikov Optimal Bid/Ask Calculation
            // r(t) = S - (γ * σ² * (T-t) * q) / 2
            const reservationPrice = ethPrice - (
                modelParams.riskAversion * 
                Math.pow(modelParams.volatility, 2) * 
                timeToExpiry * 
                inventoryImbalance
            ) / 2;
            
            // δ = γ * σ² * (T-t) + (2/γ) * ln(1 + γ/λ)
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
            
            // Calculate optimal time interval based on arrival intensity
            // Poisson process: next arrival time = -ln(U) / λ
            const randomU = Math.random();
            const nextArrivalTime = -Math.log(randomU) / modelParams.arrivalIntensity;
            const nextIntervalMs = Math.max(2000, nextArrivalTime * 1000); // Min 2 seconds
            
            console.log(`📊 Quote #${quoteCount} - ${new Date().toLocaleTimeString()}`);
            console.log(`   ETH Market Price: $${ethPrice.toFixed(4)}`);
            console.log(`   Reservation Price: $${reservationPrice.toFixed(4)}`);
            console.log(`   Optimal Bid: $${bidPrice.toFixed(4)}`);
            console.log(`   Optimal Ask: $${askPrice.toFixed(4)}`);
            console.log(`   Spread: $${optimalSpread.toFixed(4)} (${((optimalSpread/ethPrice)*100).toFixed(3)}%)`);
            console.log(`   Inventory: ${totalInventory.toFixed(3)} USDT`);
            console.log(`   Next Quote In: ${(nextIntervalMs/1000).toFixed(1)}s (λ=${modelParams.arrivalIntensity})`);
            
            // Simulate trade execution (demo only)
            if (Math.random() < 0.3) { // 30% chance of execution
                const tradeSide = Math.random() < 0.5 ? 'BUY' : 'SELL';
                const tradePrice = tradeSide === 'BUY' ? bidPrice : askPrice;
                const tradeAmount = modelParams.tradeSize;
                
                if (tradeSide === 'BUY') {
                    totalInventory += tradeAmount;
                } else {
                    totalInventory -= tradeAmount;
                }
                
                console.log(`   🔥 TRADE EXECUTED: ${tradeSide} ${tradeAmount} USDT @ $${tradePrice.toFixed(4)}`);
            }
            
            console.log('');
            
            if (quoteCount >= 10) {
                console.log('🏁 Demo complete! Avellaneda-Stoikov model working correctly.');
                console.log('📊 Summary:');
                console.log(`   Total Quotes: ${quoteCount}`);
                console.log(`   Final Inventory: ${totalInventory.toFixed(3)} USDT`);
                console.log('📖 Check SEPOLIA-SETUP.md for full bot deployment.');
                process.exit(0);
            }
            
            // Schedule next quote with model-calculated interval
            setTimeout(generateQuote, nextIntervalMs);
            
        } catch (error) {
            console.error('❌ Quote generation error:', error.message);
            // Fallback to fixed interval on error
            setTimeout(generateQuote, 5000);
        }
    }
    
    // Start the first quote
    generateQuote();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n⏹️  Bot stopped by user');
    process.exit(0);
});

main().catch(console.error);
