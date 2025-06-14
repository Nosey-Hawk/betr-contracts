// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract Mock {
    uint256 public calls;

    function getCalls() public view returns (uint256) {
        return calls;
    }

    function testSuccess() public payable {
        calls++;
    }
    function testRevert() public payable {
        revert("Mock");
    }
}