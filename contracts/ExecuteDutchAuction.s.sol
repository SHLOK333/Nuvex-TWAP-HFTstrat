// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import "../src/DutchAuctionUpgrade.sol";

contract ExecuteDutchAuction is Script {
    function run() external {
        // Contract addresses
        address dutchAuctionContract = vm.envAddress("DUTCH_AUCTION_CONTRACT");
        bytes32 orderHash = vm.envBytes32("ORDER_HASH");
        
        vm.startBroadcast();
        
        DutchAuctionUpgrade dutchAuction = DutchAuctionUpgrade(dutchAuctionContract);
        
        // Get current auction price
        (uint256 currentPrice, uint256 premiumBps) = dutchAuction.getCurrentAuctionPrice(orderHash);
        console.log("Current auction price:", currentPrice);
        console.log("Current premium (bps):", premiumBps);
        
        // Check if auction is active
        (,, bool isActive,,) = dutchAuction.getDutchAuctionStatus(orderHash);
        
        if (!isActive) {
            console.log("Auction is not active");
            return;
        }
        
        // Example swap data - replace with actual DEX call data
        bytes memory swapData = abi.encodeWithSignature(
            "executeSwap(address,address,uint256,uint256)",
            vm.envAddress("TOKEN_OUT"),
            vm.envAddress("TOKEN_IN"), 
            vm.envUint("AMOUNT_OUT"),
            currentPrice
        );
        
        // Execute the Dutch auction
        bool success = dutchAuction.executeDutchAuctionOrder(orderHash, swapData);
        
        if (success) {
            console.log("Dutch auction executed successfully!");
        } else {
            console.log("Dutch auction execution failed");
        }
        
        vm.stopBroadcast();
    }
}
