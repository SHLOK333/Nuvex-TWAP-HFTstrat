import { ethers, Wallet, JsonRpcProvider } from 'ethers'
import axios from 'axios'
import * as dotenv from "dotenv"

// Load environment variables
dotenv.config()

/**
 * Production 1inch API Integration with DelegatedWallet
 * This uses the 1inch v6 API for real on-chain trading
 */
class DelegatedWallet1inchProduction {
  private provider: JsonRpcProvider
  private wallet: Wallet
  private delegatedWalletAddress: string
  private oneinchApiKey: string
  private chainId: number
  private baseUrl: string
  
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
  
  constructor(chainId: number = 1) {
    this.chainId = chainId
    this.baseUrl = `https://api.1inch.dev`
    
    // Setup provider based on chain
    const rpcUrls: { [key: number]: string } = {
      1: process.env.ETHEREUM_RPC_URL || "https://eth.llamarpc.com",
      137: process.env.POLYGON_RPC_URL || "https://polygon.llamarpc.com", 
      42161: process.env.ARBITRUM_RPC_URL || "https://arbitrum.llamarpc.com",
      10: process.env.OPTIMISM_RPC_URL || "https://optimism.llamarpc.com"
    }
    
    this.provider = new JsonRpcProvider(rpcUrls[chainId] || rpcUrls[1])
    this.wallet = new Wallet(process.env.USER_PK || "", this.provider)
    this.delegatedWalletAddress = process.env.DELEGATED_WALLET_ADDRESS || ""
    this.oneinchApiKey = process.env.ONEINCH_API_KEY || ""
    
    if (!this.oneinchApiKey) {
      throw new Error("ONEINCH_API_KEY is required. Get one from https://portal.1inch.dev/")
    }
  }
  
