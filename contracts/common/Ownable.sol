// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {InvalidInput} from "./error.sol";

/*
 * @title Ownable
 * @author Mirko Nosenzo (@netnose)
 * @notice This contract is used to manage the ownership of the contract
 */
abstract contract Ownable {
    address public owner;
    address public proposedOwner;

    /*
     * @notice Constructor
     * @param _owner The owner of the contract
     */
    constructor(address _owner) {
        if (_owner == address(0)) revert InvalidInput();
        owner = _owner;
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
     * @title OwnershipTransferred
     * @notice Event to notify when ownership is transferred
     * @param previousOwner The previous owner
     * @param newOwner The new owner
     */
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /*
     * @title onlyOwner
     * @notice Modifier to check if the caller is the owner
     */
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /*
     * @title onlyProposedOwner
     * @notice Modifier to check if the caller is the proposed owner
     */
    modifier onlyProposedOwner() {
        if (msg.sender != proposedOwner) revert NotProposedOwner();
        _;
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
    function acceptOwnership() public onlyProposedOwner {
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
}
