// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/*
 * @title BETRERC20Payer
 * @author Mirko Nosenzo (@netnose)
 * @notice This contract is used to pay with ERC20 tokens for ETH transactions
 */
contract BETRERC20Payer is ReentrancyGuardTransient {
    address public immutable WETH;
    address public owner;
    address public proposedOwner;

    uint256 public constant MAX_PRICE_DEVIATION = 1; // 1%

    /*
     * @notice ERC20 token price pool
     * @dev This mapping is used to store the ERC20 token price pool for each token address
     */
    mapping(address => IUniswapV3Pool) public erc20TokenPricePool;

    /*
     * @notice Whitelisted destinations
     * @dev This mapping is used to whitelist destinations for ERC20 payments
     */
    mapping(address => bool) public whitelistedDestinations;

    /*
     * @title NotOwner
     * @notice Error to check if the caller is the owner
     */
    error NotOwner();

    /*
     * @title InvalidInput
     * @notice Error to check if the input is invalid
     */
    error InvalidInput();

    /*
     * @title InvalidPool
     * @notice Error to check if the pool is invalid
     */
    error InvalidPool();

    /*
     * @title SubcallFailed
     * @notice Error to check if the subcall failed
     */
    error SubcallFailed();

    /*
     * @title NotProposedOwner
     * @notice Error to check if the caller is the proposed owner
     */
    error NotProposedOwner();

    /*
     * @title NotEnoughValueInContract
     * @notice Error to check if the ETH value in the contract is not enough
     * @param required The required ETH value
     * @param available The available ETH value
     */
    error NotEnoughValueInContract(uint256 required, uint256 available);

    /*
     * @title NotWhitelistedDestination
     * @notice Error to check if the destination is not whitelisted
     * @param destination The destination address
     */
    error NotWhitelistedDestination(address destination);

    /*
     * @title NoPoolForToken
     * @notice Error to check if the token has no pool
     * @param token The token address
     */
    error NoPoolForToken(address token);

    /*
     * @title PriceCalculationError
     * @notice Error to check if the price calculation failed
     */
    error PriceCalculationError();

    /*
     * @title SlippageError
     * @notice Error to check if the slippage is too high
     * @param expectedPrice The expected price
     * @param actualPrice The actual price
     */
    error SlippageError(uint256 expectedPrice, uint256 actualPrice);

    /*
     * @title OwnershipTransferred
     * @notice Event to notify when ownership is transferred
     * @param previousOwner The previous owner
     * @param newOwner The new owner
     */
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /*
     * @title ERC20TokenPricePoolSet
     * @notice Event to notify when the ERC20 token price pool is set
     * @param token The token address
     * @param pool The pool address
     */
    event ERC20TokenPricePoolSet(address indexed token, address indexed pool);

    /*
     * @title WhitelistedDestinationSet
     * @notice Event to notify when the whitelisted destination is set
     * @param destination The destination address
     * @param whitelisted The whitelisted status
     */
    event WhitelistedDestinationSet(address indexed destination, bool whitelisted);

    /*
     * @title onlyOwner
     * @notice Modifier to check if the caller is the owner
     */
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /*
     * @notice Constructor
     * @param _owner The owner of the contract
     * @param _weth The WETH address
     */
    constructor(address _owner, address _weth) ReentrancyGuardTransient() {
        if (_owner == address(0) || _weth == address(0)) revert InvalidInput();
        owner = _owner;
        WETH = _weth;
    }

    /*
     * @title setProposedOwner
     * @notice Function to set the proposed owner
     * @param _proposedOwner The proposed owner
     */
    function setProposedOwner(address _proposedOwner) public onlyOwner {
        if (_proposedOwner == address(0)) revert InvalidInput();
        proposedOwner = _proposedOwner;
    }

    /*
     * @title acceptOwnership
     * @notice Function to accept the ownership
     */
    function acceptOwnership() public {
        if (msg.sender != proposedOwner) revert NotProposedOwner();
        emit OwnershipTransferred(owner, proposedOwner);
        owner = proposedOwner;
        proposedOwner = address(0);
    }

    /*
     * @title cancelProposedOwnership
     * @notice Function to cancel the proposed ownership
     */
    function cancelProposedOwnership() public onlyOwner {
        proposedOwner = address(0);
    }

    /*
     * @title setERC20TokenPricePool
     * @notice Function to set the ERC20 token price pool
     * @param _token The token address
     * @param _pool The pool address
     */
    function setERC20TokenPricePool(address _token, address _pool) public onlyOwner {
        if (_token == address(0) || _pool == address(0)) revert InvalidInput();
        IUniswapV3Pool pool = IUniswapV3Pool(_pool);
        if (pool.token0() != _token && pool.token1() != _token) revert InvalidPool();
        if (pool.token0() != WETH && pool.token1() != WETH) revert InvalidPool();
        erc20TokenPricePool[_token] = pool;
        emit ERC20TokenPricePoolSet(_token, _pool);
    }

    /*
     * @title setWhitelistedDestination
     * @notice Function to set the whitelisted destination
     * @param _destination The destination address
     */
    function setWhitelistedDestination(address _destination, bool _whitelisted) public onlyOwner {
        if (_destination == address(0)) revert InvalidInput();
        whitelistedDestinations[_destination] = _whitelisted;
        emit WhitelistedDestinationSet(_destination, _whitelisted);
    }

    /*
     * @title _performSubcall
     * @notice Function to perform a subcall
     * @param _smartContract The smart contract to call
     * @param _data The data to call the smart contract with
     * @param _value The value to call the smart contract with
     */
    function _performSubcall(address _smartContract, bytes calldata _data, uint256 _value) internal returns (bytes memory result) {
        if (_smartContract == address(0)) revert InvalidInput();

        bool success;
        (success, result) = _smartContract.call{value: _value}(_data);
        if (!success) revert SubcallFailed();
    }

    /*
     * @title getPriceFromPool
     * @notice Function to get the price from the pool
     * @param pool The pool
     * @param tokenIn The token in
     * @param amount The amount of ETH to pay
     * @return price The price with 18 decimals
     */
    function _getPriceFromPool(IUniswapV3Pool pool, address tokenIn, uint256 amount) internal view returns (uint256 price) {
        // Get token0 and token1 from the pool
        address token0 = pool.token0();
        address token1 = pool.token1();

        if (tokenIn != token0 && tokenIn != token1) revert InvalidInput();

        // Get decimals for proper normalization
        uint8 decimals0 = IERC20Metadata(token0).decimals();
        uint8 decimals1 = IERC20Metadata(token1).decimals();

        // Read sqrtPriceX96 from slot0
        (uint160 sqrtPriceX96, , , , , , ) = pool.slot0();

        // Compute priceX96 = (sqrtPriceX96 ^ 2) >> 192
        // Using unchecked for gas optimization since Solidity 0.8.0+ has built-in overflow protection
        unchecked {
            uint256 priceX96 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
            uint256 precision = 1;
            if (priceX96 < 2 ** 192) {
                precision = 10 ** 18;
            }
            priceX96 = priceX96 * precision >> 192;
            price = (priceX96 * (10 ** decimals0)) / (10 ** decimals1);

            if (tokenIn == token0) {
                price = amount * precision / price;
            } else {
                price = amount * price / precision;
            }
        }
        
        // Validate price is reasonable (not zero or extremely large)
        if (price == 0 || price > type(uint256).max / 1e18) revert PriceCalculationError();
    }

    /*
     * @title _transferRequiredTokens
     * @notice Function to transfer the required tokens
     * @param _token The token address
     * @param _amount The amount of ETH to transfer
     */
    function _transferRequiredTokens(address _token, uint256 _amount, uint256 _expectedPrice) internal {
      if (_token == address(0) || _amount == 0 || _expectedPrice == 0) revert InvalidInput();

      IUniswapV3Pool pool = erc20TokenPricePool[_token];
      if (address(pool) == address(0)) revert NoPoolForToken(_token);

      uint256 requiredAmount = _getPriceFromPool(pool, _token, _amount);
      
      // Validate required amount is reasonable
      if (requiredAmount == 0) revert PriceCalculationError();
      
      uint256 maxPriceDeviation = _expectedPrice * MAX_PRICE_DEVIATION / 100;
      if (requiredAmount > _expectedPrice + maxPriceDeviation || requiredAmount < _expectedPrice - maxPriceDeviation) revert SlippageError(_expectedPrice, requiredAmount);
      
      IERC20(_token).transferFrom(msg.sender, owner, requiredAmount);
    }

    /*
     * @title getPrice
     * @notice Function to get the price of the token
     * @param _token The token address
     * @param _amount The amount of ETH to pay
     * @return _price The price of the token
     */
    function getPrice(address _token, uint256 _amount) public view returns (uint256 _price) {
      if (_token == address(0) || _amount == 0) revert InvalidInput();
      IUniswapV3Pool pool = erc20TokenPricePool[_token];
      if (address(pool) == address(0)) revert NoPoolForToken(_token);
      _price = _getPriceFromPool(pool, _token, _amount);
      
      // Validate price is reasonable
      if (_price == 0) revert PriceCalculationError();
    }

    /*
     * @title payWithERC20
     * @notice Function to pay with ERC20 tokens
     * @param _token The token address
     * @param _destination The destination address
     * @param _data The data to call the destination with
     * @param _amount The amount of ETH to pay
     * @return result The result of the call
     */
    function payWithERC20(address _token, address _destination, bytes calldata _data, uint256 _amount, uint256 _expectedPrice) public nonReentrant returns (bytes memory result) {
        if (_token == address(0) || _destination == address(0) || _data.length == 0 || _amount == 0 || _expectedPrice == 0) revert InvalidInput();
        if (!whitelistedDestinations[_destination]) revert NotWhitelistedDestination(_destination);
        if (address(this).balance < _amount) revert NotEnoughValueInContract(_amount, address(this).balance);

        _transferRequiredTokens(_token, _amount, _expectedPrice);

        result = _performSubcall(_destination, _data, _amount);
    }

    /*
     * @title payWithERC20Permit
     * @notice Function to pay with ERC20 tokens using permit
     * @param _token The token address
     * @param _destination The destination address
     * @param _data The data to call the destination with
     * @param _amount The amount of ETH to pay
     * @param _expectedPrice The expected price of the token
     * @param _spendableAmount The amount of tokens that can be spent
     * @param _deadline The deadline for the permit
     * @param _v The v parameter of the signature
     * @param _r The r parameter of the signature
     * @param _s The s parameter of the signature
     * @return result The result of the call
     */
    function payWithERC20Permit(address _token, address _destination, bytes calldata _data, uint256 _amount, uint256 _expectedPrice, uint256 _spendableAmount, uint256 _deadline, uint8 _v, bytes32 _r, bytes32 _s) public nonReentrant returns (bytes memory result) {
        if (_token == address(0) || _destination == address(0) || _data.length == 0 || _amount == 0 || _expectedPrice == 0 || _deadline < block.timestamp || _r == bytes32(0) || _s == bytes32(0)) revert InvalidInput();
        if (!whitelistedDestinations[_destination]) revert NotWhitelistedDestination(_destination);
        if (address(this).balance < _amount) revert NotEnoughValueInContract(_amount, address(this).balance);

        IERC20Permit(_token).permit(msg.sender, address(this), _spendableAmount, _deadline, _v, _r, _s);
        _transferRequiredTokens(_token, _amount, _expectedPrice);

        result = _performSubcall(_destination, _data, _amount);
    }

    /*
     * @title recoverETH
     * @notice Function to recover accidentally sent ETH
     */
    function recoverETH() public onlyOwner {
        payable(owner).transfer(address(this).balance);
    }

    /*
     * @title receiveETH
     * @notice Function to receive ETH
     */
    receive() external payable {}

    /*
     * @title fallback
     * @notice Function to fallback ETH
     */
    fallback() external payable {}
}