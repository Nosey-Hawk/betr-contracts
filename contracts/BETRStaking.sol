// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/*
 * @title BETRStaking
 * @author Mirko Nosenzo (@netnose)
 * @notice This contract is used to stake an ERC20 token
 */
contract BETRStaking {
    address public owner;
    address public proposedOwner;
    IERC20 public immutable stakingToken;
    mapping(address => uint256) public stakedAmount;
    bool public isStakingPaused;

    /*
     * @notice Constructor
     * @param _owner The owner of the contract
     * @param _stakingToken The ERC20 token to stake
     */
    constructor(address _owner, address _stakingToken) {
        if (_owner == address(0)) revert InvalidInput();
        if (_stakingToken == address(0)) revert InvalidInput();
        
        // Validate ERC20 contract
        try IERC20(_stakingToken).totalSupply() returns (uint256) {
            // Contract responds to totalSupply() - likely a valid ERC20
        } catch {
            revert InvalidInput();
        }
        
        owner = _owner;
        stakingToken = IERC20(_stakingToken);
        isStakingPaused = false;
    }

    /*
     * @title NotOwner
     * @notice Error to check if the caller is the owner
     */
    error NotOwner();

    /*
     * @title NotProposedOwner
     * @notice Error to check if the caller is the proposed owner
     */
    error NotProposedOwner();

    /*
     * @title InvalidInput
     * @notice Error to check if the input is invalid
     */
    error InvalidInput();

    /*
     * @title NotEnoughStakedAmount
     * @notice Error to check if the staked amount is less than the amount to unstake
     * @param available The available amount
     * @param requested The requested amount
     */
    error NotEnoughStakedAmount(uint256 available, uint256 requested);

    /*
     * @title StakingPaused
     * @notice Error to check if the staking is paused
     */
    error StakingPaused();

    /*
     * @title Staked
     * @notice Event to notify when an address has staked
     * @param staker The address that staked
     * @param amount The amount of tokens staked
     */
    event Staked(address indexed staker, uint256 indexed amount);

    /*
     * @title Unstaked
     * @notice Event to notify when an address has unstaked
     * @param staker The address that unstaked
     * @param amount The amount of tokens unstaked
     */
    event Unstaked(address indexed staker, uint256 indexed amount);

    /*
     * @title OwnershipTransferred
     * @notice Event to notify when ownership is transferred
     * @param previousOwner The previous owner
     * @param newOwner The new owner
     */
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /*
     * @title StakingPausedSet
     * @notice Event to notify when the staking paused state is set
     * @param isStakingPaused The new staking paused state
     */
    event StakingPausedSet(bool indexed isStakingPaused);

    /*
     * @title onlyOwner
     * @notice Modifier to check if the caller is the owner
     */
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /*
     * @title stake
     * @notice Stake an ERC20 token
     * @param _amount The amount of ERC20 tokens to stake
     */
    function stake(uint256 _amount) public {
        if (isStakingPaused) revert StakingPaused();
        if (_amount == 0) revert InvalidInput();
        stakedAmount[msg.sender] += _amount;
        stakingToken.transferFrom(msg.sender, address(this), _amount);
        emit Staked(msg.sender, _amount);
    }

    /*
     * @title unstake
     * @notice Unstake an ERC20 token
     * @param _amount The amount of ERC20 tokens to unstake
     */
    function unstake(uint256 _amount) public {
        if (isStakingPaused) revert StakingPaused();
        if (_amount == 0) revert InvalidInput();
        if (stakedAmount[msg.sender] < _amount) {
            revert NotEnoughStakedAmount(stakedAmount[msg.sender], _amount);
        }
        stakedAmount[msg.sender] -= _amount;
        stakingToken.transfer(msg.sender, _amount);
        emit Unstaked(msg.sender, _amount);
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
     * @title setStakingPaused
     * @notice Function to set the staking paused state
     * @param _isStakingPaused The new staking paused state
     */
    function setStakingPaused(bool _isStakingPaused) public onlyOwner {
        isStakingPaused = _isStakingPaused;
        emit StakingPausedSet(_isStakingPaused);
    }
}