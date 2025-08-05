// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "./common/Ownable.sol";
import {IBETRStakingEventHandler} from "./interfaces/IBETRStakingEventHandler.sol";
import {IBETRStakingStateProvider} from "./interfaces/IBETRStakingStateProvider.sol";
import {InvalidInput, TokensTransferError} from "./common/error.sol";

/*
 * @title BETRRewards
 * @author Mirko Nosenzo (@netnose)
 * @notice This contract is used to manage rewards for the staking contract
 */
contract BETRRewards is IBETRStakingEventHandler, Ownable {
    mapping(address => uint256) private _debts;
    mapping(address => uint256) private _credits;

    uint256 public constant PRECISION = 1e18;

    IBETRStakingStateProvider public stakingContract;
    IERC20 public rewardToken;
    uint256 public rewardAccumulatedPerStakedToken;
    uint256 public totalRewardsClaimed;
    uint256 public totalRewardsClaimable;
    bool public isRewardingPaused;

    /*
     * @notice Constructor
     * @param _owner The owner of the contract
     * @param _stakingContract The address of the staking contract
     * @param _rewardToken The address of the reward token
     */
    constructor(address _owner, address _stakingContract, address _rewardToken) Ownable(_owner) {
        if (_stakingContract == address(0)) revert InvalidInput();
        if (_rewardToken == address(0)) revert InvalidInput();

        stakingContract = IBETRStakingStateProvider(_stakingContract);
        rewardToken = IERC20(_rewardToken);
    }

    /*
     * @title RewardingPaused
     * @notice Error to check if the rewarding is paused
     */
    error RewardingPaused();

    /*
     * @title NoClaimableReward
     * @notice Error to check if there is no claimable reward
     * @param _staker The address of the staker
     */
    error NoClaimableReward(address _staker);

    /*
     * @title NoStakedAmount
     * @notice Error to check if there is no staked amount
     */
    error NoStakedAmount();

    /*
     * @title NotStakingContract
     * @notice Error to check if the caller is not the staking contract
     */
    error NotStakingContract();

    /*
     * @title StakingContractNotRewarder
     * @notice Error to check if the caller is not a rewarder
     */
    error StakingContractNotRewarder();

    /*
     * @title RewardingPausedSet
     * @notice Event to notify when the rewarding is paused
     * @param _isRewardingPaused The new rewarding paused state
     */
    event RewardingPausedSet(bool indexed _isRewardingPaused);

    /*
     * @title RewardAdded
     * @notice Event to notify when a reward is added
     * @param _amount The amount of the reward
     */
    event RewardAdded(uint256 _amount);

    /*
     * @title RewardClaimed
     * @notice Event to notify when a reward is claimed
     * @param _staker The address of the staker
     * @param _amount The amount of the reward
     */
    event RewardClaimed(address indexed _staker, uint256 _amount);

    /*
     * @title onlyStakingContract
     * @notice Modifier to check if the caller is the staking contract
     */
    modifier onlyStakingContract() {
        if (msg.sender != address(stakingContract)) revert NotStakingContract();
        _;
    }

    /*
     * @title _claim
     * @notice Function to claim a reward
     * @param _user The address of the user
     */
    function _claim(address _user, uint256 _stakedAmount) internal {
        if (_user == address(0)) revert InvalidInput();

        uint256 rewardAmount = rewardAccumulatedPerStakedToken * _stakedAmount / PRECISION;
        uint256 actualRewardAmount = rewardAmount - _debts[_user] + _credits[_user];
        if (actualRewardAmount == 0) revert NoClaimableReward(_user);

        _debts[_user] = rewardAmount;
        _credits[_user] = 0;
        totalRewardsClaimed += actualRewardAmount;
        totalRewardsClaimable -= actualRewardAmount;

        try rewardToken.transfer(_user, actualRewardAmount) returns (bool success) {
            if (!success) revert TokensTransferError();
        } catch {
            revert TokensTransferError();
        }
        
        emit RewardClaimed(_user, actualRewardAmount);
    }

    /*
     * @title claimable
     * @notice Function to get the claimable rewards for a staker
     * @param _staker The address of the staker
     * @return _amount The amount of the claimable rewards
     */
    function claimable(address _staker) public view returns (uint256 _amount) {
        uint256 rewardAmount = rewardAccumulatedPerStakedToken * stakingContract.stakedAmount(_staker) / PRECISION;
        uint256 actualRewardAmount = rewardAmount - _debts[_staker] + _credits[_staker];
        return actualRewardAmount;
    }

    /*
     * @title claimable
     * @notice Function to get the claimable rewards for the caller
     * @return _amount The amount of the claimable rewards
     */
    function claimable() public view returns (uint256 _amount) {
        return claimable(msg.sender);
    }

    /*
     * @title addReward
     * @notice Function to add a reward
     * @param _amount The amount of the reward
     */
    function addReward(uint256 _amount) public {
        if (isRewardingPaused) revert RewardingPaused();
        if (_amount == 0) revert InvalidInput();
        if (!stakingContract.isRewarder(address(this))) revert StakingContractNotRewarder();

        uint256 totalStakedAmount = stakingContract.totalStakedAmount();
        if (totalStakedAmount == 0) revert NoStakedAmount();

        rewardAccumulatedPerStakedToken += (_amount * PRECISION) / totalStakedAmount;
        totalRewardsClaimable += _amount;

        try rewardToken.transferFrom(msg.sender, address(this), _amount) returns (bool success) {
            if (!success) revert TokensTransferError();
        } catch {
            revert TokensTransferError();
        }

        emit RewardAdded(_amount);
    }

    /*
     * @title claim
     * @notice Function to claim a reward
     */
    function claim() public {
        if (isRewardingPaused) revert RewardingPaused();
        _claim(msg.sender, stakingContract.stakedAmount(msg.sender));
    }

    /*
     * @title batchClaim
     * @notice Admin function to claim all rewards for multiple users (owner only)
     * @param _users Array of addresses of the users to claim rewards for
     * @dev This function bypasses the rewarding pause for emergency situations
     */
    function batchClaim(address[] memory _users) public onlyOwner {
        for (uint256 i = 0; i < _users.length; i++) {
            _claim(_users[i], stakingContract.stakedAmount(_users[i]));
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

    /*
     * @title onStakeChanged
     * @notice Function to handle the stake changed event
     * @param _user The address of the user
     * @param _oldAmount The old amount of the stake
     * @param _newAmount The new amount of the stake
     */
    function onStakeChanged(address _user, uint256 _oldAmount, uint256 _newAmount) public onlyStakingContract {
        if (_user == address(0)) revert InvalidInput();
        if (_oldAmount == _newAmount) return;

        uint256 rewardAmount = rewardAccumulatedPerStakedToken * _oldAmount / PRECISION;
        uint256 actualRewardAmount = rewardAmount - _debts[_user] + _credits[_user];
        _credits[_user] = actualRewardAmount;
        _debts[_user] = rewardAccumulatedPerStakedToken * _newAmount / PRECISION;
    }
}
