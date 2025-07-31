// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import "../src/Firstdraft.sol";

/**
 * Execute TWAP Order Test with Small Amounts
 * 
 * This script demonstrates the core TWAP functionality:
 * - Split 0.1 USDT into 5 parts (0.02 USDT each)
 * - Execute over 10 minutes (2 minute intervals)
 * - Convert USDT to WETH via 1inch
 * - Uses real mainnet liquidity
 */
contract ExecuteTWAPTest is Script {
    
    address wallet;
    address usdt;
    address weth;
    
    address user;
    address executor;
    
    function run() external {
        // Setup addresses
        user = vm.addr(vm.envUint("USER_PK"));
        executor = vm.addr(vm.envUint("EXECUTOR_PK"));
        
        wallet = payable(vm.envAddress("DELEGATED_WALLET_ADDRESS"));
        usdt = vm.envAddress("USDC_ADDRESS");
        weth = vm.envAddress("WETH_ADDRESS");
        
        console.log("=== TWAP TEST WITH SMALL AMOUNTS ===");
        console.log("User:", user);
        console.log("Executor:", executor);
        console.log("Wallet:", wallet);
        console.log("USDT:", usdt);
        console.log("WETH:", weth);
        
        // Check balances using direct calls
        (, bytes memory usdtBalanceData) = usdt.staticcall(abi.encodeWithSignature("balanceOf(address)", user));
        (, bytes memory wethBalanceData) = weth.staticcall(abi.encodeWithSignature("balanceOf(address)", user));
        
        uint256 usdtBalance = abi.decode(usdtBalanceData, (uint256));
        uint256 wethBalance = abi.decode(wethBalanceData, (uint256));
        uint256 userEthBalance = user.balance;
        
        console.log("\n=== CURRENT BALANCES ===");
        console.log("User USDT Balance (6 decimals):", usdtBalance);
        console.log("User USDT Balance (display):", usdtBalance / 1e6);
        console.log("User WETH Balance:", wethBalance / 1e18);
        console.log("User ETH Balance:", userEthBalance / 1e18);
        
        // Validate sufficient funds
        require(usdtBalance >= 100000, "Need at least 0.1 USDT for TWAP test");
        require(userEthBalance >= 0.01 ether, "Need at least 0.01 ETH for gas");
        
        console.log("\nSUCCESS: Sufficient funds for TWAP testing!");
        
        // Create TWAP Order
        createTWAPOrder();
    }
    
    function createTWAPOrder() internal {
        console.log("\n=== CREATING TWAP ORDER ===");
        
        // TWAP Parameters
        uint256 totalUSDT = 100000; // 0.1 USDT (6 decimals)
        uint256 minWETH = 30000000000000; // ~0.00003 WETH (18 decimals)
        uint8 twapParts = 5; // 5 separate executions
        uint32 twapDuration = 600; // 10 minutes total
        uint16 maxDeviation = 500; // 5% max price deviation
        uint16 tipBps = 10; // 0.1% executor tip
        
        console.log("Total USDT Amount (raw):", totalUSDT);
        console.log("Total USDT Amount (display):", totalUSDT / 1e6);
        console.log("Min WETH Expected:", minWETH / 1e18);
        console.log("TWAP Parts:", twapParts);
        console.log("Duration:", twapDuration / 60);
        console.log("Max Price Deviation:", maxDeviation / 100);
        console.log("Executor Tip:", tipBps / 100);
        
        vm.startBroadcast(vm.envUint("USER_PK"));
        
        // Approve USDT to Wallet
        console.log("\nApproving USDT to Wallet...");
        (bool success,) = usdt.call(abi.encodeWithSignature("approve(address,uint256)", wallet, totalUSDT));
        require(success, "USDT approval failed");
        
        // Create TWAP Order struct
        DelegatedWallet.LimitOrder memory twapOrder = DelegatedWallet.LimitOrder({
            makerAsset: usdt,
            takerAsset: weth,
            makingAmount: totalUSDT,
            takingAmount: minWETH,
            salt: uint256(keccak256(abi.encodePacked(block.timestamp, user))),
            expiration: uint256(block.timestamp + twapDuration + 300), // Extra 5 minutes buffer
            allowPartialFill: true,
            twapStartTime: uint256(block.timestamp + 60), // Start in 1 minute
            twapEndTime: uint256(block.timestamp + 60 + twapDuration),
            twapParts: twapParts,
            maxPriceDeviation: maxDeviation,
            executorTipBps: tipBps
        });
        
        // Register TWAP Order
        console.log("\nRegistering TWAP Order...");
        
        // Create proper signature for the limit order
        bytes32 messageHash = keccak256(
            abi.encode(
                wallet,
                twapOrder.makerAsset,
                twapOrder.takerAsset,
                twapOrder.makingAmount,
                twapOrder.takingAmount,
                twapOrder.salt,
                twapOrder.expiration,
                twapOrder.allowPartialFill,
                block.chainid
            )
        );
        
        // Sign with user's private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(vm.envUint("USER_PK"), messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        bytes memory extension = ""; // No extension needed for basic TWAP
        uint256 currentPrice = 3000 * 1e18; // Assume 1 ETH = 3000 USDC
        
        try wallet.registerTWAPOrderOnChain(twapOrder, signature, currentPrice, extension) returns (bytes32 orderHash) {
            console.log("SUCCESS: TWAP Order registered!");
            console.log("Order Hash:", vm.toString(orderHash));
            console.log("Order will execute in parts:", twapParts);
            console.log("Duration in minutes:", twapDuration / 60);
            console.log("Each part trades USDT:", totalUSDT / twapParts / 1e6);
            
            vm.stopBroadcast();
            
            // Show execution instructions
            showExecutionInstructions(orderHash);
            
        } catch Error(string memory reason) {
            console.log("ERROR registering TWAP:");
            console.log(reason);
            vm.stopBroadcast();
        } catch (bytes memory) {
            console.log("ERROR: Transaction reverted with empty reason");
            console.log("This could be due to:");
            console.log("1. Contract not properly initialized");
            console.log("2. Insufficient gas");
            console.log("3. Invalid parameters");
            console.log("4. Missing contract dependencies");
            vm.stopBroadcast();
        }
    }
    
    function showExecutionInstructions(bytes32 orderHash) internal view {
        console.log("\n=== TWAP EXECUTION INSTRUCTIONS ===");
        console.log("Your TWAP order is now registered and ready!");
        console.log("Order Hash:", vm.toString(orderHash));
        
        console.log("\nTo execute TWAP parts manually:");
        console.log("1. Wait 1 minute for start time");
        console.log("2. Run execution script every 2 minutes:");
        console.log("   forge script script/ExecuteTWAPPart.s.sol --broadcast");
        console.log("3. Monitor progress on Arbiscan");
        
        console.log("\nOr use the automated TWAP executor:");
        console.log("   npm run build && node dist/scripts/twap-auto-executor.js");
        
        console.log("\n=== EXPECTED RESULTS ===");
        console.log("- 5 separate transactions over 10 minutes");
        console.log("- Each trades ~0.02 USDT for WETH");
        console.log("- Executors earn 0.1% tip per execution");
        console.log("- Price protection prevents bad fills");
        console.log("- User gets WETH distributed over time");
        
        console.log("\n=== LIVE MONITORING ===");
        console.log("Watch transactions at:");
        console.log("https://arbiscan.io/address/", wallet);
        console.log("Monitor TWAP progress and execution timing!");
    }
}
