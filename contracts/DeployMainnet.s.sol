// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import "../src/Firstdraft.sol";

/**
 * Deploy DelegatedWallet on Mainnet for 1inch Integration
 * 
 * Usage:
 * forge script script/DeployMainnet.s.sol:DeployMainnet --rpc-url $MAINNET_RPC --private-key $DEPLOYER_PK --broadcast --verify
 */
contract DeployMainnet is Script {
    function run() external {
        uint256 deployerPK = vm.envUint("USER_PK");
        address deployer = vm.addr(deployerPK);
        
        console.log("=== DEPLOYING DELEGATED WALLET ON MAINNET ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        
        // Check deployer balance
        uint256 balance = deployer.balance;
        console.log("Deployer balance:", balance / 1e18, "ETH");
        
        if (balance < 0.1 ether) {
            console.log("WARNING: Low ETH balance. Need at least 0.1 ETH for deployment");
        }
        
        vm.startBroadcast(deployerPK);
        
        // Deploy DelegatedWallet
        console.log("\nDeploying DelegatedWallet...");
        DelegatedWallet wallet = new DelegatedWallet(deployer);
        
        console.log("SUCCESS: DelegatedWallet deployed at:", address(wallet));
        
        // Initialize with deployer as owner
        console.log("Setting up wallet...");
        
        // Transfer ownership to deployer (if needed)
        // wallet.transferOwnership(deployer);
        
        vm.stopBroadcast();
        
        console.log("\n=== DEPLOYMENT COMPLETE ===");
        console.log("DelegatedWallet Address:", address(wallet));
        console.log("Network:", getNetworkName(block.chainid));
        console.log("Ready for 1inch integration!");
        
        console.log("\n=== NEXT STEPS ===");
        console.log("1. Update your .env file:");
        console.log("   DELEGATED_WALLET_ADDRESS=", address(wallet));
        console.log("2. Fund the wallet with tokens for testing");
        console.log("3. Run: npx ts-node scripts/1inch-production-test.ts");
        console.log("4. Start trading with 1inch integration!");
        
        // Verify on mainnet networks
        if (block.chainid == 1 || block.chainid == 42161 || block.chainid == 137 || block.chainid == 10) {
            console.log("\nNOTE: Remember to verify your contract:");
            console.log("forge verify-contract", address(wallet), "src/Firstdraft.sol:DelegatedWallet --chain-id", block.chainid);
        }
    }
    
    function getNetworkName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 1) return "Ethereum Mainnet";
        if (chainId == 137) return "Polygon";
        if (chainId == 42161) return "Arbitrum One";
        if (chainId == 10) return "Optimism";
        if (chainId == 56) return "BSC";
        if (chainId == 43114) return "Avalanche";
        if (chainId == 250) return "Fantom";
        return "Unknown Network";
    }
}
