# BETR Contracts

This is a collection of smart contracts that simplify onchain BETRMINT operations. The repository provides a comprehensive suite of utilities for managing transactions, staking, and rewards in the BETR ecosystem.

## Contracts

### BETRHelper
A utility contract designed to help with BETR transactions by managing controlled subcalls. It features:
- **Available calls management**: Owner-controlled limit on the number of subcalls that can be performed
- **Flexible call patterns**: Support for single subcalls, loop subcalls, and multicalls
- **Safe execution**: Built-in checks to ensure subcalls succeed
- **Ownership management**: Two-step ownership transfer for enhanced security

### BETRERC20Payer
A payment gateway that enables paying with ERC20 tokens for ETH-based transactions. Features include:
- **Uniswap V3 integration**: Uses Uniswap V3 pools for real-time token pricing
- **Slippage protection**: Built-in price deviation checks (1% maximum)
- **ERC20 Permit support**: Gasless approvals using EIP-2612 permit signatures
- **Whitelisted destinations**: Only allows payments to pre-approved contract addresses
- **Reentrancy protection**: Uses transient storage guards to prevent reentrancy attacks

### BETRStaking
An ERC20 token staking contract with advanced features:
- **Flexible staking**: Users can stake tokens and stake on behalf of others
- **Event handlers**: Supports multiple rewarder contracts that react to staking events
- **Batch operations**: Owner can perform batch unstaking for multiple users
- **Pause mechanism**: Emergency pause functionality for both staking and unstaking
- **Total supply tracking**: Keeps track of total staked amounts across all users

### BETRRewards
A rewards distribution system that works in conjunction with BETRStaking:
- **Proportional rewards**: Distributes rewards proportionally to staked amounts
- **Auto-compounding**: Automatically tracks rewards as users stake/unstake
- **Batch claiming**: Owner can claim rewards for multiple users in emergencies
- **High precision**: Uses 18 decimal precision for accurate reward calculations
- **Debt/credit system**: Efficient tracking of individual user rewards

## Scripts

### Development

#### `npm run test`
Runs the full test suite using Hardhat. This executes all unit tests to ensure contract functionality and correctness.

```bash
npm run test
```

#### `npm run coverage`
Generates a code coverage report for the Solidity contracts. This helps identify untested code paths and ensures comprehensive test coverage.

```bash
npm run coverage
```

#### `npm run compile`
Compiles all Solidity smart contracts using the Hardhat compiler. This generates the necessary artifacts and type definitions for deployment and testing.

```bash
npm run compile
```

### Deployment

#### `npm run deploy:helper`
Deploys the `BETRHelper` contract to the Base network. This utility contract helps manage BETR transactions with controlled subcalls.

```bash
npm run deploy:helper
```

#### `npm run deploy:helper:arb`
Deploys the `BETRHelper` contract to the Arbitrum network. Same functionality as the Base deployment but on a different chain.

```bash
npm run deploy:helper:arb
```

#### `npm run deploy:erc20payer`
Deploys the `BETRERC20Payer` contract to the Base network. This contract enables ERC20 token payments for ETH transactions.

```bash
npm run deploy:erc20payer
```

#### `npm run deploy:staking`
Deploys the `BETRStaking` contract to the Base network using parameters from `ignition/parameters.json`. This sets up the staking infrastructure.

```bash
npm run deploy:staking
```

#### `npm run deploy:rewards`
Deploys the `BETRRewards` contract to the Base network using parameters from `ignition/parameters.json`. This contract manages reward distribution for stakers.

```bash
npm run deploy:rewards
```

**Note:** After deploying the rewards contract, you must register it as a rewarder in the `BETRStaking` contract by calling the `addRewarder(address)` function with the deployed rewards contract address. This step is essential for the rewards contract to receive staking event notifications.

#### `npm run deploy:indexer`
Deploys the BETR contracts subgraph to Goldsky for indexing blockchain events. This enables efficient querying of contract data and events.

```bash
npm run deploy:indexer
```

## Configuration

Deployment parameters are configured in `ignition/parameters.json`. Make sure to review and update these parameters before deploying to production networks.

## License

This project is licensed under the MIT License. See the LICENSE file for details.

## Author

Created by Mirko Nosenzo ([@netnose](https://github.com/netnose))
