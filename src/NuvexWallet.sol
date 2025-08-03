// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "./ExtensionHub.sol";

// ========================================================================
// INTERFACES
// ========================================================================

interface IOrderMixin {
    struct Order {
        uint256 salt;
        uint256 maker;
        uint256 receiver;
        uint256 makerAsset;
        uint256 takerAsset;
        uint256 makingAmount;
        uint256 takingAmount;
        uint256 makerTraits;
    }

    function fillOrder(
        Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount
    ) external payable returns (uint256, uint256, bytes32);

    function cancelOrder(uint256 orderInfo) external;
    function hashOrder(Order calldata order) external view returns (bytes32);
}

interface IOrderRegistrator {
    function registerOrder(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes calldata signature
    ) external;
}

/**
 * @title NuvexWallet
 * @notice Enhanced TWAP wallet with full 1inch extension support
 * @dev Integrates ExtensionHub for comprehensive order management
 */
contract NuvexWallet is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ========================================================================
    // STRUCTS
    // ========================================================================

    struct EnhancedLimitOrder {
        address makerAsset;
        address takerAsset;
        uint256 makingAmount;
        uint256 takingAmount;
        uint256 salt;
        uint256 expiration;
        bool allowPartialFill;
        // TWAP Parameters
        uint256 twapStartTime;
        uint256 twapEndTime;
        uint256 twapParts;
        uint256 maxPriceDeviation;
        uint256 executorTipBps;
        // Extension Configuration
        bool useETHOrders;
        bool useDutchAuction;
        bool useFeeTaker;
        bool usePredicates;
        bool usePostInteraction;
        bytes extensionData;
    }

    struct TWAPExecution {
        bytes32 orderHash;
        uint256 partIndex;
        uint256 executionTime;
        uint256 actualMakingAmount;
        uint256 actualTakingAmount;
        address executor;
        uint256 feesPaid;
    }

    // ========================================================================
    // STATE VARIABLES
    // ========================================================================

    /// @notice ExtensionHub contract
    ExtensionHub public immutable extensionHub;
    
    /// @notice 1inch Limit Order Protocol
    IOrderMixin public immutable limitOrderProtocol;
    
    /// @notice 1inch Order Registrator
    IOrderRegistrator public immutable orderRegistrator;

    /// @notice TWAP orders
    mapping(bytes32 => EnhancedLimitOrder) public twapOrders;
    
    /// @notice TWAP executions
    mapping(bytes32 => mapping(uint256 => TWAPExecution)) public twapExecutions;
    
    /// @notice Executed parts count
    mapping(bytes32 => uint256) public twapExecutedParts;
    
    /// @notice Initial prices for price protection
    mapping(bytes32 => uint256) public twapInitialPrice;
    
    /// @notice Authorized executors
    mapping(address => bool) public authorizedExecutors;

    // ========================================================================
    // EVENTS
    // ========================================================================

    event EnhancedTWAPOrderRegistered(
        bytes32 indexed orderHash,
        address indexed makerAsset,
        address indexed takerAsset,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 twapParts,
        bool[] extensionsEnabled
    );

    event EnhancedTWAPPartExecuted(
        bytes32 indexed orderHash,
        uint256 indexed partIndex,
        address indexed executor,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 fees,
        bytes32 oneinchOrderHash
    );

    event ExtensionUsed(
        bytes32 indexed orderHash,
        string extensionType,
        bytes data
    );

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    constructor(
        address _extensionHub,
        address _limitOrderProtocol,
        address _orderRegistrator
    ) Ownable(msg.sender) {
        extensionHub = ExtensionHub(payable(_extensionHub));
        limitOrderProtocol = IOrderMixin(_limitOrderProtocol);
        orderRegistrator = IOrderRegistrator(_orderRegistrator);
        
        // Authorize the extension hub
        authorizedExecutors[_extensionHub] = true;
    }

    // ========================================================================
    // ENHANCED TWAP FUNCTIONS
    // ========================================================================

    /**
     * @notice Register an enhanced TWAP order with extension support
     * @param order Enhanced limit order with extension configuration
     * @param userSig User's signature
     * @param initialPrice Initial price for price protection
     * @return orderHash Hash of the registered order
     */
    function registerEnhancedTWAPOrder(
        EnhancedLimitOrder memory order,
        bytes calldata userSig,
        uint256 initialPrice
    ) external nonReentrant returns (bytes32 orderHash) {
        // Validate order parameters
        require(order.twapParts > 0 && order.twapParts <= 100, "Invalid TWAP parts");
        require(order.twapStartTime < order.twapEndTime, "Invalid time window");
        require(order.makingAmount > 0 && order.takingAmount > 0, "Invalid amounts");

        // Generate order hash
        orderHash = keccak256(abi.encode(order, block.chainid, address(this)));

        // Store order
        twapOrders[orderHash] = order;
        twapInitialPrice[orderHash] = initialPrice;

        // Configure extensions if enabled
        if (order.useDutchAuction) {
            _configureDutchAuction(orderHash, order);
        }

        if (order.usePredicates) {
            _configurePredicates(orderHash, order);
        }

        if (order.usePostInteraction) {
            _configurePostInteraction(orderHash, order);
        }

        // Approve tokens for the limit order protocol
        IERC20(order.makerAsset).forceApprove(address(limitOrderProtocol), order.makingAmount);
        
        bool[] memory extensionsEnabled = new bool[](5);
        extensionsEnabled[0] = order.useETHOrders;
        extensionsEnabled[1] = order.useDutchAuction;
        extensionsEnabled[2] = order.useFeeTaker;
        extensionsEnabled[3] = order.usePredicates;
        extensionsEnabled[4] = order.usePostInteraction;

        emit EnhancedTWAPOrderRegistered(
            orderHash,
            order.makerAsset,
            order.takerAsset,
            order.makingAmount,
            order.takingAmount,
            order.twapParts,
            extensionsEnabled
        );
    }

    /**
     * @notice Execute a TWAP part with full extension support
     * @param orderHash Hash of the TWAP order
     * @param partIndex Part index to execute
     * @param currentPrice Current market price
     * @param integratorWallet Integrator wallet for fees
     * @param extensionCalldata Additional extension data
     * @return oneinchOrderHash Hash of the created 1inch order
     */
    function executeEnhancedTWAPPart(
        bytes32 orderHash,
        uint256 partIndex,
        uint256 currentPrice,
        address integratorWallet,
        bytes calldata extensionCalldata
    ) external nonReentrant returns (bytes32 oneinchOrderHash) {
        EnhancedLimitOrder memory order = twapOrders[orderHash];
        require(order.makingAmount > 0, "Order not found");
        require(partIndex < order.twapParts, "Invalid part index");
        require(twapExecutions[orderHash][partIndex].executionTime == 0, "Part already executed");

        // Validate timing
        require(block.timestamp >= order.twapStartTime, "TWAP not started");
        require(block.timestamp <= order.twapEndTime, "TWAP ended");

        // Validate price protection
        _validatePriceProtection(orderHash, currentPrice, order.maxPriceDeviation);

        // Calculate part amounts
        (uint256 partMakingAmount, uint256 partTakingAmount) = _calculatePartAmounts(
            orderHash,
            order,
            partIndex
        );

        // Apply extensions
        if (order.useDutchAuction) {
            partTakingAmount = _applyDutchAuction(orderHash, partTakingAmount);
        }

        if (order.usePredicates) {
            require(_validatePredicates(order, extensionCalldata), "Predicate validation failed");
        }

        // Create and execute 1inch order
        oneinchOrderHash = _createAndExecuteOneinchOrder(
            orderHash,
            order,
            partIndex,
            partMakingAmount,
            partTakingAmount,
            integratorWallet,
            extensionCalldata
        );

        // Record execution
        uint256 fees = 0;
        if (order.useFeeTaker) {
            fees = extensionHub.takeFee(order.takerAsset, partTakingAmount, false);
        }

        twapExecutions[orderHash][partIndex] = TWAPExecution({
            orderHash: orderHash,
            partIndex: partIndex,
            executionTime: block.timestamp,
            actualMakingAmount: partMakingAmount,
            actualTakingAmount: partTakingAmount,
            executor: msg.sender,
            feesPaid: fees
        });

        twapExecutedParts[orderHash]++;

        // Execute post-interaction if enabled
        if (order.usePostInteraction) {
            extensionHub.postInteraction(
                address(this),
                msg.sender,
                partMakingAmount,
                partTakingAmount,
                extensionCalldata
            );
        }

        emit EnhancedTWAPPartExecuted(
            orderHash,
            partIndex,
            msg.sender,
            partMakingAmount,
            partTakingAmount,
            fees,
            oneinchOrderHash
        );
    }

    /**
     * @notice Create ETH order using ExtensionHub
     * @param order ETH order parameters
     * @return orderHash Hash of the created ETH order
     */
    function createETHOrder(
        ExtensionHub.ETHOrder memory order
    ) external payable nonReentrant returns (bytes32 orderHash) {
        require(msg.value > 0, "No ETH sent");
        
        orderHash = extensionHub.createETHOrder{value: msg.value}(order);
        
        emit ExtensionUsed(orderHash, "ETHOrders", abi.encode(order));
    }

    // ========================================================================
    // INTERNAL FUNCTIONS
    // ========================================================================

    function _configureDutchAuction(bytes32 orderHash, EnhancedLimitOrder memory order) internal {
        // Decode Dutch auction parameters from extension data
        (uint256 startPrice, uint256 endPrice, uint256 decayFunction) = abi.decode(
            order.extensionData,
            (uint256, uint256, uint256)
        );

        ExtensionHub.DutchAuctionParams memory params = ExtensionHub.DutchAuctionParams({
            startPrice: startPrice,
            endPrice: endPrice,
            startTime: order.twapStartTime,
            endTime: order.twapEndTime,
            decayFunction: decayFunction
        });

        extensionHub.createDutchAuction(orderHash, params);
        
        emit ExtensionUsed(orderHash, "DutchAuction", abi.encode(params));
    }

    function _configurePredicates(bytes32 orderHash, EnhancedLimitOrder memory order) internal {
        // Configure predicate validation rules
        extensionHub.configurePredicate(
            orderHash,
            true,  // requiresTimeWindow
            60,    // minTimeWindow
            86400, // maxTimeWindow
            true,  // requiresPriceValidation
            order.maxPriceDeviation,
            false  // requiresWhitelist
        );
        
        emit ExtensionUsed(orderHash, "Predicates", order.extensionData);
    }

    function _configurePostInteraction(bytes32 orderHash, EnhancedLimitOrder memory order) internal {
        // Decode post-interaction configuration
        (address callback, bytes4 selector, uint256 gasLimit) = abi.decode(
            order.extensionData,
            (address, bytes4, uint256)
        );

        extensionHub.configurePostInteraction(
            orderHash,
            true,
            callback,
            selector,
            gasLimit
        );
        
        emit ExtensionUsed(orderHash, "PostInteraction", order.extensionData);
    }

    function _validatePriceProtection(
        bytes32 orderHash,
        uint256 currentPrice,
        uint256 maxDeviationBps
    ) internal view {
        uint256 initialPrice = twapInitialPrice[orderHash];
        uint256 deviation;
        
        if (currentPrice > initialPrice) {
            deviation = ((currentPrice - initialPrice) * 10000) / initialPrice;
        } else {
            deviation = ((initialPrice - currentPrice) * 10000) / initialPrice;
        }
        
        require(deviation <= maxDeviationBps, "Price deviation too high");
    }

    function _calculatePartAmounts(
        bytes32 orderHash,
        EnhancedLimitOrder memory order,
        uint256 partIndex
    ) internal view returns (uint256 partMakingAmount, uint256 partTakingAmount) {
        uint256 executedParts = twapExecutedParts[orderHash];
        uint256 remainingParts = order.twapParts - executedParts;
        
        // Calculate base amounts
        partMakingAmount = order.makingAmount / order.twapParts;
        partTakingAmount = order.takingAmount / order.twapParts;
        
        // Handle remainder for last part
        if (partIndex == order.twapParts - 1) {
            uint256 executedMaking = executedParts * (order.makingAmount / order.twapParts);
            uint256 executedTaking = executedParts * (order.takingAmount / order.twapParts);
            partMakingAmount = order.makingAmount - executedMaking;
            partTakingAmount = order.takingAmount - executedTaking;
        }
    }

    function _applyDutchAuction(
        bytes32 orderHash,
        uint256 baseTakingAmount
    ) internal view returns (uint256 adjustedAmount) {
        uint256 currentPrice = extensionHub.getCurrentDutchPrice(orderHash);
        // Apply Dutch auction pricing (simplified)
        adjustedAmount = (baseTakingAmount * currentPrice) / 1e18;
    }

    function _validatePredicates(
        EnhancedLimitOrder memory order,
        bytes calldata extensionData
    ) internal returns (bool) {
        // Create predicate data
        bytes memory predicateData = abi.encode(
            address(this),
            block.timestamp,
            order.takingAmount,
            new address[](0)
        );
        
        return extensionHub.isValidPredicate(predicateData);
    }

    function _createAndExecuteOneinchOrder(
        bytes32 parentOrderHash,
        EnhancedLimitOrder memory order,
        uint256 partIndex,
        uint256 partMakingAmount,
        uint256 partTakingAmount,
        address integratorWallet,
        bytes calldata extensionData
    ) internal returns (bytes32 oneinchOrderHash) {
        // Generate unique salt
        uint256 partSalt = uint256(
            keccak256(abi.encode(parentOrderHash, partIndex, block.timestamp))
        );

        // Build advanced maker traits
        uint256 baseTraits = _buildBaseMakerTraits(order);
        uint256 advancedTraits = extensionHub.buildAdvancedTraits(
            baseTraits,
            order.allowPartialFill,
            false, // useAmountFlag
            0,     // seriesNonceManagerIndex
            uint32(block.timestamp) // epoch
        );

        // Create 1inch order
        IOrderMixin.Order memory oneinchOrder = IOrderMixin.Order({
            salt: partSalt,
            maker: uint256(uint160(address(this))),
            receiver: uint256(uint160(address(this))),
            makerAsset: uint256(uint160(order.makerAsset)),
            takerAsset: uint256(uint160(order.takerAsset)),
            makingAmount: partMakingAmount,
            takingAmount: partTakingAmount,
            makerTraits: advancedTraits
        });

        // Get order hash
        oneinchOrderHash = limitOrderProtocol.hashOrder(oneinchOrder);

        // Transform asset data if needed
        bytes memory transformedExtension = extensionData;
        if (order.extensionData.length > 0) {
            transformedExtension = extensionHub.transformMakerAssetData(
                order.makerAsset,
                partMakingAmount,
                order.extensionData
            );
        }

        // Register order
        orderRegistrator.registerOrder(
            oneinchOrder,
            transformedExtension,
            abi.encodePacked(parentOrderHash, partIndex)
        );

        return oneinchOrderHash;
    }

    function _buildBaseMakerTraits(EnhancedLimitOrder memory order) internal pure returns (uint256) {
        uint256 traits = 0;
        
        // Set expiration
        traits |= (order.expiration & 0xFFFFFFFFFF) << 80;
        
        // Set partial fill flag
        if (!order.allowPartialFill) {
            traits |= (1 << 255);
        }
        
        return traits;
    }

    // ========================================================================
    // ADMIN FUNCTIONS
    // ========================================================================

    function setAuthorizedExecutor(address executor, bool authorized) external onlyOwner {
        authorizedExecutors[executor] = authorized;
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(amount);
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
    }

    receive() external payable {}
}
