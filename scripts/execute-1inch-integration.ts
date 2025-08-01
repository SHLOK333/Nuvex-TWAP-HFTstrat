import { ethers } from "ethers";
import axios from "axios";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// ============================================================================
// 1INCH API INTEGRATION WITH DELEGATED WALLET
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

class DelegatedWallet1inchIntegration {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private delegatedWalletAddress: string;
  private oneinchApiKey: string;
  
  // Contract ABIs
  private erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
  ];
  
  private delegatedWalletAbi = [
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
    
    this.delegatedWalletAddress = process.env.DELEGATED_WALLET_ADDRESS || "";
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
      
      const balanceOutBefore = await tokenOutContract.balanceOf(this.delegatedWalletAddress);
      const balanceInBefore = await tokenInContract.balanceOf(this.delegatedWalletAddress);
      
      console.log("📊 Initial Balances:");
      console.log(`- ${await tokenOutContract.symbol()}: ${ethers.formatEther(balanceOutBefore)}`);
      console.log(`- ${await tokenInContract.symbol()}: ${ethers.formatEther(balanceInBefore)}`);
      
      // 2. Get 1inch quote
      const chainId = 11155111; // Sepolia
      const quote = await this.get1inchQuote(chainId, tokenOut, tokenIn, amountOut);
      
      console.log("💱 1inch Quote:");
      console.log(`- Will receive: ${ethers.formatEther(quote.dstAmount)} tokens`);
      console.log(`- Estimated gas: ${quote.gas}`);
      
      // 3. Get 1inch swap transaction
      const swap = await this.get1inchSwap(
        chainId,
        tokenOut,
        tokenIn,
        amountOut,
        this.delegatedWalletAddress,
        1 // 1% slippage
      );\n      \n      // 4. Create DelegatedWallet swap order\n      const delegatedWallet = new ethers.Contract(\n        this.delegatedWalletAddress,\n        this.delegatedWalletAbi,\n        this.wallet\n      );\n      \n      const currentNonce = await delegatedWallet.nonce();\n      const timestamp = Math.floor(Date.now() / 1000);\n      \n      const swapOrder = {\n        tokenOut,\n        tokenIn,\n        amountOut,\n        minAmountIn,\n        timestamp,\n        expiration: timestamp + 3600, // 1 hour\n        nonce: currentNonce,\n        startPremiumBps: 0,\n        decayRateBps: 50,\n        decayInterval: 300\n      };\n      \n      // 5. Create signature\n      const messageHash = ethers.keccak256(\n        ethers.AbiCoder.defaultAbiCoder().encode(\n          ["bytes32"],\n          [ethers.keccak256(\n            ethers.AbiCoder.defaultAbiCoder().encode(\n              ["address", "address", "address", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256", "bytes32"],\n              [\n                this.delegatedWalletAddress,\n                swapOrder.tokenOut,\n                swapOrder.tokenIn,\n                swapOrder.amountOut,\n                swapOrder.minAmountIn,\n                swapOrder.timestamp,\n                swapOrder.expiration,\n                swapOrder.nonce,\n                chainId,\n                ethers.keccak256(\n                  ethers.AbiCoder.defaultAbiCoder().encode(\n                    ["uint256", "uint256", "uint256"],\n                    [swapOrder.startPremiumBps, swapOrder.decayRateBps, swapOrder.decayInterval]\n                  )\n                )\n              ]\n            )\n          )]\n        )\n      );\n      \n      const signature = await this.wallet.signMessage(ethers.getBytes(messageHash));\n      \n      // 6. Create 1inch call\n      const oneinchCall = {\n        to: swap.tx.to,\n        value: swap.tx.value,\n        data: swap.tx.data\n      };\n      \n      console.log("📝 Executing swap order through DelegatedWallet...");\n      \n      // 7. Execute the swap\n      const tx = await delegatedWallet.executeSwap(\n        swapOrder,\n        oneinchCall,\n        signature,\n        {\n          gasLimit: swap.tx.gas,\n          gasPrice: swap.tx.gasPrice\n        }\n      );\n      \n      console.log("⏳ Transaction submitted:", tx.hash);\n      \n      const receipt = await tx.wait();\n      console.log("✅ Transaction confirmed in block:", receipt.blockNumber);\n      \n      // 8. Check final balances\n      const balanceOutAfter = await tokenOutContract.balanceOf(this.delegatedWalletAddress);\n      const balanceInAfter = await tokenInContract.balanceOf(this.delegatedWalletAddress);\n      \n      console.log("📊 Final Balances:");\n      console.log(`- ${await tokenOutContract.symbol()}: ${ethers.formatEther(balanceOutAfter)}`);\n      console.log(`- ${await tokenInContract.symbol()}: ${ethers.formatEther(balanceInAfter)}`);\n      \n      const amountTraded = balanceOutBefore - balanceOutAfter;\n      const amountReceived = balanceInAfter - balanceInBefore;\n      \n      console.log("💹 Trade Summary:");\n      console.log(`- Traded: ${ethers.formatEther(amountTraded)} ${await tokenOutContract.symbol()}`);\n      console.log(`- Received: ${ethers.formatEther(amountReceived)} ${await tokenInContract.symbol()}`);\n      \n      if (amountTraded > 0) {\n        const effectiveRate = (Number(ethers.formatEther(amountReceived)) * 100) / Number(ethers.formatEther(amountTraded));\n        console.log(`- Effective Rate: ${effectiveRate.toFixed(2)}%`);\n      }\n      \n      console.log("🎉 1INCH INTEGRATION SUCCESSFUL!");\n      \n    } catch (error: any) {\n      console.error("❌ 1inch integration failed:", error.message);\n      \n      if (error.code === 'INSUFFICIENT_FUNDS') {\n        console.log("💡 Suggestion: Ensure your DelegatedWallet has sufficient token balance");\n      } else if (error.response?.status === 401) {\n        console.log("💡 Suggestion: Check your 1inch API key in .env file");\n      } else if (error.response?.status === 400) {\n        console.log("💡 Suggestion: Check token addresses and amounts");\n      }\n      \n      throw error;\n    }\n  }\n}\n\n// ============================================================================\n// MAIN EXECUTION\n// ============================================================================\n\nasync function main() {\n  console.log("🔗 === DELEGATED WALLET + 1INCH INTEGRATION ===");\n  \n  // Check environment variables\n  if (!process.env.USER_PK) {\n    throw new Error("USER_PK environment variable is required");\n  }\n  \n  if (!process.env.DELEGATED_WALLET_ADDRESS) {\n    throw new Error("DELEGATED_WALLET_ADDRESS environment variable is required");\n  }\n  \n  if (!process.env.ONEINCH_API_KEY || process.env.ONEINCH_API_KEY === "your_1inch_api_key_here") {\n    console.log("⚠️  WARNING: 1inch API key not configured. Get one from https://portal.1inch.dev/");\n    console.log("⚠️  This demo will likely fail without a valid API key");\n  }\n  \n  const integration = new DelegatedWallet1inchIntegration();\n  \n  // Test with your deployed test tokens\n  const TEST_USDC = process.env.TEST_USDC_ADDRESS || "";\n  const TEST_1INCH = process.env.TEST_1INCH_ADDRESS || "";\n  \n  if (!TEST_USDC || !TEST_1INCH) {\n    throw new Error("Test token addresses not found in environment variables");\n  }\n  \n  // Execute a limit order: 5 TestUSDC -> Test1INCH via 1inch\n  await integration.executeLimitOrderVia1inch(\n    TEST_USDC,\n    TEST_1INCH,\n    ethers.parseEther("5"), // 5 TestUSDC\n    ethers.parseEther("3")  // At least 3 Test1INCH\n  );\n}\n\n// Run the integration\nif (require.main === module) {\n  main()\n    .then(() => {\n      console.log("✅ 1inch integration completed successfully!");\n      process.exit(0);\n    })\n    .catch((error) => {\n      console.error("❌ 1inch integration failed:", error);\n      process.exit(1);\n    });\n}\n\nexport { DelegatedWallet1inchIntegration };
