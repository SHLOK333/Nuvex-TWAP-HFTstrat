// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import "../src/DelegatedWalletEIP712.sol";

/**
 * Monitor TWAP order status and execution progress
 */
contract CheckTWAPStatus is Script {
    
    function run() external {
        DelegatedWalletEIP712 wallet = DelegatedWalletEIP712(payable(vm.envAddress("DELEGATED_WALLET_ADDRESS")));
        
        // Your current order hash from the successful registration
        bytes32 orderHash = 0xc84131fe1e4ae81ad6e02d695e8c9e97f49766f020a5f6d7e0deece1ba00f13b;
        
        console.log("=== TWAP ORDER STATUS ===");
        console.log("Order Hash:", vm.toString(orderHash));
        console.log("Contract:", address(wallet));
        console.log("Current Time:", block.timestamp);
        
        // Get order details
        bool isRegistered = wallet.registeredLimitOrders(orderHash);
        bool isCancelled = wallet.cancelledLimitOrders(orderHash);
        
        console.log("Order Registered:", isRegistered);
        console.log("Order Cancelled:", isCancelled);
        
        if (isRegistered && !isCancelled) {
            console.log("✅ TWAP ORDER IS ACTIVE");
            
            // Get order details (you'd need to add getter functions to the contract)
            console.log("Status: Ready for execution");
            console.log("Monitor at: https://arbiscan.io/address/", address(wallet));
            
            // Check timing
            // Note: You'd need to add public getters for TWAP order details
            console.log("\n=== EXECUTION TIMELINE ===");
            console.log("Start Time: 1753991354");
            console.log("End Time: 1753991954");
            console.log("Duration: 10 minutes");
            console.log("Parts: 5 executions");
            
            if (block.timestamp < 1753991354) {
                console.log("⏱️  Waiting for start time...");
                console.log("Starts in:", 1753991354 - block.timestamp, "seconds");
            } else if (block.timestamp <= 1753991954) {
                console.log("🚀 EXECUTION WINDOW ACTIVE!");
                console.log("Time remaining:", 1753991954 - block.timestamp, "seconds");
            } else {
                console.log("⏰ Execution window has ended");
            }
            
        } else {
            console.log("❌ Order not found or cancelled");
        }
    }
}
