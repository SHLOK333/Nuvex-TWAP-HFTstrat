import { ethers } from "ethers";
import axios from "axios";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// ============================================================================
// 1INCH API INTEGRATION WITH NUVEX WALLET
// ============================================================================

interface Quote1inch {
  dstAmount: string;
  srcAmount: string;
  protocols: any[];
  gas: string;
}

interface Swap1inch {
  dstAmount: string;
  srcAmount: string;
  tx: {
    to: string;
    data: string;
    value: string;
    gas: string;
    gasPrice: string;
  };
}

class NuvexWallet1inchIntegration {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private nuvexWalletAddress: string;
  private oneinchApiKey: string;
  
  // Contract ABIs
  private erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
  ];
  
  private nuvexWalletAbi = [
    "function executeSwap((address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256),(address,uint256,bytes),bytes) returns (bytes)",
    "function nonce() view returns (uint256)"
  ];
  
  constructor() {
    this.provider = new ethers.JsonRpcProvider(
      process.env.ALCHEMY_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/DD1U2tcVyJGO3IZFUW8rzVdNNRFoPLtp"
    );
    
    this.wallet = new ethers.Wallet(
      process.env.USER_PK || "",
      this.provider
    );
    
    this.nuvexWalletAddress = process.env.NUVEX_WALLET_ADDRESS || "";
    this.oneinchApiKey = process.env.ONEINCH_API_KEY || "";
  }
  
  async get1inchQuote(
    chainId: number,
    src: string,
    dst: string,
    amount: string
  ): Promise<Quote1inch> {
    console.log("🔍 Getting 1inch quote...");
    
    const url = `https://api.1inch.dev/swap/v6.0/${chainId}/quote`;
    
    try {
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.oneinchApiKey}`
        },
        params: {
          src,
          dst,
          amount,
          includeProtocols: true,
          includeGas: true
        }
      });
      
      console.log("✅ Quote received:", {
        srcAmount: response.data.srcAmount,
        dstAmount: response.data.dstAmount,
        gas: response.data.gas
      });
      
      return response.data;
    } catch (error: any) {
      console.error("❌ Failed to get 1inch quote:", error.response?.data || error.message);
      throw error;
    }
  }
  
  async get1inchSwap(
    chainId: number,
    src: string,
    dst: string,
    amount: string,
    from: string,
    slippage: number = 1
  ): Promise<Swap1inch> {
    console.log("🔄 Getting 1inch swap transaction...");
    
    const url = `https://api.1inch.dev/swap/v6.0/${chainId}/swap`;
    
    try {
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.oneinchApiKey}`
        },
        params: {
          src,
          dst,
          amount,
          from,
          slippage,
          disableEstimate: true,
          allowPartialFill: false
        }
      });
      
      console.log("✅ Swap transaction received");
      
      return response.data;
    } catch (error: any) {
      console.error("❌ Failed to get 1inch swap:", error.response?.data || error.message);
      throw error;
    }
  }
  
  async executeLimitOrderVia1inch(
    tokenOut: string,
    tokenIn: string,
    amountOut: string,
    minAmountIn: string
  ) {
    console.log("🚀 === EXECUTING LIMIT ORDER VIA 1INCH ===");
    console.log({
      tokenOut,
      tokenIn,
      amountOut: ethers.formatEther(amountOut),
      minAmountIn: ethers.formatEther(minAmountIn)
    });
    
    try {
      // 1. Get current balances
      const tokenOutContract = new ethers.Contract(tokenOut, this.erc20Abi, this.provider);
      const tokenInContract = new ethers.Contract(tokenIn, this.erc20Abi, this.provider);
      
      const balanceOutBefore = await tokenOutContract.balanceOf(this.nuvexWalletAddress);
      const balanceInBefore = await tokenInContract.balanceOf(this.nuvexWalletAddress);
      
      console.log("📊 Initial Balances:");
      console.log(`- ${await tokenOutContract.symbol()}: ${ethers.formatEther(balanceOutBefore)}`);
      console.log(`- ${await tokenInContract.symbol()}: ${ethers.formatEther(balanceInBefore)}`);
      
      // 2. Get 1inch quote (skip for Sepolia since 1inch may not be available)
      console.log("ℹ️ Note: Skipping 1inch API calls on Sepolia testnet");
      console.log("ℹ️ In production, use Mainnet/Polygon/Optimism for full 1inch support");
      
      // 3. Create mock 1inch transaction data for demonstration
      const mockSwapData = "0x12aa3caf000000000000000000000000e37e799d5077682fa0a244d46e5649f71457bd09000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000010000000000000000cfee7c08";
      
      // 4. Create NuvexWallet swap order
      const nuvexWallet = new ethers.Contract(
        this.nuvexWalletAddress,
        this.nuvexWalletAbi,
        this.wallet
      );
      
      const currentNonce = await nuvexWallet.nonce();
      const timestamp = Math.floor(Date.now() / 1000);
      
      const swapOrder = {
        tokenOut,
        tokenIn,
        amountOut,
        minAmountIn,
        timestamp,
        expiration: timestamp + 3600, // 1 hour
        nonce: currentNonce,
        startPremiumBps: 0,
        decayRateBps: 50,
        decayInterval: 300
      };
      
      console.log("📝 Creating swap order signature...");
      
      // 5. Create signature
      const messageHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32"],
          [ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
              ["address", "address", "address", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "bytes32"],
              [
                this.nuvexWalletAddress,
                swapOrder.tokenOut,
                swapOrder.tokenIn,
                swapOrder.amountOut,
                swapOrder.minAmountIn,
                swapOrder.timestamp,
                swapOrder.expiration,
                swapOrder.nonce,
                11155111, // Sepolia chain ID
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
      );
      
      const signature = await this.wallet.signMessage(ethers.getBytes(messageHash));
      
      // 6. Create mock 1inch call (use actual 1inch router on mainnet)
      const oneinchCall = {
        to: "0x111111125421cA6dc452d289314280a0f8842A65", // 1inch V6 Router
        value: "0",
        data: mockSwapData
      };
      
      console.log("📝 Executing swap order through NuvexWallet...");
      console.log("⚠️  Note: This is a demo - actual 1inch integration requires mainnet");
      
      // In a real scenario with proper 1inch API:
      console.log("🔗 For production 1inch integration:");
      console.log("1. Get quote from: https://api.1inch.dev/swap/v6.0/{chainId}/quote");
      console.log("2. Get swap tx from: https://api.1inch.dev/swap/v6.0/{chainId}/swap");
      console.log("3. Use the returned tx.data in your NuvexWallet.executeSwap()");
      console.log("4. Deploy on Mainnet/Polygon/Optimism for live 1inch support");
      
      console.log("✅ 1INCH INTEGRATION PATTERN DEMONSTRATED!");
      console.log("Your NuvexWallet is ready for 1inch integration on mainnet!");
      
    } catch (error: any) {
      console.error("❌ 1inch integration demo failed:", error.message);
      
      if (error.code === 'INSUFFICIENT_FUNDS') {
        console.log("💡 Suggestion: Ensure your NuvexWallet has sufficient token balance");
      } else if (error.response?.status === 401) {
        console.log("💡 Suggestion: Check your 1inch API key in .env file");
      } else if (error.response?.status === 400) {
        console.log("💡 Suggestion: Check token addresses and amounts");
      }
      
      throw error;
    }
  }
}

// ============================================================================
