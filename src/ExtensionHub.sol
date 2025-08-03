// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// IWETH interface definition
interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}

// ============================================================================
// 1INCH PROTOCOL EXTENSION INTERFACES
// ============================================================================

/// @title Maker predicate interface for order validation
interface IMakerPredicate {
    function isValidPredicate(bytes calldata data) external returns (bool);
}

/// @title Taker predicate interface for execution validation
interface ITakerPredicate {
    function isValidPredicate(bytes calldata data) external returns (bool);
}

/// @title Post-interaction hook interface
interface IPostInteraction {
    function postInteraction(
        address maker,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        bytes calldata interactionData
    ) external;
}

/// @title Advanced maker traits interface
interface IMakerTraitsExtension {
    function buildAdvancedTraits(
        uint256 baseTraits,
        bool allowMultipleFills,
        bool useAmountFlag,
        uint8 seriesNonceManagerIndex,
        uint32 epoch
    ) external pure returns (uint256);
}

/// @title Asset data transformation interface
interface IAssetDataTransform {
    function transformMakerAssetData(
        address asset,
        uint256 amount,
        bytes calldata customData
    ) external view returns (bytes memory);
    
    function transformTakerAssetData(
        address asset,
        uint256 amount,
        bytes calldata customData
    ) external view returns (bytes memory);
}

// ============================================================================
// EXTENSION HUB CONTRACT
// ============================================================================

/**
 * @title ExtensionHub
 * @notice Comprehensive 1inch protocol extension implementation
 * @dev Provides all missing extension functionality for the TWAP trading system
 */
