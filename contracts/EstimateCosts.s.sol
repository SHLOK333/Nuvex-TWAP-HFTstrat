// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import "../src/Firstdraft.sol";

/**
 * Gas Estimation Script for DelegatedWallet Deployment and 1inch Integration
 * 
 * This script estimates costs WITHOUT actually deploying or spending money
 * 
 * Usage:
 * forge script script/EstimateCosts.s.sol:EstimateCosts --rpc-url $RPC_URL
 */
contract EstimateCosts is Script {
    
    struct GasEstimate {
        uint256 deploymentGas;
        uint256 singleSwapGas;
        uint256 batchSwapGas;
        uint256 approvalGas;
        uint256 totalEstimatedGas;
    }
    
    struct NetworkCosts {
        string name;
        uint256 chainId;
        uint256 gasPrice; // in gwei
        uint256 deploymentCostUSD;
        uint256 singleSwapCostUSD;
        uint256 batchSwapCostUSD;
        uint256 dailyTradingCostUSD;
    }
    
    function run() external view {
        console.log("=== GAS ESTIMATION FOR 1INCH INTEGRATION ===");
        console.log("This script estimates costs WITHOUT spending money");
        console.log("");
        
        // Get gas estimates
        GasEstimate memory gasEst = getGasEstimates();
        
        // Print gas estimates
        printGasEstimates(gasEst);
        
        // Calculate costs for different networks
        NetworkCosts[] memory networks = new NetworkCosts[](5);
        
        // Ethereum Mainnet (expensive)
        networks[0] = NetworkCosts({
            name: "Ethereum Mainnet",
            chainId: 1,
            gasPrice: 20, // 20 gwei average
            deploymentCostUSD: 0,
            singleSwapCostUSD: 0,
            batchSwapCostUSD: 0,
            dailyTradingCostUSD: 0
        });
        
        // Arbitrum (much cheaper)
        networks[1] = NetworkCosts({
            name: "Arbitrum One",
            chainId: 42161,
            gasPrice: 1, // ~0.1 gwei typical
            deploymentCostUSD: 0,
            singleSwapCostUSD: 0,
            batchSwapCostUSD: 0,
            dailyTradingCostUSD: 0
        });
        
        // Polygon (cheapest)
        networks[2] = NetworkCosts({
            name: "Polygon",
            chainId: 137,
            gasPrice: 30, // 30 gwei but MATIC is cheap
            deploymentCostUSD: 0,
            singleSwapCostUSD: 0,
            batchSwapCostUSD: 0,
            dailyTradingCostUSD: 0
        });
        
        // Optimism
        networks[3] = NetworkCosts({
            name: "Optimism",
            chainId: 10,
            gasPrice: 1, // ~0.001 gwei typical
            deploymentCostUSD: 0,
            singleSwapCostUSD: 0,
            batchSwapCostUSD: 0,
            dailyTradingCostUSD: 0
        });
        
        // Base
        networks[4] = NetworkCosts({
            name: "Base",
            chainId: 8453,
            gasPrice: 1, // Very cheap
            deploymentCostUSD: 0,
            singleSwapCostUSD: 0,
            batchSwapCostUSD: 0,
            dailyTradingCostUSD: 0
        });
        
        // Calculate and display costs
        console.log("\n=== COST COMPARISON BY NETWORK ===");
        console.log("Assumptions:");
        console.log("- ETH = $3,500");
        console.log("- MATIC = $1.00");
        console.log("- Gas prices are typical/average");
        console.log("");
        
        for (uint i = 0; i < networks.length; i++) {
            printNetworkCosts(networks[i], gasEst);
        }
        
        // Print recommendations
        printRecommendations();
    }
    
    function getGasEstimates() internal pure returns (GasEstimate memory) {
        return GasEstimate({
            deploymentGas: 2_500_000,     // DelegatedWallet deployment
            singleSwapGas: 180_000,       // Single swap execution
            batchSwapGas: 120_000,        // Per batch part execution
            approvalGas: 46_000,          // ERC20 approval
            totalEstimatedGas: 2_846_000  // Sum for initial setup
        });
    }
    
    function printGasEstimates(GasEstimate memory gasEst) internal pure {
        console.log("=== GAS USAGE ESTIMATES ===");
        console.log("Contract Deployment:", gasEst.deploymentGas, "gas");
        console.log("Single Swap Execution:", gasEst.singleSwapGas, "gas");
        console.log("Batch Swap (per part):", gasEst.batchSwapGas, "gas");
        console.log("Token Approval:", gasEst.approvalGas, "gas");
        console.log("Total Setup Cost:", gasEst.totalEstimatedGas, "gas");
        console.log("");
    }
    
    function printNetworkCosts(NetworkCosts memory network, GasEstimate memory gasEst) internal pure {
        console.log("--- ", network.name, " ---");
        console.log("Chain ID:", network.chainId);
        
        if (network.chainId == 1) {
            // Ethereum mainnet calculations (ETH price)
            uint256 deploymentETH = (gasEst.deploymentGas * network.gasPrice) / 1e9; // Convert to ETH
            uint256 singleSwapETH = (gasEst.singleSwapGas * network.gasPrice) / 1e9;
            uint256 batchSwapETH = (gasEst.batchSwapGas * network.gasPrice) / 1e9;
            
            console.log("Deployment Cost: ~", deploymentETH * 3500 / 1e18, "USD");
            console.log("Single Swap: ~", singleSwapETH * 3500 / 1e18, "USD");
            console.log("Batch Swap Part: ~", batchSwapETH * 3500 / 1e18, "USD");
            console.log("Daily Trading (10 swaps): ~", (singleSwapETH * 10 * 3500) / 1e18, "USD");
            
        } else if (network.chainId == 137) {
            // Polygon calculations (MATIC price)
            uint256 deploymentMATIC = (gasEst.deploymentGas * network.gasPrice) / 1e9;
            uint256 singleSwapMATIC = (gasEst.singleSwapGas * network.gasPrice) / 1e9;
            uint256 batchSwapMATIC = (gasEst.batchSwapGas * network.gasPrice) / 1e9;
            
            console.log("Deployment Cost: ~", deploymentMATIC / 1e18, "USD (in MATIC)");
            console.log("Single Swap: ~", singleSwapMATIC / 1e15, "USD (in MATIC)"); // milliUSD
            console.log("Batch Swap Part: ~", batchSwapMATIC / 1e15, "USD (in MATIC)");
            console.log("Daily Trading (10 swaps): ~", (singleSwapMATIC * 10) / 1e15, "USD");
            
        } else {
            // L2 calculations (very cheap)
            console.log("Deployment Cost: < $5 USD");
            console.log("Single Swap: < $0.50 USD");
            console.log("Batch Swap Part: < $0.30 USD");
            console.log("Daily Trading (10 swaps): < $5 USD");
        }
        
        console.log("");
    }
    
    function printRecommendations() internal pure {
        console.log("=== RECOMMENDATIONS ===");
        console.log("");
        console.log("BEST FOR TESTING: Arbitrum One");
        console.log("- Very low gas costs (< $5 total)");
        console.log("- Full 1inch support");
        console.log("- Reliable infrastructure");
        console.log("- Easy bridging from Ethereum");
        console.log("");
        
        console.log("ALTERNATIVE: Polygon");
        console.log("- Extremely cheap gas");
        console.log("- Full 1inch support");
        console.log("- High transaction volume");
        console.log("- Sometimes congested");
        console.log("");
        
        console.log("AVOID FOR TESTING: Ethereum Mainnet");
        console.log("- Very expensive ($50-200+ for testing)");
        console.log("- Same features available on L2s");
        console.log("- Only use for final production deployment");
        console.log("");
        
        console.log("=== TESTING BUDGET RECOMMENDATION ===");
        console.log("For comprehensive 1inch integration testing:");
        console.log("- Arbitrum: $20-50 USD should cover everything");
        console.log("- Polygon: $10-30 USD should cover everything"); 
        console.log("- Includes: deployment + 50+ test swaps + mistakes");
        console.log("");
        
        console.log("=== GETTING STARTED ===");
        console.log("1. Bridge $50 worth of ETH to Arbitrum");
        console.log("2. Get some USDC on Arbitrum for testing");
        console.log("3. Deploy DelegatedWallet contract");
        console.log("4. Run 1inch integration tests");
        console.log("5. Scale up to production volumes");
        console.log("");
        
        console.log("TIP: Start with Arbitrum - best balance of cost/features");
    }
}
