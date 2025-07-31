// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import "../src/DelegatedWalletEIP712.sol";

/**
 * Deploy DelegatedWallet with EIP-712 signature support
 */
contract DeployEIP712Wallet is Script {
    
    function run() external {
        uint256 deployerPK = vm.envUint("USER_PK");
        address deployer = vm.addr(deployerPK);
        
        console.log("=== DEPLOYING EIP-712 DELEGATED WALLET ===");
        console.log("Deployer:", deployer);
        console.log("Network:", getNetworkName(block.chainid));
        console.log("Chain ID:", block.chainid);
        
        // 1inch Limit Order Protocol v4 address on Arbitrum One
        address limitOrderProtocol = 0x1111111254EEB25477B68fb85Ed929f73A960582;
        
        console.log("Using 1inch Limit Order Protocol at:", limitOrderProtocol);
        
        vm.startBroadcast(deployerPK);
        
        // Deploy EIP-712 DelegatedWallet
        console.log("\nDeploying EIP-712 DelegatedWallet...");
        DelegatedWalletEIP712 wallet = new DelegatedWalletEIP712(limitOrderProtocol);
        
        console.log("SUCCESS: EIP-712 DelegatedWallet deployed at:", address(wallet));
        
        // Get domain separator
        bytes32 domainSeparator = wallet.domainSeparator();
        console.log("EIP-712 Domain Separator:", vm.toString(domainSeparator));
        
        vm.stopBroadcast();
        
        console.log("\n=== DEPLOYMENT COMPLETE ===");
        console.log("EIP-712 DelegatedWallet Address:", address(wallet));
        console.log("Network:", getNetworkName(block.chainid));
        console.log("1inch Protocol:", limitOrderProtocol);
        console.log("EIP-712 Domain: DelegatedWallet v1");
        console.log("Ready for structured data signing!");
        
        // Update .env instructions
        console.log("\n=== UPDATE YOUR .ENV FILE ===");
        console.log("Update this line in your .env file:");
        console.log("DELEGATED_WALLET_ADDRESS=", address(wallet));
    }
    
    function getNetworkName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 1) return "Ethereum Mainnet";
        if (chainId == 42161) return "Arbitrum One";
        if (chainId == 137) return "Polygon";
        if (chainId == 10) return "Optimism";
        if (chainId == 8453) return "Base";
        if (chainId == 11155111) return "Sepolia";
        return "Unknown Network";
    }
}
