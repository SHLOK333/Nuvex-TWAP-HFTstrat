// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import {DelegatedWallet} from "../src/Firstdraft.sol";

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
    function allowance(address, address) external view returns (uint256);
}

// 1inch V6 AggregationRouterV6 interface
interface I1inchRouter {
    struct SwapDescription {
        address srcToken;
        address dstToken;
        address srcReceiver;
        address dstReceiver;
        uint256 amount;
        uint256 minReturnAmount;
        uint256 flags;
    }
    
    function swap(
        address executor,
        SwapDescription calldata desc,
        bytes calldata permit,
        bytes calldata data
    ) external payable returns (uint256 returnAmount, uint256 spentAmount);
}

contract Execute1inchIntegration is Script {
    // Contract addresses
    address constant IMPLEMENTATION_ADDRESS = 0x3710eb4783a591120b9e403cbE988AcD9E75721d;
    
    // 1inch Router V6 on Sepolia (you'll need to deploy or find the correct address)
    address constant ONEINCH_ROUTER = 0x111111125421cA6dc452d289314280a0f8842A65;
    
    function run() external {
        uint256 USER_PK = vm.envUint("USER_PK");
        address USER = vm.addr(USER_PK);
        
        // Test token addresses
        address TEST_USDC = vm.envAddress("TEST_USDC_ADDRESS");
        address TEST_1INCH = vm.envAddress("TEST_1INCH_ADDRESS");
        
        console.log("=== 1INCH DEX INTEGRATION TEST ===");
        console.log("User Address:", USER);
        console.log("TestUSDC:", TEST_USDC);
        console.log("Test1INCH:", TEST_1INCH);
        console.log("1inch Router:", ONEINCH_ROUTER);
        
        // Check initial balances
        IERC20 testUSDC = IERC20(TEST_USDC);
        IERC20 test1INCH = IERC20(TEST_1INCH);
        
        uint256 usdcBalanceBefore = testUSDC.balanceOf(USER);
        uint256 oneinchBalanceBefore = test1INCH.balanceOf(USER);
        
        console.log("Initial Balances:");
        console.log("- TestUSDC:", usdcBalanceBefore / 1e18);
        console.log("- Test1INCH:", oneinchBalanceBefore / 1e18);
        
        vm.startBroadcast(USER_PK);
        
        // Set up EIP-7702 delegation
        vm.signAndAttachDelegation(IMPLEMENTATION_ADDRESS, USER_PK);
        
        // Create DelegatedWallet interface
        DelegatedWallet wallet = DelegatedWallet(payable(USER));
        
        // Get current nonce
        uint256 currentNonce = wallet.nonce();
        console.log("Current wallet nonce:", currentNonce);
        
        // First, approve 1inch router to spend our tokens
        console.log("=== SETTING UP 1INCH APPROVALS ===");
        
        // Check current allowance
        uint256 currentAllowance = testUSDC.allowance(USER, ONEINCH_ROUTER);
        console.log("Current USDC allowance to 1inch:", currentAllowance / 1e18);
        
        if (currentAllowance < 10 * 1e18) {
            // Approve 1inch router to spend TestUSDC
            testUSDC.approve(ONEINCH_ROUTER, type(uint256).max);
            console.log("Approved 1inch router for unlimited TestUSDC");
        }
        
        // Create a limit order: 5 TestUSDC via 1inch
        DelegatedWallet.SwapOrder memory swapOrder = DelegatedWallet.SwapOrder({
            tokenOut: TEST_USDC,
            tokenIn: TEST_1INCH,
            amountOut: 5 * 1e18, // 5 TestUSDC
            minAmountIn: 3 * 1e18, // At least 3 Test1INCH
            timestamp: block.timestamp,
            expiration: block.timestamp + 1 hours,
            nonce: currentNonce,
            startPremiumBps: 0,
            decayRateBps: 50,
            decayInterval: 300
        });
        
        console.log("=== CREATING 1INCH LIMIT ORDER ===");
        console.log("Selling:", swapOrder.amountOut / 1e18, "TestUSDC");
        console.log("For at least:", swapOrder.minAmountIn / 1e18, "Test1INCH");
        
        // Create order signature
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(
                    abi.encode(
                        address(wallet),
                        swapOrder.tokenOut,
                        swapOrder.tokenIn,
                        swapOrder.amountOut,
                        swapOrder.minAmountIn,
                        swapOrder.timestamp,
                        swapOrder.expiration,
                        swapOrder.nonce,
                        block.chainid,
                        keccak256(
                            abi.encode(
                                swapOrder.startPremiumBps,
                                swapOrder.decayRateBps,
                                swapOrder.decayInterval
                            )
                        )
                    )
                )
            )
        );
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(USER_PK, messageHash);
        bytes memory userSig = abi.encodePacked(r, s, v);
        
        // Create 1inch swap call
        // Note: In production, you'd get this data from 1inch API
        // This is a simplified version for demonstration
        I1inchRouter.SwapDescription memory desc = I1inchRouter.SwapDescription({
            srcToken: TEST_USDC,
            dstToken: TEST_1INCH,
            srcReceiver: ONEINCH_ROUTER,
            dstReceiver: USER,
            amount: swapOrder.amountOut,
            minReturnAmount: swapOrder.minAmountIn,
            flags: 0
        });
        
        // Create the 1inch call data
        bytes memory swapData = abi.encodeWithSignature(
            "swap(address,(address,address,address,address,uint256,uint256,uint256),bytes,bytes)",
            address(0), // executor
            desc,
            "", // permit
            "" // data
        );
        
        DelegatedWallet.Call memory oneinchCall = DelegatedWallet.Call({
            to: ONEINCH_ROUTER,
            value: 0,
            data: swapData
        });
        
        console.log("=== EXECUTING VIA 1INCH AGGREGATOR ===");
        
        try wallet.executeSwap(swapOrder, oneinchCall, userSig) returns (bytes memory result) {
            console.log("[SUCCESS] 1inch swap executed successfully!");
            
            // Check final balances
            uint256 usdcBalanceAfter = testUSDC.balanceOf(USER);
            uint256 oneinchBalanceAfter = test1INCH.balanceOf(USER);
            
            console.log("=== 1INCH SWAP RESULTS ===");
            console.log("Initial TestUSDC:", usdcBalanceBefore / 1e18);
            console.log("Final TestUSDC:", usdcBalanceAfter / 1e18);
            
            if (usdcBalanceBefore > usdcBalanceAfter) {
                console.log("TestUSDC Traded:", (usdcBalanceBefore - usdcBalanceAfter) / 1e18);
            }
            
            console.log("Initial Test1INCH:", oneinchBalanceBefore / 1e18);
            console.log("Final Test1INCH:", oneinchBalanceAfter / 1e18);
            
            if (oneinchBalanceAfter > oneinchBalanceBefore) {
                console.log("Test1INCH Received:", (oneinchBalanceAfter - oneinchBalanceBefore) / 1e18);
                
                uint256 usdcTraded = usdcBalanceBefore - usdcBalanceAfter;
                uint256 oneinchReceived = oneinchBalanceAfter - oneinchBalanceBefore;
                
                if (usdcTraded > 0) {
                    console.log("Effective Rate:", (oneinchReceived * 100) / usdcTraded, "% T1INCH per TUSDC");
                }
            }
            
            console.log("*** 1INCH INTEGRATION SUCCESSFUL! ***");
            console.log("Your DelegatedWallet is now connected to 1inch aggregator!");
            
        } catch Error(string memory reason) {
            console.log("[ERROR] 1inch swap failed:", reason);
            console.log("This might be expected on Sepolia as 1inch may not be deployed");
            console.log("Recommendation: Use this pattern on Mainnet/Optimism/Polygon");
        } catch (bytes memory lowLevelData) {
            console.log("[ERROR] 1inch swap failed with low-level error");
            console.logBytes(lowLevelData);
            console.log("Note: 1inch V6 might not be available on Sepolia testnet");
        }
        
        vm.stopBroadcast();
        
        console.log("=== 1INCH INTEGRATION TEST COMPLETE ===");
        console.log("Next: Deploy on Mainnet for full 1inch functionality!");
    }
}
