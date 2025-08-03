// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import "../src/DutchAuctionUpgrade.sol";

contract DeployDutchAuction is Script {
    function run() external {
        // Get the delegated wallet address (your existing contract)
        address delegatedWallet = vm.envAddress("DELEGATED_WALLET_ADDRESS");
        
        vm.startBroadcast();
        
        // Deploy the Dutch Auction upgrade contract
        DutchAuctionUpgrade dutchAuction = new DutchAuctionUpgrade(delegatedWallet);
        
        console.log("Dutch Auction contract deployed at:", address(dutchAuction));
        console.log("Connected to Delegated Wallet at:", delegatedWallet);
        
        vm.stopBroadcast();
    }
}
