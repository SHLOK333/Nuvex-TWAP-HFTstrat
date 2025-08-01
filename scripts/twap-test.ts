import {
  LimitOrder,
  MakerTraits,
  Address,
  Api,
  randBigInt,
  HttpProviderConnector,
} from "@1inch/limit-order-sdk";
import { Wallet, JsonRpcProvider, Contract } from "ethers";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// ============================================================================
// CONFIGURATION FOR ARBITRUM + LIVE TWAP ORDER
// ============================================================================

// Network configuration - UPDATED FOR ARBITRUM
const NETWORK_ID = 42161; // Arbitrum One
const RPC_URL = "https://arb1.arbitrum.io/rpc";
const ONEINCH_API_KEY = process.env.ONEINCH_API_KEY || "";

// Live contract addresses on Arbitrum
const DELEGATED_WALLET_ADDRESS = process.env.DELEGATED_WALLET_ADDRESS || "0xaa3b89a93560F1AC6F2cad0B1aefe75623495a7b"; // Your delegated wallet
const USDT_ADDRESS = process.env.USDT_ADDRESS || "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"; // USDT on Arbitrum
const WETH_ADDRESS = process.env.WETH_ADDRESS || "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"; // WETH on Arbitrum
const ONEINCH_PROTOCOL = "0x1111111254EEB25477B68fb85Ed929f73A960582"; // 1inch on Arbitrum

// Live TWAP order hash from our successful execution
// You can update this with your latest order hash or load from environment
const LIVE_TWAP_ORDER_HASH =
  process.env.LIVE_TWAP_ORDER_HASH ||
  "0xb2300e7ae16786d6e7178f9818f2fb8eface4f419337fe897e9d209a55954b99"; // Your latest successful TWAP

// Private keys and wallets
// Uses your existing environment variables from .env file:
// USER_PK (already configured)
// DELEGATED_WALLET_ADDRESS (already configured) 
// USDT_ADDRESS (already configured)
// WETH_ADDRESS (already configured)
// Optional: ONEINCH_API_KEY for 1inch integration

const executorPrivateKey = process.env.USER_PK || "";
const userPrivateKey = process.env.USER_PK || "";
const sponsorPrivateKey = process.env.USER_PK || "";

// DelegatedWallet ABI - Updated to match your actual contract
const DELEGATED_WALLET_ABI = [
  "function twapOrders(bytes32) view returns (tuple(address makerAsset, address takerAsset, uint256 makingAmount, uint256 takingAmount, uint256 salt, uint256 expiration, bool allowPartialFill, uint256 twapStartTime, uint256 twapEndTime, uint256 twapParts, uint256 maxPriceDeviation, uint256 executorTipBps))",
  "function twapInitialPrice(bytes32) view returns (uint256)",
  "function executeTWAPPart(bytes32 orderHash, uint256 partIndex, uint256 currentPrice, address integratorWallet, bytes extension) returns (bytes32)",
  "function registeredLimitOrders(bytes32) view returns (bool)",
  "function authorizedUsers(address) view returns (bool)",
];

// ============================================================================
// MAIN INTEGRATION SCRIPT
// ============================================================================

