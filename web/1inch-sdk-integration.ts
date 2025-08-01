import { ethers, Wallet, JsonRpcProvider } from 'ethers'
import axios from 'axios'
import * as dotenv from "dotenv"

// Load environment variables
dotenv.config()

/**
 * Complete 1inch API Integration with DelegatedWallet
 * This combines the 1inch API with your DelegatedWallet for production trading
 */
class DelegatedWallet1inchAPIIntegration {
  private provider: JsonRpcProvider
  private wallet: Wallet
  private delegatedWalletAddress: string
  private oneinchApiKey: string
  private chainId: number
  
  // DelegatedWallet ABI
  private delegatedWalletAbi = [
    "function executeSwap((address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256),(address,uint256,bytes),bytes) returns (bytes)",
    "function nonce() view returns (uint256)",
    "function executedOrders(uint256) view returns (bool)"
  ]
  
  // ERC20 ABI
  private erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
  ]
  
  constructor(networkId: number = 1) {
    this.chainId = networkId
    
    // Setup provider and wallet
    const rpcUrl = networkId === 1 
      ? process.env.ETHEREUM_RPC_URL || "https://eth.llamarpc.com"
      : networkId === 137
      ? process.env.POLYGON_RPC_URL || "https://polygon.llamarpc.com"
      : networkId === 42161
      ? process.env.ARBITRUM_RPC_URL || "https://arbitrum.llamarpc.com"
      : process.env.RPC_URL || "https://eth.llamarpc.com"
    
    this.provider = new JsonRpcProvider(rpcUrl)
    this.wallet = new Wallet(process.env.USER_PK || "", this.provider)
    this.delegatedWalletAddress = process.env.DELEGATED_WALLET_ADDRESS || ""
    
    // Initialize 1inch SDK
    this.sdk = new Sdk({
      authKey: process.env.ONEINCH_API_KEY || "",
      networkId,
      httpConnector: new FetchProviderConnector()
    })
  }
  
  /**
   * Create and submit a limit order using 1inch SDK + DelegatedWallet execution
   */
  async createAndExecuteLimitOrder(
    makerAssetAddress: string,
    takerAssetAddress: string,
    makingAmount: bigint,
    takingAmount: bigint,
    expirationMinutes: number = 60
  ) {
    console.log("🚀 === 1INCH SDK + DELEGATED WALLET INTEGRATION ===")
    
    try {
      // 1. Setup expiration and traits
      const expiresIn = BigInt(expirationMinutes * 60) // Convert to seconds
      const expiration = BigInt(Math.floor(Date.now() / 1000)) + expiresIn
      const UINT_40_MAX = (1n << 48n) - 1n
      
      const makerTraits = MakerTraits.default()
        .withExpiration(expiration)
        .withNonce(randBigInt(UINT_40_MAX))
      
      console.log("📝 Order Parameters:")
      console.log(`- Maker Asset: ${makerAssetAddress}`)
      console.log(`- Taker Asset: ${takerAssetAddress}`)
      console.log(`- Making Amount: ${makingAmount.toString()}`)
      console.log(`- Taking Amount: ${takingAmount.toString()}`)
      console.log(`- Expiration: ${expiration} (${new Date(Number(expiration) * 1000).toISOString()})`)
      
      // 2. Create 1inch limit order
      console.log("🔄 Creating 1inch limit order...")
      const order = await this.sdk.createOrder({
        makerAsset: new Address(makerAssetAddress),
        takerAsset: new Address(takerAssetAddress),
        makingAmount,
        takingAmount,
        maker: new Address(this.delegatedWalletAddress), // Use DelegatedWallet as maker
      }, makerTraits)
      
      console.log("✅ 1inch order created successfully")
      
      // 3. Get typed data and create signature
      const typedData = order.getTypedData()
      console.log("📝 Generating signature for 1inch order...")
      
      // Sign with the wallet that controls the DelegatedWallet
      const signature = await this.wallet.signTypedData(
        typedData.domain,
        { Order: typedData.types.Order },
        typedData.message
      )
      
      console.log("✅ Order signature generated")
      
      // 4. Submit order to 1inch
      console.log("📤 Submitting order to 1inch...")
      const submitResult = await this.sdk.submitOrder(order, signature)
      console.log("✅ Order submitted to 1inch successfully!")
      console.log("Order Hash:", submitResult.orderHash)
      
      // 5. Create DelegatedWallet swap order for backup execution
      await this.createDelegatedWalletBackupOrder(
        makerAssetAddress,
        takerAssetAddress,
        makingAmount,
        takingAmount,
        Number(expiration)
      )
      
      return {
        oneinchOrderHash: submitResult.orderHash,
        order,
        signature,
        expiration: Number(expiration)
      }
      
    } catch (error: any) {
      console.error("❌ 1inch SDK integration failed:", error.message)
      throw error
    }
  }
  
  /**
   * Create a backup DelegatedWallet order in case 1inch order isn't filled
   */
  private async createDelegatedWalletBackupOrder(
    tokenOut: string,
    tokenIn: string,
    amountOut: bigint,
    minAmountIn: bigint,
    expiration: number
  ) {
    console.log("🔄 Creating DelegatedWallet backup order...")
    
    try {
      const delegatedWallet = new ethers.Contract(
        this.delegatedWalletAddress,
        this.delegatedWalletAbi,
        this.wallet
      )
      
      const currentNonce = await delegatedWallet.nonce()
      const timestamp = Math.floor(Date.now() / 1000)
      
      // Create swap order
      const swapOrder = {
        tokenOut,
        tokenIn,
        amountOut: amountOut.toString(),
        minAmountIn: minAmountIn.toString(),
        timestamp,
        expiration,
        nonce: currentNonce,
        startPremiumBps: 0, // No premium for backup order
        decayRateBps: 10,   // Small decay
        decayInterval: 300  // 5 minutes
      }
      
      console.log("✅ DelegatedWallet backup order ready")
      console.log("💡 You can execute this if 1inch order doesn't fill")
      
      return swapOrder
      
    } catch (error: any) {
      console.error("⚠️ Backup order creation failed:", error.message)
    }
  }
  
  /**
   * Check order status on 1inch
   */
  async checkOrderStatus(orderHash: string) {
    try {
      console.log("🔍 Checking order status on 1inch...")
      // Note: SDK might have a method for this, check their docs
      console.log(`Order Hash: ${orderHash}`)
      console.log("💡 Check order status on 1inch explorer or API")
      
    } catch (error: any) {
      console.error("❌ Failed to check order status:", error.message)
    }
  }
  
  /**
   * Cancel order on 1inch
   */
  async cancelOrder(order: any) {
    try {
      console.log("❌ Cancelling order on 1inch...")
      await this.sdk.cancelOrder(order)
      console.log("✅ Order cancelled successfully")
      
    } catch (error: any) {
      console.error("❌ Failed to cancel order:", error.message)
    }
  }
}

