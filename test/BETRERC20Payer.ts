import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, encodeFunctionData, parseEther } from "viem";
import { Signature } from "ethers";

describe("BETRERC20Payer", function () {
  // We define a fixture to reuse the same setup in every test.
  async function deployBETRERC20PayerFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount, user] = await hre.viem.getWalletClients();

    // Deploy mock WETH
    const mockWETH = await hre.viem.deployContract("MockERC20", ["Wrapped Ether", "WETH", 18]);
    
    // Deploy mock ERC20 token
    const mockToken = await hre.viem.deployContract("MockERC20", ["Test Token", "TEST", 18]);
    
    // Deploy mock Uniswap V3 Pool with 1:1 price ratio
    const mockPool = await hre.viem.deployContract("MockUniswapV3Pool", [
      mockToken.address, 
      mockWETH.address, 
      79228162514264337593543950336n // 2^96 for 1:1 price
    ]);
    
    // Deploy BETRERC20Payer
    const betrERC20Payer = await hre.viem.deployContract("BETRERC20Payer", [owner.account.address, mockWETH.address]);
    
    // Deploy mock destination contract
    const mockDestination = await hre.viem.deployContract("Mock");

    const publicClient = await hre.viem.getPublicClient();

    return {
      betrERC20Payer,
      mockWETH,
      mockToken,
      mockPool,
      mockDestination,
      owner,
      otherAccount,
      user,
      publicClient,
    };
  }

  // Fixture for multiple tokens with different configurations
  async function deployMultipleTokensFixture() {
    const [owner, otherAccount, user] = await hre.viem.getWalletClients();

    // Deploy mock WETH
    const mockWETH = await hre.viem.deployContract("MockERC20", ["Wrapped Ether", "WETH", 18]);
    
    // Deploy multiple mock ERC20 tokens with different decimals
    const mockToken18 = await hre.viem.deployContract("MockERC20", ["Token 18", "TKN18", 18]);
    const mockToken6 = await hre.viem.deployContract("MockERC20", ["Token 6", "TKN6", 6]);
    const mockToken8 = await hre.viem.deployContract("MockERC20", ["Token 8", "TKN8", 8]);
    const mockToken12 = await hre.viem.deployContract("MockERC20", ["Token 12", "TKN12", 12]);
    
    // Deploy BETRERC20Payer
    const betrERC20Payer = await hre.viem.deployContract("BETRERC20Payer", [owner.account.address, mockWETH.address]);
    
    // Deploy mock destination contract
    const mockDestination = await hre.viem.deployContract("Mock");

    const publicClient = await hre.viem.getPublicClient();

    return {
      betrERC20Payer,
      mockWETH,
      mockToken18,
      mockToken6,
      mockToken8,
      mockToken12,
      mockDestination,
      owner,
      otherAccount,
      user,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Should set the right owner and WETH", async function () {
      const { betrERC20Payer, owner, mockWETH } = await loadFixture(deployBETRERC20PayerFixture);

      expect(await betrERC20Payer.read.owner()).to.equal(
        getAddress(owner.account.address)
      );
      expect(await betrERC20Payer.read.WETH()).to.equal(
        getAddress(mockWETH.address)
      );
    });

    it("Should revert if owner is zero address", async function () {
      const { mockWETH } = await loadFixture(deployBETRERC20PayerFixture);
      
      await expect(
        hre.viem.deployContract("BETRERC20Payer", [
          "0x0000000000000000000000000000000000000000", 
          mockWETH.address
        ])
      ).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if WETH is zero address", async function () {
      const { owner } = await loadFixture(deployBETRERC20PayerFixture);
      
      await expect(
        hre.viem.deployContract("BETRERC20Payer", [
          owner.account.address, 
          "0x0000000000000000000000000000000000000000"
        ])
      ).to.be.rejectedWith("InvalidInput");
    });
  });

  describe("Ownership", function () {
    it("Should prepare the ownership transfer", async function () {
      const { betrERC20Payer, owner, otherAccount } = await loadFixture(deployBETRERC20PayerFixture);

      await betrERC20Payer.write.setProposedOwner([otherAccount.account.address], {
        account: owner.account
      });
      expect(await betrERC20Payer.read.proposedOwner()).to.equal(
        getAddress(otherAccount.account.address)
      );
    });

    it("Should not prepare the ownership transfer if the proposed owner is the zero address", async function () {
      const { betrERC20Payer, owner } = await loadFixture(deployBETRERC20PayerFixture);
      await expect(betrERC20Payer.write.setProposedOwner([getAddress("0x0000000000000000000000000000000000000000")], {
        account: owner.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should not prepare the ownership transfer if the sender is not the owner", async function () {
      const { betrERC20Payer, otherAccount } = await loadFixture(deployBETRERC20PayerFixture);
      await expect(betrERC20Payer.write.setProposedOwner([otherAccount.account.address], {
        account: otherAccount.account
      })).to.be.rejectedWith("NotOwner");
    });

    it("Should accept the ownership transfer", async function () {
      const { betrERC20Payer, owner, otherAccount, publicClient } = await loadFixture(deployBETRERC20PayerFixture);

      let hash = await betrERC20Payer.write.setProposedOwner([otherAccount.account.address], {
        account: owner.account
      });
      await publicClient.waitForTransactionReceipt({ hash });

      expect(await betrERC20Payer.write.acceptOwnership({
        account: otherAccount.account
      })).to.emit(betrERC20Payer, "OwnershipTransferred").withArgs(owner.account.address, otherAccount.account.address);

      expect((await betrERC20Payer.read.owner()).toLocaleLowerCase()).to.equal(otherAccount.account.address.toLocaleLowerCase());
    });

    it("Should not accept the ownership transfer if the sender is not the proposed owner", async function () {
      const { betrERC20Payer, otherAccount } = await loadFixture(deployBETRERC20PayerFixture);
      await expect(betrERC20Payer.write.acceptOwnership({
        account: otherAccount.account
      })).to.be.rejectedWith("NotProposedOwner");
    });

    it("Should cancel the ownership transfer", async function () {
      const { betrERC20Payer, owner, otherAccount, publicClient } = await loadFixture(deployBETRERC20PayerFixture);

      let hash = await betrERC20Payer.write.setProposedOwner([otherAccount.account.address], {
        account: owner.account
      });
      await publicClient.waitForTransactionReceipt({ hash });

      await betrERC20Payer.write.cancelProposedOwnership({
        account: owner.account
      });

      expect((await betrERC20Payer.read.owner()).toLocaleLowerCase()).to.equal(owner.account.address.toLocaleLowerCase());
      expect((await betrERC20Payer.read.proposedOwner()).toLocaleLowerCase()).to.equal("0x0000000000000000000000000000000000000000");
    });

    it("Should not cancel the ownership transfer if the sender is not the owner", async function () {
      const { betrERC20Payer, otherAccount } = await loadFixture(deployBETRERC20PayerFixture);
      await expect(betrERC20Payer.write.cancelProposedOwnership({
        account: otherAccount.account
      })).to.be.rejectedWith("NotOwner");
    });
  });

  describe("ERC20 Token Price Pool Management", function () {
    it("Should set ERC20 token price pool", async function () {
      const { betrERC20Payer, owner, mockToken, mockPool } = await loadFixture(deployBETRERC20PayerFixture);

      // This test passes because our mock implements the required functions (token0, token1, slot0)
      expect(await betrERC20Payer.write.setERC20TokenPricePool([mockToken.address, mockPool.address], {
        account: owner.account
      })).to.emit(betrERC20Payer, "ERC20TokenPricePoolSet").withArgs(mockToken.address, mockPool.address);

      expect((await betrERC20Payer.read.erc20TokenPricePool([mockToken.address])).toLowerCase()).to.equal(mockPool.address.toLowerCase());
    });

    it("Should not set ERC20 token price pool if token is zero address", async function () {
      const { betrERC20Payer, owner, mockPool } = await loadFixture(deployBETRERC20PayerFixture);

      await expect(betrERC20Payer.write.setERC20TokenPricePool([
        "0x0000000000000000000000000000000000000000", 
        mockPool.address
      ], {
        account: owner.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should not set ERC20 token price pool if pool is zero address", async function () {
      const { betrERC20Payer, owner, mockToken } = await loadFixture(deployBETRERC20PayerFixture);

      await expect(betrERC20Payer.write.setERC20TokenPricePool([
        mockToken.address, 
        "0x0000000000000000000000000000000000000000"
      ], {
        account: owner.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should not set ERC20 token price pool if sender is not owner", async function () {
      const { betrERC20Payer, otherAccount, mockToken, mockPool } = await loadFixture(deployBETRERC20PayerFixture);

      await expect(betrERC20Payer.write.setERC20TokenPricePool([mockToken.address, mockPool.address], {
        account: otherAccount.account
      })).to.be.rejectedWith("NotOwner");
    });

    it("Should not set ERC20 token price pool if pool is invalid", async function () {
      const { betrERC20Payer, owner, mockToken } = await loadFixture(deployBETRERC20PayerFixture);
      
      // Deploy invalid pool (doesn't contain the token)
      const invalidPool = await hre.viem.deployContract("MockUniswapV3Pool", [
        "0x0000000000000000000000000000000000000001", 
        "0x0000000000000000000000000000000000000002",
        79228162514264337593543950336n // 2^96 for 1:1 price
      ]);

      await expect(betrERC20Payer.write.setERC20TokenPricePool([mockToken.address, invalidPool.address], {
        account: owner.account
      })).to.be.rejectedWith("InvalidPool");
    });
  });

  describe("Whitelisted Destinations", function () {
    it("Should set whitelisted destination", async function () {
      const { betrERC20Payer, owner, otherAccount } = await loadFixture(deployBETRERC20PayerFixture);

      expect(await betrERC20Payer.write.setWhitelistedDestination([otherAccount.account.address, true], {
        account: owner.account
      })).to.emit(betrERC20Payer, "WhitelistedDestinationSet").withArgs(otherAccount.account.address, true);

      expect(await betrERC20Payer.read.whitelistedDestinations([otherAccount.account.address])).to.be.true;
    });

    it("Should remove whitelisted destination", async function () {
      const { betrERC20Payer, owner, otherAccount } = await loadFixture(deployBETRERC20PayerFixture);

      // First whitelist
      await betrERC20Payer.write.setWhitelistedDestination([otherAccount.account.address, true], {
        account: owner.account
      });

      // Then remove
      expect(await betrERC20Payer.write.setWhitelistedDestination([otherAccount.account.address, false], {
        account: owner.account
      })).to.emit(betrERC20Payer, "WhitelistedDestinationSet").withArgs(otherAccount.account.address, false);

      expect(await betrERC20Payer.read.whitelistedDestinations([otherAccount.account.address])).to.be.false;
    });

    it("Should not set whitelisted destination if destination is zero address", async function () {
      const { betrERC20Payer, owner } = await loadFixture(deployBETRERC20PayerFixture);

      await expect(betrERC20Payer.write.setWhitelistedDestination([
        "0x0000000000000000000000000000000000000000", 
        true
      ], {
        account: owner.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should not set whitelisted destination if sender is not owner", async function () {
      const { betrERC20Payer, otherAccount, user } = await loadFixture(deployBETRERC20PayerFixture);

      await expect(betrERC20Payer.write.setWhitelistedDestination([user.account.address, true], {
        account: otherAccount.account
      })).to.be.rejectedWith("NotOwner");
    });
  });

  describe("Price Calculations", function () {
    it("Should get price from pool", async function () {
      const { betrERC20Payer, mockToken, mockPool } = await loadFixture(deployBETRERC20PayerFixture);

      // Set the pool
      const [owner] = await hre.viem.getWalletClients();
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken.address, mockPool.address], {
        account: owner.account
      });

      const amount = parseEther("1");
      const price = await betrERC20Payer.read.getPrice([mockToken.address, amount]);
      
      // Price should be greater than 0
      expect(price).to.be.gt(0n);
    });

    it("Should revert getPrice if token is zero address", async function () {
      const { betrERC20Payer } = await loadFixture(deployBETRERC20PayerFixture);

      await expect(betrERC20Payer.read.getPrice([
        "0x0000000000000000000000000000000000000000", 
        parseEther("1")
      ])).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert getPrice if amount is zero", async function () {
      const { betrERC20Payer, mockToken } = await loadFixture(deployBETRERC20PayerFixture);

      await expect(betrERC20Payer.read.getPrice([mockToken.address, 0n])).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert getPrice if no pool for token", async function () {
      const { betrERC20Payer, mockToken } = await loadFixture(deployBETRERC20PayerFixture);

      await expect(betrERC20Payer.read.getPrice([mockToken.address, parseEther("1")])).to.be.rejectedWith("NoPoolForToken");
    });
  });

  describe("Pay with ERC20", function () {
    it("Should pay with ERC20 tokens successfully", async function () {
      const { betrERC20Payer, mockToken, mockPool, mockDestination, owner, user } = await loadFixture(deployBETRERC20PayerFixture);

      // Setup: Set pool and whitelist destination
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken.address, mockPool.address], {
        account: owner.account
      });
      await betrERC20Payer.write.setWhitelistedDestination([mockDestination.address, true], {
        account: owner.account
      });

      // Fund the contract with ETH
      await owner.sendTransaction({
        to: betrERC20Payer.address,
        value: parseEther("1")
      });

      // Fund user with tokens
      await mockToken.write.mint([user.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrERC20Payer.address, parseEther("1000")], {
        account: user.account
      });

      const amount = parseEther("0.1");
      const expectedPrice = amount; // 1:1 ratio from mock pool

      const data = encodeFunctionData({
        abi: mockDestination.abi,
        functionName: "testSuccess",
        args: []
      });

      const result = await betrERC20Payer.write.payWithERC20([
        mockToken.address,
        mockDestination.address,
        data,
        amount,
        expectedPrice
      ], {
        account: user.account
      });

      expect(result).to.not.be.undefined;
    });

    it("Should revert if token is zero address", async function () {
      const { betrERC20Payer, mockDestination, user } = await loadFixture(deployBETRERC20PayerFixture);

      const data = encodeFunctionData({
        abi: mockDestination.abi,
        functionName: "testSuccess",
        args: []
      });

      await expect(betrERC20Payer.write.payWithERC20([
        "0x0000000000000000000000000000000000000000",
        mockDestination.address,
        data,
        parseEther("0.1"),
        parseEther("1")
      ], {
        account: user.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if destination is zero address", async function () {
      const { betrERC20Payer, mockToken, user } = await loadFixture(deployBETRERC20PayerFixture);

      const data = encodeFunctionData({
        abi: mockToken.abi,
        functionName: "transfer",
        args: [user.account.address, parseEther("1")]
      });

      await expect(betrERC20Payer.write.payWithERC20([
        mockToken.address,
        "0x0000000000000000000000000000000000000000",
        data,
        parseEther("0.1"),
        parseEther("1")
      ], {
        account: user.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if data is empty", async function () {
      const { betrERC20Payer, mockToken, mockDestination, user } = await loadFixture(deployBETRERC20PayerFixture);

      await expect(betrERC20Payer.write.payWithERC20([
        mockToken.address,
        mockDestination.address,
        "0x",
        parseEther("0.1"),
        parseEther("1")
      ], {
        account: user.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if amount is zero", async function () {
      const { betrERC20Payer, mockToken, mockDestination, user } = await loadFixture(deployBETRERC20PayerFixture);

      const data = encodeFunctionData({
        abi: mockDestination.abi,
        functionName: "testSuccess",
        args: []
      });

      await expect(betrERC20Payer.write.payWithERC20([
        mockToken.address,
        mockDestination.address,
        data,
        0n,
        parseEther("1")
      ], {
        account: user.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if destination is not whitelisted", async function () {
      const { betrERC20Payer, mockToken, mockDestination, user } = await loadFixture(deployBETRERC20PayerFixture);

      const data = encodeFunctionData({
        abi: mockDestination.abi,
        functionName: "testSuccess",
        args: []
      });

      await expect(betrERC20Payer.write.payWithERC20([
        mockToken.address,
        mockDestination.address,
        data,
        parseEther("0.1"),
        parseEther("1")
      ], {
        account: user.account
      })).to.be.rejectedWith("NotWhitelistedDestination");
    });

    it("Should revert if contract doesn't have enough ETH", async function () {
      const { betrERC20Payer, mockToken, mockPool, mockDestination, owner, user } = await loadFixture(deployBETRERC20PayerFixture);

      // Setup: Set pool and whitelist destination
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken.address, mockPool.address], {
        account: owner.account
      });
      await betrERC20Payer.write.setWhitelistedDestination([mockDestination.address, true], {
        account: owner.account
      });

      // Fund user with tokens
      await mockToken.write.mint([user.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrERC20Payer.address, parseEther("1000")], {
        account: user.account
      });

      const data = encodeFunctionData({
        abi: mockDestination.abi,
        functionName: "testSuccess",
        args: []
      });

      await expect(betrERC20Payer.write.payWithERC20([
        mockToken.address,
        mockDestination.address,
        data,
        parseEther("1"), // More than contract has
        parseEther("1")
      ], {
        account: user.account
      })).to.be.rejectedWith("NotEnoughValueInContract");
    });

    it("Should revert if no pool for token", async function () {
      const { betrERC20Payer, mockToken, mockDestination, owner, user } = await loadFixture(deployBETRERC20PayerFixture);

      // Only whitelist destination, don't set pool
      await betrERC20Payer.write.setWhitelistedDestination([mockDestination.address, true], {
        account: owner.account
      });

      // Fund the contract with ETH
      await owner.sendTransaction({
        to: betrERC20Payer.address,
        value: parseEther("1")
      });

      const data = encodeFunctionData({
        abi: mockDestination.abi,
        functionName: "testSuccess",
        args: []
      });

      await expect(betrERC20Payer.write.payWithERC20([
        mockToken.address,
        mockDestination.address,
        data,
        parseEther("0.1"),
        parseEther("1")
      ], {
        account: user.account
      })).to.be.rejectedWith("NoPoolForToken");
    });

    it("Should revert if subcall reverts", async function () {
      const { betrERC20Payer, mockToken, mockPool, mockDestination, owner, user } = await loadFixture(deployBETRERC20PayerFixture);

      // Setup: Set pool and whitelist destination
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken.address, mockPool.address], {
        account: owner.account
      });
      await betrERC20Payer.write.setWhitelistedDestination([mockDestination.address, true], {
        account: owner.account
      });

      // Fund the contract with ETH
      await owner.sendTransaction({
        to: betrERC20Payer.address,
        value: parseEther("1")
      });

      // Fund user with tokens
      await mockToken.write.mint([user.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrERC20Payer.address, parseEther("1000")], {
        account: user.account
      });

      const data = encodeFunctionData({
        abi: mockDestination.abi,
        functionName: "testRevert",
        args: []
      });

      await expect(betrERC20Payer.write.payWithERC20([
        mockToken.address,
        mockDestination.address,
        data,
        parseEther("0.1"),
        parseEther("0.1")
      ], {
        account: user.account
      })).to.be.rejectedWith("SubcallFailed");
    });
  });

  describe("Pay with ERC20 Permit", function () {
    it("Should pay with ERC20 permit using a real signature", async function () {
      const { betrERC20Payer, mockToken, mockPool, mockDestination, owner, user } = await loadFixture(deployBETRERC20PayerFixture);

      // Setup: Set pool and whitelist destination
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken.address, mockPool.address], {
        account: owner.account
      });
      await betrERC20Payer.write.setWhitelistedDestination([mockDestination.address, true], {
        account: owner.account
      });

      // Fund the contract with ETH
      await owner.sendTransaction({
        to: betrERC20Payer.address,
        value: parseEther("1")
      });

      // Fund user with tokens
      await mockToken.write.mint([user.account.address, parseEther("1000")], {
        account: owner.account
      });

      const amount = parseEther("0.1");
      const expectedPrice = amount; // 1:1 ratio from mock pool
      const spendableAmount = parseEther("1000");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now

      // Get the current nonce
      const nonce = await mockToken.read.nonces([user.account.address]);
      let chainId: number;
      if (hre.network.config.chainId) {
        chainId = hre.network.config.chainId;
      } else {
        chainId = await (await hre.viem.getPublicClient()).getChainId();
      }
      const domain = {
        name: await mockToken.read.name(),
        version: "1",
        chainId,
        verifyingContract: mockToken.address,
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const values = {
        owner: user.account.address,
        spender: betrERC20Payer.address,
        value: spendableAmount,
        nonce,
        deadline,
      };
      // Sign the permit
      const signature = await user.signTypedData({ domain, types, primaryType: "Permit", message: values });
      const { v, r, s } = Signature.from(signature);

      const data = encodeFunctionData({
        abi: mockDestination.abi,
        functionName: "testSuccess",
        args: []
      });

      // Call payWithERC20Permit
      const result = await betrERC20Payer.write.payWithERC20Permit([
        mockToken.address,
        mockDestination.address,
        data,
        amount,
        expectedPrice,
        spendableAmount,
        deadline,
        v,
        r as `0x${string}`,
        s as `0x${string}`
      ], {
        account: user.account
      });

      expect(result).to.not.be.undefined;
      // Check that the allowance is set to 0 (spent)
      const allowance = await mockToken.read.allowance([user.account.address, betrERC20Payer.address]);
      expect(allowance).to.equal(spendableAmount - expectedPrice);
    });

    it("Should revert if deadline is in the past", async function () {
      const { betrERC20Payer, mockToken, mockDestination, user } = await loadFixture(deployBETRERC20PayerFixture);

      const data = encodeFunctionData({
        abi: mockDestination.abi,
        functionName: "testSuccess",
        args: []
      });

      const pastDeadline = BigInt(Math.floor(Date.now() / 1000) - 3600); // 1 hour ago

      await expect(betrERC20Payer.write.payWithERC20Permit([
        mockToken.address,
        mockDestination.address,
        data,
        parseEther("0.1"),
        parseEther("1"),
        parseEther("1000"),
        pastDeadline,
        27,
        "0x1234567890123456789012345678901234567890123456789012345678901234",
        "0x1234567890123456789012345678901234567890123456789012345678901234"
      ], {
        account: user.account
      })).to.be.rejectedWith("InvalidInput");
    });
  });

  describe("Recovery Functions", function () {
    it("Should recover ETH", async function () {
      const { betrERC20Payer, owner, publicClient } = await loadFixture(deployBETRERC20PayerFixture);

      // Fund the contract
      await owner.sendTransaction({
        to: betrERC20Payer.address,
        value: parseEther("1")
      });

      const initialBalance = await publicClient.getBalance({ address: owner.account.address });
      
      await betrERC20Payer.write.recoverETH({
        account: owner.account
      });

      const finalBalance = await publicClient.getBalance({ address: owner.account.address });
      
      // Balance should increase (minus gas costs)
      expect(finalBalance).to.be.gte(initialBalance);

      // Payer balance should be 0
      const payerBalance = await publicClient.getBalance({ address: betrERC20Payer.address });
      expect(payerBalance).to.equal(0);
    });

    it("Should not recover ETH if sender is not owner", async function () {
      const { betrERC20Payer, otherAccount } = await loadFixture(deployBETRERC20PayerFixture);

      await expect(betrERC20Payer.write.recoverETH({
        account: otherAccount.account
      })).to.be.rejectedWith("NotOwner");
    });
  });

  describe("Receive and Fallback", function () {
    it("Should receive ETH via receive function", async function () {
      const { betrERC20Payer, owner, publicClient } = await loadFixture(deployBETRERC20PayerFixture);

      const initialBalance = await publicClient.getBalance({ address: betrERC20Payer.address });
      
      await owner.sendTransaction({
        to: betrERC20Payer.address,
        value: parseEther("1")
      });

      const finalBalance = await publicClient.getBalance({ address: betrERC20Payer.address });
      
      expect(finalBalance).to.equal(initialBalance + parseEther("1"));
    });

    it("Should receive ETH via fallback function", async function () {
      const { betrERC20Payer, owner, publicClient } = await loadFixture(deployBETRERC20PayerFixture);

      const initialBalance = await publicClient.getBalance({ address: betrERC20Payer.address });
      
      await owner.sendTransaction({
        to: betrERC20Payer.address,
        value: parseEther("1"),
        data: "0x12345678" // Some random data
      });

      const finalBalance = await publicClient.getBalance({ address: betrERC20Payer.address });
      
      expect(finalBalance).to.equal(initialBalance + parseEther("1"));
    });
  });

  describe("Multiple Token Price Conversions", function () {
    it("Should calculate prices correctly for 18-decimal tokens", async function () {
      const { betrERC20Payer, mockToken18, mockWETH, owner } = await loadFixture(deployMultipleTokensFixture);

      // Deploy a pool for the 18-decimal token
      const mockPool18 = await hre.viem.deployContract("MockUniswapV3Pool", [
        mockToken18.address, 
        mockWETH.address, 
        79228162514264337593543950336n // 2^96 for 1:1 price
      ]);
      
      // Set the pool
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken18.address, mockPool18.address], {
        account: owner.account
      });

      // Test different amounts
      const amounts = [parseEther("0.1"), parseEther("1"), parseEther("10"), parseEther("100")];
      
      for (const amount of amounts) {
        // The mock pool has 1:1 price (1 token = 1 WETH)
        const expectedPrice = amount; // 1:1 ratio
        const price = await betrERC20Payer.read.getPrice([mockToken18.address, amount]);
        expect(price).to.equal(expectedPrice);
      }
    });

    it("Should calculate prices correctly for 6-decimal tokens", async function () {
      const { betrERC20Payer, mockToken6, mockWETH, owner } = await loadFixture(deployMultipleTokensFixture);

      // Deploy a pool for the 6-decimal token
      const mockPool6 = await hre.viem.deployContract("MockUniswapV3Pool", [
        mockToken6.address, 
        mockWETH.address, 
        79228162514264337593543950336n // 2^96 for 1:1 price
      ]);
      
      // Set the pool
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken6.address, mockPool6.address], {
        account: owner.account
      });

      // Test different amounts
      const amounts = [parseEther("0.1"), parseEther("1"), parseEther("10")];
      
      for (const amount of amounts) {
        const price = await betrERC20Payer.read.getPrice([mockToken6.address, amount]);
        
        // The mock pool has 1:1 price (1 token = 1 WETH)
        const expectedPrice = amount; // 1:1 ratio
        expect(price).to.equal(expectedPrice);
      }
    });

    it("Should calculate prices correctly for 8-decimal tokens", async function () {
      const { betrERC20Payer, mockToken8, mockWETH, owner } = await loadFixture(deployMultipleTokensFixture);

      // Deploy a pool for the 8-decimal token
      const mockPool8 = await hre.viem.deployContract("MockUniswapV3Pool", [
        mockToken8.address, 
        mockWETH.address, 
        79228162514264337593543950336n // 2^96 for 1:1 price
      ]);
      
      // Set the pool
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken8.address, mockPool8.address], {
        account: owner.account
      });

      // Test different amounts
      const amounts = [parseEther("0.1"), parseEther("1"), parseEther("10")];
      
      for (const amount of amounts) {
        const price = await betrERC20Payer.read.getPrice([mockToken8.address, amount]);
        // The mock pool has 1:1 price (1 token = 1 WETH)
        const expectedPrice = amount; // 1:1 ratio
        expect(price).to.equal(expectedPrice);
      }
    });

    it("Should calculate prices correctly for 12-decimal tokens", async function () {
      const { betrERC20Payer, mockToken12, mockWETH, owner } = await loadFixture(deployMultipleTokensFixture);

      // Deploy a pool for the 12-decimal token
      const mockPool12 = await hre.viem.deployContract("MockUniswapV3Pool", [
        mockToken12.address, 
        mockWETH.address, 
        79228162514264337593543950336n // 2^96 for 1:1 price
      ]);
      
      // Set the pool
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken12.address, mockPool12.address], {
        account: owner.account
      });

      // Test different amounts
      const amounts = [parseEther("0.1"), parseEther("1"), parseEther("10")];
      
      for (const amount of amounts) {
        const price = await betrERC20Payer.read.getPrice([mockToken12.address, amount]);
        // The mock pool has 1:1 price (1 token = 1 WETH)
        const expectedPrice = amount; // 1:1 ratio
        expect(price).to.equal(expectedPrice);
      }
    });

    it("Should handle token0 vs token1 order correctly", async function () {
      const { betrERC20Payer, owner, mockWETH } = await loadFixture(deployBETRERC20PayerFixture);

      // Deploy three ERC20 tokens (use the WETH from the fixture)
      const mockTokenA = await hre.viem.deployContract("MockERC20", ["A", "A", 18]);
      const mockTokenB = await hre.viem.deployContract("MockERC20", ["B", "B", 18]);
      const mockTokenC = await hre.viem.deployContract("MockERC20", ["C", "C", 18]);

      // Collect and sort all addresses
      const tokens = [mockTokenA, mockTokenB, mockTokenC, mockWETH];
      const sorted = tokens.map(t => t.address.toLowerCase()).sort();
      const addrToToken = Object.fromEntries(tokens.map(t => [t.address.toLowerCase(), t]));

      // Pool1: [lowest, second lowest] (token0 is ERC20, token1 is WETH)
      const pool1Token0 = addrToToken[sorted[0]];
      const pool1Token1 = addrToToken[sorted[1]];
      // Pool2: [third lowest, highest] (token0 is WETH, token1 is ERC20)
      const pool2Token0 = addrToToken[sorted[2]];
      const pool2Token1 = addrToToken[sorted[3]];

      // Identify which is WETH and which are ERC20s
      const isWETH = (t: { address: string }) => t.address.toLowerCase() === mockWETH.address.toLowerCase();
      const isERC20 = (t: { address: string }) => t.address.toLowerCase() !== mockWETH.address.toLowerCase();

      // Find a valid ERC20/WETH pair for Pool1 (ERC20 as token0, WETH as token1)
      let pool1ERC20, pool1WETH;
      for (const t of [mockTokenA, mockTokenB, mockTokenC]) {
        if (t.address.toLowerCase() !== mockWETH.address.toLowerCase()) {
          if (t.address.toLowerCase() < mockWETH.address.toLowerCase()) {
            pool1ERC20 = t;
            pool1WETH = mockWETH;
            break;
          }
        }
      }
      if (!pool1ERC20 || !pool1WETH) throw new Error("No valid ERC20/WETH pair found for Pool1 (ERC20 as token0, WETH as token1)");

      // Find a valid WETH/ERC20 pair for Pool2 (WETH as token0, ERC20 as token1)
      let pool2ERC20, pool2WETH;
      for (const t of [mockTokenA, mockTokenB, mockTokenC]) {
        if (t.address.toLowerCase() !== mockWETH.address.toLowerCase()) {
          if (mockWETH.address.toLowerCase() < t.address.toLowerCase()) {
            pool2ERC20 = t;
            pool2WETH = mockWETH;
            break;
          }
        }
      }
      if (!pool2ERC20 || !pool2WETH) throw new Error("No valid WETH/ERC20 pair found for Pool2 (WETH as token0, ERC20 as token1)");

      // Deploy pools
      const pool1 = await hre.viem.deployContract("MockUniswapV3Pool", [
        pool1ERC20.address, pool1WETH.address, 79228162514264337593543950336n
      ]);
      const pool2 = await hre.viem.deployContract("MockUniswapV3Pool", [
        pool2WETH.address, pool2ERC20.address, 79228162514264337593543950336n
      ]);

      // Register pools
      await betrERC20Payer.write.setERC20TokenPricePool([pool1ERC20.address, pool1.address], { account: owner.account });
      await betrERC20Payer.write.setERC20TokenPricePool([pool2ERC20.address, pool2.address], { account: owner.account });

      const amount = parseEther("1");
      
      // Both should return the same price since our mock pool has 1:1 ratio
      const expectedPrice = amount; // 1:1 ratio
      
      const price1 = await betrERC20Payer.read.getPrice([mockTokenA.address, amount]);
      const price2 = await betrERC20Payer.read.getPrice([mockTokenB.address, amount]);

      // Both should return the same expected price
      expect(price1).to.equal(expectedPrice);
      expect(price2).to.equal(expectedPrice);
    });

    it("Should handle multiple tokens simultaneously", async function () {
      const { betrERC20Payer, mockToken18, mockToken6, mockToken8, mockWETH, owner } = await loadFixture(deployMultipleTokensFixture);

      // Deploy pools for all tokens
      const pool18 = await hre.viem.deployContract("MockUniswapV3Pool", [mockToken18.address, mockWETH.address, 79228162514264337593543950336n]);
      const pool6 = await hre.viem.deployContract("MockUniswapV3Pool", [mockToken6.address, mockWETH.address, 79228162514264337593543950336n]);
      const pool8 = await hre.viem.deployContract("MockUniswapV3Pool", [mockToken8.address, mockWETH.address, 79228162514264337593543950336n]);
      
      // Set all pools
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken18.address, pool18.address], {
        account: owner.account
      });
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken6.address, pool6.address], {
        account: owner.account
      });
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken8.address, pool8.address], {
        account: owner.account
      });

      // Test all tokens with the same ETH amount
      const ethAmount = parseEther("1");
      
      const price18 = await betrERC20Payer.read.getPrice([mockToken18.address, ethAmount]);
      const price6 = await betrERC20Payer.read.getPrice([mockToken6.address, ethAmount]);
      const price8 = await betrERC20Payer.read.getPrice([mockToken8.address, ethAmount]);
      
      // All should be the same due to mock pool 1:1 ratio
      const expected = ethAmount; // 1:1 ratio
      expect(price18).to.equal(expected);
      expect(price6).to.equal(expected);
      expect(price8).to.equal(expected);
    });

    it("Should handle edge cases with very small amounts", async function () {
      const { betrERC20Payer, mockToken18, mockWETH, owner } = await loadFixture(deployMultipleTokensFixture);

      // Deploy a pool
      const mockPool = await hre.viem.deployContract("MockUniswapV3Pool", [mockToken18.address, mockWETH.address, 79228162514264337593543950336n]);
      
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken18.address, mockPool.address], {
        account: owner.account
      });

      // Test small amounts that should work
      const smallAmounts = [
        parseEther("0.01"),  // 10 milli ETH
        parseEther("0.1"),   // 100 milli ETH
        parseEther("0.5"),   // 500 milli ETH
      ];
      
      for (const amount of smallAmounts) {
        const expectedPrice = amount; // 1:1 ratio
        const price = await betrERC20Payer.read.getPrice([mockToken18.address, amount]);
        expect(price).to.equal(expectedPrice);
      }
    });

    it("Should handle edge cases with very large amounts", async function () {
      const { betrERC20Payer, mockToken18, mockWETH, owner } = await loadFixture(deployMultipleTokensFixture);

      // Deploy a pool
      const mockPool = await hre.viem.deployContract("MockUniswapV3Pool", [mockToken18.address, mockWETH.address, 79228162514264337593543950336n]);
      
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken18.address, mockPool.address], {
        account: owner.account
      });

      // Test very large amounts
      const largeAmounts = [
        parseEther("1000"),
        parseEther("10000"),
        parseEther("100000"),
      ];
      
      for (const amount of largeAmounts) {
        const expectedPrice = amount; // 1:1 ratio
        const price = await betrERC20Payer.read.getPrice([mockToken18.address, amount]);
        expect(price).to.equal(expectedPrice);
      }
    });

    it("Should verify price consistency across multiple calls", async function () {
      const { betrERC20Payer, mockToken18, mockWETH, owner } = await loadFixture(deployMultipleTokensFixture);

      // Deploy a pool
      const mockPool = await hre.viem.deployContract("MockUniswapV3Pool", [mockToken18.address, mockWETH.address, 79228162514264337593543950336n]);
      
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken18.address, mockPool.address], {
        account: owner.account
      });

      const amount = parseEther("1");
      const expectedPrice = amount; // 1:1 ratio
      
      // Call getPrice multiple times and verify consistency
      for (let i = 0; i < 5; i++) {
        const price = await betrERC20Payer.read.getPrice([mockToken18.address, amount]);
        expect(price).to.equal(expectedPrice);
      }
    });

    it("Should calculate prices correctly for 2:1 ratio (token is worth 2 WETH)", async function () {
      const { betrERC20Payer, mockToken18, mockWETH, owner } = await loadFixture(deployMultipleTokensFixture);
      const sqrtPriceX96 = 112589990684262400000000000000n;
      const pool = await hre.viem.deployContract("MockUniswapV3Pool", [mockToken18.address, mockWETH.address, sqrtPriceX96]);
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken18.address, pool.address], { account: owner.account });
      const amount = parseEther("1");
      const priceX96 = (sqrtPriceX96 * sqrtPriceX96) >> 192n;
      const price = priceX96; // for 18 decimals, decimals0 = decimals1 = 18
      const expectedPrice = Number(amount) / Number(price);
      const contractPrice = await betrERC20Payer.read.getPrice([mockToken18.address, amount]);
      expect(contractPrice).to.be.closeTo(BigInt(expectedPrice), 10000000000000000n);
    });

    it("Should calculate prices correctly for 0.5:1 ratio (token is worth 0.5 WETH)", async function () {
      const { betrERC20Payer, mockToken18, mockWETH, owner } = await loadFixture(deployMultipleTokensFixture);
      const sqrtPriceX96 = 56065982068469760000000000000n;
      const pool = await hre.viem.deployContract("MockUniswapV3Pool", [mockToken18.address, mockWETH.address, sqrtPriceX96]);
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken18.address, pool.address], { account: owner.account });
      const amount = parseEther("1");
      const priceX96 = (sqrtPriceX96 * sqrtPriceX96 * BigInt(10 ** 18)) >> 192n;
      const price = priceX96;
      const expectedPrice = Number(amount) * Number(10 ** 18) / Number(price);
      const contractPrice = await betrERC20Payer.read.getPrice([mockToken18.address, amount]);
      expect(contractPrice).to.be.closeTo(BigInt(expectedPrice), 10000000000000000n);
    });

    it("Should calculate prices correctly for 3:1 ratio (token is worth 3 WETH)", async function () {
      const { betrERC20Payer, mockToken18, mockWETH, owner } = await loadFixture(deployMultipleTokensFixture);
      const sqrtPriceX96 = 137438953471230000000000000000n;
      const pool = await hre.viem.deployContract("MockUniswapV3Pool", [mockToken18.address, mockWETH.address, sqrtPriceX96]);
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken18.address, pool.address], { account: owner.account });
      const amount = parseEther("1");
      const priceX96 = (sqrtPriceX96 * sqrtPriceX96) >> 192n;
      const price = priceX96;
      const expectedPrice = Number(amount) / Number(price);
      const contractPrice = await betrERC20Payer.read.getPrice([mockToken18.address, amount]);
      expect(contractPrice).to.be.closeTo(BigInt(expectedPrice), 10000000000000000n);
    });

    it("Should calculate prices correctly for 1:3 ratio (token is worth 1/3 WETH)", async function () {
      const { betrERC20Payer, mockToken18, mockWETH, owner } = await loadFixture(deployMultipleTokensFixture);
      const sqrtPriceX96 = 45709897368276000000000000000n;
      const pool = await hre.viem.deployContract("MockUniswapV3Pool", [mockToken18.address, mockWETH.address, sqrtPriceX96]);
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken18.address, pool.address], { account: owner.account });
      const amount = parseEther("1");
      const priceX96 = (sqrtPriceX96 * sqrtPriceX96 * BigInt(10 ** 18)) >> 192n;
      const price = priceX96;
      const expectedPrice = Number(amount) * Number(10 ** 18) / Number(price);
      const contractPrice = await betrERC20Payer.read.getPrice([mockToken18.address, amount]);
      expect(contractPrice).to.be.closeTo(BigInt(expectedPrice), 10000000000000000n);
    });

    it("Should calculate prices correctly for Degen ratio", async function () {
      const { betrERC20Payer, mockToken18, mockWETH, owner } = await loadFixture(deployMultipleTokensFixture);
      const sqrtPriceX96 = 69001984749344145248939427640873n;
      const pool = await hre.viem.deployContract("MockUniswapV3Pool", [mockToken18.address, mockWETH.address, sqrtPriceX96]);
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken18.address, pool.address], { account: owner.account });
      const amount = parseEther("1");
      const priceX96 = (sqrtPriceX96 * sqrtPriceX96 * BigInt(10 ** 18)) >> 192n;
      const price = priceX96;
      const expectedPrice = Number(amount) * Number(10 ** 18) / Number(price);
      const contractPrice = await betrERC20Payer.read.getPrice([mockToken18.address, amount]);
      expect(contractPrice).to.be.closeTo(BigInt(Math.round(expectedPrice)), 10000000000000000n);
    });

    it("Should calculate prices correctly for BETR ratio", async function () {
      const { betrERC20Payer, mockToken18, mockWETH, owner } = await loadFixture(deployMultipleTokensFixture);
      const sqrtPriceX96 = 2086589424500337163456753n;
      const pool = await hre.viem.deployContract("MockUniswapV3Pool", [mockToken18.address, mockWETH.address, sqrtPriceX96]);
      await betrERC20Payer.write.setERC20TokenPricePool([mockToken18.address, pool.address], { account: owner.account });
      const amount = parseEther("1");
      const priceX96 = (sqrtPriceX96 * sqrtPriceX96 * BigInt(10 ** 18)) >> 192n;
      const price = priceX96;
      const expectedPrice = Number(amount) * Number(10 ** 18) / Number(price);
      const contractPrice = await betrERC20Payer.read.getPrice([mockToken18.address, amount]);
      expect(contractPrice).to.be.closeTo(BigInt(Math.round(expectedPrice)), 10000000000000000n);
    });
  });
}); 