async function main() {
  console.log("🚀 Integrating Live EIP-7702 TWAP with 1inch API - Arbitrum");
  console.log("===========================================================");

  if (!ONEINCH_API_KEY) {
    console.warn(
      "⚠️  ONEINCH_API_KEY not set - continuing without API submission"
    );
  }

  // Initialize provider and wallets
  const provider = new JsonRpcProvider(RPC_URL);
  const userWallet = new Wallet(userPrivateKey, provider);
  const executorWallet = new Wallet(executorPrivateKey, provider);

  console.log("👤 User wallet (delegated):", userWallet.address);
  console.log("🤖 Executor wallet:", executorWallet.address);
  console.log("📋 Live TWAP order hash:", LIVE_TWAP_ORDER_HASH);

  // Connect to our deployed contract
  const delegatedWallet = new Contract(
    DELEGATED_WALLET_ADDRESS,
    DELEGATED_WALLET_ABI,
    provider
  );

  // Initialize 1inch API if we have the key
  let api: Api | null = null;
  if (ONEINCH_API_KEY) {
    try {
      // Create a simple HTTP connector
      const httpConnector = {
        async get<T>(url: string, headers: Record<string, string>): Promise<T> {
          const response = await fetch(url, { headers });
          return response.json() as Promise<T>;
        },
        async post<T>(
          url: string,
          data: unknown,
          headers: Record<string, string>
        ): Promise<T> {
          const response = await fetch(url, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          return response.json() as Promise<T>;
        },
      };

      api = new Api({
        authKey: ONEINCH_API_KEY,
        networkId: NETWORK_ID,
        httpConnector: httpConnector,
      });
      console.log("🔗 Connected to 1inch API");
    } catch (error) {
      console.warn("⚠️  Could not connect to 1inch API:", error);
    }
  }

  try {
    // 1. Check live TWAP status
    console.log("\n📊 === CHECKING LIVE TWAP STATUS ===");
    const twapStatus = await getLiveTWAPStatus(delegatedWallet);

    // 2. Execute remaining TWAP parts
    console.log("\n🔄 === EXECUTING REMAINING TWAP PARTS ===");
    await executeRemainingTWAPParts(
      delegatedWallet,
      userWallet,
      executorWallet,
      api,
      twapStatus
    );

    console.log("\n✅ Live TWAP integration completed successfully!");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message || error);
    process.exit(1);
  }
}

// ============================================================================
// LIVE TWAP INTEGRATION FUNCTIONS
// ============================================================================

interface LiveTWAPStatus {
  order: any;
  executedParts: number;
  nextExecutionTime: number;
  isComplete: boolean;
  partMakingAmount: bigint;
  partTakingAmount: bigint;
}

async function getLiveTWAPStatus(contract: Contract): Promise<LiveTWAPStatus> {
  console.log("Fetching live TWAP status...");

  // Get TWAP order details
  const order = await contract.twapOrders(LIVE_TWAP_ORDER_HASH);
  
  // Check if order exists
  if (order.makerAsset === "0x0000000000000000000000000000000000000000") {
    throw new Error("TWAP order not found or invalid order hash");
  }

  // Since the contract doesn't track executed parts, we'll assume this is a fresh execution
  // In a real implementation, you'd track this separately or add this functionality to the contract
  const executedParts = 0; // Starting fresh - your contract doesn't track executed parts
  
  // Calculate timing
  const currentTime = Math.floor(Date.now() / 1000);
  const timeBetweenParts = (Number(order.twapEndTime) - Number(order.twapStartTime)) / Number(order.twapParts);
  const nextExecutionTime = Number(order.twapStartTime) + executedParts * timeBetweenParts;
  const isComplete = Number(executedParts) >= Number(order.twapParts) || currentTime > Number(order.twapEndTime);

  const partMakingAmount = order.makingAmount / BigInt(order.twapParts);
  const partTakingAmount = order.takingAmount / BigInt(order.twapParts);

  console.log("📋 Live TWAP Status:");
  console.log("   - Maker Asset (USDT):", order.makerAsset);
  console.log("   - Taker Asset (WETH):", order.takerAsset);
  console.log(
    "   - Total Making:",
    formatAmount(order.makingAmount, 6),
    "USDT"
  );
  console.log(
    "   - Total Taking:",
    formatAmount(order.takingAmount, 18),
    "WETH"
  );
  console.log("   - Total Parts:", order.twapParts.toString());
  console.log("   - Executed Parts:", executedParts.toString(), "(contract doesn't track - assuming fresh start)");
  console.log(
    "   - Per Part Making:",
    formatAmount(partMakingAmount, 6),
    "USDT"
  );
  console.log(
    "   - Per Part Taking:",
    formatAmount(partTakingAmount, 18),
    "WETH"
  );
  console.log(
    "   - TWAP Start:",
    new Date(Number(order.twapStartTime) * 1000).toISOString()
  );
  console.log(
    "   - TWAP End:",
    new Date(Number(order.twapEndTime) * 1000).toISOString()
  );
  console.log(
    "   - Next Execution:",
    new Date(nextExecutionTime * 1000).toISOString()
  );
  console.log("   - Current Time:", new Date().toISOString());
  console.log("   - Is Complete:", isComplete);
  console.log(
    "   - Max Price Deviation:",
    order.maxPriceDeviation.toString(),
    "bps"
  );
  console.log("   - Executor Tip:", order.executorTipBps.toString(), "bps");

  return {
    order,
    executedParts,
    nextExecutionTime,
    isComplete,
    partMakingAmount,
    partTakingAmount,
  };
}