// ============================================================================
// MAIN EXECUTION EXAMPLE
// ============================================================================

async function main() {
  console.log("🔗 === 1INCH SDK + DELEGATED WALLET INTEGRATION ===")
  
  // Choose your network
  const NETWORK_ID = process.env.NETWORK_ID ? parseInt(process.env.NETWORK_ID) : 1 // 1=Ethereum, 137=Polygon, 42161=Arbitrum
  
  const integration = new DelegatedWallet1inchSDKIntegration(NETWORK_ID)
  
  // Example: USDT -> 1INCH limit order
  const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7" // Ethereum USDT
  const ONEINCH = "0x111111111117dc0aa78b770fa6a738034120c302" // 1INCH token
  
  try {
    // Create limit order: 100 USDT for 10 1INCH tokens
    const result = await integration.createAndExecuteLimitOrder(
      USDT,                    // Selling USDT
      ONEINCH,                 // Buying 1INCH
      100_000000n,             // 100 USDT (6 decimals)
      10_000000000000000000n,  // 10 1INCH (18 decimals)
      60                       // 60 minutes expiration
    )
    
    console.log("🎉 Limit order created successfully!")
    console.log("Order will be automatically executed by 1inch when price is reached")
    
    // Check status after 10 seconds
    setTimeout(async () => {
      await integration.checkOrderStatus(result.oneinchOrderHash)
    }, 10000)
    
  } catch (error: any) {
    console.error("❌ Integration failed:", error.message)
    process.exit(1)
  }
}

// Export for use in other scripts
export { DelegatedWallet1inchSDKIntegration }

// Run if this file is executed directly
if (require.main === module) {
  main()
    .then(() => {
      console.log("✅ 1inch SDK integration completed!")
      // Keep process alive to check order status
      setTimeout(() => process.exit(0), 30000) // Exit after 30 seconds
    })
    .catch((error) => {
      console.error("❌ Integration failed:", error)
      process.exit(1)
    })
}
