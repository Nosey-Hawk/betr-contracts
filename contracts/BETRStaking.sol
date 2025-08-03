// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {InvalidInput} from "./common/error.sol";
import {Ownable} from "./common/Ownable.sol";
import {IBETRStaking} from "./interfaces/IBETRStaking.sol";

/*
 * @title BETRStaking
 * @author Mirko Nosenzo (@netnose)
 * @notice This contract is used to stake an ERC20 token
 */
contract BETRStaking is IBETRStaking, Ownable {
    address[] private _stakers;

    IERC20 public immutable stakingToken;
    uint256 public totalStakedAmount;
    mapping(address => uint256) public stakedAmount;
    bool public isStakingPaused;

    /*
     * @notice Constructor
     * @param _owner The owner of the contract
     * @param _stakingToken The ERC20 token to stake
     */
    constructor(address _owner, address _stakingToken) Ownable(_owner) {
        if (_stakingToken == address(0)) revert InvalidInput();
        
        // Validate ERC20 contract
        try IERC20(_stakingToken).totalSupply() returns (uint256) {
            // Contract responds to totalSupply() - likely a valid ERC20
        } catch {
            revert InvalidInput();
        }
        
        stakingToken = IERC20(_stakingToken);
        isStakingPaused = false;
    }

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
     * @title StakingPausedSet
     * @notice Event to notify when the staking paused state is set
     * @param isStakingPaused The new staking paused state
     */
    event StakingPausedSet(bool indexed isStakingPaused);

    /*
     * @title _removeStaker
     * @notice Function to remove a staker
     * @param _staker The staker to remove
     */
    function _removeStaker(address _staker) internal {
        for (uint256 i = 0; i < _stakers.length; i++) {
            if (_stakers[i] == _staker) {
                _stakers[i] = _stakers[_stakers.length - 1];
                _stakers.pop();
                return;
            }
        }
    }

    /*
     * @title _unstake
     * @notice Internal function to unstake tokens for a user
     * @param _user The user to unstake tokens for
     * @param _amount The amount to unstake (0 for all)
     * @return The amount actually unstaked
     */
    function _unstake(address _user, uint256 _amount) internal returns (uint256) {
        if (_user == address(0)) revert InvalidInput();
        
        uint256 userStaked = stakedAmount[_user];
        uint256 amountToUnstake = _amount == 0 ? userStaked : _amount;
        if (amountToUnstake == 0) return 0;

        if (amountToUnstake > userStaked) {
            revert NotEnoughStakedAmount(userStaked, amountToUnstake);
        }
        
        stakedAmount[_user] -= amountToUnstake;
        if (stakedAmount[_user] == 0) {
            _removeStaker(_user);
        }
        
        stakingToken.transfer(_user, amountToUnstake);
        emit Unstaked(_user, amountToUnstake);
        
        return amountToUnstake;
    }

    /*
     * @title stakers
     * @notice Function to get the stakers
     * @return The stakers
     */
    function stakers() public view returns (address[] memory) {
        return _stakers;
    }

    /*
     * @title stakersCount
     * @notice Function to get the number of stakers
     * @return The number of stakers
     */
    function stakersCount() public view returns (uint256) {
        return _stakers.length;
    }

    /*
     * @title stake
     * @notice Stake an ERC20 token
     * @param _amount The amount of ERC20 tokens to stake
     */
    function stake(uint256 _amount) public {
        if (isStakingPaused) revert StakingPaused();
        if (_amount == 0) revert InvalidInput();

        if (stakedAmount[msg.sender] == 0) {
            _stakers.push(msg.sender);
        }
        stakedAmount[msg.sender] += _amount;
        totalStakedAmount += _amount;
        stakingToken.transferFrom(msg.sender, address(this), _amount);
        emit Staked(msg.sender, _amount);
    }

    /*
     * @title stakeFor
     * @notice Function to stake tokens for a user
     * @param _user The user to stake tokens for
     * @param _amount The amount of tokens to stake
     */
    function stakeFor(address _user, uint256 _amount) public {
        if (isStakingPaused) revert StakingPaused();
        if (_user == address(0)) revert InvalidInput();
        if (_amount == 0) revert InvalidInput();
        
        if (stakedAmount[_user] == 0) {
            _stakers.push(_user);
        }
        stakedAmount[_user] += _amount;
        totalStakedAmount += _amount;
        stakingToken.transferFrom(msg.sender, address(this), _amount);
        emit Staked(_user, _amount);
    }

    /*
     * @title unstake
     * @notice Unstake an ERC20 token
     * @param _amount The amount of ERC20 tokens to unstake
     */
    function unstake(uint256 _amount) public {
        if (isStakingPaused) revert StakingPaused();
        if (_amount == 0) revert InvalidInput();
        
        uint256 unstakedAmount = _unstake(msg.sender, _amount);
        totalStakedAmount -= unstakedAmount;
    }

    /*
     * @title batchUnstake
     * @notice Admin function to unstake tokens for multiple users (owner only)
     * @param _users Array of users to unstake tokens for
     * @param _amounts Array of amounts to unstake (0 for all, must match _users length)
     * @dev This function bypasses the staking pause for emergency situations
     */
    function batchUnstake(address[] calldata _users, uint256[] calldata _amounts) public onlyOwner {
        if (_users.length != _amounts.length) revert InvalidInput();
        if (_users.length == 0) revert InvalidInput();
        
        uint256 totalUnstaked = 0;
        
        for (uint256 i = 0; i < _users.length; i++) {
            address user = _users[i];
            uint256 amount = _amounts[i];
            
            uint256 unstakedAmount = _unstake(user, amount);
            totalUnstaked += unstakedAmount;
        }
        
        totalStakedAmount -= totalUnstaked;
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