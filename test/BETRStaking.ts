import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseEther } from "viem";

describe("BETRStaking", function () {
  // We define a fixture to reuse the same setup in every test.
  async function deployBETRStakingFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount, user, staker1, staker2] = await hre.viem.getWalletClients();

    // Deploy mock ERC20 token for staking
    const mockToken = await hre.viem.deployContract("MockERC20", ["Staking Token", "STK", 18]);
    
    // Deploy BETRStaking
    const betrStaking = await hre.viem.deployContract("BETRStaking", [owner.account.address, mockToken.address]);

    const publicClient = await hre.viem.getPublicClient();

    return {
      betrStaking,
      mockToken,
      owner,
      otherAccount,
      user,
      staker1,
      staker2,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Should set the right owner and staking token", async function () {
      const { betrStaking, owner, mockToken } = await loadFixture(deployBETRStakingFixture);

      expect(await betrStaking.read.owner()).to.equal(
        getAddress(owner.account.address)
      );
      expect(await betrStaking.read.stakingToken()).to.equal(
        getAddress(mockToken.address)
      );
    });

    it("Should revert if owner is zero address", async function () {
      const { mockToken } = await loadFixture(deployBETRStakingFixture);
      
      await expect(
        hre.viem.deployContract("BETRStaking", [
          "0x0000000000000000000000000000000000000000", 
          mockToken.address
        ])
      ).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if staking token is zero address", async function () {
      const { owner } = await loadFixture(deployBETRStakingFixture);
      
      await expect(
        hre.viem.deployContract("BETRStaking", [
          owner.account.address, 
          "0x0000000000000000000000000000000000000000"
        ])
      ).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if staking token is not a valid ERC20", async function () {
      const { owner } = await loadFixture(deployBETRStakingFixture);
      
      // Deploy a contract that's not an ERC20
      const mockContract = await hre.viem.deployContract("Mock");
      
      await expect(
        hre.viem.deployContract("BETRStaking", [
          owner.account.address, 
          mockContract.address
        ])
      ).to.be.rejectedWith("InvalidInput");
    });

    it("Should initialize with staking paused as false", async function () {
      const { betrStaking } = await loadFixture(deployBETRStakingFixture);

      expect(await betrStaking.read.isStakingPaused()).to.be.false;
    });
  });

  describe("Ownership", function () {
    it("Should prepare the ownership transfer", async function () {
      const { betrStaking, owner, otherAccount } = await loadFixture(deployBETRStakingFixture);

      await betrStaking.write.setProposedOwner([otherAccount.account.address], {
        account: owner.account
      });
      expect(await betrStaking.read.proposedOwner()).to.equal(
        getAddress(otherAccount.account.address)
      );
    });

    it("Should not prepare the ownership transfer if the proposed owner is the zero address", async function () {
      const { betrStaking, owner } = await loadFixture(deployBETRStakingFixture);
      await expect(betrStaking.write.setProposedOwner([getAddress("0x0000000000000000000000000000000000000000")], {
        account: owner.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should not prepare the ownership transfer if the sender is not the owner", async function () {
      const { betrStaking, otherAccount, user } = await loadFixture(deployBETRStakingFixture);
      await expect(betrStaking.write.setProposedOwner([user.account.address], {
        account: otherAccount.account
      })).to.be.rejectedWith("NotOwner");
    });

    it("Should accept the ownership transfer", async function () {
      const { betrStaking, owner, otherAccount, publicClient } = await loadFixture(deployBETRStakingFixture);

      let hash = await betrStaking.write.setProposedOwner([otherAccount.account.address], {
        account: owner.account
      });
      await publicClient.waitForTransactionReceipt({ hash });

      expect(await betrStaking.write.acceptOwnership({
        account: otherAccount.account
      })).to.emit(betrStaking, "OwnershipTransferred").withArgs(owner.account.address, otherAccount.account.address);

      expect((await betrStaking.read.owner()).toLocaleLowerCase()).to.equal(otherAccount.account.address.toLocaleLowerCase());
    });

    it("Should not accept the ownership transfer if the sender is not the proposed owner", async function () {
      const { betrStaking, otherAccount } = await loadFixture(deployBETRStakingFixture);
      await expect(betrStaking.write.acceptOwnership({
        account: otherAccount.account
      })).to.be.rejectedWith("NotProposedOwner");
    });

    it("Should cancel the ownership transfer", async function () {
      const { betrStaking, owner, otherAccount, publicClient } = await loadFixture(deployBETRStakingFixture);

      let hash = await betrStaking.write.setProposedOwner([otherAccount.account.address], {
        account: owner.account
      });
      await publicClient.waitForTransactionReceipt({ hash });

      await betrStaking.write.cancelProposedOwnership({
        account: owner.account
      });

      expect((await betrStaking.read.owner()).toLocaleLowerCase()).to.equal(owner.account.address.toLocaleLowerCase());
      expect((await betrStaking.read.proposedOwner()).toLocaleLowerCase()).to.equal("0x0000000000000000000000000000000000000000");
    });

    it("Should not cancel the ownership transfer if the sender is not the owner", async function () {
      const { betrStaking, otherAccount } = await loadFixture(deployBETRStakingFixture);
      await expect(betrStaking.write.cancelProposedOwnership({
        account: otherAccount.account
      })).to.be.rejectedWith("NotOwner");
    });
  });

  describe("Staking Pause Management", function () {
    it("Should set staking paused state", async function () {
      const { betrStaking, owner } = await loadFixture(deployBETRStakingFixture);

      expect(await betrStaking.write.setStakingPaused([true], {
        account: owner.account
      })).to.emit(betrStaking, "StakingPausedSet").withArgs(true);

      expect(await betrStaking.read.isStakingPaused()).to.be.true;
    });

    it("Should unset staking paused state", async function () {
      const { betrStaking, owner } = await loadFixture(deployBETRStakingFixture);

      // First pause
      await betrStaking.write.setStakingPaused([true], {
        account: owner.account
      });

      // Then unpause
      expect(await betrStaking.write.setStakingPaused([false], {
        account: owner.account
      })).to.emit(betrStaking, "StakingPausedSet").withArgs(false);

      expect(await betrStaking.read.isStakingPaused()).to.be.false;
    });

    it("Should not set staking paused state if sender is not owner", async function () {
      const { betrStaking, otherAccount } = await loadFixture(deployBETRStakingFixture);

      await expect(betrStaking.write.setStakingPaused([true], {
        account: otherAccount.account
      })).to.be.rejectedWith("NotOwner");
    });
  });

  describe("Staking", function () {
    it("Should stake tokens successfully", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund staker with tokens
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      const stakeAmount = parseEther("100");

      expect(await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      })).to.emit(betrStaking, "Staked").withArgs(staker1.account.address, stakeAmount);

      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(stakeAmount);
      expect(await mockToken.read.balanceOf([betrStaking.address])).to.equal(stakeAmount);
      expect(await betrStaking.read.totalStakedAmount()).to.equal(stakeAmount);
    });

    it("Should stake multiple times", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund staker with tokens
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      const firstStake = parseEther("50");
      const secondStake = parseEther("75");

      // First stake
      await betrStaking.write.stake([firstStake], {
        account: staker1.account
      });

      // Check total staked after first stake
      expect(await betrStaking.read.totalStakedAmount()).to.equal(firstStake);

      // Second stake
      await betrStaking.write.stake([secondStake], {
        account: staker1.account
      });

      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(firstStake + secondStake);
      expect(await mockToken.read.balanceOf([betrStaking.address])).to.equal(firstStake + secondStake);
      expect(await betrStaking.read.totalStakedAmount()).to.equal(firstStake + secondStake);
    });

    it("Should revert if staking is paused", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Pause staking
      await betrStaking.write.setStakingPaused([true], {
        account: owner.account
      });

      // Fund staker with tokens
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      await expect(betrStaking.write.stake([parseEther("100")], {
        account: staker1.account
      })).to.be.rejectedWith("StakingPaused");
    });

    it("Should revert if amount is zero", async function () {
      const { betrStaking, staker1 } = await loadFixture(deployBETRStakingFixture);

      await expect(betrStaking.write.stake([0n], {
        account: staker1.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if user doesn't have enough tokens", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund staker with only 50 tokens
      await mockToken.write.mint([staker1.account.address, parseEther("50")], {
        account: owner.account
      });

      // Approve more than they have
      await mockToken.write.approve([betrStaking.address, parseEther("100")], {
        account: staker1.account
      });

      await expect(betrStaking.write.stake([parseEther("100")], {
        account: staker1.account
      })).to.be.rejected;
    });

    it("Should revert if user hasn't approved enough tokens", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund staker with tokens
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve less than they want to stake
      await mockToken.write.approve([betrStaking.address, parseEther("50")], {
        account: staker1.account
      });

      await expect(betrStaking.write.stake([parseEther("100")], {
        account: staker1.account
      })).to.be.rejected;
    });
  });

  describe("StakeFor", function () {
    it("Should stake tokens for another user successfully", async function () {
      const { betrStaking, mockToken, staker1, otherAccount, owner } = await loadFixture(deployBETRStakingFixture);

      // Create a mock rewarder contract
      const mockRewarder = await hre.viem.deployContract("MockRewarder");
      
      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([mockRewarder.address], {
        account: owner.account
      });

      // Fund the caller (otherAccount) with tokens
      await mockToken.write.mint([otherAccount.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens for the caller
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: otherAccount.account
      });

      const stakeAmount = parseEther("100");

      // Verify initial state
      expect(await mockRewarder.read.getTotalCalls()).to.equal(0n);
      expect(await mockRewarder.read.getUserCalls([staker1.account.address])).to.equal(0n);

      expect(await betrStaking.write.stakeFor([staker1.account.address, stakeAmount], {
        account: otherAccount.account
      })).to.emit(betrStaking, "Staked").withArgs(staker1.account.address, stakeAmount);

      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(stakeAmount);
      expect(await mockToken.read.balanceOf([betrStaking.address])).to.equal(stakeAmount);
      expect(await betrStaking.read.totalStakedAmount()).to.equal(stakeAmount);

      // Verify rewarder was called
      expect(await mockRewarder.read.getTotalCalls()).to.equal(1n);
      expect(await mockRewarder.read.getUserCalls([staker1.account.address])).to.equal(1n);
      
      // Verify the call details
      const [user, oldAmount, newAmount, timestamp, callIndex] = await mockRewarder.read.getLastStakeChange([staker1.account.address]);
      expect(user.toLocaleLowerCase()).to.equal(staker1.account.address.toLocaleLowerCase());
      expect(oldAmount).to.equal(0n);
      expect(newAmount).to.equal(stakeAmount);
      expect(callIndex).to.equal(1n);
    });

    it("Should stake for multiple users", async function () {
      const { betrStaking, mockToken, staker1, staker2, otherAccount, owner } = await loadFixture(deployBETRStakingFixture);

      // Create a mock rewarder contract
      const mockRewarder = await hre.viem.deployContract("MockRewarder");
      
      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([mockRewarder.address], {
        account: owner.account
      });

      // Fund the caller with tokens
      await mockToken.write.mint([otherAccount.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens for the caller
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: otherAccount.account
      });

      const stake1 = parseEther("100");
      const stake2 = parseEther("200");

      // Verify initial state
      expect(await mockRewarder.read.getTotalCalls()).to.equal(0n);

      // Stake for first user
      await betrStaking.write.stakeFor([staker1.account.address, stake1], {
        account: otherAccount.account
      });

      // Check total staked after first stake
      expect(await betrStaking.read.totalStakedAmount()).to.equal(stake1);

      // Verify first rewarder call
      expect(await mockRewarder.read.getTotalCalls()).to.equal(1n);
      expect(await mockRewarder.read.getUserCalls([staker1.account.address])).to.equal(1n);

      // Stake for second user
      await betrStaking.write.stakeFor([staker2.account.address, stake2], {
        account: otherAccount.account
      });

      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(stake1);
      expect(await betrStaking.read.stakedAmount([staker2.account.address])).to.equal(stake2);
      expect(await mockToken.read.balanceOf([betrStaking.address])).to.equal(stake1 + stake2);
      expect(await betrStaking.read.totalStakedAmount()).to.equal(stake1 + stake2);

      // Verify second rewarder call
      expect(await mockRewarder.read.getTotalCalls()).to.equal(2n);
      expect(await mockRewarder.read.getUserCalls([staker2.account.address])).to.equal(1n);

      // Verify call details for both users
      let [user, oldAmount, newAmount, timestamp, callIndex] = await mockRewarder.read.getLastStakeChange([staker1.account.address]);
      expect(user.toLocaleLowerCase()).to.equal(staker1.account.address.toLocaleLowerCase());
      expect(oldAmount).to.equal(0n);
      expect(newAmount).to.equal(stake1);
      expect(callIndex).to.equal(1n);
      
      [user, oldAmount, newAmount, timestamp, callIndex] = await mockRewarder.read.getLastStakeChange([staker2.account.address]);
      expect(user.toLocaleLowerCase()).to.equal(staker2.account.address.toLocaleLowerCase());
      expect(oldAmount).to.equal(0n);
      expect(newAmount).to.equal(stake2);
      expect(callIndex).to.equal(2n);
    });

    it("Should stake multiple times for the same user", async function () {
      const { betrStaking, mockToken, staker1, otherAccount, owner } = await loadFixture(deployBETRStakingFixture);

      // Create a mock rewarder contract
      const mockRewarder = await hre.viem.deployContract("MockRewarder");
      
      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([mockRewarder.address], {
        account: owner.account
      });

      // Fund the caller with tokens
      await mockToken.write.mint([otherAccount.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens for the caller
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: otherAccount.account
      });

      const firstStake = parseEther("50");
      const secondStake = parseEther("75");

      // Verify initial state
      expect(await mockRewarder.read.getTotalCalls()).to.equal(0n);
      expect(await mockRewarder.read.getUserCalls([staker1.account.address])).to.equal(0n);

      // First stake for user
      await betrStaking.write.stakeFor([staker1.account.address, firstStake], {
        account: otherAccount.account
      });

      // Check total staked after first stake
      expect(await betrStaking.read.totalStakedAmount()).to.equal(firstStake);

      // Verify first rewarder call
      expect(await mockRewarder.read.getTotalCalls()).to.equal(1n);
      expect(await mockRewarder.read.getUserCalls([staker1.account.address])).to.equal(1n);

      // Second stake for same user
      await betrStaking.write.stakeFor([staker1.account.address, secondStake], {
        account: otherAccount.account
      });

      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(firstStake + secondStake);
      expect(await mockToken.read.balanceOf([betrStaking.address])).to.equal(firstStake + secondStake);
      expect(await betrStaking.read.totalStakedAmount()).to.equal(firstStake + secondStake);

      // Verify second rewarder call
      expect(await mockRewarder.read.getTotalCalls()).to.equal(2n);
      expect(await mockRewarder.read.getUserCalls([staker1.account.address])).to.equal(2n);

      // Verify call details for both stakes
      let [user, oldAmount, newAmount, timestamp, callIndex] = await mockRewarder.read.getLastStakeChange([staker1.account.address]);
      expect(user.toLocaleLowerCase()).to.equal(staker1.account.address.toLocaleLowerCase());
      expect(oldAmount).to.equal(firstStake);
      expect(newAmount).to.equal(firstStake + secondStake);
      expect(callIndex).to.equal(2n);

      // Verify user has multiple stake changes recorded
      expect(await mockRewarder.read.getUserStakeChangesCount([staker1.account.address])).to.equal(2n);
    });

    it("Should revert if staking is paused", async function () {
      const { betrStaking, mockToken, staker1, otherAccount, owner } = await loadFixture(deployBETRStakingFixture);

      // Create a mock rewarder contract
      const mockRewarder = await hre.viem.deployContract("MockRewarder");
      
      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([mockRewarder.address], {
        account: owner.account
      });

      // Pause staking
      await betrStaking.write.setStakingPaused([true], {
        account: owner.account
      });

      // Fund the caller with tokens
      await mockToken.write.mint([otherAccount.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens for the caller
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: otherAccount.account
      });

      await expect(betrStaking.write.stakeFor([staker1.account.address, parseEther("100")], {
        account: otherAccount.account
      })).to.be.rejectedWith("StakingPaused");

      // Verify rewarder was not called due to pause
      expect(await mockRewarder.read.getTotalCalls()).to.equal(0n);
    });

    it("Should revert if amount is zero", async function () {
      const { betrStaking, staker1, otherAccount } = await loadFixture(deployBETRStakingFixture);

      await expect(betrStaking.write.stakeFor([staker1.account.address, 0n], {
        account: otherAccount.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if user address is zero", async function () {
      const { betrStaking, otherAccount } = await loadFixture(deployBETRStakingFixture);

      await expect(betrStaking.write.stakeFor(["0x0000000000000000000000000000000000000000", parseEther("100")], {
        account: otherAccount.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if caller doesn't have enough tokens", async function () {
      const { betrStaking, mockToken, staker1, otherAccount, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund the caller with only 50 tokens
      await mockToken.write.mint([otherAccount.account.address, parseEther("50")], {
        account: owner.account
      });

      // Approve more than they have
      await mockToken.write.approve([betrStaking.address, parseEther("100")], {
        account: otherAccount.account
      });

      await expect(betrStaking.write.stakeFor([staker1.account.address, parseEther("100")], {
        account: otherAccount.account
      })).to.be.rejected;
    });

    it("Should revert if caller hasn't approved enough tokens", async function () {
      const { betrStaking, mockToken, staker1, otherAccount, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund the caller with tokens
      await mockToken.write.mint([otherAccount.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve less than they want to stake
      await mockToken.write.approve([betrStaking.address, parseEther("50")], {
        account: otherAccount.account
      });

      await expect(betrStaking.write.stakeFor([staker1.account.address, parseEther("100")], {
        account: otherAccount.account
      })).to.be.rejected;
    });

    it("Should allow user to stake for themselves", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Create a mock rewarder contract
      const mockRewarder = await hre.viem.deployContract("MockRewarder");
      
      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([mockRewarder.address], {
        account: owner.account
      });

      // Fund staker with tokens
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      const stakeAmount = parseEther("100");

      // Verify initial state
      expect(await mockRewarder.read.getTotalCalls()).to.equal(0n);
      expect(await mockRewarder.read.getUserCalls([staker1.account.address])).to.equal(0n);

      expect(await betrStaking.write.stakeFor([staker1.account.address, stakeAmount], {
        account: staker1.account
      })).to.emit(betrStaking, "Staked").withArgs(staker1.account.address, stakeAmount);

      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(stakeAmount);
      expect(await mockToken.read.balanceOf([betrStaking.address])).to.equal(stakeAmount);
      expect(await betrStaking.read.totalStakedAmount()).to.equal(stakeAmount);

      // Verify rewarder was called
      expect(await mockRewarder.read.getTotalCalls()).to.equal(1n);
      expect(await mockRewarder.read.getUserCalls([staker1.account.address])).to.equal(1n);
      
      // Verify the call details
      const [user, oldAmount, newAmount, timestamp, callIndex] = await mockRewarder.read.getLastStakeChange([staker1.account.address]);
      expect(user.toLocaleLowerCase()).to.equal(staker1.account.address.toLocaleLowerCase());
      expect(oldAmount).to.equal(0n);
      expect(newAmount).to.equal(stakeAmount);
      expect(callIndex).to.equal(1n);
    });

    it("Should handle mixed stake and stakeFor operations", async function () {
      const { betrStaking, mockToken, staker1, staker2, otherAccount, owner } = await loadFixture(deployBETRStakingFixture);

      // Create a mock rewarder contract
      const mockRewarder = await hre.viem.deployContract("MockRewarder");
      
      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([mockRewarder.address], {
        account: owner.account
      });

      // Fund both users
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockToken.write.mint([otherAccount.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: otherAccount.account
      });

      const stake1 = parseEther("100");
      const stake2 = parseEther("200");

      // Verify initial state
      expect(await mockRewarder.read.getTotalCalls()).to.equal(0n);

      // Staker1 stakes for themselves
      await betrStaking.write.stake([stake1], {
        account: staker1.account
      });

      // Verify first rewarder call
      expect(await mockRewarder.read.getTotalCalls()).to.equal(1n);
      expect(await mockRewarder.read.getUserCalls([staker1.account.address])).to.equal(1n);

      // OtherAccount stakes for staker2
      await betrStaking.write.stakeFor([staker2.account.address, stake2], {
        account: otherAccount.account
      });

      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(stake1);
      expect(await betrStaking.read.stakedAmount([staker2.account.address])).to.equal(stake2);
      expect(await betrStaking.read.totalStakedAmount()).to.equal(stake1 + stake2);

      // Verify second rewarder call
      expect(await mockRewarder.read.getTotalCalls()).to.equal(2n);
      expect(await mockRewarder.read.getUserCalls([staker2.account.address])).to.equal(1n);

      // Verify call details for both users
      let [user, oldAmount, newAmount, timestamp, callIndex] = await mockRewarder.read.getLastStakeChange([staker1.account.address]);
      expect(user.toLocaleLowerCase()).to.equal(staker1.account.address.toLocaleLowerCase());
      expect(oldAmount).to.equal(0n);
      expect(newAmount).to.equal(stake1);
      expect(callIndex).to.equal(1n);
      
      [user, oldAmount, newAmount, timestamp, callIndex] = await mockRewarder.read.getLastStakeChange([staker2.account.address]);
      expect(user.toLocaleLowerCase()).to.equal(staker2.account.address.toLocaleLowerCase());
      expect(oldAmount).to.equal(0n);
      expect(newAmount).to.equal(stake2);
      expect(callIndex).to.equal(2n);
    });

    it("Should emit correct Staked event with beneficiary address", async function () {
      const { betrStaking, mockToken, staker1, otherAccount, owner } = await loadFixture(deployBETRStakingFixture);

      // Create a mock rewarder contract
      const mockRewarder = await hre.viem.deployContract("MockRewarder");
      
      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([mockRewarder.address], {
        account: owner.account
      });

      // Fund the caller with tokens
      await mockToken.write.mint([otherAccount.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens for the caller
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: otherAccount.account
      });

      const stakeAmount = parseEther("100");

      expect(await betrStaking.write.stakeFor([staker1.account.address, stakeAmount], {
        account: otherAccount.account
      })).to.emit(betrStaking, "Staked").withArgs(staker1.account.address, stakeAmount);

      // Verify rewarder was called
      expect(await mockRewarder.read.getTotalCalls()).to.equal(1n);
      expect(await mockRewarder.read.getUserCalls([staker1.account.address])).to.equal(1n);
    });
  });

  describe("Unstaking", function () {
    it("Should unstake tokens successfully", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund staker with tokens
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      const stakeAmount = parseEther("100");
      const unstakeAmount = parseEther("50");

      // First stake
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Check total staked after stake
      expect(await betrStaking.read.totalStakedAmount()).to.equal(stakeAmount);

      // Then unstake
      expect(await betrStaking.write.unstake([unstakeAmount], {
        account: staker1.account
      })).to.emit(betrStaking, "Unstaked").withArgs(staker1.account.address, unstakeAmount);

      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(stakeAmount - unstakeAmount);
      expect(await mockToken.read.balanceOf([betrStaking.address])).to.equal(stakeAmount - unstakeAmount);
      expect(await betrStaking.read.totalStakedAmount()).to.equal(stakeAmount - unstakeAmount);
    });

    it("Should unstake all tokens", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund staker with tokens
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      const stakeAmount = parseEther("100");

      // Stake
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Check total staked after stake
      expect(await betrStaking.read.totalStakedAmount()).to.equal(stakeAmount);

      // Unstake all
      await betrStaking.write.unstake([stakeAmount], {
        account: staker1.account
      });

      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(0n);
      expect(await mockToken.read.balanceOf([betrStaking.address])).to.equal(0n);
      expect(await betrStaking.read.totalStakedAmount()).to.equal(0n);
    });

    it("Should revert if unstaking is paused", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund staker with tokens
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      const stakeAmount = parseEther("100");

      // Stake
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Pause staking (this also pauses unstaking)
      await betrStaking.write.setStakingPaused([true], {
        account: owner.account
      });

      await expect(betrStaking.write.unstake([parseEther("50")], {
        account: staker1.account
      })).to.be.rejectedWith("StakingPaused");
    });

    it("Should revert if amount is zero", async function () {
      const { betrStaking, staker1 } = await loadFixture(deployBETRStakingFixture);

      await expect(betrStaking.write.unstake([0n], {
        account: staker1.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if user tries to unstake more than staked", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund staker with tokens
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      const stakeAmount = parseEther("100");

      // Stake
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Try to unstake more than staked
      await expect(betrStaking.write.unstake([parseEther("150")], {
        account: staker1.account
      })).to.be.rejectedWith("NotEnoughStakedAmount");
    });

    it("Should revert if user tries to unstake without staking first", async function () {
      const { betrStaking, staker1 } = await loadFixture(deployBETRStakingFixture);

      await expect(betrStaking.write.unstake([parseEther("50")], {
        account: staker1.account
      })).to.be.rejectedWith("NotEnoughStakedAmount");
    });
  });



  describe("Total Staked Amount", function () {
    it("Should start with zero total staked amount", async function () {
      const { betrStaking } = await loadFixture(deployBETRStakingFixture);
      
      expect(await betrStaking.read.totalStakedAmount()).to.equal(0n);
    });

    it("Should correctly track total staked amount across multiple operations", async function () {
      const { betrStaking, mockToken, staker1, staker2, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund both stakers
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockToken.write.mint([staker2.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker2.account
      });

      // Initial state
      expect(await betrStaking.read.totalStakedAmount()).to.equal(0n);

      // First staker stakes
      await betrStaking.write.stake([parseEther("100")], {
        account: staker1.account
      });
      expect(await betrStaking.read.totalStakedAmount()).to.equal(parseEther("100"));

      // Second staker stakes
      await betrStaking.write.stake([parseEther("200")], {
        account: staker2.account
      });
      expect(await betrStaking.read.totalStakedAmount()).to.equal(parseEther("300"));

      // First staker unstakes partially
      await betrStaking.write.unstake([parseEther("30")], {
        account: staker1.account
      });
      expect(await betrStaking.read.totalStakedAmount()).to.equal(parseEther("270"));

      // Second staker unstakes all
      await betrStaking.write.unstake([parseEther("200")], {
        account: staker2.account
      });
      expect(await betrStaking.read.totalStakedAmount()).to.equal(parseEther("70"));

      // First staker unstakes remaining
      await betrStaking.write.unstake([parseEther("70")], {
        account: staker1.account
      });
      expect(await betrStaking.read.totalStakedAmount()).to.equal(0n);
    });

    it("Should handle complex stake/unstake cycles correctly", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund staker
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      let expectedTotal = 0n;

      // Multiple stake/unstake cycles
      for (let i = 0; i < 5; i++) {
        const stakeAmount = parseEther("10");
        const unstakeAmount = parseEther("5");

        // Stake
        await betrStaking.write.stake([stakeAmount], {
          account: staker1.account
        });
        expectedTotal += stakeAmount;
        expect(await betrStaking.read.totalStakedAmount()).to.equal(expectedTotal);

        // Unstake
        await betrStaking.write.unstake([unstakeAmount], {
          account: staker1.account
        });
        expectedTotal -= unstakeAmount;
        expect(await betrStaking.read.totalStakedAmount()).to.equal(expectedTotal);
      }

      // Final total should be 25 (5 cycles * 5 tokens each)
      expect(await betrStaking.read.totalStakedAmount()).to.equal(parseEther("25"));
    });
  });



  describe("Batch Unstake", function () {
    it("Should batch unstake multiple users", async function () {
      const { betrStaking, mockToken, staker1, staker2, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund both stakers
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockToken.write.mint([staker2.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker2.account
      });

      // Both stake
      await betrStaking.write.stake([parseEther("100")], {
        account: staker1.account
      });
      await betrStaking.write.stake([parseEther("200")], {
        account: staker2.account
      });

      // Verify both are staking
      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(parseEther("100"));
      expect(await betrStaking.read.stakedAmount([staker2.account.address])).to.equal(parseEther("200"));

      // Batch unstake both users
      const users = [staker1.account.address, staker2.account.address];
      const amounts = [parseEther("50"), parseEther("100")]; // Partial for staker1, partial for staker2

      await betrStaking.write.batchUnstake([users, amounts], {
        account: owner.account
      });

      // Verify unstaking worked
      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(parseEther("50"));
      expect(await betrStaking.read.stakedAmount([staker2.account.address])).to.equal(parseEther("100"));
    });

    it("Should batch unstake all tokens for users", async function () {
      const { betrStaking, mockToken, staker1, staker2, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund both stakers
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockToken.write.mint([staker2.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker2.account
      });

      // Both stake
      await betrStaking.write.stake([parseEther("100")], {
        account: staker1.account
      });
      await betrStaking.write.stake([parseEther("200")], {
        account: staker2.account
      });

      // Batch unstake all for both users (amount = 0 means unstake all)
      const users = [staker1.account.address, staker2.account.address];
      const amounts = [0n, 0n]; // 0 = unstake all

      await betrStaking.write.batchUnstake([users, amounts], {
        account: owner.account
      });

      // Verify both users are completely unstaked
      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(0n);
      expect(await betrStaking.read.stakedAmount([staker2.account.address])).to.equal(0n);
    });

    it("Should batch unstake even when staking is paused", async function () {
      const { betrStaking, mockToken, staker1, staker2, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund both stakers
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockToken.write.mint([staker2.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker2.account
      });

      // Both stake
      await betrStaking.write.stake([parseEther("100")], {
        account: staker1.account
      });
      await betrStaking.write.stake([parseEther("200")], {
        account: staker2.account
      });

      // Pause staking
      await betrStaking.write.setStakingPaused([true], {
        account: owner.account
      });

      // Batch unstake should still work (bypasses pause)
      const users = [staker1.account.address, staker2.account.address];
      const amounts = [0n, 0n];

      await betrStaking.write.batchUnstake([users, amounts], {
        account: owner.account
      });

      // Verify unstaking worked despite pause
      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(0n);
      expect(await betrStaking.read.stakedAmount([staker2.account.address])).to.equal(0n);
    });

    it("Should revert if arrays have different lengths", async function () {
      const { betrStaking, owner } = await loadFixture(deployBETRStakingFixture);

      const users = [owner.account.address];
      const amounts = [100n, 200n]; // Different length

      await expect(betrStaking.write.batchUnstake([users, amounts], {
        account: owner.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if arrays are empty", async function () {
      const { betrStaking, owner } = await loadFixture(deployBETRStakingFixture);

      const users: `0x${string}`[] = [];
      const amounts: bigint[] = [];

      await expect(betrStaking.write.batchUnstake([users, amounts], {
        account: owner.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if an address is 0", async function () {
      const { betrStaking, owner } = await loadFixture(deployBETRStakingFixture);
      const users = ["0x0000000000000000000000000000000000000000"] as `0x${string}`[];
      const amounts = [0n];
      await expect(betrStaking.write.batchUnstake([users, amounts], {
        account: owner.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if caller is not owner", async function () {
      const { betrStaking, staker1 } = await loadFixture(deployBETRStakingFixture);

      const users = [staker1.account.address];
      const amounts = [100n];

      await expect(betrStaking.write.batchUnstake([users, amounts], {
        account: staker1.account
      })).to.be.rejectedWith("NotOwner");
    });

    it("Should handle users with zero stake gracefully", async function () {
      const { betrStaking, mockToken, staker1, staker2, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund only staker1
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      // Only staker1 stakes
      await betrStaking.write.stake([parseEther("100")], {
        account: staker1.account
      });

      // Try to batch unstake both users (staker2 has no stake)
      const users = [staker1.account.address, staker2.account.address];
      const amounts = [0n, 0n];

      await betrStaking.write.batchUnstake([users, amounts], {
        account: owner.account
      });

      // Verify staker1 is unstaked, staker2 unchanged
      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(0n);
      expect(await betrStaking.read.stakedAmount([staker2.account.address])).to.equal(0n);
    });

    it("Should emit Unstaked events for each user", async function () {
      const { betrStaking, mockToken, staker1, staker2, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund both stakers
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockToken.write.mint([staker2.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker2.account
      });

      // Both stake
      await betrStaking.write.stake([parseEther("100")], {
        account: staker1.account
      });
      await betrStaking.write.stake([parseEther("200")], {
        account: staker2.account
      });

      // Batch unstake
      const users = [staker1.account.address, staker2.account.address];
      const amounts = [parseEther("50"), parseEther("100")];

      const tx = await betrStaking.write.batchUnstake([users, amounts], {
        account: owner.account
      });

      expect(tx).to.emit(betrStaking, "Unstaked").withArgs(staker1.account.address, parseEther("50"));
      expect(tx).to.emit(betrStaking, "Unstaked").withArgs(staker2.account.address, parseEther("100"));
    });
  });

  describe("Edge Cases", function () {
    it("Should handle very small amounts", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund staker with tokens
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      const smallAmount = 1n; // 1 wei

      await betrStaking.write.stake([smallAmount], {
        account: staker1.account
      });

      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(smallAmount);
    });

    it("Should handle very large amounts", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund staker with a very large amount
      const largeAmount = parseEther("1000000"); // 1 million tokens
      await mockToken.write.mint([staker1.account.address, largeAmount], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, largeAmount], {
        account: staker1.account
      });

      await betrStaking.write.stake([largeAmount], {
        account: staker1.account
      });

      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(largeAmount);
    });

    it("Should handle multiple stake/unstake cycles", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund staker with tokens
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      // Multiple stake/unstake cycles
      for (let i = 0; i < 5; i++) {
        const stakeAmount = parseEther("10");
        const unstakeAmount = parseEther("5");

        await betrStaking.write.stake([stakeAmount], {
          account: staker1.account
        });

        await betrStaking.write.unstake([unstakeAmount], {
          account: staker1.account
        });
      }

      // Final staked amount should be 25 (5 cycles * 5 tokens each)
      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(parseEther("25"));
    });
  });

  describe("Rewarder Management", function () {
    it("Should add a rewarder successfully", async function () {
      const { betrStaking, owner, otherAccount } = await loadFixture(deployBETRStakingFixture);

      // Initially should not be a rewarder
      expect(await betrStaking.read.isRewarder([otherAccount.account.address])).to.be.false;

      await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      });

      // Verify rewarder was added
      expect(await betrStaking.read.isRewarder([otherAccount.account.address])).to.be.true;
    });

    it("Should add multiple rewarders", async function () {
      const { betrStaking, owner, otherAccount, user } = await loadFixture(deployBETRStakingFixture);

      // Add first rewarder
      await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      });

      // Add second rewarder
      await betrStaking.write.addRewarder([user.account.address], {
        account: owner.account
      });

      // Verify rewarders were added
      expect(await betrStaking.read.isRewarder([otherAccount.account.address])).to.be.true;
      expect(await betrStaking.read.isRewarder([user.account.address])).to.be.true;
    });

    it("Should revert when adding zero address as rewarder", async function () {
      const { betrStaking, owner } = await loadFixture(deployBETRStakingFixture);

      await expect(betrStaking.write.addRewarder(["0x0000000000000000000000000000000000000000"], {
        account: owner.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert when non-owner tries to add rewarder", async function () {
      const { betrStaking, otherAccount, user } = await loadFixture(deployBETRStakingFixture);

      await expect(betrStaking.write.addRewarder([user.account.address], {
        account: otherAccount.account
      })).to.be.rejectedWith("NotOwner");
    });

    it("Should revert when adding duplicate rewarder", async function () {
      const { betrStaking, owner, otherAccount } = await loadFixture(deployBETRStakingFixture);

      // Add rewarder first
      await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      });

      // Verify rewarder was added
      expect(await betrStaking.read.isRewarder([otherAccount.account.address])).to.be.true;

      // Try to add the same rewarder again
      await expect(betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert when adding multiple duplicate rewarders", async function () {
      const { betrStaking, owner, otherAccount, user } = await loadFixture(deployBETRStakingFixture);

      // Add first rewarder
      await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      });

      // Add second rewarder
      await betrStaking.write.addRewarder([user.account.address], {
        account: owner.account
      });

      // Try to add first rewarder again
      await expect(betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      })).to.be.rejectedWith("InvalidInput");

      // Try to add second rewarder again
      await expect(betrStaking.write.addRewarder([user.account.address], {
        account: owner.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should allow adding rewarder after removing it", async function () {
      const { betrStaking, owner, otherAccount } = await loadFixture(deployBETRStakingFixture);

      // Add rewarder
      await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      });

      // Verify rewarder was added
      expect(await betrStaking.read.isRewarder([otherAccount.account.address])).to.be.true;

      // Remove rewarder
      await betrStaking.write.removeRewarder([otherAccount.account.address], {
        account: owner.account
      });

      // Verify rewarder was removed
      expect(await betrStaking.read.isRewarder([otherAccount.account.address])).to.be.false;

      // Should be able to add the same rewarder again
      await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      });

      // Verify rewarder was added again
      expect(await betrStaking.read.isRewarder([otherAccount.account.address])).to.be.true;
    });

    it("Should remove a rewarder successfully", async function () {
      const { betrStaking, owner, otherAccount } = await loadFixture(deployBETRStakingFixture);

      // Add rewarder first
      await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      });

      // Remove rewarder
      await betrStaking.write.removeRewarder([otherAccount.account.address], {
        account: owner.account
      });

      // Verify rewarder was removed
      expect(await betrStaking.read.isRewarder([otherAccount.account.address])).to.be.false;
    });

    it("Should remove rewarder from middle of array", async function () {
      const { betrStaking, owner, otherAccount, user, staker1 } = await loadFixture(deployBETRStakingFixture);

      // Add three rewarders
      await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      });
      await betrStaking.write.addRewarder([user.account.address], {
        account: owner.account
      });
      await betrStaking.write.addRewarder([staker1.account.address], {
        account: owner.account
      });

      // Remove middle rewarder (user)
      await betrStaking.write.removeRewarder([user.account.address], {
        account: owner.account
      });

      // Verify rewarder was removed
      expect(await betrStaking.read.isRewarder([user.account.address])).to.be.false;

      // Verify other rewarders are still there
      expect(await betrStaking.read.isRewarder([otherAccount.account.address])).to.be.true;
      expect(await betrStaking.read.isRewarder([staker1.account.address])).to.be.true;
    });

    it("Should handle removing non-existent rewarder gracefully", async function () {
      const { betrStaking, owner, otherAccount, user } = await loadFixture(deployBETRStakingFixture);

      // Add one rewarder
      await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      });

      // Try to remove non-existent rewarder
      await betrStaking.write.removeRewarder([user.account.address], {
        account: owner.account
      });

      // Verify rewarder was not removed
      expect(await betrStaking.read.isRewarder([user.account.address])).to.be.false;

      // Verify other rewarders are still there
      expect(await betrStaking.read.isRewarder([otherAccount.account.address])).to.be.true;
    });

    it("Should revert when non-owner tries to remove rewarder", async function () {
      const { betrStaking, owner, otherAccount, user } = await loadFixture(deployBETRStakingFixture);

      // Add rewarder first
      await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      });

      // Try to remove with non-owner
      await expect(betrStaking.write.removeRewarder([otherAccount.account.address], {
        account: user.account
      })).to.be.rejectedWith("NotOwner");
    });

    it("Should handle complex add/remove operations", async function () {
      const { betrStaking, owner, otherAccount, user, staker1, staker2 } = await loadFixture(deployBETRStakingFixture);

      // Add multiple rewarders
      await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      });
      await betrStaking.write.addRewarder([user.account.address], {
        account: owner.account
      });
      await betrStaking.write.addRewarder([staker1.account.address], {
        account: owner.account
      });

      // Remove first rewarder
      await betrStaking.write.removeRewarder([otherAccount.account.address], {
        account: owner.account
      });

      // Add new rewarder
      await betrStaking.write.addRewarder([staker2.account.address], {
        account: owner.account
      });

      // Remove middle rewarder
      await betrStaking.write.removeRewarder([user.account.address], {
        account: owner.account
      });

      // Verify rewarders inclusion and exclusion
      expect(await betrStaking.read.isRewarder([otherAccount.account.address])).to.be.false;
      expect(await betrStaking.read.isRewarder([user.account.address])).to.be.false;
      expect(await betrStaking.read.isRewarder([staker1.account.address])).to.be.true;
      expect(await betrStaking.read.isRewarder([staker2.account.address])).to.be.true;
    });

    it("Should call rewarders when staking", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Create a mock rewarder contract
      const mockRewarder = await hre.viem.deployContract("MockRewarder");
      
      // Add rewarder
      await betrStaking.write.addRewarder([mockRewarder.address], {
        account: owner.account
      });

      // Fund staker with tokens
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      const stakeAmount = parseEther("100");

      // Verify initial state
      expect(await mockRewarder.read.getTotalCalls()).to.equal(0n);
      expect(await mockRewarder.read.getUserCalls([staker1.account.address])).to.equal(0n);

      // Stake - this should call the rewarder
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Verify staking worked
      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(stakeAmount);
      
      // Verify rewarder was called
      expect(await mockRewarder.read.getTotalCalls()).to.equal(1n);
      expect(await mockRewarder.read.getUserCalls([staker1.account.address])).to.equal(1n);
      
      // Verify the call details
      const [user, oldAmount, newAmount, timestamp, callIndex] = await mockRewarder.read.getLastStakeChange([staker1.account.address]);
      expect(user.toLocaleLowerCase()).to.equal(staker1.account.address.toLocaleLowerCase());
      expect(oldAmount).to.equal(0n);
      expect(newAmount).to.equal(stakeAmount);
      expect(callIndex).to.equal(1n);
    });

    it("Should call rewarders when unstaking", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Create a mock rewarder contract
      const mockRewarder = await hre.viem.deployContract("MockRewarder");
      
      // Add rewarder
      await betrStaking.write.addRewarder([mockRewarder.address], {
        account: owner.account
      });

      // Fund staker with tokens
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      const stakeAmount = parseEther("100");
      const unstakeAmount = parseEther("50");

      // First stake
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Verify first call
      expect(await mockRewarder.read.getTotalCalls()).to.equal(1n);
      expect(await mockRewarder.read.getUserCalls([staker1.account.address])).to.equal(1n);
      
      let [user, oldAmount, newAmount, timestamp, callIndex] = await mockRewarder.read.getLastStakeChange([staker1.account.address]);
      expect(user.toLocaleLowerCase()).to.equal(staker1.account.address.toLocaleLowerCase());
      expect(oldAmount).to.equal(0n);
      expect(newAmount).to.equal(stakeAmount);
      expect(callIndex).to.equal(1n);

      // Then unstake - this should call the rewarder again
      await betrStaking.write.unstake([unstakeAmount], {
        account: staker1.account
      });

      // Verify unstaking worked
      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(stakeAmount - unstakeAmount);
      
      // Verify second call
      expect(await mockRewarder.read.getTotalCalls()).to.equal(2n);
      expect(await mockRewarder.read.getUserCalls([staker1.account.address])).to.equal(2n);
      
      [user, oldAmount, newAmount, timestamp, callIndex] = await mockRewarder.read.getLastStakeChange([staker1.account.address]);
      expect(user.toLocaleLowerCase()).to.equal(staker1.account.address.toLocaleLowerCase());
      expect(oldAmount).to.equal(stakeAmount);
      expect(newAmount).to.equal(stakeAmount - unstakeAmount);
      expect(callIndex).to.equal(2n);
    });

    it("Should call multiple rewarders when staking", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Create multiple mock rewarder contracts
      const mockRewarder1 = await hre.viem.deployContract("MockRewarder");
      const mockRewarder2 = await hre.viem.deployContract("MockRewarder");
      
      // Add rewarders
      await betrStaking.write.addRewarder([mockRewarder1.address], {
        account: owner.account
      });
      await betrStaking.write.addRewarder([mockRewarder2.address], {
        account: owner.account
      });

      // Fund staker with tokens
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      const stakeAmount = parseEther("100");

      // Verify initial state
      expect(await mockRewarder1.read.getTotalCalls()).to.equal(0n);
      expect(await mockRewarder2.read.getTotalCalls()).to.equal(0n);

      // Stake - this should call both rewarders
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Verify staking worked
      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(stakeAmount);
      
      // Verify both rewarders were called
      expect(await mockRewarder1.read.getTotalCalls()).to.equal(1n);
      expect(await mockRewarder2.read.getTotalCalls()).to.equal(1n);
      
      // Verify call details for both rewarders
      let [user, oldAmount, newAmount, timestamp, callIndex] = await mockRewarder1.read.getLastStakeChange([staker1.account.address]);
      expect(user.toLocaleLowerCase()).to.equal(staker1.account.address.toLocaleLowerCase());
      expect(oldAmount).to.equal(0n);
      expect(newAmount).to.equal(stakeAmount);
      expect(callIndex).to.equal(1n);
      
      [user, oldAmount, newAmount, timestamp, callIndex] = await mockRewarder2.read.getLastStakeChange([staker1.account.address]);
      expect(user.toLocaleLowerCase()).to.equal(staker1.account.address.toLocaleLowerCase());
      expect(oldAmount).to.equal(0n);
      expect(newAmount).to.equal(stakeAmount);
      expect(callIndex).to.equal(1n);
    });

    it("Should handle rewarder removal during operations", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Create mock rewarder contracts
      const mockRewarder1 = await hre.viem.deployContract("MockRewarder");
      const mockRewarder2 = await hre.viem.deployContract("MockRewarder");
      
      // Add rewarders
      await betrStaking.write.addRewarder([mockRewarder1.address], {
        account: owner.account
      });
      await betrStaking.write.addRewarder([mockRewarder2.address], {
        account: owner.account
      });

      // Fund staker with tokens
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      const stakeAmount = parseEther("100");

      // First stake - should call both rewarders
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Verify both rewarders were called
      expect(await mockRewarder1.read.getTotalCalls()).to.equal(1n);
      expect(await mockRewarder2.read.getTotalCalls()).to.equal(1n);

      // Remove one rewarder
      await betrStaking.write.removeRewarder([mockRewarder1.address], {
        account: owner.account
      });

      // Stake again - should only call remaining rewarder
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Verify final state
      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(stakeAmount * 2n);
      
      // Verify only the remaining rewarder was called for the second stake
      expect(await mockRewarder1.read.getTotalCalls()).to.equal(1n); // No additional calls
      expect(await mockRewarder2.read.getTotalCalls()).to.equal(2n); // Called twice
      
      // Verify the second call details for the remaining rewarder
      const [user, oldAmount, newAmount, timestamp, callIndex] = await mockRewarder2.read.getLastStakeChange([staker1.account.address]);
      expect(user.toLocaleLowerCase()).to.equal(staker1.account.address.toLocaleLowerCase());
      expect(oldAmount).to.equal(stakeAmount);
      expect(newAmount).to.equal(stakeAmount * 2n);
      expect(callIndex).to.equal(2n);
    });

    // Tests for isRewarder function (uncomment when function is properly exposed)
    it("Should correctly identify rewarders with isRewarder function", async function () {
      const { betrStaking, owner, otherAccount, user } = await loadFixture(deployBETRStakingFixture);

      // Initially no rewarders should exist
      expect(await betrStaking.read.isRewarder([otherAccount.account.address])).to.be.false;
      expect(await betrStaking.read.isRewarder([user.account.address])).to.be.false;

      // Add first rewarder
      await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      });

      // Verify first rewarder is identified
      expect(await betrStaking.read.isRewarder([otherAccount.account.address])).to.be.true;
      expect(await betrStaking.read.isRewarder([user.account.address])).to.be.false;

      // Add second rewarder
      await betrStaking.write.addRewarder([user.account.address], {
        account: owner.account
      });

      // Verify both rewarders are identified
      expect(await betrStaking.read.isRewarder([otherAccount.account.address])).to.be.true;
      expect(await betrStaking.read.isRewarder([user.account.address])).to.be.true;
    });

    it("Should correctly handle isRewarder after removal", async function () {
      const { betrStaking, owner, otherAccount, user } = await loadFixture(deployBETRStakingFixture);

      // Add two rewarders
      await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      });
      await betrStaking.write.addRewarder([user.account.address], {
        account: owner.account
      });

      // Verify both are rewarders
      expect(await betrStaking.read.isRewarder([otherAccount.account.address])).to.be.true;
      expect(await betrStaking.read.isRewarder([user.account.address])).to.be.true;

      // Remove first rewarder
      await betrStaking.write.removeRewarder([otherAccount.account.address], {
        account: owner.account
      });

      // Verify first is no longer a rewarder, second still is
      expect(await betrStaking.read.isRewarder([otherAccount.account.address])).to.be.false;
      expect(await betrStaking.read.isRewarder([user.account.address])).to.be.true;
    });

    it("Should handle isRewarder with zero address", async function () {
      const { betrStaking } = await loadFixture(deployBETRStakingFixture);

      // Zero address should not be a rewarder
      expect(await betrStaking.read.isRewarder(["0x0000000000000000000000000000000000000000"])).to.be.false;
    });

    it("Should handle isRewarder with non-existent address", async function () {
      const { betrStaking, owner, otherAccount } = await loadFixture(deployBETRStakingFixture);

      // Add a rewarder
      await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      });

      // Create a new address that hasn't been added as rewarder
      const [newAccount] = await hre.viem.getWalletClients();
      
      // Verify new address is not a rewarder
      expect(await betrStaking.read.isRewarder([newAccount.account.address])).to.be.false;
      expect(await betrStaking.read.isRewarder([otherAccount.account.address])).to.be.true;
    });

    it("Should handle isRewarder with multiple add/remove cycles", async function () {
      const { betrStaking, owner, otherAccount, user, staker1 } = await loadFixture(deployBETRStakingFixture);

      // Add multiple rewarders
      await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      });
      await betrStaking.write.addRewarder([user.account.address], {
        account: owner.account
      });
      await betrStaking.write.addRewarder([staker1.account.address], {
        account: owner.account
      });

      // Verify all are rewarders
      expect(await betrStaking.read.isRewarder([otherAccount.account.address])).to.be.true;
      expect(await betrStaking.read.isRewarder([user.account.address])).to.be.true;
      expect(await betrStaking.read.isRewarder([staker1.account.address])).to.be.true;

      // Remove middle rewarder
      await betrStaking.write.removeRewarder([user.account.address], {
        account: owner.account
      });

      // Verify middle is no longer a rewarder, others still are
      expect(await betrStaking.read.isRewarder([otherAccount.account.address])).to.be.true;
      expect(await betrStaking.read.isRewarder([user.account.address])).to.be.false;
      expect(await betrStaking.read.isRewarder([staker1.account.address])).to.be.true;

      // Add new rewarder
      const [newAccount] = await hre.viem.getWalletClients();
      await betrStaking.write.addRewarder([newAccount.account.address], {
        account: owner.account
      });

      // Verify new rewarder is identified
      expect(await betrStaking.read.isRewarder([newAccount.account.address])).to.be.true;
    });

    it("Should comprehensively handle onStakeChanged calls", async function () {
      const { betrStaking, mockToken, staker1, staker2, owner } = await loadFixture(deployBETRStakingFixture);

      // Create mock rewarder
      const mockRewarder = await hre.viem.deployContract("MockRewarder");
      
      // Add rewarder
      await betrStaking.write.addRewarder([mockRewarder.address], {
        account: owner.account
      });

      // Fund both stakers with tokens
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockToken.write.mint([staker2.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker2.account
      });

      // Test 1: Initial stake for staker1
      const stake1 = parseEther("100");
      await betrStaking.write.stake([stake1], {
        account: staker1.account
      });

      // Verify call details
      expect(await mockRewarder.read.getTotalCalls()).to.equal(1n);
      expect(await mockRewarder.read.getUserCalls([staker1.account.address])).to.equal(1n);
      
      let [user, oldAmount, newAmount, timestamp, callIndex] = await mockRewarder.read.getLastStakeChange([staker1.account.address]);
      expect(user.toLocaleLowerCase()).to.equal(staker1.account.address.toLocaleLowerCase());
      expect(oldAmount).to.equal(0n);
      expect(newAmount).to.equal(stake1);
      expect(callIndex).to.equal(1n);

      // Test 2: Stake for staker2
      const stake2 = parseEther("200");
      await betrStaking.write.stake([stake2], {
        account: staker2.account
      });

      // Verify call details
      expect(await mockRewarder.read.getTotalCalls()).to.equal(2n);
      expect(await mockRewarder.read.getUserCalls([staker2.account.address])).to.equal(1n);
      
      [user, oldAmount, newAmount, timestamp, callIndex] = await mockRewarder.read.getLastStakeChange([staker2.account.address]);
      expect(user.toLocaleLowerCase()).to.equal(staker2.account.address.toLocaleLowerCase());
      expect(oldAmount).to.equal(0n);
      expect(newAmount).to.equal(stake2);
      expect(callIndex).to.equal(2n);

      // Test 3: Additional stake for staker1
      const additionalStake = parseEther("50");
      await betrStaking.write.stake([additionalStake], {
        account: staker1.account
      });

      // Verify call details
      expect(await mockRewarder.read.getTotalCalls()).to.equal(3n);
      expect(await mockRewarder.read.getUserCalls([staker1.account.address])).to.equal(2n);
      
      [user, oldAmount, newAmount, timestamp, callIndex] = await mockRewarder.read.getLastStakeChange([staker1.account.address]);
      expect(user.toLocaleLowerCase()).to.equal(staker1.account.address.toLocaleLowerCase());
      expect(oldAmount).to.equal(stake1);
      expect(newAmount).to.equal(stake1 + additionalStake);
      expect(callIndex).to.equal(3n);

      // Test 4: Unstake for staker1
      const unstakeAmount = parseEther("30");
      await betrStaking.write.unstake([unstakeAmount], {
        account: staker1.account
      });

      // Verify call details
      expect(await mockRewarder.read.getTotalCalls()).to.equal(4n);
      expect(await mockRewarder.read.getUserCalls([staker1.account.address])).to.equal(3n);
      
      [user, oldAmount, newAmount, timestamp, callIndex] = await mockRewarder.read.getLastStakeChange([staker1.account.address]);
      expect(user.toLocaleLowerCase()).to.equal(staker1.account.address.toLocaleLowerCase());
      expect(oldAmount).to.equal(stake1 + additionalStake);
      expect(newAmount).to.equal(stake1 + additionalStake - unstakeAmount);
      expect(callIndex).to.equal(4n);

      // Test 5: Verify user history
      expect(await mockRewarder.read.getUserStakeChangesCount([staker1.account.address])).to.equal(3n);
      expect(await mockRewarder.read.getUserStakeChangesCount([staker2.account.address])).to.equal(1n);

      // Test 6: Verify total calls per user
      expect(await mockRewarder.read.getUserCalls([staker1.account.address])).to.equal(3n);
      expect(await mockRewarder.read.getUserCalls([staker2.account.address])).to.equal(1n);
    });
  });

  describe("Events", function () {
    it("Should emit correct events for staking", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund staker with tokens
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      const stakeAmount = parseEther("100");

      expect(await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      })).to.emit(betrStaking, "Staked").withArgs(staker1.account.address, stakeAmount);
    });

    it("Should emit correct events for unstaking", async function () {
      const { betrStaking, mockToken, staker1, owner } = await loadFixture(deployBETRStakingFixture);

      // Fund staker with tokens
      await mockToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      const stakeAmount = parseEther("100");
      const unstakeAmount = parseEther("50");

      // First stake
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Then unstake
      expect(await betrStaking.write.unstake([unstakeAmount], {
        account: staker1.account
      })).to.emit(betrStaking, "Unstaked").withArgs(staker1.account.address, unstakeAmount);
    });

    it("Should emit correct events for ownership transfer", async function () {
      const { betrStaking, owner, otherAccount, publicClient } = await loadFixture(deployBETRStakingFixture);

      let hash = await betrStaking.write.setProposedOwner([otherAccount.account.address], {
        account: owner.account
      });
      await publicClient.waitForTransactionReceipt({ hash });

      expect(await betrStaking.write.acceptOwnership({
        account: otherAccount.account
      })).to.emit(betrStaking, "OwnershipTransferred").withArgs(owner.account.address, otherAccount.account.address);
    });

    it("Should emit correct events for staking pause", async function () {
      const { betrStaking, owner } = await loadFixture(deployBETRStakingFixture);

      expect(await betrStaking.write.setStakingPaused([true], {
        account: owner.account
      })).to.emit(betrStaking, "StakingPausedSet").withArgs(true);

      expect(await betrStaking.write.setStakingPaused([false], {
        account: owner.account
      })).to.emit(betrStaking, "StakingPausedSet").withArgs(false);
    });

    it("Should emit RewarderAdded event when adding a rewarder", async function () {
      const { betrStaking, owner, otherAccount } = await loadFixture(deployBETRStakingFixture);

      expect(await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      })).to.emit(betrStaking, "RewarderAdded").withArgs(otherAccount.account.address);
    });

    it("Should emit RewarderRemoved event when removing a rewarder", async function () {
      const { betrStaking, owner, otherAccount } = await loadFixture(deployBETRStakingFixture);

      // First add a rewarder
      await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      });

      // Then remove it and verify event emission
      expect(await betrStaking.write.removeRewarder([otherAccount.account.address], {
        account: owner.account
      })).to.emit(betrStaking, "RewarderRemoved").withArgs(otherAccount.account.address);
    });

    it("Should emit RewarderRemoved event even when removing non-existent rewarder", async function () {
      const { betrStaking, owner, otherAccount } = await loadFixture(deployBETRStakingFixture);

      // Try to remove a rewarder that was never added
      expect(await betrStaking.write.removeRewarder([otherAccount.account.address], {
        account: owner.account
      })).to.emit(betrStaking, "RewarderRemoved").withArgs(otherAccount.account.address);
    });

    it("Should emit multiple RewarderAdded events when adding multiple rewarders", async function () {
      const { betrStaking, owner, otherAccount, user } = await loadFixture(deployBETRStakingFixture);

      // Add first rewarder
      expect(await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      })).to.emit(betrStaking, "RewarderAdded").withArgs(otherAccount.account.address);

      // Add second rewarder
      expect(await betrStaking.write.addRewarder([user.account.address], {
        account: owner.account
      })).to.emit(betrStaking, "RewarderAdded").withArgs(user.account.address);
    });

    it("Should emit RewarderRemoved events in correct order when removing multiple rewarders", async function () {
      const { betrStaking, owner, otherAccount, user } = await loadFixture(deployBETRStakingFixture);

      // Add two rewarders
      await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      });
      await betrStaking.write.addRewarder([user.account.address], {
        account: owner.account
      });

      // Remove first rewarder
      expect(await betrStaking.write.removeRewarder([otherAccount.account.address], {
        account: owner.account
      })).to.emit(betrStaking, "RewarderRemoved").withArgs(otherAccount.account.address);

      // Remove second rewarder
      expect(await betrStaking.write.removeRewarder([user.account.address], {
        account: owner.account
      })).to.emit(betrStaking, "RewarderRemoved").withArgs(user.account.address);
    });

    it("Should emit events with correct indexed parameters", async function () {
      const { betrStaking, owner, otherAccount } = await loadFixture(deployBETRStakingFixture);

      // Test RewarderAdded event with indexed parameter
      const addTx = await betrStaking.write.addRewarder([otherAccount.account.address], {
        account: owner.account
      });
      
      expect(addTx).to.emit(betrStaking, "RewarderAdded").withArgs(otherAccount.account.address);

      // Test RewarderRemoved event with indexed parameter
      const removeTx = await betrStaking.write.removeRewarder([otherAccount.account.address], {
        account: owner.account
      });
      
      expect(removeTx).to.emit(betrStaking, "RewarderRemoved").withArgs(otherAccount.account.address);
    });
  });
}); 