import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseEther } from "viem";

describe("BETRRewards", function () {
  // We define a fixture to reuse the same setup in every test.
  async function deployBETRRewardsFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount, user, staker1, staker2, rewarder] = await hre.viem.getWalletClients();

    // Deploy mock ERC20 token for staking
    const mockStakingToken = await hre.viem.deployContract("MockERC20", ["Staking Token", "STK", 18]);
    
    // Deploy mock ERC20 token for rewards
    const mockRewardToken = await hre.viem.deployContract("MockERC20", ["Reward Token", "RWD", 18]);
    
    // Deploy BETRStaking
    const betrStaking = await hre.viem.deployContract("BETRStaking", [owner.account.address, mockStakingToken.address]);

    // Deploy BETRRewards
    const betrRewards = await hre.viem.deployContract("BETRRewards", [owner.account.address, betrStaking.address, mockRewardToken.address]);

    const publicClient = await hre.viem.getPublicClient();

    return {
      betrRewards,
      betrStaking,
      mockStakingToken,
      mockRewardToken,
      owner,
      otherAccount,
      user,
      staker1,
      staker2,
      rewarder,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Should set the right owner, staking contract, and reward token", async function () {
      const { betrRewards, owner, betrStaking, mockRewardToken } = await loadFixture(deployBETRRewardsFixture);

      expect(await betrRewards.read.owner()).to.equal(
        getAddress(owner.account.address)
      );
      expect(await betrRewards.read.stakingContract()).to.equal(
        getAddress(betrStaking.address)
      );
      expect(await betrRewards.read.rewardToken()).to.equal(
        getAddress(mockRewardToken.address)
      );
    });

    it("Should revert if staking contract is zero address", async function () {
      const { owner, mockRewardToken } = await loadFixture(deployBETRRewardsFixture);
      
      await expect(
        hre.viem.deployContract("BETRRewards", [
          owner.account.address, 
          "0x0000000000000000000000000000000000000000",
          mockRewardToken.address
        ])
      ).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if reward token is zero address", async function () {
      const { betrStaking, owner } = await loadFixture(deployBETRRewardsFixture);
      
      await expect(
        hre.viem.deployContract("BETRRewards", [
          owner.account.address, 
          betrStaking.address,
          "0x0000000000000000000000000000000000000000"
        ])
      ).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if staking contract is not a valid staking contract", async function () {
      const { owner, mockRewardToken } = await loadFixture(deployBETRRewardsFixture);
      
      // Deploy a contract that's not a staking contract
      const mockContract = await hre.viem.deployContract("Mock");
      
      await expect(
        hre.viem.deployContract("BETRRewards", [
          owner.account.address, 
          mockContract.address,
          mockRewardToken.address
        ])
      ).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if reward token is not a valid ERC20", async function () {
      const { betrStaking, owner } = await loadFixture(deployBETRRewardsFixture);
      
      // Deploy a contract that's not an ERC20
      const mockContract = await hre.viem.deployContract("Mock");
      
      await expect(
        hre.viem.deployContract("BETRRewards", [
          owner.account.address, 
          betrStaking.address,
          mockContract.address
        ])
      ).to.be.rejectedWith("InvalidInput");
    });

    it("Should initialize with rewarding paused as false", async function () {
      const { betrRewards } = await loadFixture(deployBETRRewardsFixture);

      expect(await betrRewards.read.isRewardingPaused()).to.be.false;
    });
  });

  describe("Ownership", function () {
    it("Should prepare the ownership transfer", async function () {
      const { betrRewards, owner, otherAccount } = await loadFixture(deployBETRRewardsFixture);

      await betrRewards.write.setProposedOwner([otherAccount.account.address], {
        account: owner.account
      });
      expect(await betrRewards.read.proposedOwner()).to.equal(
        getAddress(otherAccount.account.address)
      );
    });

    it("Should not prepare the ownership transfer if the proposed owner is the zero address", async function () {
      const { betrRewards, owner } = await loadFixture(deployBETRRewardsFixture);
      await expect(betrRewards.write.setProposedOwner([getAddress("0x0000000000000000000000000000000000000000")], {
        account: owner.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should not prepare the ownership transfer if the sender is not the owner", async function () {
      const { betrRewards, otherAccount, user } = await loadFixture(deployBETRRewardsFixture);
      await expect(betrRewards.write.setProposedOwner([user.account.address], {
        account: otherAccount.account
      })).to.be.rejectedWith("NotOwner");
    });

    it("Should accept the ownership transfer", async function () {
      const { betrRewards, owner, otherAccount, publicClient } = await loadFixture(deployBETRRewardsFixture);

      let hash = await betrRewards.write.setProposedOwner([otherAccount.account.address], {
        account: owner.account
      });
      await publicClient.waitForTransactionReceipt({ hash });

      expect(await betrRewards.write.acceptOwnership({
        account: otherAccount.account
      })).to.emit(betrRewards, "OwnershipTransferred").withArgs(owner.account.address, otherAccount.account.address);

      expect((await betrRewards.read.owner()).toLocaleLowerCase()).to.equal(otherAccount.account.address.toLocaleLowerCase());
    });

    it("Should not accept the ownership transfer if the sender is not the proposed owner", async function () {
      const { betrRewards, otherAccount } = await loadFixture(deployBETRRewardsFixture);
      await expect(betrRewards.write.acceptOwnership({
        account: otherAccount.account
      })).to.be.rejectedWith("NotProposedOwner");
    });

    it("Should cancel the ownership transfer", async function () {
      const { betrRewards, owner, otherAccount, publicClient } = await loadFixture(deployBETRRewardsFixture);

      let hash = await betrRewards.write.setProposedOwner([otherAccount.account.address], {
        account: owner.account
      });
      await publicClient.waitForTransactionReceipt({ hash });

      await betrRewards.write.cancelProposedOwnership({
        account: owner.account
      });

      expect((await betrRewards.read.owner()).toLocaleLowerCase()).to.equal(owner.account.address.toLocaleLowerCase());
      expect((await betrRewards.read.proposedOwner()).toLocaleLowerCase()).to.equal("0x0000000000000000000000000000000000000000");
    });

    it("Should not cancel the ownership transfer if the sender is not the owner", async function () {
      const { betrRewards, otherAccount } = await loadFixture(deployBETRRewardsFixture);
      await expect(betrRewards.write.cancelProposedOwnership({
        account: otherAccount.account
      })).to.be.rejectedWith("NotOwner");
    });
  });

  describe("Rewarding Pause Management", function () {
    it("Should set rewarding paused state", async function () {
      const { betrRewards, owner } = await loadFixture(deployBETRRewardsFixture);

      expect(await betrRewards.write.setRewardingPaused([true], {
        account: owner.account
      })).to.emit(betrRewards, "RewardingPausedSet").withArgs(true);

      expect(await betrRewards.read.isRewardingPaused()).to.be.true;
    });

    it("Should unset rewarding paused state", async function () {
      const { betrRewards, owner } = await loadFixture(deployBETRRewardsFixture);

      // First pause
      await betrRewards.write.setRewardingPaused([true], {
        account: owner.account
      });

      // Then unpause
      expect(await betrRewards.write.setRewardingPaused([false], {
        account: owner.account
      })).to.emit(betrRewards, "RewardingPausedSet").withArgs(false);

      expect(await betrRewards.read.isRewardingPaused()).to.be.false;
    });

    it("Should not set rewarding paused state if sender is not owner", async function () {
      const { betrRewards, otherAccount } = await loadFixture(deployBETRRewardsFixture);

      await expect(betrRewards.write.setRewardingPaused([true], {
        account: otherAccount.account
      })).to.be.rejectedWith("NotOwner");
    });
  });

  describe("Reward Distribution", function () {
    it("Should add reward to all stakers proportionally", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, staker2, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      // Fund stakers with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockStakingToken.write.mint([staker2.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker2.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Stake tokens
      const stake1 = parseEther("100");
      const stake2 = parseEther("200");
      await betrStaking.write.stake([stake1], {
        account: staker1.account
      });
      await betrStaking.write.stake([stake2], {
        account: staker2.account
      });

      // Add reward
      const rewardAmount = parseEther("300");
      expect(await betrRewards.write.addReward([rewardAmount], {
        account: rewarder.account
      })).to.emit(betrRewards, "RewardAdded").withArgs(rewardAmount);

      // Check claimable rewards
      const claimable1 = await betrRewards.read.claimable([staker1.account.address]);
      const claimable2 = await betrRewards.read.claimable([staker2.account.address]);

      expect(claimable1).to.equal(parseEther("100")); // 100/300 * 300 = 100
      expect(claimable2).to.equal(parseEther("200")); // 200/300 * 300 = 200

      // Check total rewards tracking
      expect(await betrRewards.read.totalRewardsClaimable()).to.equal(rewardAmount);
      expect(await betrRewards.read.totalRewardsClaimed()).to.equal(0n);
    });

    it("Should revert if rewarding is paused", async function () {
      const { betrRewards, betrStaking, mockRewardToken, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      // Pause rewarding
      await betrRewards.write.setRewardingPaused([true], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      await expect(betrRewards.write.addReward([parseEther("100")], {
        account: rewarder.account
      })).to.be.rejectedWith("RewardingPaused");
    });

    it("Should revert if caller is not a rewarder", async function () {
      const { betrRewards, mockRewardToken, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      await expect(betrRewards.write.addReward([parseEther("100")], {
        account: rewarder.account
      })).to.be.rejectedWith("StakingContractNotRewarder");
    });

    it("Should revert if amount is zero", async function () {
      const { betrRewards, betrStaking, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      await expect(betrRewards.write.addReward([0n], {
        account: rewarder.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if no staked amount", async function () {
      const { betrRewards, betrStaking, mockRewardToken, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Try to add reward when no one has staked
      await expect(betrRewards.write.addReward([parseEther("100")], {
        account: rewarder.account
      })).to.be.rejectedWith("NoStakedAmount");
    });

    it("Should handle multiple reward distributions", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, staker2, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      // Fund stakers with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockStakingToken.write.mint([staker2.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker2.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Stake tokens
      const stake1 = parseEther("100");
      const stake2 = parseEther("200");
      await betrStaking.write.stake([stake1], {
        account: staker1.account
      });
      await betrStaking.write.stake([stake2], {
        account: staker2.account
      });

      // First reward distribution
      const reward1 = parseEther("300");
      await betrRewards.write.addReward([reward1], {
        account: rewarder.account
      });

      // Second reward distribution
      const reward2 = parseEther("150");
      await betrRewards.write.addReward([reward2], {
        account: rewarder.account
      });

      // Check claimable rewards (should be cumulative)
      const claimable1 = await betrRewards.read.claimable([staker1.account.address]);
      const claimable2 = await betrRewards.read.claimable([staker2.account.address]);

      expect(claimable1).to.equal(parseEther("150")); // (100/300 * 300) + (100/300 * 150) = 100 + 50 = 150
      expect(claimable2).to.equal(parseEther("300")); // (200/300 * 300) + (200/300 * 150) = 200 + 100 = 300
    });
  });

  describe("Reward Claiming", function () {
    it("Should claim reward successfully", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      // Fund staker with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Stake tokens
      const stakeAmount = parseEther("100");
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Add reward
      const rewardAmount = parseEther("100");
      await betrRewards.write.addReward([rewardAmount], {
        account: rewarder.account
      });

      // Check initial balance
      const initialBalance = await mockRewardToken.read.balanceOf([staker1.account.address]);

      // Claim reward
      expect(await betrRewards.write.claim({
        account: staker1.account
      })).to.emit(betrRewards, "RewardClaimed").withArgs(staker1.account.address, rewardAmount);

      // Check final balance
      const finalBalance = await mockRewardToken.read.balanceOf([staker1.account.address]);
      expect(finalBalance - initialBalance).to.equal(rewardAmount);

      // Check that reward is no longer claimable
      const claimable = await betrRewards.read.claimable([staker1.account.address]);
      expect(claimable).to.equal(0n);

      // Check total rewards tracking
      expect(await betrRewards.read.totalRewardsClaimed()).to.equal(rewardAmount);
      expect(await betrRewards.read.totalRewardsClaimable()).to.equal(0n);
    });

    it("Should batch claim rewards for multiple users", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, staker2, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      // Fund stakers with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockStakingToken.write.mint([staker2.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker2.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Stake tokens
      const stake1 = parseEther("100");
      const stake2 = parseEther("200");
      await betrStaking.write.stake([stake1], {
        account: staker1.account
      });
      await betrStaking.write.stake([stake2], {
        account: staker2.account
      });

      // Add reward
      const rewardAmount = parseEther("300");
      await betrRewards.write.addReward([rewardAmount], {
        account: rewarder.account
      });

      // Check initial balances
      const initialBalance1 = await mockRewardToken.read.balanceOf([staker1.account.address]);
      const initialBalance2 = await mockRewardToken.read.balanceOf([staker2.account.address]);

      // Batch claim rewards
      const users = [staker1.account.address, staker2.account.address];
      await betrRewards.write.batchClaim([users], {
        account: owner.account
      });

      // Check final balances
      const finalBalance1 = await mockRewardToken.read.balanceOf([staker1.account.address]);
      const finalBalance2 = await mockRewardToken.read.balanceOf([staker2.account.address]);
      expect(finalBalance1 - initialBalance1).to.equal(parseEther("100")); // 100/300 * 300
      expect(finalBalance2 - initialBalance2).to.equal(parseEther("200")); // 200/300 * 300

      // Check that no rewards are claimable
      const claimable1 = await betrRewards.read.claimable([staker1.account.address]);
      const claimable2 = await betrRewards.read.claimable([staker2.account.address]);
      expect(claimable1).to.equal(0n);
      expect(claimable2).to.equal(0n);
    });

    it("Should revert if claiming when rewarding is paused", async function () {
      const { betrRewards, staker1, owner } = await loadFixture(deployBETRRewardsFixture);

      // Pause rewarding
      await betrRewards.write.setRewardingPaused([true], {
        account: owner.account
      });

      await expect(betrRewards.write.claim({
        account: staker1.account
      })).to.be.rejectedWith("RewardingPaused");
    });

    it("Should revert if claiming reward that doesn't exist", async function () {
      const { betrRewards, staker1 } = await loadFixture(deployBETRRewardsFixture);

      await expect(betrRewards.write.claim({
        account: staker1.account
      })).to.be.rejectedWith("NoClaimableReward");
    });

    it("Should batch claim even when rewarding is paused", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      // Fund staker with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Stake tokens
      const stakeAmount = parseEther("100");
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Add reward
      const rewardAmount = parseEther("100");
      await betrRewards.write.addReward([rewardAmount], {
        account: rewarder.account
      });

      // Pause rewarding
      await betrRewards.write.setRewardingPaused([true], {
        account: owner.account
      });

      // Batch claim should still work (bypasses pause)
      const users = [staker1.account.address];
      await betrRewards.write.batchClaim([users], {
        account: owner.account
      });

      // Check that reward was claimed
      const claimable = await betrRewards.read.claimable([staker1.account.address]);
      expect(claimable).to.equal(0n);
    });

    it("Should revert if batchClaim called from non-owner", async function () {
      const { betrRewards, otherAccount } = await loadFixture(deployBETRRewardsFixture);

      const users = [otherAccount.account.address];
      
      // Try to call batchClaim from a non-owner account
      await expect(betrRewards.write.batchClaim([users], {
        account: otherAccount.account
      })).to.be.rejectedWith("NotOwner");
    });
  });

  describe("onStakeChanged Integration", function () {
    it("Should handle stake changes correctly", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      // Fund staker with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Stake tokens
      const stakeAmount = parseEther("100");
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Add initial reward
      const initialReward = parseEther("100");
      await betrRewards.write.addReward([initialReward], {
        account: rewarder.account
      });

      // Check initial claimable
      let claimable = await betrRewards.read.claimable([staker1.account.address]);
      expect(claimable).to.equal(initialReward);

      // Add more reward
      const additionalReward = parseEther("50");
      await betrRewards.write.addReward([additionalReward], {
        account: rewarder.account
      });

      // Unstake partially
      const unstakeAmount = parseEther("30");
      await betrStaking.write.unstake([unstakeAmount], {
        account: staker1.account
      });

      // Check claimable after unstake
      claimable = await betrRewards.read.claimable([staker1.account.address]);
      expect(claimable).to.equal(parseEther("150")); // Should keep the same claimable amount
    });

    it("Should revert onStakeChanged when caller is not staking contract", async function () {
      const { betrRewards, staker1, otherAccount } = await loadFixture(deployBETRRewardsFixture);

      // Try to call onStakeChanged from a non-staking contract account
      await expect(betrRewards.write.onStakeChanged([staker1.account.address, 0n, parseEther("100")], {
        account: otherAccount.account
      })).to.be.rejectedWith("NotStakingContract");
    });

    it("Should allow onStakeChanged when caller is staking contract", async function () {
      const { betrRewards, betrStaking, mockStakingToken, staker1, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      // Fund staker with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      // Stake tokens (this should trigger onStakeChanged)
      const stakeAmount = parseEther("100");
      await expect(betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      })).to.not.be.rejected;
    });
  });

  describe("Claimable Function", function () {
    it("Should return zero for user with no stake", async function () {
      const { betrRewards, staker1 } = await loadFixture(deployBETRRewardsFixture);

      // Check claimable for user who never staked
      const claimable = await betrRewards.read.claimable([staker1.account.address]);
      expect(claimable).to.equal(0n);
    });

    it("Should return zero for user who staked but no rewards added", async function () {
      const { betrRewards, betrStaking, mockStakingToken, staker1, owner } = await loadFixture(deployBETRRewardsFixture);

      // Fund staker with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });

      // Stake tokens
      const stakeAmount = parseEther("100");
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Check claimable for user who staked but no rewards were added
      const claimable = await betrRewards.read.claimable([staker1.account.address]);
      expect(claimable).to.equal(0n);
    });

    it("Should return correct amount for user with stake and rewards", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      // Fund staker with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Stake tokens
      const stakeAmount = parseEther("100");
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Add reward
      const rewardAmount = parseEther("200");
      await betrRewards.write.addReward([rewardAmount], {
        account: rewarder.account
      });

      // Check claimable amount
      const claimable = await betrRewards.read.claimable([staker1.account.address]);
      expect(claimable).to.equal(rewardAmount); // 100% of rewards since only one staker
    });

    it("Should return proportional amount for multiple stakers", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, staker2, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      // Fund stakers with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockStakingToken.write.mint([staker2.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker2.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Stake tokens
      const stake1 = parseEther("100");
      const stake2 = parseEther("300");
      await betrStaking.write.stake([stake1], {
        account: staker1.account
      });
      await betrStaking.write.stake([stake2], {
        account: staker2.account
      });

      // Add reward
      const rewardAmount = parseEther("400");
      await betrRewards.write.addReward([rewardAmount], {
        account: rewarder.account
      });

      // Check claimable amounts (proportional to stake)
      const claimable1 = await betrRewards.read.claimable([staker1.account.address]);
      const claimable2 = await betrRewards.read.claimable([staker2.account.address]);

      expect(claimable1).to.equal(parseEther("100")); // 100/400 * 400 = 100
      expect(claimable2).to.equal(parseEther("300")); // 300/400 * 400 = 300
    });

    it("Should return zero after claiming", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      // Fund staker with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Stake tokens
      const stakeAmount = parseEther("100");
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Add reward
      const rewardAmount = parseEther("100");
      await betrRewards.write.addReward([rewardAmount], {
        account: rewarder.account
      });

      // Check claimable before claiming
      let claimable = await betrRewards.read.claimable([staker1.account.address]);
      expect(claimable).to.equal(rewardAmount);

      // Claim reward
      await betrRewards.write.claim({
        account: staker1.account
      });

      // Check claimable after claiming
      claimable = await betrRewards.read.claimable([staker1.account.address]);
      expect(claimable).to.equal(0n);
    });

    it("Should handle multiple reward distributions correctly", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, staker2, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      // Fund stakers with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockStakingToken.write.mint([staker2.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker2.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Stake tokens
      const stake1 = parseEther("100");
      const stake2 = parseEther("200");
      await betrStaking.write.stake([stake1], {
        account: staker1.account
      });
      await betrStaking.write.stake([stake2], {
        account: staker2.account
      });

      // First reward distribution
      const reward1 = parseEther("300");
      await betrRewards.write.addReward([reward1], {
        account: rewarder.account
      });

      // Check claimable after first distribution
      let claimable1 = await betrRewards.read.claimable([staker1.account.address]);
      let claimable2 = await betrRewards.read.claimable([staker2.account.address]);
      expect(claimable1).to.equal(parseEther("100")); // 100/300 * 300
      expect(claimable2).to.equal(parseEther("200")); // 200/300 * 300

      // Second reward distribution
      const reward2 = parseEther("150");
      await betrRewards.write.addReward([reward2], {
        account: rewarder.account
      });

      // Check claimable after second distribution (cumulative)
      claimable1 = await betrRewards.read.claimable([staker1.account.address]);
      claimable2 = await betrRewards.read.claimable([staker2.account.address]);
      expect(claimable1).to.equal(parseEther("150")); // (100/300 * 300) + (100/300 * 150) = 100 + 50
      expect(claimable2).to.equal(parseEther("300")); // (200/300 * 300) + (200/300 * 150) = 200 + 100
    });

    it("Should handle stake changes correctly", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, staker2, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      // Fund stakers with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockStakingToken.write.mint([staker2.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker2.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Initial stake
      const initialStake1 = parseEther("100");
      const initialStake2 = parseEther("100");
      await betrStaking.write.stake([initialStake1], {
        account: staker1.account
      });
      await betrStaking.write.stake([initialStake2], {
        account: staker2.account
      });

      // Add initial reward
      const initialReward = parseEther("200");
      await betrRewards.write.addReward([initialReward], {
        account: rewarder.account
      });

      // Check initial claimable
      let claimable1 = await betrRewards.read.claimable([staker1.account.address]);
      let claimable2 = await betrRewards.read.claimable([staker2.account.address]);
      expect(claimable1).to.equal(parseEther("100")); // 100/200 * 200
      expect(claimable2).to.equal(parseEther("100")); // 100/200 * 200

      // Add more stake to staker1
      const additionalStake = parseEther("100");
      await betrStaking.write.stake([additionalStake], {
        account: staker1.account
      });

      // Add more reward
      const additionalReward = parseEther("100");
      await betrRewards.write.addReward([additionalReward], {
        account: rewarder.account
      });

      // Check claimable after stake change
      claimable1 = await betrRewards.read.claimable([staker1.account.address]);
      claimable2 = await betrRewards.read.claimable([staker2.account.address]);
      expect(claimable1).to.be.closeTo(parseEther("166.666666666666666666"), 1e12); // 100 + (200/300 * 100)
      expect(claimable2).to.be.closeTo(parseEther("133.333333333333333333"), 1e12); // 100 + (100/300 * 100)
    });

    it("Should handle unstaking correctly", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, staker2, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      // Fund stakers with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockStakingToken.write.mint([staker2.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker2.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Initial stake
      const initialStake1 = parseEther("200");
      const initialStake2 = parseEther("100");
      await betrStaking.write.stake([initialStake1], {
        account: staker1.account
      });
      await betrStaking.write.stake([initialStake2], {
        account: staker2.account
      });

      // Add initial reward
      const initialReward = parseEther("300");
      await betrRewards.write.addReward([initialReward], {
        account: rewarder.account
      });

      // Check initial claimable
      let claimable1 = await betrRewards.read.claimable([staker1.account.address]);
      let claimable2 = await betrRewards.read.claimable([staker2.account.address]);
      expect(claimable1).to.equal(parseEther("200")); // 200/300 * 300
      expect(claimable2).to.equal(parseEther("100")); // 100/300 * 300

      // Unstake partially from staker1
      const unstakeAmount = parseEther("100");
      await betrStaking.write.unstake([unstakeAmount], {
        account: staker1.account
      });

      // Add more reward
      const additionalReward = parseEther("100");
      await betrRewards.write.addReward([additionalReward], {
        account: rewarder.account
      });

      // Check claimable after unstake
      claimable1 = await betrRewards.read.claimable([staker1.account.address]);
      claimable2 = await betrRewards.read.claimable([staker2.account.address]);
      expect(claimable1).to.equal(parseEther("250")); // 200 + (100/200 * 100)
      expect(claimable2).to.equal(parseEther("150")); // 100 + (100/200 * 100)
    });

    it("Should handle zero address correctly", async function () {
      const { betrRewards } = await loadFixture(deployBETRRewardsFixture);

      // Check claimable for zero address
      const claimable = await betrRewards.read.claimable(["0x0000000000000000000000000000000000000000"]);
      expect(claimable).to.equal(0n);
    });

    it("Should handle non-existent address correctly", async function () {
      const { betrRewards } = await loadFixture(deployBETRRewardsFixture);

      // Check claimable for non-existent address
      const claimable = await betrRewards.read.claimable(["0x1234567890123456789012345678901234567890"]);
      expect(claimable).to.equal(0n);
    });

    it("Should call claimable() without parameters", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      // Fund staker with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Stake tokens
      const stakeAmount = parseEther("100");
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Add reward
      const rewardAmount = parseEther("200");
      await betrRewards.write.addReward([rewardAmount], {
        account: rewarder.account
      });

      // Call claimable() without parameters (should use msg.sender)
      const claimable = await betrRewards.read.claimable({
        account: staker1.account
      });
      
      // Should return the claimable amount for the caller (staker1)
      expect(claimable).to.equal(rewardAmount);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle very small reward amounts", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      // Fund staker with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Stake tokens
      const stakeAmount = parseEther("100");
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Add very small reward
      const smallReward = 1000000000000n; // Minimum is 1e12
      await betrRewards.write.addReward([smallReward], {
        account: rewarder.account
      });

      // Check claimable rewards
      const claimable = await betrRewards.read.claimable([staker1.account.address]);
      expect(claimable).to.equal(smallReward);
    });

    it("Should handle user with no rewards", async function () {
      const { betrRewards, staker1 } = await loadFixture(deployBETRRewardsFixture);

      // Check claimable rewards for user with no rewards
      const claimable = await betrRewards.read.claimable([staker1.account.address]);
      expect(claimable).to.equal(0n);
    });
  });

  describe("Events", function () {
    it("Should emit correct events for reward distribution", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      // Fund staker with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Stake tokens
      const stakeAmount = parseEther("100");
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Add reward
      const rewardAmount = parseEther("100");
      expect(await betrRewards.write.addReward([rewardAmount], {
        account: rewarder.account
      })).to.emit(betrRewards, "RewardAdded").withArgs(rewardAmount);
    });

    it("Should emit correct events for reward claiming", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Add rewarder to staking contract
      await betrStaking.write.addRewarder([betrRewards.address], {
        account: owner.account
      });

      // Fund staker with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Stake tokens
      const stakeAmount = parseEther("100");
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Add reward
      const rewardAmount = parseEther("100");
      await betrRewards.write.addReward([rewardAmount], {
        account: rewarder.account
      });

      // Claim reward
      expect(await betrRewards.write.claim({
        account: staker1.account
      })).to.emit(betrRewards, "RewardClaimed").withArgs(staker1.account.address, rewardAmount);
    });

    it("Should emit correct events for rewarding pause", async function () {
      const { betrRewards, owner } = await loadFixture(deployBETRRewardsFixture);

      expect(await betrRewards.write.setRewardingPaused([true], {
        account: owner.account
      })).to.emit(betrRewards, "RewardingPausedSet").withArgs(true);

      expect(await betrRewards.write.setRewardingPaused([false], {
        account: owner.account
      })).to.emit(betrRewards, "RewardingPausedSet").withArgs(false);
    });
  });
}); 