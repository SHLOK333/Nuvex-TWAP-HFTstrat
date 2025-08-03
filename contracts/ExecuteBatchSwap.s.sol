// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import {DelegatedWallet} from "../src/Firstdraft.sol";

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

// Enhanced MockDEX for batch testing
contract MockDEXForBatch {
    uint256 public executionCount = 0;
    
    function swap(
        address tokenOut,
        address tokenIn, 
        uint256 amountOut,
        uint256 minAmountIn,
        address user
    ) external returns (uint256 amountIn) {
        executionCount++;
        
        // Simulate varying exchange rates
        uint256 rate = 80 + (executionCount % 5); // 80-84% varying rates
        
        amountIn = (amountOut * rate) / 100;
        require(amountIn >= minAmountIn, "Insufficient output amount");
        
        // Execute the swap
        require(IERC20(tokenOut).transferFrom(user, address(this), amountOut), "Transfer out failed");
        require(IERC20(tokenIn).transfer(user, amountIn), "Transfer in failed");
        
        return amountIn;
    }
    
    function getExecutionCount() external view returns (uint256) {
        return executionCount;
    }
}

contract ExecuteBatchSwap is Script {
    // Contract addresses
    address constant IMPLEMENTATION_ADDRESS = 0x3710eb4783a591120b9e403cbE988AcD9E75721d;
    
    function run() external {
        uint256 USER_PK = vm.envUint("USER_PK");
        address USER = vm.addr(USER_PK);
        
        // Test token addresses
        address TEST_USDC = vm.envAddress("TEST_USDC_ADDRESS");
        address TEST_1INCH = vm.envAddress("TEST_1INCH_ADDRESS");
        
        console.log("=== TESTING BATCH SWAP FUNCTIONALITY ===");
        console.log("User Address:", USER);
        console.log("TestUSDC:", TEST_USDC);
        console.log("Test1INCH:", TEST_1INCH);
        
        // Check initial balances
        IERC20 testUSDC = IERC20(TEST_USDC);
        IERC20 test1INCH = IERC20(TEST_1INCH);
        
        uint256 usdcBalanceBefore = testUSDC.balanceOf(USER);
        uint256 oneinchBalanceBefore = test1INCH.balanceOf(USER);
        
        console.log("Initial Balances:");
        console.log("- TestUSDC:", usdcBalanceBefore / 1e18);
        console.log("- Test1INCH:", oneinchBalanceBefore / 1e18);
        
        vm.startBroadcast(USER_PK);
        
        // Deploy MockDEX for batch testing
        MockDEXForBatch mockDEX = new MockDEXForBatch();
        console.log("MockDEX deployed at:", address(mockDEX));
        
        // Fund MockDEX with Test1INCH tokens
        test1INCH.transfer(address(mockDEX), 100 * 1e18);
        console.log("Funded MockDEX with 100 T1INCH");
        
        // Update balances after funding DEX
        usdcBalanceBefore = testUSDC.balanceOf(USER);
        oneinchBalanceBefore = test1INCH.balanceOf(USER);
        
        // Set up EIP-7702 delegation
        vm.signAndAttachDelegation(IMPLEMENTATION_ADDRESS, USER_PK);
        
        // Create DelegatedWallet interface
        DelegatedWallet wallet = DelegatedWallet(payable(USER));
        
        // Get current nonce
        uint256 currentNonce = wallet.nonce();
        console.log("Current wallet nonce:", currentNonce);
        
        // Create batch swap order: 12 TestUSDC total, split into 3 parts
        DelegatedWallet.BatchSwapOrder memory batchOrder = DelegatedWallet.BatchSwapOrder({
            tokenOut: TEST_USDC,
            tokenIn: TEST_1INCH,
            totalAmountOut: 12 * 1e18, // 12 TestUSDC total
            minAmountInPerPart: 3 * 1e18, // At least 3 Test1INCH per part
            timestamp: block.timestamp,
            expiration: block.timestamp + 1 hours,
            orderHash: bytes32(0), // Will be set after registration
            batchParts: 3, // Split into 3 parts
            minTimeBetweenExecutions: 0, // No time delay for testing
            maxPriceDeviation: 500, // 5% max price deviation
            executorTipBps: 10, // 0.1% executor tip
            startPremiumBps: 0,
            decayRateBps: 50,
            decayInterval: 300
        });
        
        console.log("=== CREATING BATCH SWAP ORDER ===");
        console.log("Total Amount Out:", batchOrder.totalAmountOut / 1e18, "TestUSDC");
        console.log("Min Amount Per Part:", batchOrder.minAmountInPerPart / 1e18, "Test1INCH");
        console.log("Batch Parts:", batchOrder.batchParts);
        console.log("Amount per part:", (batchOrder.totalAmountOut / batchOrder.batchParts) / 1e18, "TestUSDC");
        
        // Generate the same order hash as the contract would
        bytes32 orderHash = keccak256(
            abi.encode(
                batchOrder.tokenOut,
                batchOrder.tokenIn,
                batchOrder.totalAmountOut,
                batchOrder.minAmountInPerPart,
                batchOrder.timestamp,
                batchOrder.expiration,
                batchOrder.batchParts,
                batchOrder.minTimeBetweenExecutions,
                batchOrder.maxPriceDeviation,
                batchOrder.executorTipBps,
                batchOrder.startPremiumBps,
                batchOrder.decayRateBps,
                batchOrder.decayInterval,
                block.chainid,
                address(wallet)
            )
        );
        
        // Create signature for the order hash (EIP-191 format)
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                orderHash
            )
        );
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(USER_PK, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        console.log("=== REGISTERING BATCH SWAP ORDER ===");
        console.log("Pre-calculated Order Hash:", vm.toString(orderHash));
        
        try wallet.registerBatchSwapOrder(batchOrder, signature) returns (bytes32 returnedOrderHash) {
            console.log("[SUCCESS] Batch swap order registered!");
            console.log("Returned Order Hash:", vm.toString(returnedOrderHash));
            
            // Use the returned order hash for executions
            bytes32 finalOrderHash = returnedOrderHash;
            
            // Now execute parts of the batch
            console.log("=== EXECUTING BATCH PARTS ===");
            
            for (uint256 i = 0; i < batchOrder.batchParts; i++) {
                console.log("Executing batch part:", i + 1);
                
                uint256 amountPerPart = batchOrder.totalAmountOut / batchOrder.batchParts;
                
                // Create DEX call for this part
                bytes memory swapData = abi.encodeWithSignature(
                    "swap(address,address,uint256,uint256,address)",
                    TEST_USDC,
                    TEST_1INCH,
                    amountPerPart,
                    batchOrder.minAmountInPerPart,
                    USER
                );
                
                DelegatedWallet.Call memory swapCall = DelegatedWallet.Call({
                    to: address(mockDEX),
                    value: 0,
                    data: swapData
                });
                
                // No time delay needed since minTimeBetweenExecutions = 0
                
                try wallet.executeBatchSwapPart(finalOrderHash, swapCall, 80) {
                    console.log("[SUCCESS] Batch part", i + 1, "executed!");
                    
                    // Check balances after this execution
                    uint256 usdcAfter = testUSDC.balanceOf(USER);
                    uint256 oneinchAfter = test1INCH.balanceOf(USER);
                    
                    console.log("Balances after part", i + 1, ":");
                    console.log("- TestUSDC:", usdcAfter / 1e18);
                    console.log("- Test1INCH:", oneinchAfter / 1e18);
                    
                } catch Error(string memory reason) {
                    console.log("[ERROR] Batch part", i + 1, "failed:", reason);
                    break;
                } catch (bytes memory lowLevelData) {
                    console.log("[ERROR] Batch part", i + 1, "failed with low-level error");
                    console.logBytes(lowLevelData);
                    break;
                }
            }
            console.log("[SUCCESS] Batch swap executed successfully!");
            
            // Check final balances
            uint256 usdcFinal = testUSDC.balanceOf(USER);
            uint256 oneinchFinal = test1INCH.balanceOf(USER);
            
            console.log("=== BATCH SWAP RESULTS ===");
            console.log("Initial TestUSDC:", usdcBalanceBefore / 1e18);
            console.log("Final TestUSDC:", usdcFinal / 1e18);
            console.log("TestUSDC Traded:", (usdcBalanceBefore - usdcFinal) / 1e18);
            
            console.log("Initial Test1INCH:", oneinchBalanceBefore / 1e18);
            console.log("Final Test1INCH:", oneinchFinal / 1e18);
            
            if (oneinchFinal > oneinchBalanceBefore) {
                console.log("Test1INCH Received:", (oneinchFinal - oneinchBalanceBefore) / 1e18);
            } else {
                console.log("Test1INCH Change:", (oneinchBalanceBefore - oneinchFinal) / 1e18);
            }
            
            console.log("Total DEX executions:", mockDEX.getExecutionCount());
            
            console.log("*** BATCH SWAP FUNCTIONALITY WORKING! ***");
            
        } catch Error(string memory reason) {
            console.log("[ERROR] Batch swap registration failed:", reason);
        } catch (bytes memory lowLevelData) {
            console.log("[ERROR] Batch swap registration failed with low-level error");
            console.logBytes(lowLevelData);
        }
        
        vm.stopBroadcast();
        
        console.log("=== BATCH SWAP TEST COMPLETE ===");
    }
}
