// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IBETRStaking {
    /*
     * @title isStakingPaused
     * @notice Function to check if the staking is paused
     * @return isStakingPaused The staking paused state
     */
    function isStakingPaused() external view returns (bool);

    /*
     * @title setStakingPaused
     * @notice Function to set the staking paused state
     * @param _isStakingPaused The new staking paused state
     */
    function setStakingPaused(bool _isStakingPaused) external;

    /*
     * @title stakingToken
     * @notice Function to get the staking token
     * @return stakingToken The staking token
     */
    function stakingToken() external view returns (IERC20);
    
    /*
     * @title stake
     * @notice Function to stake tokens
     * @param _amount The amount of tokens to stake
     */
    function stake(uint256 _amount) external;

    /*
     * @title stakeFor
     * @notice Function to stake tokens for a user
     * @param _user The user to stake tokens for
     * @param _amount The amount of tokens to stake
     */
    function stakeFor(address _user, uint256 _amount) external;

    /*
     * @title unstake
     * @notice Function to unstake tokens
     * @param _amount The amount of tokens to unstake
     */
    function unstake(uint256 _amount) external;

    /*
     * @title batchUnstake
     * @notice Function to unstake tokens for multiple users
     * @param _users The addresses of the users to unstake tokens for
     * @param _amounts The amounts of tokens to unstake for each user
     */
    function batchUnstake(address[] calldata _users, uint256[] calldata _amounts) external;

    /*
     * @title totalStakedAmount
     * @notice Function to get the total amount of tokens staked
     * @return totalStakedAmount The total amount of tokens staked
     */
    function totalStakedAmount() external view returns (uint256);

    /*
     * @title stakers
     * @notice Function to get the addresses of the stakers
     * @return stakers The addresses of the stakers
     */
    function stakers() external view returns (address[] memory);

    /*
     * @title stakersCount
     * @notice Function to get the number of stakers
     * @return stakersCount The number of stakers
     */
    function stakersCount() external view returns (uint256);

    /*
     * @title stakedAmount
     * @notice Function to get the amount of tokens staked by a user
     * @param _user The address of the user
     * @return stakedAmount The amount of tokens staked by the user
     */
    function stakedAmount(address _user) external view returns (uint256);
}
