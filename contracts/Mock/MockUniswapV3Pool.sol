// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MockUniswapV3Pool {
    address public immutable token0;
    address public immutable token1;
    uint24 public immutable fee;
    int24 public immutable tickSpacing;
    uint128 public immutable maxLiquidityPerTick;

    // Mock price data - configurable sqrtPriceX96 for different price ratios
    uint160 public immutable sqrtPriceX96;
    int24 public tick = 0;
    uint16 public observationIndex = 0;
    uint16 public observationCardinality = 0;
    uint16 public observationCardinalityNext = 0;
    uint8 public feeProtocol = 0;
    bool public unlocked = true;

    constructor(address _token0, address _token1, uint160 _sqrtPriceX96) {
        // Uniswap V3 orders tokens by address (lexicographically)
        if (_token0 < _token1) {
            token0 = _token0;
            token1 = _token1;
        } else {
            token0 = _token1;
            token1 = _token0;
        }
        fee = 3000; // 0.3%
        tickSpacing = 60;
        maxLiquidityPerTick = 11505743598341114571880798222544994;
        sqrtPriceX96 = _sqrtPriceX96;
    }

    function slot0() external view returns (
        uint160 _sqrtPriceX96,
        int24 _tick,
        uint16 _observationIndex,
        uint16 _observationCardinality,
        uint16 _observationCardinalityNext,
        uint8 _feeProtocol,
        bool _unlocked
    ) {
        return (sqrtPriceX96, tick, observationIndex, observationCardinality, observationCardinalityNext, feeProtocol, unlocked);
    }
}