  /**
   * Get 1inch quote for a swap
   */
  async get1inchQuote(src: string, dst: string, amount: string) {
    const url = `${this.baseUrl}/swap/v6.0/${this.chainId}/quote`
    
    try {
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.oneinchApiKey}`,
          'Content-Type': 'application/json'
        },
        params: {
          src,
          dst,
          amount
        }
      })
      
      return response.data
    } catch (error: any) {
      console.error("1inch quote failed:", error.response?.data || error.message)
      throw error
    }
  }
  
  /**
   * Get 1inch swap transaction
   */
  async get1inchSwap(src: string, dst: string, amount: string, from: string, slippage: number = 1) {
    const url = `${this.baseUrl}/swap/v6.0/${this.chainId}/swap`
    
    try {
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.oneinchApiKey}`,
          'Content-Type': 'application/json'
        },
        params: {
          src,
          dst,
          amount,
          from,
          slippage,
          disableEstimate: true
        }
      })
      
      return response.data
    } catch (error: any) {
      console.error("1inch swap failed:", error.response?.data || error.message)
      throw error
    }
  }
  
  /**
   * Execute a live 1inch swap through DelegatedWallet
   */
  async executeLive1inchSwap(
    tokenOut: string,
    tokenIn: string,
    amountOut: string,
    minAmountIn: string,
    slippage: number = 1
  ) {
    console.log("🚀 === LIVE 1INCH SWAP EXECUTION ===")
    console.log({
      chainId: this.chainId,
      tokenOut,
      tokenIn,
      amountOut: ethers.formatUnits(amountOut, 18),
      minAmountIn: ethers.formatUnits(minAmountIn, 18)
    })
    
    try {
      // 1. Get 1inch quote
      console.log("🔍 Getting 1inch quote...")
      const quote = await this.get1inchQuote(tokenOut, tokenIn, amountOut)
      console.log("Quote received:", {
        dstAmount: quote.dstAmount,
        gas: quote.gas
      })
      
      // 2. Get 1inch swap transaction
      console.log("🔄 Getting 1inch swap transaction...")
      const swapData = await this.get1inchSwap(
        tokenOut,
        tokenIn,
        amountOut,
        this.delegatedWalletAddress,
        slippage
      )
      
      console.log("Swap transaction received")
      
      // 3. Create DelegatedWallet swap order
      const delegatedWallet = new ethers.Contract(
        this.delegatedWalletAddress,
        this.delegatedWalletAbi,
        this.wallet
      )
      
      const currentNonce = await delegatedWallet.nonce()
      const timestamp = Math.floor(Date.now() / 1000)
      
      const swapOrder = {
        tokenOut,
        tokenIn,
        amountOut,
        minAmountIn,
        timestamp,
        expiration: timestamp + 3600, // 1 hour
        nonce: currentNonce,
        startPremiumBps: 0,
        decayRateBps: 0,
        decayInterval: 300
      }
      
      // 4. Create signature
      console.log("📝 Creating signature...")
      const messageHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32"],
          [ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
              ["address", "address", "address", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "bytes32"],
              [
                this.delegatedWalletAddress,
                swapOrder.tokenOut,
                swapOrder.tokenIn,
                swapOrder.amountOut,
                swapOrder.minAmountIn,
                swapOrder.timestamp,
                swapOrder.expiration,
                swapOrder.nonce,
                this.chainId,
                ethers.keccak256(
                  ethers.AbiCoder.defaultAbiCoder().encode(
                    ["uint256", "uint256", "uint256"],
                    [swapOrder.startPremiumBps, swapOrder.decayRateBps, swapOrder.decayInterval]
                  )
                )
              ]
            )
          )]
        )
      )
      
      const signature = await this.wallet.signMessage(ethers.getBytes(messageHash))
      
      // 5. Create 1inch call
      const oneinchCall = {
        to: swapData.tx.to,
        value: swapData.tx.value || "0",
        data: swapData.tx.data
      }
      
      console.log("📝 Executing swap through DelegatedWallet...")
      
      // 6. Execute the swap
      const tx = await delegatedWallet.executeSwap(swapOrder, oneinchCall, signature)
      console.log("📤 Transaction sent:", tx.hash)
      
      const receipt = await tx.wait()
      console.log("✅ Transaction confirmed!")
      console.log("Gas used:", receipt.gasUsed.toString())
      
      return {
        transactionHash: tx.hash,
        gasUsed: receipt.gasUsed.toString(),
        swapOrder,
        oneinchData: swapData
      }
      
    } catch (error: any) {
      console.error("❌ Live 1inch swap failed:", error.message)
      throw error
    }
  }
  
  /**
   * Check token balances
   */
  async checkBalances(tokenAddress: string) {
    const token = new ethers.Contract(tokenAddress, this.erc20Abi, this.provider)
    const balance = await token.balanceOf(this.delegatedWalletAddress)
    const symbol = await token.symbol()
    const decimals = await token.decimals()
    
    return {
      balance: balance.toString(),
      formatted: ethers.formatUnits(balance, decimals),
      symbol,
      decimals
    }
  }
  
  /**
   * Approve token for 1inch router
   */
  async approveToken(tokenAddress: string, amount: string) {
    const ONEINCH_ROUTER = "0x111111125421cA6dc452d289314280a0f8842A65"
    
    const token = new ethers.Contract(tokenAddress, this.erc20Abi, this.wallet)
    const tx = await token.approve(ONEINCH_ROUTER, amount)
    console.log("Approval tx:", tx.hash)
    
    await tx.wait()
    console.log("✅ Token approved for 1inch router")
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log("🔗 === PRODUCTION 1INCH INTEGRATION TEST ===")
  
  // Choose your network
  const networks: { [key: string]: number } = {
    'ethereum': 1,
    'polygon': 137,
    'arbitrum': 42161,
    'optimism': 10
  }
  
  const NETWORK = process.env.NETWORK || 'ethereum'
  const CHAIN_ID = networks[NETWORK] || 1
  
  console.log(`Using network: ${NETWORK} (${CHAIN_ID})`)
  
  const integration = new DelegatedWallet1inchProduction(CHAIN_ID)
  
  // Example tokens (update these for your network)
  const tokens: { [key: number]: { [key: string]: string } } = {
    1: { // Ethereum
      USDC: "0xA0b86a33E6421B32C18EC1c25F7fb58C05093578",
      WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      ONEINCH: "0x111111111117dc0aa78b770fa6a738034120c302"
    },
    42161: { // Arbitrum
      USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      ARB: "0x912CE59144191C1204E64559FE8253a0e49E6548"
    }
  }
  
  const networkTokens = tokens[CHAIN_ID]
  if (!networkTokens) {
    throw new Error(`No tokens configured for chain ${CHAIN_ID}`)
  }
  
  try {
    // Check balances
    console.log("\n📊 Checking balances...")
    for (const [symbol, address] of Object.entries(networkTokens)) {
      const balance = await integration.checkBalances(address)
      console.log(`${symbol}: ${balance.formatted} ${balance.symbol}`)
    }
    
    // Example: Execute USDC -> WETH swap
    if (networkTokens.USDC && networkTokens.WETH) {
      console.log("\n🚀 Executing USDC -> WETH swap...")
      
      const result = await integration.executeLive1inchSwap(
        networkTokens.USDC,     // Selling USDC
        networkTokens.WETH,     // Buying WETH
        "100000000",            // 100 USDC (6 decimals)
        "30000000000000000",    // 0.03 WETH minimum (18 decimals)
        2                       // 2% slippage
      )
      
      console.log("🎉 Swap completed successfully!")
      console.log("Transaction:", result.transactionHash)
    }
    
  } catch (error: any) {
    console.error("❌ Production test failed:", error.message)
    process.exit(1)
  }
}

// Export for use in other scripts
export { DelegatedWallet1inchProduction }

// Run if this file is executed directly
if (require.main === module) {
  main()
    .then(() => {
      console.log("✅ Production 1inch integration test completed!")
      process.exit(0)
    })
    .catch((error) => {
      console.error("❌ Test failed:", error)
      process.exit(1)
    })
}
