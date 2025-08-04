// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/*
 * @title IBETRStakingStateProvider
 * @notice Interface for the staking state provider
 */
interface IBETRStakingStateProvider {
    /*
     * @title isRewarder
     * @notice Function to check if an address is a rewarder
     * @param _contract The address to check
     * @return isRewarder True if the address is a rewarder, false otherwise
     */
    function isRewarder(address _contract) external view returns (bool);

    /*
     * @title stakingToken
     * @notice Function to get the staking token
     * @return stakingToken The staking token
     */
    function stakingToken() external view returns (IERC20);
    
    /*
     * @title totalStakedAmount
     * @notice Function to get the total amount of tokens staked
     * @return totalStakedAmount The total amount of tokens staked
     */
    function totalStakedAmount() external view returns (uint256);

    /*
     * @title stakedAmount
     * @notice Function to get the amount of tokens staked by a user
     * @param _user The address of the user
     * @return stakedAmount The amount of tokens staked by the user
     */
    function stakedAmount(address _user) external view returns (uint256);
}
