// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 * @title IBETRStakingEventHandler
 * @notice Interface for the staking event handler
 */
interface IBETRStakingEventHandler {
    /*
     * @title onStakeChanged
     * @notice Function to handle the stake changed event
     * @param _user The user who changed the stake
     * @param _oldAmount The old amount of stake
     * @param _newAmount The new amount of stake
     */
    function onStakeChanged(address _user, uint256 _oldAmount, uint256 _newAmount) external;
}