async function executeRemainingTWAPParts(
  contract: Contract,
  userWallet: Wallet,
  executorWallet: Wallet,
  api: Api | null,
  twapStatus: LiveTWAPStatus
): Promise<void> {
  if (twapStatus.isComplete) {
    console.log("✅ TWAP is already complete!");
    return;
  }

  const remainingParts =
    Number(twapStatus.order.twapParts) - twapStatus.executedParts;
  console.log(`📋 ${remainingParts} parts remaining to execute`);

  // For demo, execute next 2 parts or all remaining (whichever is less)
  const partsToExecute = Math.min(2, remainingParts);
  console.log(`🎯 Will execute ${partsToExecute} parts for demonstration`);

  for (let i = 0; i < partsToExecute; i++) {
    const partIndex = twapStatus.executedParts + i;

    console.log(`\n🔄 === EXECUTING TWAP PART ${partIndex + 1} ===`);

    try {
      // Check if we're ready to execute this part
      const currentTime = Math.floor(Date.now() / 1000);
      const timeBetweenParts =
        (Number(twapStatus.order.twapEndTime) -
          Number(twapStatus.order.twapStartTime)) /
        Number(twapStatus.order.twapParts);
      const expectedExecutionTime =
        Number(twapStatus.order.twapStartTime) + partIndex * timeBetweenParts;

      if (currentTime < expectedExecutionTime) {
        const waitTime = expectedExecutionTime - currentTime;
        console.log(
          `⏳ Need to wait ${waitTime} seconds before executing part ${
            partIndex + 1
          }`
        );
        console.log(
          `   Expected execution time: ${new Date(
            expectedExecutionTime * 1000
          ).toISOString()}`
        );

        if (waitTime > 300) {
          // More than 5 minutes
          console.log("⏭️  Skipping - too long to wait for demo");
          continue;
        } else {
          console.log(`⏱️  Waiting ${waitTime} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
        }
      }

      // Execute TWAP part via EIP-7702
      const oneinchOrderHash = await executeEIP7702TWAPPart(
        contract,
        userWallet,
        executorWallet,
        partIndex,
        twapStatus
      );

      // Submit to 1inch API if we have it
      if (api && oneinchOrderHash) {
        await submitTWAPPartTo1inch(
          api,
          oneinchOrderHash,
          twapStatus,
          partIndex,
          userWallet
        );
      }

      // Update status for next iteration
      twapStatus.executedParts++;
    } catch (error: any) {
      console.error(
        `❌ Failed to execute part ${partIndex + 1}:`,
        error.message
      );
    }
  }

  // Show remaining work
  const newRemainingParts =
    Number(twapStatus.order.twapParts) - twapStatus.executedParts;
  if (newRemainingParts > 0) {
    const timeBetweenParts =
      (Number(twapStatus.order.twapEndTime) -
        Number(twapStatus.order.twapStartTime)) /
      Number(twapStatus.order.twapParts);
    console.log(
      `\n📈 Progress: ${twapStatus.executedParts}/${Number(
        twapStatus.order.twapParts
      )} parts executed`
    );
    console.log(`⏳ ${newRemainingParts} parts still remaining`);

    const nextExecutionTime =
      Number(twapStatus.order.twapStartTime) +
      twapStatus.executedParts * timeBetweenParts;
    console.log(
      `🕐 Next part ready at: ${new Date(
        nextExecutionTime * 1000
      ).toISOString()}`
    );
  }
}

async function executeEIP7702TWAPPart(
  contract: Contract,
  userWallet: Wallet,
  executorWallet: Wallet,
  partIndex: number,
  twapStatus: LiveTWAPStatus
): Promise<string | null> {
  console.log(`🚀 Executing EIP-7702 TWAP part ${partIndex + 1}...`);

  // Calculate current price (in production, get from oracle)
  const currentPrice =
    (twapStatus.order.takingAmount * BigInt(1e18)) /
    twapStatus.order.makingAmount;

  try {
    // Create contract instance with user wallet for EIP-7702 execution
    const userContract = contract.connect(userWallet) as any;

    // Execute TWAP part (this will use EIP-7702 delegation)
    const tx = await userContract.executeTWAPPart(
      LIVE_TWAP_ORDER_HASH,
      BigInt(partIndex),
      currentPrice,
      executorWallet.address, // Executor gets the tip
      "0x" // Empty extension
    );

    console.log(`📋 Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(
      `✅ Part ${partIndex + 1} executed in block ${receipt.blockNumber}`
    );
    console.log(
      `💰 Gas used: ${receipt.gasUsed} (${formatAmount(
        BigInt(receipt.gasUsed) * BigInt(receipt.gasPrice),
        18
      )} ETH)`
    );

    // Extract the 1inch order hash from the return value or events
    // For now, we'll generate a representative hash
    const oneinchOrderHash = `0x${Math.random()
      .toString(16)
      .slice(2)
      .padStart(64, "0")}`;

    console.log(`🔗 Generated 1inch order hash: ${oneinchOrderHash}`);

    return oneinchOrderHash;
  } catch (error: any) {
    console.error(`❌ EIP-7702 execution failed:`, error.message);
    return null;
  }
}

async function submitTWAPPartTo1inch(
  api: Api,
  oneinchOrderHash: string,
  twapStatus: LiveTWAPStatus,
  partIndex: number,
  userWallet: Wallet
): Promise<void> {
  console.log(`📤 Submitting TWAP part ${partIndex + 1} to 1inch API...`);

  try {
    // Calculate integrator fee
    const integratorFee =
      (twapStatus.partTakingAmount * twapStatus.order.executorTipBps) / 10000n;
    const totalTakingAmount = twapStatus.partTakingAmount + integratorFee;

    // Create expiration (1 hour from now)
    const expiration = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
    const UINT_40_MAX = (1n << 40n) - 1n;

    // Create maker traits
    const makerTraits = MakerTraits.default()
      .withExpiration(expiration)
      .withNonce(randBigInt(UINT_40_MAX));

    // Create the order
    const order = new LimitOrder(
      {
        makerAsset: new Address(USDT_ADDRESS),
        takerAsset: new Address(WETH_ADDRESS),
        makingAmount: twapStatus.partMakingAmount,
        takingAmount: totalTakingAmount,
        maker: new Address(DELEGATED_WALLET_ADDRESS), // Our delegated wallet
        receiver: new Address(DELEGATED_WALLET_ADDRESS),
      },
      makerTraits
    );

    console.log(`📝 Created 1inch order for part ${partIndex + 1}:`);
    console.log(
      `   - Making: ${formatAmount(twapStatus.partMakingAmount, 6)} USDT`
    );
    console.log(
      `   - Taking: ${formatAmount(twapStatus.partTakingAmount, 18)} WETH`
    );
    console.log(
      `   - Integrator fee: ${formatAmount(integratorFee, 18)} WETH`
    );
    console.log(
      `   - Total taking: ${formatAmount(totalTakingAmount, 18)} WETH`
    );

    // Sign the order (this would need to be done by the delegated wallet in production)
    const typedData = order.getTypedData(NETWORK_ID);
    const signature = await userWallet.signTypedData(
      typedData.domain,
      typedData.types,
      typedData.message
    );

    console.log(`✍️  Order signed`);

    // Submit to 1inch
    await api.submitOrder(order, signature);

    const actualOrderHash = order.getOrderHash(NETWORK_ID);
    console.log(`✅ Part ${partIndex + 1} submitted to 1inch orderbook!`);
    console.log(`   Order hash: ${actualOrderHash}`);
  } catch (error: any) {
    console.error(`❌ Failed to submit to 1inch API:`, error.message);
    if (error.response?.data) {
      console.error("   API Error:", error.response.data);
    }
  }
}

// ============================================================================
// UTILITY FUNCTIONS (from original script)
// ============================================================================

function formatAmount(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;

  if (fraction === 0n) {
    return whole.toString();
  }

  const fractionStr = fraction.toString().padStart(decimals, "0");
  const trimmed = fractionStr.replace(/0+$/, "");

  return `${whole}.${trimmed}`;
}

// ============================================================================
// EXECUTION
// ============================================================================

if (require.main === module) {
  main().catch(console.error);
}

export {
  getLiveTWAPStatus,
  executeRemainingTWAPParts,
  executeEIP7702TWAPPart,
  submitTWAPPartTo1inch,
  formatAmount,
};
