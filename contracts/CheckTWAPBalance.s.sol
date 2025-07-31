// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import "../src/Firstdraft.sol";

/**
 * Check TWAP Balance Requirements
 * Simple script to verify wallet has sufficient funds for TWAP testing
 */
contract CheckTWAPBalance is Script {
    
    function run() external {
        address user = vm.addr(vm.envUint("USER_PK"));
        address usdt = vm.envAddress("USDC_ADDRESS"); // Using USDC_ADDRESS which now points to USDT
        address weth = vm.envAddress("WETH_ADDRESS");
        
        console.log("=== TWAP BALANCE CHECK ===");
        console.log("User Address:", user);
        console.log("USDT Token:", usdt);
        console.log("WETH Token:", weth);
        
        // Check ETH balance
        uint256 ethBalance = user.balance;
        console.log("\nETH Balance:", ethBalance / 1e18, "ETH");
        
        if (ethBalance < 0.01 ether) {
            console.log("WARNING: Need at least 0.01 ETH for gas fees");
            console.log("Current ETH:", ethBalance / 1e18, "ETH");
            console.log("Get more ETH from: https://arbitrum.foundation/");
        } else {
            console.log("SUCCESS: Sufficient ETH for gas fees");
        }
        
        // Check USDT balance
        (bool success, bytes memory data) = usdt.staticcall(
            abi.encodeWithSignature("balanceOf(address)", user)
        );
        
        if (success) {
            uint256 usdtBalance = abi.decode(data, (uint256));
            console.log("\nUSDT Balance:", usdtBalance / 1e6, "USDT");
            
            if (usdtBalance >= 100000) { // 0.1 USDT
                console.log("SUCCESS: Sufficient USDT for TWAP testing!");
                console.log("Can test with 0.1 USDT split into 5 parts");
                
                // Show TWAP test plan
                console.log("\n=== TWAP TEST PLAN ===");
                console.log("Total Amount: 0.1 USDT");
                console.log("TWAP Parts: 5");
                console.log("Amount per Part: 0.02 USDT");
                console.log("Duration: 10 minutes");
                console.log("Target: Convert USDT to WETH");
                
                console.log("\n=== READY TO PROCEED ===");
                console.log("Next step: Run TWAP registration");
                console.log("Command: forge script script/ExecuteTWAPTest.s.sol --broadcast");
                
            } else {
                console.log("WARNING: Need at least 0.1 USDT for testing");
                console.log("Current USDT:", usdtBalance / 1e6, "USDT");
                console.log("Need:", (100000 - usdtBalance) / 1e6, "more USDT");
                
                console.log("\n=== HOW TO GET USDT ON ARBITRUM ===");
                console.log("1. Bridge from Ethereum: https://bridge.arbitrum.io/");
                console.log("2. Buy on Uniswap V3: https://app.uniswap.org/");
                console.log("3. Use GMX: https://app.gmx.io/");
                console.log("4. Swap ETH->USDT on any Arbitrum DEX");
                console.log("5. Use Binance/Coinbase: Direct withdrawal to Arbitrum");
            }
        } else {
            console.log("ERROR: Could not check USDT balance");
        }
        
        // Check WETH balance (for reference)
        (bool wethSuccess, bytes memory wethData) = weth.staticcall(
            abi.encodeWithSignature("balanceOf(address)", user)
        );
        
        if (wethSuccess) {
            uint256 wethBalance = abi.decode(wethData, (uint256));
            console.log("\nWETH Balance:", wethBalance / 1e18, "WETH");
        }
        
        console.log("\n=== ARBITRUM MAINNET DEPLOYMENT ===");
        console.log("DelegatedWallet:", vm.envAddress("DELEGATED_WALLET_ADDRESS"));
        console.log("Network: Arbitrum One");
        console.log("Explorer: https://arbiscan.io/");
        console.log("Status: Ready for TWAP testing!");
    }
}
