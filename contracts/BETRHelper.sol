// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/*
 * @title BETRHelper
 * @author Mirko Nosenzo (@netnose)
 * @notice This contract is used to help with the BETR transactions
 */
contract BETRHelper {
    address public owner;
    address public proposedOwner;
    uint256 public availableCalls;

    /*
     * @notice Constructor
     * @param _owner The owner of the contract
     */
    constructor(address _owner) {
        owner = _owner;
    }

    /*
     * @title NotOwner
     * @notice Error to check if the caller is the owner
     */
    error NotOwner();

    /*
     * @title NotEnoughCallsAvailable
     * @notice Error to check if the available calls are less than the amount of calls to subtract
     */
    error NotEnoughCallsAvailable();

    /*
     * @title SubcallFailed
     * @notice Error to check if the subcall failed
     */
    error SubcallFailed();

    /*
     * @title InvalidInput
     * @notice Error to check if the input is invalid
     */
    error InvalidInput();

    /*
     * @title NotProposedOwner
     * @notice Error to check if the caller is the proposed owner
     */
    error NotProposedOwner();

    /*
     * @title NotEnoughValue
     * @notice Error to check if the value is not enough
     * @param required The required value
     * @param provided The provided value
     */
    error NotEnoughValue(uint256 required, uint256 provided);

    /*
     * @title OwnershipTransferred
     * @notice Event to notify when ownership is transferred
     * @param previousOwner The previous owner
     * @param newOwner The new owner
     */
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /*
     * @title AvailableCallsUpdated
     * @notice Event to notify when available calls are updated
     * @param newAmount The new amount of available calls
     */
    event AvailableCallsUpdated(uint256 newAmount);

    /*
     * @title Called
     * @notice Event to notify when a subcall is performed
     * @param amount The amount that was passed to the subcall
     * @param smartContract The smart contract that was called
     * @param data The data that was passed to the subcall
     */
    event Called(uint256 indexed amount, address indexed smartContract, bytes data);

    /*
     * @title onlyOwner
     * @notice Modifier to check if the caller is the owner
     */
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /*
     * @title enoughSubcallsAvailable
     * @notice Modifier to check if the amount of subcalls available is enough
     * @param _amount The amount of subcalls
     */
    modifier enoughSubcallsAvailable(uint256 _amount) {
        if (_amount == 0) revert InvalidInput();
        if (availableCalls < _amount) revert NotEnoughCallsAvailable();
        availableCalls -= _amount;
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
     * @title setAvailableCalls
     * @notice Function to set the available calls
     * @param _availableCalls The available calls
     */
    function setAvailableCalls(uint256 _availableCalls) public onlyOwner {
        availableCalls = _availableCalls;
        emit AvailableCallsUpdated(_availableCalls);
    }

    /*
     * @title subcall
     * @notice Function to call a smart contract
     * @param _amount The amount of calls to subtract from the available calls
     * @param _smartContract The smart contract to call
     * @param _data The data to call the smart contract with
     */
    function subcall(uint256 _amount, address _smartContract, bytes calldata _data) public enoughSubcallsAvailable(_amount) payable returns (bytes memory result) {
        result = _performSubcall(_smartContract, _data, msg.value);
        emit Called(_amount, _smartContract, _data);
    }

    /*
     * @title loopSubcall
     * @notice Function to call a smart contract in a loop
     * @param _amount The amount of calls
     * @param _smartContract The smart contract to call
     * @param _data The data to call the smart contract with
     */
    function loopSubcall(uint256 _amount, address _smartContract, bytes calldata _data) public enoughSubcallsAvailable(_amount) payable returns (bytes[] memory results) {
        uint256 value = msg.value / _amount;
        results = new bytes[](_amount);
        for (uint256 i = 0; i < _amount; i++) {
            results[i] = _performSubcall(_smartContract, _data, value);
        }
        emit Called(_amount, _smartContract, _data);
    }

    /*
     * @title multiCall
     * @notice Function to call multiple smart contracts
     * @param _smartContracts The smart contracts to call
     * @param _datas The data to call the smart contracts with
     * @param _values The values to call the smart contracts with
     */
    function multiCall(
        address[] calldata _smartContracts, 
        bytes[] calldata _datas, 
        uint256[] calldata _values
    ) public payable returns (bytes[] memory results) {
        if (_smartContracts.length == 0) revert InvalidInput();
        if (_smartContracts.length != _datas.length || _smartContracts.length != _values.length) revert InvalidInput();

        uint256 totalValue = 0;
        for (uint256 i = 0; i < _values.length; i++) {
            totalValue += _values[i];
        }
        if (msg.value < totalValue) revert NotEnoughValue(totalValue, msg.value);

        results = new bytes[](_smartContracts.length);
        for (uint256 i = 0; i < _smartContracts.length; i++) {
            results[i] = _performSubcall(_smartContracts[i], _datas[i], _values[i]);
        }
    }

    /*
     * @title _performSubcall
     * @notice Function to perform a subcall
     * @param _smartContract The smart contract to call
     * @param _data The data to call the smart contract with
     * @param _value The value to call the smart contract with
     */
    function _performSubcall(address _smartContract, bytes calldata _data, uint256 _value) internal returns (bytes memory result) {
        if (_smartContract == address(0)) revert InvalidInput();

        bool success;
        (success, result) = _smartContract.call{value: _value}(_data);
        if (!success) revert SubcallFailed();
    }

    /*
     * @title recoverETH
     * @notice Function to recover accidentally sent ETH
     */
    function recoverETH() public {
        payable(owner).transfer(address(this).balance);
    }
}
