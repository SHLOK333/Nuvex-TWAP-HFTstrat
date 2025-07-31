// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function symbol() external view returns (string memory);
    function name() external view returns (string memory);
    function decimals() external view returns (uint8);
}

contract CheckBalances is Script {
    function run() external view {
        address USER = vm.envAddress("DELEGATED_WALLET_ADDRESS");
        address TEST_USDC = vm.envAddress("TEST_USDC_ADDRESS");
        address TEST_1INCH = vm.envAddress("TEST_1INCH_ADDRESS");
        address TEST_WETH = vm.envAddress("TEST_WETH_ADDRESS");
        
        console.log("=== CURRENT TOKEN BALANCES ===");
        console.log("Wallet Address:", USER);
        console.log();
        
        IERC20 testUSDC = IERC20(TEST_USDC);
        IERC20 test1INCH = IERC20(TEST_1INCH);
        IERC20 testWETH = IERC20(TEST_WETH);
        
        uint256 usdcBalance = testUSDC.balanceOf(USER);
        uint256 oneinchBalance = test1INCH.balanceOf(USER);
        uint256 wethBalance = testWETH.balanceOf(USER);
        
        console.log("TestUSDC Balance:", usdcBalance / 1e18, "TUSDC");
        console.log("Test1INCH Balance:", oneinchBalance / 1e18, "T1INCH");
        console.log("TestWETH Balance:", wethBalance / 1e18, "TWETH");
        
        console.log();
        console.log("=== RAW BALANCES ===");
        console.log("TestUSDC (raw):", usdcBalance);
        console.log("Test1INCH (raw):", oneinchBalance);
        console.log("TestWETH (raw):", wethBalance);
        
        console.log();
        console.log("=== TOKEN INFO ===");
        console.log("TestUSDC:", testUSDC.name(), "-", testUSDC.symbol());
        console.log("Test1INCH:", test1INCH.name(), "-", test1INCH.symbol());
        console.log("TestWETH:", testWETH.name(), "-", testWETH.symbol());
    }
}
