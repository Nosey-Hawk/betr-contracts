// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IBETRStakingEventHandler} from "../interfaces/IBETRStakingEventHandler.sol";

/*
 * @title MockRewarder
 * @notice Mock rewarder contract for testing onStakeChanged calls
 */
contract MockRewarder is IBETRStakingEventHandler {
    // Track total calls
    uint256 public totalCalls;
    
    // Track calls per user
    mapping(address => uint256) public userCalls;
    
    // Track the last call details for each user
    mapping(address => StakeChange) public lastStakeChange;
    
    // Track all stake changes for each user
    mapping(address => StakeChange[]) public userStakeChanges;
    
    // Structure to store stake change details
    struct StakeChange {
        address user;
        uint256 oldAmount;
        uint256 newAmount;
        uint256 timestamp;
        uint256 callIndex;
    }
    
    // Event to emit when onStakeChanged is called
    event StakeChangedCalled(
        address indexed user,
        uint256 oldAmount,
        uint256 newAmount,
        uint256 callIndex
    );

    /*
     * @title onStakeChanged
     * @notice Implementation of the IBETRStakingEventHandler interface
     * @param _user The user who changed the stake
     * @param _oldAmount The old amount of stake
     * @param _newAmount The new amount of stake
     */
    function onStakeChanged(address _user, uint256 _oldAmount, uint256 _newAmount) external override {
        totalCalls++;
        userCalls[_user]++;
        
        // Create stake change record
        StakeChange memory change = StakeChange({
            user: _user,
            oldAmount: _oldAmount,
            newAmount: _newAmount,
            timestamp: block.timestamp,
            callIndex: totalCalls
        });
        
        // Store the last call for this user
        lastStakeChange[_user] = change;
        
        // Add to user's history
        userStakeChanges[_user].push(change);
        
        // Emit event
        emit StakeChangedCalled(_user, _oldAmount, _newAmount, totalCalls);
    }
    
    /*
     * @title getTotalCalls
     * @notice Get the total number of onStakeChanged calls
     * @return Total number of calls
     */
    function getTotalCalls() public view returns (uint256) {
        return totalCalls;
    }
    
    /*
     * @title getUserCalls
     * @notice Get the number of calls for a specific user
     * @param _user The user address
     * @return Number of calls for the user
     */
    function getUserCalls(address _user) public view returns (uint256) {
        return userCalls[_user];
    }
    
    /*
     * @title getLastStakeChange
     * @notice Get the last stake change for a user
     * @param _user The user address
     * @return user The user address
     * @return oldAmount The old amount
     * @return newAmount The new amount
     * @return timestamp The timestamp of the call
     * @return callIndex The call index
     */
    function getLastStakeChange(address _user) public view returns (
        address user,
        uint256 oldAmount,
        uint256 newAmount,
        uint256 timestamp,
        uint256 callIndex
    ) {
        StakeChange memory change = lastStakeChange[_user];
        return (change.user, change.oldAmount, change.newAmount, change.timestamp, change.callIndex);
    }
    
    /*
     * @title getUserStakeChanges
     * @notice Get all stake changes for a user
     * @param _user The user address
     * @return Array of stake changes
     */
    function getUserStakeChanges(address _user) public view returns (StakeChange[] memory) {
        return userStakeChanges[_user];
    }
    
    /*
     * @title getUserStakeChangesCount
     * @notice Get the number of stake changes for a user
     * @param _user The user address
     * @return Number of stake changes
     */
    function getUserStakeChangesCount(address _user) public view returns (uint256) {
        return userStakeChanges[_user].length;
    }
    
    /*
     * @title reset
     * @notice Reset all tracking data (for testing)
     */
    function reset() public {
        totalCalls = 0;
        // Note: This doesn't clear mappings as they're expensive to clear
        // In a real test scenario, you'd deploy a new instance
    }
} 