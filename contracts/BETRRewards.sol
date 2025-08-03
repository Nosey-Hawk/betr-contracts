// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "./common/Ownable.sol";
import {IBETRStaking} from "./interfaces/IBETRStaking.sol";
import {InvalidInput} from "./common/error.sol";

/*
 * @title BETRRewards
 * @author Mirko Nosenzo (@netnose)
 * @notice This contract is used to manage rewards for the staking contract
 */
contract BETRRewards is Ownable {
    /*
     * @title Reward
     * @notice This struct is used to store the reward information
     * @param token The address of the token
     * @param amount The amount of the reward
     */
    struct Reward {
        address token;
        uint256 amount;
    }

    mapping(address => Reward[]) private _rewards;

    IBETRStaking public stakingContract;
    mapping(address => bool) public rewardableTokens;
    mapping(address => uint256) public totalRewardsClaimable;
    mapping(address => uint256) public totalRewardsClaimed;
    bool public isRewardingPaused;

    /*
     * @notice Constructor
     * @param _owner The owner of the contract
     * @param _stakingContract The address of the staking contract
     */
    constructor(address _owner, address _stakingContract) Ownable(_owner) {
        if (_stakingContract == address(0)) revert InvalidInput();

        // Validate staking contract
        try IBETRStaking(_stakingContract).totalStakedAmount() returns (uint256) {
            // Contract responds to totalStakedAmount() - likely a valid staking contract
        } catch {
            revert InvalidInput();
        }

        stakingContract = IBETRStaking(_stakingContract);
    }

    /*
     * @title TokenNotRewardable
     * @notice Error to check if the token is not rewardable
     */
    error TokenNotRewardable();

    /*
     * @title RewardingPaused
     * @notice Error to check if the rewarding is paused
     */
    error RewardingPaused();

    /*
     * @title NoClaimableReward
     * @notice Error to check if there is no claimable reward
     * @param _staker The address of the staker
     * @param _token The address of the token
     */
    error NoClaimableReward(address _staker, address _token);

    /*
     * @title NoStakedAmount
     * @notice Error to check if there is no staked amount
     */
    error NoStakedAmount();

    /*
     * @title RewardingPausedSet
     * @notice Event to notify when the rewarding is paused
     * @param _isRewardingPaused The new rewarding paused state
     */
    event RewardingPausedSet(bool indexed _isRewardingPaused);

    /*
     * @title RewardableTokenSet
     * @notice Event to notify when a token is set as rewardable
     * @param _token The address of the token
     * @param _rewardable Whether the token is rewardable
     */
    event RewardableTokenSet(address indexed _token, bool _rewardable);

    /*
     * @title RewardAdded
     * @notice Event to notify when a reward is added
     * @param _token The address of the token
     * @param _amount The amount of the reward
     */
    event RewardAdded(address indexed _token, uint256 _amount);

    /*
     * @title RewardClaimed
     * @notice Event to notify when a reward is claimed
     * @param _staker The address of the staker
     * @param _token The address of the token
     * @param _amount The amount of the reward
     */
    event RewardClaimed(address indexed _staker, address indexed _token, uint256 _amount);

    /*
     * @title _getReward
     * @notice Function to get the reward for a staker and token
     * @param _staker The address of the staker
     * @param _token The address of the token
     * @return reward The reward for the staker and token
     */
    function _getReward(address _staker, address _token) internal returns (Reward storage) {
        Reward[] storage rewards = _rewards[_staker];
        uint256 rewardsLength = rewards.length;
        for (uint256 i = 0; i < rewardsLength; i++) {
            if (rewards[i].token == _token) return rewards[i];
        }
        rewards.push(Reward(_token, 0));
        return rewards[rewardsLength];
    }

    /*
     * @title _removeReward
     * @notice Function to remove a reward
     * @param _staker The address of the staker
     * @param _token The address of the token
     */
    function _removeReward(address _staker, address _token) internal {
        Reward[] storage rewards = _rewards[_staker];
        uint256 rewardsLength = rewards.length;
        for (uint256 i = 0; i < rewardsLength; i++) {
            if (rewards[i].token == _token) {
                rewards[i] = rewards[rewardsLength - 1];
                rewards.pop();
                return;
            }
        }
    }

    /*
     * @title _claim
     * @notice Function to claim a reward
     * @param _user The address of the user
     * @param _token The address of the token
     */
    function _claim(address _user, address _token) internal {
        if (_user == address(0)) revert InvalidInput();
        if (_token == address(0)) revert InvalidInput();
        if (!rewardableTokens[_token]) revert TokenNotRewardable();

        Reward storage reward = _getReward(_user, _token);
        uint256 rewardAmount = reward.amount;
        if (rewardAmount == 0) revert NoClaimableReward(_user, _token);

        _removeReward(_user, _token);
        totalRewardsClaimed[_token] += rewardAmount;
        totalRewardsClaimable[_token] -= rewardAmount;
        IERC20(_token).transfer(_user, rewardAmount);
        emit RewardClaimed(_user, _token, rewardAmount);
    }

    /*
     * @title _claimAndStake
     * @notice Function to claim a reward and stake it
     * @param _user The address of the user
     * @param _token The address of the token
     */
    function _claimAndStake(address _user, address _token) internal {
        if (_user == address(0)) revert InvalidInput();
        if (_token == address(0)) revert InvalidInput();
        if (!rewardableTokens[_token]) revert TokenNotRewardable();
        if (address(stakingContract.stakingToken()) != _token) revert InvalidInput();
        
        Reward storage reward = _getReward(_user, _token);
        uint256 rewardAmount = reward.amount;
        if (rewardAmount == 0) revert NoClaimableReward(_user, _token);

        _removeReward(_user, _token);
        totalRewardsClaimed[_token] += rewardAmount;
        totalRewardsClaimable[_token] -= rewardAmount;
        IERC20(_token).approve(address(stakingContract), rewardAmount);
        emit RewardClaimed(_user, _token, rewardAmount);
        stakingContract.stakeFor(_user, rewardAmount);
    }

    /*
     * @title _claimAll
     * @notice Function to claim all rewards for a user
     * @param _user The address of the user
     */
    function _claimAll(address _user) internal {
        if (_user == address(0)) revert InvalidInput();

        Reward[] storage rewards = _rewards[_user];
        if (rewards.length == 0) return;

        for (uint256 i = 0; i < rewards.length; i++) {
            address token = rewards[i].token;
            uint256 rewardAmount = rewards[i].amount;

            if (rewardAmount > 0) {
                rewards[i].amount = 0;
                totalRewardsClaimed[token] += rewardAmount;
                totalRewardsClaimable[token] -= rewardAmount;
                IERC20(token).transfer(_user, rewardAmount);
                emit RewardClaimed(_user, token, rewardAmount);
            }
        }
        delete _rewards[_user];
    }

    /*
     * @title claimable
     * @notice Function to get the claimable rewards for the caller
     * @param _staker The address of the staker
     * @return _tokens The tokens of the claimable rewards
     * @return _amounts The amounts of the claimable rewards
     */
    function claimable(address _staker) public view returns (address[] memory _tokens, uint256[] memory _amounts) {
        Reward[] storage rewards = _rewards[_staker];
        uint256 rewardsLength = rewards.length;
        _tokens = new address[](rewardsLength);
        _amounts = new uint256[](rewardsLength);
        for (uint256 i = 0; i < rewardsLength; i++) {
            _tokens[i] = rewards[i].token;
            _amounts[i] = rewards[i].amount;
        }
    }

    /*
     * @notice Set the rewardable tokens
     * @param _token The address of the token
     * @param _rewardable Whether the token is rewardable
     */
    function setRewardableToken(address _token, bool _rewardable) public onlyOwner {
        if (_token == address(0)) revert InvalidInput();
        rewardableTokens[_token] = _rewardable;
        emit RewardableTokenSet(_token, _rewardable);
    }

    /*
     * @title addReward
     * @notice Function to add a reward
     * @param _token The address of the token
     * @param _amount The amount of the reward
     * @param _users The addresses of the users to add the reward to
     * @param _proportionalToTotalStakedAmount When true, the reward is proportional to the total staked amount, when false, the reward is proportional to the staked amount of the _users
     */
    function addRewardTo(address _token, uint256 _amount, address[] memory _users, bool _proportionalToTotalStakedAmount) public {
        if (isRewardingPaused) revert RewardingPaused();
        if (_token == address(0)) revert InvalidInput();
        if (_amount == 0) revert InvalidInput();
        if (_users.length == 0) revert InvalidInput();
        if (!rewardableTokens[_token]) revert TokenNotRewardable();

        uint256 usersLength = _users.length;
        uint256 totalStakedAmount = 0;
        if (_proportionalToTotalStakedAmount) {
            totalStakedAmount = stakingContract.totalStakedAmount();
        }
        else {
            totalStakedAmount = 0;
            for (uint256 i = 0; i < usersLength; i++) {
                address staker = _users[i];
                if (staker == address(0)) revert InvalidInput();
                uint256 stakedAmount = stakingContract.stakedAmount(staker);
                totalStakedAmount += stakedAmount;
            }
        }
        if (totalStakedAmount == 0) revert NoStakedAmount();
        
        uint256 totalRewardsAdded = 0;
        for (uint256 i = 0; i < usersLength; i++) {
            address staker = _users[i];
            if (staker == address(0)) revert InvalidInput();
            uint256 stakedAmount = stakingContract.stakedAmount(staker);
            uint256 rewardAmount = (_amount * stakedAmount) / totalStakedAmount;
            if (rewardAmount > 0) {
                Reward storage reward = _getReward(staker, _token);
                reward.amount += rewardAmount;
                totalRewardsAdded += rewardAmount;
            }
        }

        totalRewardsClaimable[_token] += totalRewardsAdded;
        IERC20(_token).transferFrom(msg.sender, address(this), totalRewardsAdded);
        emit RewardAdded(_token, totalRewardsAdded);
    }

    /*
     * @title addReward
     * @notice Function to add a reward
     * @param _token The address of the token
     * @param _amount The amount of the reward
     */
    function addReward(address _token, uint256 _amount) public {
        addRewardTo(_token, _amount, stakingContract.stakers(), true);
    }

    /*
     * @title claim
     * @notice Function to claim a reward
     * @param _token The address of the token
     */
    function claim(address _token) public {
        if (isRewardingPaused) revert RewardingPaused();
        _claim(msg.sender, _token);
    }

    /*
     * @title claimAndStake
     * @notice Function to claim a reward and stake it
     * @param _token The address of the token
     */
    function claimAndStake(address _token) public {
        if (isRewardingPaused) revert RewardingPaused();
        _claimAndStake(msg.sender, _token);
    }

    /*
     * @title claimAll
     * @notice Function to claim all rewards for the caller
     */
    function claimAll() public {
        if (isRewardingPaused) revert RewardingPaused();
        _claimAll(msg.sender);
    }

    /*
     * @title batchClaim
     * @notice Admin function to claim all rewards for multiple users (owner only)
     * @param _users Array of addresses of the users to claim rewards for
     * @dev This function bypasses the rewarding pause for emergency situations
     */
    function batchClaim(address[] memory _users) public onlyOwner {
        for (uint256 i = 0; i < _users.length; i++) {
            _claimAll(_users[i]);
        }
    }

    /*
     * @title setStakingPaused
     * @notice Function to set the staking paused state
     * @param _isRewardingPaused The new rewarding paused state
     */
    function setRewardingPaused(bool _isRewardingPaused) public onlyOwner {
        isRewardingPaused = _isRewardingPaused;
        emit RewardingPausedSet(_isRewardingPaused);
    }
}
