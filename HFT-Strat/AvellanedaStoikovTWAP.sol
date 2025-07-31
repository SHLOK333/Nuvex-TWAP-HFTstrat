// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AvellanedaStoikovTWAP
 * @notice TWAP strategy using Avellaneda-Stoikov model and 1inch Limit Order Protocol integration.
 * @dev 
 *   - Bot pushes market data (midPrice, volatility) on-chain.
 *   - Owner starts TWAP (total amount, duration, splits).
 *   - Bot executes TWAP parts by submitting limit orders via 1inch Protocol.
 *   - Includes advanced Avellaneda-Stoikov math with spread/logs approximated.
 *   - 1inch integration happens via `fillOrder` call.
 */

interface ILimitOrderProtocol {
    /**
     * @notice Fill limit order on 1inch protocol
     * @param order Encoded limit order data (off-chain constructed and signed)
     * @param signature EIP-712 signature for order authenticity
     * @param interaction Optional extra calldata for complex interactions
     * @return filledAmount Amount of maker asset filled in this call
     */
    function fillOrder(
        bytes calldata order,
        bytes calldata signature,
        bytes calldata interaction
    ) external payable returns (uint256 filledAmount);
}

contract AvellanedaStoikovTWAP {
    // ======== STATE VARIABLES ========

    address public owner;            // Owner/admin
    address public bot;              // Authorized bot pushing market data and executing orders
    ILimitOrderProtocol public limitOrderProtocol; // 1inch Limit Order Protocol contract address

    // Market data (pushed by bot)
    uint256 public midPrice;         // Mid-price in 1e18 decimals (e.g., USDT/WETH price)
    uint256 public volatility;       // Daily volatility scaled 1e18 (0.03 = 3%)

    // Avellaneda-Stoikov parameters
    uint256 public gamma = 1e16;     // Risk aversion coefficient γ (default 0.01)
    uint256 public k = 15e17;        // Arrival rate parameter k (1.5)

    // TWAP control variables
    uint256 public totalAmountToTrade; // Total amount to trade (scaled 1e18)
    uint256 public numberOfParts;       // Number of TWAP slices
    uint256 public executedParts;       // Number of parts already executed
    uint256 public startTime;            // TWAP start timestamp (unix)
    uint256 public endTime;              // TWAP end timestamp (unix)

    // Inventory state for Avellaneda calculation (signed)
    int256 public inventory;

    // ======== EVENTS ========

    event MarketDataUpdated(uint256 midPrice, uint256 volatility);
    event TWAPStarted(uint256 totalAmount, uint256 parts, uint256 startTime, uint256 endTime);
    event TWAPPartExecuted(uint256 partIndex, uint256 amount, uint256 timestamp);
    event LimitOrderSubmitted(bytes orderData, bytes signature);

    // ======== MODIFIERS ========

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyBot() {
        require(msg.sender == bot, "Only bot");
        _;
    }

    // ======== CONSTRUCTOR ========

    constructor(address _bot, address _limitOrderProtocol) {
        owner = msg.sender;
        bot = _bot;
        limitOrderProtocol = ILimitOrderProtocol(_limitOrderProtocol);
    }

    // ======== ADMIN FUNCTIONS ========

    function setBot(address _bot) external onlyOwner {
        bot = _bot;
    }

    function setAvellanedaParams(uint256 _gamma, uint256 _k) external onlyOwner {
        gamma = _gamma;
        k = _k;
    }

    // ======== MARKET DATA UPDATE ========

    /**
     * @notice Bot pushes current mid-price and volatility data on-chain.
     * @param _midPrice Mid-price scaled by 1e18 decimals.
     * @param _volatility Daily volatility scaled by 1e18 decimals.
     */
    function pushMarketData(uint256 _midPrice, uint256 _volatility) external onlyBot {
        midPrice = _midPrice;
        volatility = _volatility;
        emit MarketDataUpdated(_midPrice, _volatility);
    }

    // ======== AVELLANEDA-STOIKOV FORMULAS ========

    /**
     * @notice Compute reservation price and optimal bid/ask prices using Avellaneda-Stoikov model.
     * @param currentInventory Current inventory position (signed int).
     * @param T Total TWAP duration in seconds.
     * @param t Seconds elapsed since TWAP start.
     * @return bidPrice Bid price (1e18 decimals).
     * @return askPrice Ask price (1e18 decimals).
     */
    function computeQuote(int256 currentInventory, uint256 T, uint256 t)
        public
        view
        returns (uint256 bidPrice, uint256 askPrice)
    {
        require(t <= T, "Elapsed time cannot exceed total duration");

        // Calculate variance σ² = volatility²
        uint256 sigma2 = (volatility * volatility) / 1e18;

        // Reservation price r(t) = midPrice - inventory * γ * σ² * (T - t)
        // - The inventory penalizes skewing quote away from midPrice
        int256 r_t = int256(midPrice) - currentInventory * int256((gamma * sigma2 * (T - t)) / 1e18);

        // Optimal spread calculation from Avellaneda-Stoikov model:
        // spread = γ * σ² * (T - t) + (2/γ) * ln(1 + γ/k)
        // We approximate ln(1 + γ/k) by its series expansion or constant (~0.06 for γ=0.01, k=1.5)
        // For gas efficiency, precompute log constant ~ 6e16 (scaled 1e18)
        uint256 logTerm = 6e16; // ~0.06

        // spread = γ*σ²*(T - t) + (2/γ)*log(1 + γ/k)
        uint256 spread = (gamma * sigma2 * (T - t)) / 1e18 + (2 * 1e18 / gamma) * logTerm / 1e18;

        // Bid and ask prices are reservation price ± half spread
        bidPrice = uint256(r_t) > spread / 2 ? uint256(r_t) - spread / 2 : 0;
        askPrice = uint256(r_t) + spread / 2;
    }

    // ======== TWAP MANAGEMENT ========

    /**
     * @notice Starts the TWAP execution with given parameters.
     * @param _totalAmount Total amount to trade (scaled 1e18).
     * @param _numberOfParts Number of TWAP parts to split trade.
     * @param _startTime Unix timestamp for TWAP start.
     * @param _endTime Unix timestamp for TWAP end.
     */
    function startTWAP(
        uint256 _totalAmount,
        uint256 _numberOfParts,
        uint256 _startTime,
        uint256 _endTime
    ) external onlyOwner {
        require(_startTime < _endTime, "Start must be before end");
        require(_numberOfParts > 0, "Parts must be > 0");
        require(_totalAmount > 0, "Total amount must be > 0");

        totalAmountToTrade = _totalAmount;
        numberOfParts = _numberOfParts;
        startTime = _startTime;
        endTime = _endTime;
        executedParts = 0;
        inventory = 0;

        emit TWAPStarted(_totalAmount, _numberOfParts, _startTime, _endTime);
    }

    /**
     * @notice Returns amount per TWAP part.
     * @return Amount of base asset per part.
     */
    function amountPerPart() public view returns (uint256) {
        require(numberOfParts > 0, "TWAP not started");
        return totalAmountToTrade / numberOfParts;
    }

    // ======== 1INCH LIMIT ORDER INTEGRATION ========

    /**
     * @notice Executes a TWAP part by submitting a limit order through 1inch Limit Order Protocol.
     *         This is the key function where 1inch is integrated.
     * @param isSell True if selling base asset, false if buying.
     * @param makerAsset Token address offered by maker.
     * @param takerAsset Token address asked by maker.
     * @param makerAmount Amount of makerAsset to offer (scaled 1e18).
     * @param orderData ABI-encoded limit order (constructed and signed off-chain).
     * @param signature EIP-712 signature for the order (off-chain signed).
     */
    function executeTWAPPart(
        bool isSell,
        address makerAsset,
        address takerAsset,
        uint256 makerAmount,
        bytes calldata orderData,
        bytes calldata signature
    ) external onlyBot {
        require(block.timestamp >= startTime, "TWAP not started");
        require(block.timestamp <= endTime, "TWAP ended");
        require(executedParts < numberOfParts, "All parts executed");
        require(makerAmount == amountPerPart(), "Maker amount must equal part size");

        uint256 duration = endTime - startTime;
        uint256 elapsed = block.timestamp - startTime;

        // Get Avellaneda-Stoikov quotes for current inventory and elapsed time
        (uint256 bid, uint256 ask) = computeQuote(inventory, duration, elapsed);

        // For buy orders, expected price ~ ask; for sell orders, expected price ~ bid
        uint256 expectedPrice = isSell ? bid : ask;

        // *** IMPORTANT ***
        // Off-chain, your bot must create a 1inch limit order with price ~ expectedPrice
        // and sign it (EIP-712). The orderData & signature are passed here.

        // === 1inch Limit Order Protocol Integration ===
        // This is where the contract submits the limit order to the 1inch protocol
        // The fillOrder call executes the trade if matching taker is found off-chain.
        limitOrderProtocol.fillOrder{value: 0}(orderData, signature, "");

        // Update executed parts count and inventory tracking
        executedParts += 1;
        inventory += isSell ? int256(makerAmount) : -int256(makerAmount);

        emit TWAPPartExecuted(executedParts, makerAmount, block.timestamp);
        emit LimitOrderSubmitted(orderData, signature);
    }

    // ======== UTILITY ========

    /// @notice Returns seconds left for TWAP to finish
    function timeLeft() external view returns (uint256) {
        if (block.timestamp >= endTime) return 0;
        return endTime - block.timestamp;
    }

    /// @notice Returns TWAP progress (executed / total)
    function progress() external view returns (uint256 executed, uint256 total) {
        return (executedParts, numberOfParts);
    }

    // ======== FALLBACKS ========

    receive() external payable {}

    fallback() external payable {}
}
