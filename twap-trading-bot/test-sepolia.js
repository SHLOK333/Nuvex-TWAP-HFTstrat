/**
 * Test script to diagnose Sepolia bot issues
 */

console.log('🧪 Testing Sepolia Bot Dependencies...');

try {
    console.log('📦 Loading dotenv...');
    const dotenv = await import('dotenv');
    dotenv.config();
    console.log('✅ dotenv loaded');

    console.log('📦 Loading ethers...');
    const { ethers } = await import('ethers');
    console.log('✅ ethers loaded');

    console.log('📦 Loading SepoliaMarketDataProvider...');
    const { SepoliaMarketDataProvider } = await import('./src/data/SepoliaMarketDataProvider.js');
    console.log('✅ SepoliaMarketDataProvider loaded');

    console.log('📦 Loading AvellanedaStoikovModel...');
    const { AvellanedaStoikovModel } = await import('./src/models/AvellanedaStoikovModel.js');
    console.log('✅ AvellanedaStoikovModel loaded');

    console.log('\n🔧 Testing environment variables...');
    console.log('PRIVATE_KEY:', process.env.PRIVATE_KEY ? '✅ Present' : '❌ Missing');
    console.log('WALLET_ADDRESS:', process.env.WALLET_ADDRESS ? '✅ Present' : '❌ Missing');
    console.log('ONEINCH_API_KEY:', process.env.ONEINCH_API_KEY ? '✅ Present' : '❌ Missing');
    console.log('INFURA_API_KEY:', process.env.INFURA_API_KEY ? '✅ Present' : '❌ Missing');

    console.log('\n🌐 Testing RPC connection...');
    const rpcUrl = `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    const blockNumber = await provider.getBlockNumber();
    console.log('✅ RPC connection successful, block:', blockNumber);

    console.log('\n👛 Testing wallet...');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    console.log('✅ Wallet created:', wallet.address);
    
    const balance = await provider.getBalance(wallet.address);
    console.log('💰 ETH Balance:', ethers.formatEther(balance), 'ETH');

    console.log('\n🎯 All tests passed! Bot should work.');

} catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
}