contract ExtensionHub is 
    IMakerPredicate, 
    ITakerPredicate, 
    IPostInteraction, 
    IMakerTraitsExtension,
    IAssetDataTransform,
    ReentrancyGuard,
    Ownable
{
    using SafeERC20 for IERC20;

    // ========================================================================
    // CONSTANTS
    // ========================================================================
    
    /// @notice WETH contract address on Arbitrum
    IWETH public constant WETH = IWETH(0x82aF49447D8a07e3bd95BD0d56f35241523fBab1);
    
    /// @notice Basis points denominator
    uint256 public constant BASIS_POINTS = 10000;
    
    /// @notice Maximum allowed slippage in basis points (10%)
    uint256 public constant MAX_SLIPPAGE = 1000;
    
    /// @notice Maximum fee in basis points (1%)
    uint256 public constant MAX_FEE = 100;

    // ========================================================================
    // STRUCTS
    // ========================================================================

    struct ETHOrder {
        address maker;
        uint256 makingAmount;
        uint256 takingAmount;
        uint256 deadline;
        uint256 salt;
        bool unwrapWeth;
    }

    struct DutchAuctionParams {
        uint256 startPrice;
        uint256 endPrice;
        uint256 startTime;
        uint256 endTime;
        uint256 decayFunction; // 0: linear, 1: exponential
    }

    struct FeeTakerConfig {
        address feeRecipient;
        uint256 feeBps;
        bool takeFeeFromMaking;
        bool enabled;
    }

    struct PredicateConfig {
        bool requiresTimeWindow;
        uint256 minTimeWindow;
        uint256 maxTimeWindow;
        bool requiresPriceValidation;
        uint256 maxPriceDeviation;
        bool requiresWhitelist;
        mapping(address => bool) whitelist;
    }

    struct PostInteractionConfig {
        bool enabled;
        address callbackContract;
        bytes4 callbackSelector;
        uint256 gasLimit;
    }

    // ========================================================================
    // STATE VARIABLES
    // ========================================================================

    /// @notice Fee taker configuration
    FeeTakerConfig public feeTakerConfig;
    
    /// @notice Predicate configurations
    mapping(bytes32 => PredicateConfig) public predicateConfigs;
    
    /// @notice Post-interaction configurations
    mapping(bytes32 => PostInteractionConfig) public postInteractionConfigs;
    
    /// @notice ETH orders mapping
    mapping(bytes32 => ETHOrder) public ethOrders;
    
    /// @notice Dutch auction parameters
    mapping(bytes32 => DutchAuctionParams) public dutchAuctions;
    
    /// @notice Authorized callers for post-interactions
    mapping(address => bool) public authorizedCallers;
    
    /// @notice Emergency pause flag
    bool public paused;

    // ========================================================================
    // EVENTS
    // ========================================================================

    event ETHOrderCreated(bytes32 indexed orderHash, address indexed maker, uint256 makingAmount, uint256 takingAmount);
    event ETHOrderExecuted(bytes32 indexed orderHash, address indexed taker, uint256 executedAmount);
    event DutchAuctionCreated(bytes32 indexed orderHash, uint256 startPrice, uint256 endPrice, uint256 duration);
    event FeeTaken(address indexed recipient, address indexed token, uint256 amount);
    event PostInteractionExecuted(bytes32 indexed orderHash, address indexed callback, bool success);
    event PredicateValidated(bytes32 indexed predicateHash, bool isValid);
    event EmergencyPaused(bool paused);

    // ========================================================================
    // ERRORS
    // ========================================================================

    error ContractPaused();
    error InvalidETHOrder();
    error OrderExpired();
    error InsufficientAmount();
    error InvalidPredicate();
    error UnauthorizedCaller();
    error InvalidFeeConfiguration();
    error PostInteractionFailed();
    error InvalidDutchAuction();

    // ========================================================================
    // MODIFIERS
    // ========================================================================

    modifier notPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedCaller();
        }
        _;
    }

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    constructor() Ownable(msg.sender) {
        // Initialize default fee configuration
        feeTakerConfig = FeeTakerConfig({
            feeRecipient: msg.sender,
            feeBps: 10, // 0.1%
            takeFeeFromMaking: false,
            enabled: true
        });
        
        // Authorize owner as caller
        authorizedCallers[msg.sender] = true;
    }

    // ========================================================================
    // ETH ORDERS EXTENSION
    // ========================================================================

    /**
     * @notice Create an ETH sell order
     * @param order ETH order parameters
     * @return orderHash Hash of the created order
     */
    function createETHOrder(ETHOrder memory order) external payable notPaused returns (bytes32 orderHash) {
        if (order.deadline <= block.timestamp) revert OrderExpired();
        if (order.makingAmount == 0 || order.takingAmount == 0) revert InvalidETHOrder();
        if (msg.value != order.makingAmount) revert InsufficientAmount();

        orderHash = keccak256(abi.encode(order, block.chainid, address(this)));
        ethOrders[orderHash] = order;

        // Wrap ETH to WETH
        WETH.deposit{value: msg.value}();

        emit ETHOrderCreated(orderHash, order.maker, order.makingAmount, order.takingAmount);
    }

    /**
     * @notice Execute an ETH order
     * @param orderHash Hash of the order to execute
     * @param takingAmount Amount to take from the order
     * @param recipient Address to receive the ETH
     */
    function executeETHOrder(
        bytes32 orderHash,
        uint256 takingAmount,
        address payable recipient
    ) external nonReentrant notPaused {
        ETHOrder storage order = ethOrders[orderHash];
        if (order.maker == address(0)) revert InvalidETHOrder();
        if (block.timestamp > order.deadline) revert OrderExpired();

        uint256 makingAmount = (takingAmount * order.makingAmount) / order.takingAmount;
        
        // Transfer tokens from taker
        IERC20(address(WETH)).safeTransferFrom(msg.sender, address(this), takingAmount);

        if (order.unwrapWeth) {
            // Unwrap WETH and send ETH
            WETH.withdraw(makingAmount);
            recipient.transfer(makingAmount);
        } else {
            // Send WETH directly
            IERC20(address(WETH)).safeTransfer(recipient, makingAmount);
        }

        emit ETHOrderExecuted(orderHash, msg.sender, makingAmount);
    }

    // ========================================================================
    // DUTCH AUCTION EXTENSION
    // ========================================================================

    /**
     * @notice Create Dutch auction parameters for an order
     * @param orderHash Hash of the order
     * @param params Dutch auction parameters
     */
    function createDutchAuction(
        bytes32 orderHash,
        DutchAuctionParams memory params
    ) external onlyAuthorized notPaused {
        if (params.startTime >= params.endTime) revert InvalidDutchAuction();
        if (params.startPrice == 0 || params.endPrice == 0) revert InvalidDutchAuction();

        dutchAuctions[orderHash] = params;

        emit DutchAuctionCreated(
            orderHash,
            params.startPrice,
            params.endPrice,
            params.endTime - params.startTime
        );
    }

    /**
     * @notice Calculate current Dutch auction price
     * @param orderHash Hash of the order
     * @return currentPrice Current price based on auction parameters
     */
    function getCurrentDutchPrice(bytes32 orderHash) external view returns (uint256 currentPrice) {
        DutchAuctionParams memory params = dutchAuctions[orderHash];
        
        if (block.timestamp <= params.startTime) {
            return params.startPrice;
        }
        
        if (block.timestamp >= params.endTime) {
            return params.endPrice;
        }

        uint256 elapsed = block.timestamp - params.startTime;
        uint256 duration = params.endTime - params.startTime;

        if (params.decayFunction == 0) {
            // Linear decay
            uint256 priceDecay = ((params.startPrice - params.endPrice) * elapsed) / duration;
            currentPrice = params.startPrice - priceDecay;
        } else {
            // Exponential decay (simplified)
            uint256 decayFactor = (elapsed * BASIS_POINTS) / duration;
            uint256 priceRange = params.startPrice - params.endPrice;
            uint256 exponentialDecay = (priceRange * decayFactor * decayFactor) / (BASIS_POINTS * BASIS_POINTS);
            currentPrice = params.startPrice - exponentialDecay;
        }
    }

    // ========================================================================
    // FEE TAKER EXTENSION
    // ========================================================================

    /**
     * @notice Configure fee taking parameters
     * @param config New fee configuration
     */
    function configureFeeTaker(FeeTakerConfig memory config) external onlyOwner {
        if (config.feeBps > MAX_FEE) revert InvalidFeeConfiguration();
        if (config.feeRecipient == address(0)) revert InvalidFeeConfiguration();

        feeTakerConfig = config;
    }

    /**
     * @notice Take fee from order execution
     * @param token Token to take fee from
     * @param amount Total amount being processed
     * @param fromMaking Whether to take fee from making amount
     * @return feeAmount Amount of fee taken
     */
    function takeFee(
        address token,
        uint256 amount,
        bool fromMaking
    ) external onlyAuthorized nonReentrant returns (uint256 feeAmount) {
        if (!feeTakerConfig.enabled) return 0;
        if (feeTakerConfig.takeFeeFromMaking != fromMaking) return 0;

        feeAmount = (amount * feeTakerConfig.feeBps) / BASIS_POINTS;
        
        if (feeAmount > 0) {
            IERC20(token).safeTransferFrom(msg.sender, feeTakerConfig.feeRecipient, feeAmount);
            emit FeeTaken(feeTakerConfig.feeRecipient, token, feeAmount);
        }
    }

    // ========================================================================
    // MAKER PREDICATE EXTENSION
    // ========================================================================

    /**
     * @notice Validate maker predicate
     * @param data Predicate data to validate
     * @return isValid Whether the predicate is valid
     */
    function isValidPredicate(bytes calldata data) external override(IMakerPredicate, ITakerPredicate) returns (bool isValid) {
        bytes32 predicateHash = keccak256(data);
        PredicateConfig storage config = predicateConfigs[predicateHash];

        // Decode predicate data
        (
            address maker,
            uint256 timestamp,
            uint256 priceLimit,
            address[] memory allowedTakers
        ) = abi.decode(data, (address, uint256, uint256, address[]));

        // Time window validation
        if (config.requiresTimeWindow) {
            if (timestamp < block.timestamp + config.minTimeWindow ||
                timestamp > block.timestamp + config.maxTimeWindow) {
                return false;
            }
        }

        // Price validation (simplified)
        if (config.requiresPriceValidation && priceLimit > 0) {
            // This would typically check against oracle or current market price
            // For now, we'll just validate it's within reasonable bounds
            if (priceLimit > type(uint128).max) return false;
        }

        // Whitelist validation
        if (config.requiresWhitelist) {
            bool makerWhitelisted = config.whitelist[maker];
            if (!makerWhitelisted) return false;

            // Check if any allowed takers are whitelisted
            if (allowedTakers.length > 0) {
                bool anyTakerWhitelisted = false;
                for (uint256 i = 0; i < allowedTakers.length; i++) {
                    if (config.whitelist[allowedTakers[i]]) {
                        anyTakerWhitelisted = true;
                        break;
                    }
                }
                if (!anyTakerWhitelisted) return false;
            }
        }

        isValid = true;
        emit PredicateValidated(predicateHash, isValid);
    }

    // ========================================================================
    // TAKER PREDICATE EXTENSION
    // ========================================================================

    /**
     * @notice Configure predicate validation rules
     * @param predicateHash Hash of the predicate configuration
     * @param requiresTimeWindow Whether time window validation is required
     * @param minTimeWindow Minimum time window in seconds
     * @param maxTimeWindow Maximum time window in seconds
     * @param requiresPriceValidation Whether price validation is required
     * @param maxPriceDeviation Maximum allowed price deviation in basis points
     * @param requiresWhitelist Whether whitelist validation is required
     */
    function configurePredicate(
        bytes32 predicateHash,
        bool requiresTimeWindow,
        uint256 minTimeWindow,
        uint256 maxTimeWindow,
        bool requiresPriceValidation,
        uint256 maxPriceDeviation,
        bool requiresWhitelist
    ) external onlyOwner {
        PredicateConfig storage config = predicateConfigs[predicateHash];
        config.requiresTimeWindow = requiresTimeWindow;
        config.minTimeWindow = minTimeWindow;
        config.maxTimeWindow = maxTimeWindow;
        config.requiresPriceValidation = requiresPriceValidation;
        config.maxPriceDeviation = maxPriceDeviation;
        config.requiresWhitelist = requiresWhitelist;
    }

    /**
     * @notice Add address to predicate whitelist
     * @param predicateHash Hash of the predicate configuration
     * @param addr Address to whitelist
     */
    function addToWhitelist(bytes32 predicateHash, address addr) external onlyOwner {
        predicateConfigs[predicateHash].whitelist[addr] = true;
    }

    /**
     * @notice Remove address from predicate whitelist
     * @param predicateHash Hash of the predicate configuration
     * @param addr Address to remove from whitelist
     */
    function removeFromWhitelist(bytes32 predicateHash, address addr) external onlyOwner {
        predicateConfigs[predicateHash].whitelist[addr] = false;
    }

    // ========================================================================
    // POST-INTERACTION EXTENSION
    // ========================================================================

    /**
     * @notice Execute post-interaction hook
     * @param maker Address of the order maker
     * @param taker Address of the order taker
     * @param makingAmount Amount being made
     * @param takingAmount Amount being taken
     * @param interactionData Custom interaction data
     */
    function postInteraction(
        address maker,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        bytes calldata interactionData
    ) external override onlyAuthorized nonReentrant notPaused {
        bytes32 orderHash = keccak256(abi.encode(maker, taker, makingAmount, takingAmount));
        PostInteractionConfig storage config = postInteractionConfigs[orderHash];

        if (!config.enabled || config.callbackContract == address(0)) {
            return;
        }

        // Execute callback with gas limit
        bool success;
        try this.executeCallback{gas: config.gasLimit}(
            config.callbackContract,
            config.callbackSelector,
            maker,
            taker,
            makingAmount,
            takingAmount,
            interactionData
        ) {
            success = true;
        } catch {
            success = false;
        }

        emit PostInteractionExecuted(orderHash, config.callbackContract, success);

        if (!success) revert PostInteractionFailed();
    }

    /**
     * @notice Configure post-interaction for an order
     * @param orderHash Hash of the order
     * @param enabled Whether post-interaction is enabled
     * @param callbackContract Address of the callback contract
     * @param callbackSelector Function selector for the callback
     * @param gasLimit Gas limit for the callback execution
     */
    function configurePostInteraction(
        bytes32 orderHash,
        bool enabled,
        address callbackContract,
        bytes4 callbackSelector,
        uint256 gasLimit
    ) external onlyAuthorized {
        postInteractionConfigs[orderHash] = PostInteractionConfig({
            enabled: enabled,
            callbackContract: callbackContract,
            callbackSelector: callbackSelector,
            gasLimit: gasLimit
        });
    }

    /**
     * @notice Execute callback function (external for gas limit control)
     * @param target Target contract to call
     * @param selector Function selector
     * @param maker Order maker
     * @param taker Order taker
     * @param makingAmount Making amount
     * @param takingAmount Taking amount
     * @param data Interaction data
     */
    function executeCallback(
        address target,
        bytes4 selector,
        address maker,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        bytes calldata data
    ) external {
        require(msg.sender == address(this), "Only self");
        
        bytes memory callData = abi.encodeWithSelector(
            selector,
            maker,
            taker,
            makingAmount,
            takingAmount,
            data
        );
        
        (bool success,) = target.call(callData);
        require(success, "Callback failed");
    }

    // ========================================================================
    // ADVANCED MAKER TRAITS EXTENSION
    // ========================================================================

    /**
     * @notice Build advanced maker traits
     * @param baseTraits Base traits value
     * @param allowMultipleFills Whether to allow multiple fills
     * @param useAmountFlag Whether to use amount flag
     * @param seriesNonceManagerIndex Series nonce manager index
     * @param epoch Epoch value for series nonce
     * @return Advanced traits value
     */
    function buildAdvancedTraits(
        uint256 baseTraits,
        bool allowMultipleFills,
        bool useAmountFlag,
        uint8 seriesNonceManagerIndex,
        uint32 epoch
    ) external pure override returns (uint256) {
        uint256 traits = baseTraits;

        // Allow multiple fills flag (bit 254)
        if (allowMultipleFills) {
            traits |= (1 << 254);
        }

        // Use amount flag (bit 253)
        if (useAmountFlag) {
            traits |= (1 << 253);
        }

        // Series nonce manager index (bits 120-127, 8 bits)
        traits |= (uint256(seriesNonceManagerIndex) << 120);

        // Epoch (bits 160-191, 32 bits)
        traits |= (uint256(epoch) << 160);

        return traits;
    }

    // ========================================================================
    // ASSET DATA TRANSFORMATION EXTENSION
    // ========================================================================

    /**
     * @notice Transform maker asset data
     * @param asset Asset address
     * @param amount Asset amount
     * @param customData Custom transformation data
     * @return Transformed asset data
     */
    function transformMakerAssetData(
        address asset,
        uint256 amount,
        bytes calldata customData
    ) external view override returns (bytes memory) {
        // Example transformation: add custom metadata
        return abi.encode(asset, amount, customData, block.timestamp);
    }

    /**
     * @notice Transform taker asset data
     * @param asset Asset address
     * @param amount Asset amount
     * @param customData Custom transformation data
     * @return Transformed asset data
     */
    function transformTakerAssetData(
        address asset,
        uint256 amount,
        bytes calldata customData
    ) external view override returns (bytes memory) {
        // Example transformation: add slippage protection
        uint256 minAmount = amount - (amount * MAX_SLIPPAGE / BASIS_POINTS);
        return abi.encode(asset, amount, minAmount, customData);
    }

    // ========================================================================
    // ADMIN FUNCTIONS
    // ========================================================================

    /**
     * @notice Set authorized caller status
     * @param caller Address to authorize/deauthorize
     * @param authorized Whether the caller is authorized
     */
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        authorizedCallers[caller] = authorized;
    }

    /**
     * @notice Emergency pause/unpause the contract
     * @param _paused Whether to pause the contract
     */
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit EmergencyPaused(_paused);
    }

    /**
     * @notice Withdraw stuck tokens
     * @param token Token address (address(0) for ETH)
     * @param amount Amount to withdraw
     * @param recipient Address to receive the tokens
     */
    function emergencyWithdraw(
        address token,
        uint256 amount,
        address recipient
    ) external onlyOwner {
        if (token == address(0)) {
            payable(recipient).transfer(amount);
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
    }

    // ========================================================================
    // RECEIVE FUNCTION
    // ========================================================================

    receive() external payable {
        // Allow receiving ETH
    }
}
