// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import {DelegatedWallet} from "../src/Firstdraft.sol";

// Simple ERC20 for testing
contract TestToken {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;
    
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    
    constructor(string memory _name, string memory _symbol, uint256 _totalSupply) {
        name = _name;
        symbol = _symbol;
        totalSupply = _totalSupply * 10**decimals;
        balanceOf[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }
    
    function transfer(address to, uint256 value) external returns (bool) {
        require(balanceOf[msg.sender] >= value, "Insufficient balance");
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }
    
    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }
    
    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        require(balanceOf[from] >= value, "Insufficient balance");
        require(allowance[from][msg.sender] >= value, "Insufficient allowance");
        
        balanceOf[from] -= value;
        balanceOf[to] += value;
        allowance[from][msg.sender] -= value;
        
        emit Transfer(from, to, value);
        return true;
    }
    
    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}

contract DeployTestTokens is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("SPONSOR_PK"); // Use sponsor instead
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("=== DEPLOYING TEST TOKENS ON SEPOLIA ===");
        console.log("Deployer:", deployer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy TestUSDC (6 decimals like real USDC)
        TestToken testUSDC = new TestToken("Test USDC", "TUSDC", 1000000); // 1M USDC
        console.log("TestUSDC deployed at:", address(testUSDC));
        
        // Deploy Test1INCH (18 decimals)
        TestToken test1INCH = new TestToken("Test 1INCH", "T1INCH", 1000000); // 1M 1INCH
        console.log("Test1INCH deployed at:", address(test1INCH));
        
        // Deploy TestWETH (18 decimals)
        TestToken testWETH = new TestToken("Test WETH", "TWETH", 10000); // 10K WETH
        console.log("TestWETH deployed at:", address(testWETH));
        
        // Give some tokens to the user's DelegatedWallet
        address walletAddress = vm.envAddress("DELEGATED_WALLET_ADDRESS");
        
        console.log("\nDistributing tokens to DelegatedWallet:", walletAddress);
        
        testUSDC.transfer(walletAddress, 10000 * 10**6); // 10,000 USDC
        test1INCH.transfer(walletAddress, 1000 * 10**18); // 1,000 1INCH
        testWETH.transfer(walletAddress, 10 * 10**18); // 10 WETH
        
        console.log("Tokens distributed!");
        console.log("- TUSDC Balance:", testUSDC.balanceOf(walletAddress) / 10**6, "TUSDC");
        console.log("- T1INCH Balance:", test1INCH.balanceOf(walletAddress) / 10**18, "T1INCH");
        console.log("- TWETH Balance:", testWETH.balanceOf(walletAddress) / 10**18, "TWETH");
        
        vm.stopBroadcast();
        
        console.log("\n=== ADD TO YOUR .env FILE ===");
        console.log("TEST_USDC_ADDRESS=", address(testUSDC));
        console.log("TEST_1INCH_ADDRESS=", address(test1INCH));
        console.log("TEST_WETH_ADDRESS=", address(testWETH));
        console.log("\n=== TEST TOKENS DEPLOYED SUCCESSFULLY ===");
    }
}
