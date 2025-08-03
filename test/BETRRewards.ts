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

    // Deploy mock ERC20 token for another reward
    const mockRewardToken2 = await hre.viem.deployContract("MockERC20", ["Reward Token 2", "RWD2", 18]);
    
    // Deploy BETRStaking
    const betrStaking = await hre.viem.deployContract("BETRStaking", [owner.account.address, mockStakingToken.address]);

    // Deploy BETRRewards
    const betrRewards = await hre.viem.deployContract("BETRRewards", [owner.account.address, betrStaking.address]);

    const publicClient = await hre.viem.getPublicClient();

    return {
      betrRewards,
      betrStaking,
      mockStakingToken,
      mockRewardToken,
      mockRewardToken2,
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
    it("Should set the right owner and staking contract", async function () {
      const { betrRewards, owner, betrStaking } = await loadFixture(deployBETRRewardsFixture);

      expect(await betrRewards.read.owner()).to.equal(
        getAddress(owner.account.address)
      );
      expect(await betrRewards.read.stakingContract()).to.equal(
        getAddress(betrStaking.address)
      );
    });

    it("Should revert if staking contract is zero address", async function () {
      const { owner } = await loadFixture(deployBETRRewardsFixture);
      
      await expect(
        hre.viem.deployContract("BETRRewards", [
          owner.account.address, 
          "0x0000000000000000000000000000000000000000"
        ])
      ).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if staking contract is not a valid staking contract", async function () {
      const { owner } = await loadFixture(deployBETRRewardsFixture);
      
      // Deploy a contract that's not a staking contract
      const mockContract = await hre.viem.deployContract("Mock");
      
      await expect(
        hre.viem.deployContract("BETRRewards", [
          owner.account.address, 
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

  describe("Rewardable Token Management", function () {
    it("Should set rewardable token", async function () {
      const { betrRewards, mockRewardToken, owner } = await loadFixture(deployBETRRewardsFixture);

      expect(await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
        account: owner.account
      })).to.emit(betrRewards, "RewardableTokenSet").withArgs(mockRewardToken.address, true);

      expect(await betrRewards.read.rewardableTokens([mockRewardToken.address])).to.be.true;
    });

    it("Should unset rewardable token", async function () {
      const { betrRewards, mockRewardToken, owner } = await loadFixture(deployBETRRewardsFixture);

      // First set as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
        account: owner.account
      });

      // Then unset
      expect(await betrRewards.write.setRewardableToken([mockRewardToken.address, false], {
        account: owner.account
      })).to.emit(betrRewards, "RewardableTokenSet").withArgs(mockRewardToken.address, false);

      expect(await betrRewards.read.rewardableTokens([mockRewardToken.address])).to.be.false;
    });

    it("Should not set rewardable token if sender is not owner", async function () {
      const { betrRewards, mockRewardToken, otherAccount } = await loadFixture(deployBETRRewardsFixture);

      await expect(betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
        account: otherAccount.account
      })).to.be.rejectedWith("NotOwner");
    });

    it("Should revert if token address is zero", async function () {
      const { betrRewards, owner } = await loadFixture(deployBETRRewardsFixture);

      await expect(betrRewards.write.setRewardableToken(["0x0000000000000000000000000000000000000000", true], {
        account: owner.account
      })).to.be.rejectedWith("InvalidInput");
    });
  });

  describe("Reward Distribution", function () {
    it("Should add reward to all stakers proportionally", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, staker2, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
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
      expect(await betrRewards.write.addReward([mockRewardToken.address, rewardAmount], {
        account: rewarder.account
      })).to.emit(betrRewards, "RewardAdded").withArgs(mockRewardToken.address, rewardAmount);

      // Check claimable rewards
      let [tokens1, amounts1] = await betrRewards.read.claimable([staker1.account.address]);
      let [tokens2, amounts2] = await betrRewards.read.claimable([staker2.account.address]);

      expect(tokens1).to.have.lengthOf(1);
      expect(tokens1[0].toLocaleLowerCase()).to.equal(mockRewardToken.address.toLocaleLowerCase());
      expect(amounts1[0]).to.equal(parseEther("100")); // 100/300 * 300 = 100

      expect(tokens2).to.have.lengthOf(1);
      expect(tokens2[0].toLocaleLowerCase()).to.equal(mockRewardToken.address.toLocaleLowerCase());
      expect(amounts2[0]).to.equal(parseEther("200")); // 200/300 * 300 = 200

      // Check total rewards tracking
      expect(await betrRewards.read.totalRewardsClaimable([mockRewardToken.address])).to.equal(rewardAmount);
      expect(await betrRewards.read.totalRewardsClaimed([mockRewardToken.address])).to.equal(0n);
    });

    it("Should add reward to specific users proportionally to total staked", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, staker2, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
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

      // Add reward only to staker1 (proportional to total staked)
      const rewardAmount = parseEther("300");
      const users = [staker1.account.address];
      expect(await betrRewards.write.addRewardTo([mockRewardToken.address, rewardAmount, users, true], {
        account: rewarder.account
      })).to.emit(betrRewards, "RewardAdded").withArgs(mockRewardToken.address, parseEther("100")); // 100/300 * 300 = 100

      // Check claimable rewards
      let [tokens1, amounts1] = await betrRewards.read.claimable([staker1.account.address]);
      let [tokens2, amounts2] = await betrRewards.read.claimable([staker2.account.address]);

      expect(tokens1).to.have.lengthOf(1);
      expect(tokens1[0].toLocaleLowerCase()).to.equal(mockRewardToken.address.toLocaleLowerCase());
      expect(amounts1[0]).to.equal(parseEther("100")); // 100/300 * 300 = 100

      expect(tokens2).to.have.lengthOf(0); // staker2 gets nothing
    });

    it("Should add reward to specific users proportionally to their staked amounts", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, staker2, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
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

      // Add reward to both users (proportional to their staked amounts only)
      const rewardAmount = parseEther("300");
      const users = [staker1.account.address, staker2.account.address];
      expect(await betrRewards.write.addRewardTo([mockRewardToken.address, rewardAmount, users, false], {
        account: rewarder.account
      })).to.emit(betrRewards, "RewardAdded").withArgs(mockRewardToken.address, rewardAmount);

      // Check claimable rewards
      let [tokens1, amounts1] = await betrRewards.read.claimable([staker1.account.address]);
      let [tokens2, amounts2] = await betrRewards.read.claimable([staker2.account.address]);

      expect(tokens1).to.have.lengthOf(1);
      expect(tokens1[0].toLocaleLowerCase()).to.equal(mockRewardToken.address.toLocaleLowerCase());
      expect(amounts1[0]).to.equal(parseEther("100")); // 100/300 * 300 = 100

      expect(tokens2).to.have.lengthOf(1);
      expect(tokens2[0].toLocaleLowerCase()).to.equal(mockRewardToken.address.toLocaleLowerCase());
      expect(amounts2[0]).to.equal(parseEther("200")); // 200/300 * 300 = 200
    });

    it("Should revert if rewarding is paused", async function () {
      const { betrRewards, mockRewardToken, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
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

      await expect(betrRewards.write.addReward([mockRewardToken.address, parseEther("100")], {
        account: rewarder.account
      })).to.be.rejectedWith("RewardingPaused");
    });

    it("Should revert if token is not rewardable", async function () {
      const { betrRewards, betrStaking, mockRewardToken, mockStakingToken, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Stake tokens
      await mockStakingToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: rewarder.account
      });
      await betrStaking.write.stake([parseEther("100")], {
        account: rewarder.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      await expect(betrRewards.write.addReward([mockRewardToken.address, parseEther("100")], {
        account: rewarder.account
      })).to.be.rejectedWith("TokenNotRewardable");
    });

    it("Should revert if token address is zero", async function () {
      const { betrRewards, rewarder } = await loadFixture(deployBETRRewardsFixture);

      await expect(betrRewards.write.addReward(["0x0000000000000000000000000000000000000000", parseEther("100")], {
        account: rewarder.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if amount is zero", async function () {
      const { betrRewards, mockRewardToken, rewarder } = await loadFixture(deployBETRRewardsFixture);

      await expect(betrRewards.write.addReward([mockRewardToken.address, 0n], {
        account: rewarder.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if users array is empty", async function () {
      const { betrRewards, mockRewardToken, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      const emptyUsers: `0x${string}`[] = [];
      await expect(betrRewards.write.addRewardTo([mockRewardToken.address, parseEther("100"), emptyUsers, true], {
        account: rewarder.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if user address is zero", async function () {
      const { betrRewards, betrStaking, mockRewardToken, mockStakingToken, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Stake tokens
      await mockStakingToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: rewarder.account
      });
      await betrStaking.write.stake([parseEther("100")], {
        account: rewarder.account
      });

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      const users = ["0x0000000000000000000000000000000000000000"] as `0x${string}`[];
      await expect(betrRewards.write.addRewardTo([mockRewardToken.address, parseEther("100"), users, true], {
        account: rewarder.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if users array contains zero address mixed with valid addresses", async function () {
      const { betrRewards, betrStaking, mockRewardToken, mockStakingToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
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

      // Create users array with mix of valid address and zero address
      const users = [staker1.account.address, "0x0000000000000000000000000000000000000000"] as `0x${string}`[];
      
      await expect(betrRewards.write.addRewardTo([mockRewardToken.address, parseEther("100"), users, false], {
        account: rewarder.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if no staked amount", async function () {
      const { betrRewards, betrStaking, mockRewardToken, mockStakingToken, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Stake tokens
      await mockStakingToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: rewarder.account
      });
      await betrStaking.write.stake([parseEther("100")], {
        account: rewarder.account
      });

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
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
      await expect(betrRewards.write.addRewardTo([mockRewardToken.address, parseEther("100"), [owner.account.address], false], {
        account: rewarder.account
      })).to.be.rejectedWith("NoStakedAmount");
    });

    it("Should handle multiple reward distributions", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, staker2, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
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
      await betrRewards.write.addReward([mockRewardToken.address, reward1], {
        account: rewarder.account
      });

      // Second reward distribution
      const reward2 = parseEther("150");
      await betrRewards.write.addReward([mockRewardToken.address, reward2], {
        account: rewarder.account
      });

      // Check claimable rewards (should be cumulative)
      let [tokens1, amounts1] = await betrRewards.read.claimable([staker1.account.address]);
      let [tokens2, amounts2] = await betrRewards.read.claimable([staker2.account.address]);

      expect(tokens1).to.have.lengthOf(1);
      expect(tokens1[0].toLocaleLowerCase()).to.equal(mockRewardToken.address.toLocaleLowerCase());
      expect(amounts1[0]).to.equal(parseEther("150")); // (100/300 * 300) + (100/300 * 150) = 100 + 50 = 150

      expect(tokens2).to.have.lengthOf(1);
      expect(tokens2[0].toLocaleLowerCase()).to.equal(mockRewardToken.address.toLocaleLowerCase());
      expect(amounts2[0]).to.equal(parseEther("300")); // (200/300 * 300) + (200/300 * 150) = 200 + 100 = 300
    });
  });

  describe("Reward Claiming", function () {
    it("Should claim reward successfully", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
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
      await betrRewards.write.addReward([mockRewardToken.address, rewardAmount], {
        account: rewarder.account
      });

      // Check initial balance
      const initialBalance = await mockRewardToken.read.balanceOf([staker1.account.address]);

      // Claim reward
      expect(await betrRewards.write.claim([mockRewardToken.address], {
        account: staker1.account
      })).to.emit(betrRewards, "RewardClaimed").withArgs(staker1.account.address, mockRewardToken.address, rewardAmount);

      // Check final balance
      const finalBalance = await mockRewardToken.read.balanceOf([staker1.account.address]);
      expect(finalBalance - initialBalance).to.equal(rewardAmount);

      // Check that reward is no longer claimable
      let [tokens, amounts] = await betrRewards.read.claimable([staker1.account.address]);
      expect(tokens).to.have.lengthOf(0);

      // Check total rewards tracking
      expect(await betrRewards.read.totalRewardsClaimed([mockRewardToken.address])).to.equal(rewardAmount);
      expect(await betrRewards.read.totalRewardsClaimable([mockRewardToken.address])).to.equal(0n);
    });

    it("Should claim and stake reward successfully", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockStakingToken.address, true], {
        account: owner.account
      });

      // Fund staker with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with reward tokens
      await mockStakingToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockStakingToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Stake tokens
      const stakeAmount = parseEther("100");
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Add reward
      const rewardAmount = parseEther("100");
      await betrRewards.write.addReward([mockStakingToken.address, rewardAmount], {
        account: rewarder.account
      });

      // Check initial staked amount
      const initialStaked = await betrStaking.read.stakedAmount([staker1.account.address]);

      // Claim and stake reward
      expect(await betrRewards.write.claimAndStake([mockStakingToken.address], {
        account: staker1.account
      })).to.emit(betrRewards, "RewardClaimed").withArgs(staker1.account.address, mockStakingToken.address, rewardAmount);

      // Check final staked amount
      const finalStaked = await betrStaking.read.stakedAmount([staker1.account.address]);
      expect(finalStaked - initialStaked).to.equal(rewardAmount);

      // Check that reward is no longer claimable
      let [tokens, amounts] = await betrRewards.read.claimable([staker1.account.address]);
      expect(tokens).to.have.lengthOf(0);
    });

    it("Should claim reward for multiple tokens", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, mockRewardToken2, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
        account: owner.account
      });

      // Set another reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken2.address, true], {
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

      // Fund rewarder with another reward tokens
      await mockRewardToken2.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });
      await mockRewardToken2.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Stake tokens
      const stakeAmount = parseEther("100");
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Add reward
      const rewardAmount = parseEther("100");
      await betrRewards.write.addReward([mockRewardToken.address, rewardAmount], {
        account: rewarder.account
      });

      // Add another reward token
      const rewardAmount2 = parseEther("50");
      await betrRewards.write.addReward([mockRewardToken2.address, rewardAmount2], {
        account: rewarder.account
      });

      // Claim reward for second token
      expect(await betrRewards.write.claim([mockRewardToken2.address], {
        account: staker1.account
      })).to.emit(betrRewards, "RewardClaimed").withArgs(staker1.account.address, mockRewardToken2.address, rewardAmount2);

      // Check remaining rewards
      let [tokens, amounts] = await betrRewards.read.claimable([staker1.account.address]);
      expect(tokens).to.have.lengthOf(1);
      expect(tokens[0].toLocaleLowerCase()).to.equal(mockRewardToken.address.toLocaleLowerCase());
      expect(amounts[0]).to.equal(rewardAmount);

      // Claim remaining reward
      expect(await betrRewards.write.claim([mockRewardToken.address], {
        account: staker1.account
      })).to.emit(betrRewards, "RewardClaimed").withArgs(staker1.account.address, mockRewardToken.address, rewardAmount);

      // Check that no rewards are claimable
      let [tokens2, amounts2] = await betrRewards.read.claimable([staker1.account.address]);
      expect(tokens2).to.have.lengthOf(0);
      expect(amounts2).to.have.lengthOf(0);

      // Check total rewards claimed
      expect(await betrRewards.read.totalRewardsClaimed([mockRewardToken.address])).to.equal(rewardAmount);
      expect(await betrRewards.read.totalRewardsClaimed([mockRewardToken2.address])).to.equal(rewardAmount2);

      // Check total rewards claimable
      expect(await betrRewards.read.totalRewardsClaimable([mockRewardToken.address])).to.equal(0n);
      expect(await betrRewards.read.totalRewardsClaimable([mockRewardToken2.address])).to.equal(0n);
    });

    it("Should claim all rewards successfully", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
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

      // Add multiple rewards
      const reward1 = parseEther("100");
      const reward2 = parseEther("50");
      await betrRewards.write.addReward([mockRewardToken.address, reward1], {
        account: rewarder.account
      });
      await betrRewards.write.addReward([mockRewardToken.address, reward2], {
        account: rewarder.account
      });

      // Check initial balance
      const initialBalance = await mockRewardToken.read.balanceOf([staker1.account.address]);

      // Claim all rewards
      await betrRewards.write.claimAll({
        account: staker1.account
      });

      // Check final balance
      const finalBalance = await mockRewardToken.read.balanceOf([staker1.account.address]);
      expect(finalBalance - initialBalance).to.equal(reward1 + reward2);

      // Check that no rewards are claimable
      let [tokens, amounts] = await betrRewards.read.claimable([staker1.account.address]);
      expect(tokens).to.have.lengthOf(0);
    });

    it("Should batch claim rewards for multiple users", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, staker2, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
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
      await betrRewards.write.addReward([mockRewardToken.address, rewardAmount], {
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
      let [tokens1, amounts1] = await betrRewards.read.claimable([staker1.account.address]);
      let [tokens2, amounts2] = await betrRewards.read.claimable([staker2.account.address]);
      expect(tokens1).to.have.lengthOf(0);
      expect(tokens2).to.have.lengthOf(0);
    });

    it("Should revert if claiming when rewarding is paused", async function () {
      const { betrRewards, mockRewardToken, staker1, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
        account: owner.account
      });

      // Pause rewarding
      await betrRewards.write.setRewardingPaused([true], {
        account: owner.account
      });

      await expect(betrRewards.write.claim([mockRewardToken.address], {
        account: staker1.account
      })).to.be.rejectedWith("RewardingPaused");
    });

    it("Should revert if claimAll when rewarding is paused", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
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
      await betrRewards.write.addReward([mockRewardToken.address, rewardAmount], {
        account: rewarder.account
      });

      // Pause rewarding
      await betrRewards.write.setRewardingPaused([true], {
        account: owner.account
      });

      // Try to claim all rewards when rewarding is paused
      await expect(betrRewards.write.claimAll({
        account: staker1.account
      })).to.be.rejectedWith("RewardingPaused");
    });

    it("Should revert if claimAndStake when rewarding is paused", async function () {
      const { betrRewards, betrStaking, mockStakingToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set staking token as rewardable (for claimAndStake)
      await betrRewards.write.setRewardableToken([mockStakingToken.address, true], {
        account: owner.account
      });

      // Fund staker with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with staking tokens (as rewards)
      await mockStakingToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockStakingToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Stake tokens
      const stakeAmount = parseEther("100");
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Add reward
      const rewardAmount = parseEther("100");
      await betrRewards.write.addReward([mockStakingToken.address, rewardAmount], {
        account: rewarder.account
      });

      // Pause rewarding
      await betrRewards.write.setRewardingPaused([true], {
        account: owner.account
      });

      // Try to claim and stake when rewarding is paused
      await expect(betrRewards.write.claimAndStake([mockStakingToken.address], {
        account: staker1.account
      })).to.be.rejectedWith("RewardingPaused");
    });

    it("Should revert if claiming non-rewardable token", async function () {
      const { betrRewards, mockRewardToken, staker1 } = await loadFixture(deployBETRRewardsFixture);

      await expect(betrRewards.write.claim([mockRewardToken.address], {
        account: staker1.account
      })).to.be.rejectedWith("TokenNotRewardable");
    });

    it("Should revert if claiming token with zero address", async function () {
      const { betrRewards, staker1 } = await loadFixture(deployBETRRewardsFixture);

      await expect(betrRewards.write.claim(["0x0000000000000000000000000000000000000000"], {
        account: staker1.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if claiming reward that doesn't exist", async function () {
      const { betrRewards, mockRewardToken, staker1, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
        account: owner.account
      });

      await expect(betrRewards.write.claim([mockRewardToken.address], {
        account: staker1.account
      })).to.be.rejectedWith("NoClaimableReward");
    });

    it("Should revert if claiming and staking with wrong token", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
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
      await betrRewards.write.addReward([mockRewardToken.address, rewardAmount], {
        account: rewarder.account
      });

      // Try to claim and stake with wrong token (reward token instead of staking token)
      await expect(betrRewards.write.claimAndStake([mockRewardToken.address], {
        account: staker1.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if claimAndStake called with zero address token", async function () {
      const { betrRewards, staker1 } = await loadFixture(deployBETRRewardsFixture);

      // Try to claim and stake with zero address token
      await expect(betrRewards.write.claimAndStake(["0x0000000000000000000000000000000000000000"], {
        account: staker1.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if claimAndStake called with non-rewardable token", async function () {
      const { betrRewards, betrStaking, mockStakingToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Fund staker with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with staking tokens (as rewards)
      await mockStakingToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockStakingToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Stake tokens
      const stakeAmount = parseEther("100");
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Set token as rewardable
      await betrRewards.write.setRewardableToken([mockStakingToken.address, true], {
        account: owner.account
      });

      // Add reward (staking token is not set as rewardable)
      const rewardAmount = parseEther("100");
      await betrRewards.write.addReward([mockStakingToken.address, rewardAmount], {
        account: rewarder.account
      });
      // Set token as non-rewardable
      await betrRewards.write.setRewardableToken([mockStakingToken.address, false], {
        account: owner.account
      });

      // Try to claim and stake with non-rewardable token
      await expect(betrRewards.write.claimAndStake([mockStakingToken.address], {
        account: staker1.account
      })).to.be.rejectedWith("TokenNotRewardable");
    });

    it("Should revert if claimAndStake called with token that is not staking token", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
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
      await betrRewards.write.addReward([mockRewardToken.address, rewardAmount], {
        account: rewarder.account
      });

      // Try to claim and stake with reward token (not staking token)
      await expect(betrRewards.write.claimAndStake([mockRewardToken.address], {
        account: staker1.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if claimAndStake called with token that has no rewards", async function () {
      const { betrRewards, betrStaking, mockStakingToken, staker1, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set staking token as rewardable
      await betrRewards.write.setRewardableToken([mockStakingToken.address, true], {
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

      // Stake tokens
      const stakeAmount = parseEther("100");
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Try to claim and stake with token that has no rewards
      await expect(betrRewards.write.claimAndStake([mockStakingToken.address], {
        account: staker1.account
      })).to.be.rejectedWith("NoClaimableReward");
    });

    it("Should batch claim even when rewarding is paused", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
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
      await betrRewards.write.addReward([mockRewardToken.address, rewardAmount], {
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
      let [tokens, amounts] = await betrRewards.read.claimable([staker1.account.address]);
      expect(tokens).to.have.lengthOf(0);
    });

    it("Should revert if batchClaim called from non-owner", async function () {
      const { betrRewards, otherAccount } = await loadFixture(deployBETRRewardsFixture);

      const users = [otherAccount.account.address];
      
      // Try to call batchClaim from a non-owner account
      await expect(betrRewards.write.batchClaim([users], {
        account: otherAccount.account
      })).to.be.rejectedWith("NotOwner");
    });

    it("Should revert if batchClaim called with zero address in users array", async function () {
      const { betrRewards, owner } = await loadFixture(deployBETRRewardsFixture);

      const users = ["0x0000000000000000000000000000000000000000"] as `0x${string}`[];
      
      // Try to call batchClaim with zero address in users array
      await expect(betrRewards.write.batchClaim([users], {
        account: owner.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if batchClaim called with zero address mixed with valid addresses", async function () {
      const { betrRewards, owner, otherAccount } = await loadFixture(deployBETRRewardsFixture);

      const users = [otherAccount.account.address, "0x0000000000000000000000000000000000000000"] as `0x${string}`[];
      
      // Try to call batchClaim with zero address mixed with valid addresses
      await expect(betrRewards.write.batchClaim([users], {
        account: owner.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should reward successfully when user has already claimed rewards", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
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
      await betrRewards.write.addReward([mockRewardToken.address, rewardAmount], {
        account: rewarder.account
      });

      // Claim reward
      await betrRewards.write.claimAll({
        account: staker1.account
      });

      // Add reward again
      await betrRewards.write.addReward([mockRewardToken.address, rewardAmount], {
        account: rewarder.account
      });

      // Check claimable rewards
      let [tokens, amounts] = await betrRewards.read.claimable([staker1.account.address]);
      expect(tokens).to.have.lengthOf(1);
      expect(tokens[0].toLocaleLowerCase()).to.equal(mockRewardToken.address.toLocaleLowerCase());
      expect(amounts[0]).to.equal(rewardAmount);

      // Claim reward again
      await betrRewards.write.claimAll({
        account: staker1.account
      });
      
      // Check claimable rewards
      [tokens, amounts] = await betrRewards.read.claimable([staker1.account.address]);
      expect(tokens).to.have.lengthOf(0);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle very small reward amounts", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
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
      const smallReward = 1n; // 1 wei
      await betrRewards.write.addReward([mockRewardToken.address, smallReward], {
        account: rewarder.account
      });

      // Check claimable rewards
      let [tokens, amounts] = await betrRewards.read.claimable([staker1.account.address]);
      expect(tokens).to.have.lengthOf(1);
      expect(amounts[0]).to.equal(smallReward);
    });

    it("Should handle multiple reward tokens", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Deploy second reward token
      const mockRewardToken2 = await hre.viem.deployContract("MockERC20", ["Reward Token 2", "RWD2", 18]);

      // Set both reward tokens as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
        account: owner.account
      });
      await betrRewards.write.setRewardableToken([mockRewardToken2.address, true], {
        account: owner.account
      });

      // Fund staker with staking tokens
      await mockStakingToken.write.mint([staker1.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Fund rewarder with both reward tokens
      await mockRewardToken.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });
      await mockRewardToken2.write.mint([rewarder.account.address, parseEther("1000")], {
        account: owner.account
      });

      // Approve tokens
      await mockStakingToken.write.approve([betrStaking.address, parseEther("1000")], {
        account: staker1.account
      });
      await mockRewardToken.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });
      await mockRewardToken2.write.approve([betrRewards.address, parseEther("1000")], {
        account: rewarder.account
      });

      // Stake tokens
      const stakeAmount = parseEther("100");
      await betrStaking.write.stake([stakeAmount], {
        account: staker1.account
      });

      // Add rewards for both tokens
      const reward1 = parseEther("100");
      const reward2 = parseEther("200");
      await betrRewards.write.addReward([mockRewardToken.address, reward1], {
        account: rewarder.account
      });
      await betrRewards.write.addReward([mockRewardToken2.address, reward2], {
        account: rewarder.account
      });

      // Check claimable rewards
      let [tokens, amounts] = await betrRewards.read.claimable([staker1.account.address]);
      expect(tokens).to.have.lengthOf(2);
      expect(amounts[0]).to.equal(reward1);
      expect(amounts[1]).to.equal(reward2);
    });

    it("Should handle user with no rewards", async function () {
      const { betrRewards, staker1 } = await loadFixture(deployBETRRewardsFixture);

      // Check claimable rewards for user with no rewards
      let [tokens, amounts] = await betrRewards.read.claimable([staker1.account.address]);
      expect(tokens).to.have.lengthOf(0);
      expect(amounts).to.have.lengthOf(0);
    });

    it("Should handle claimAll with no rewards", async function () {
      const { betrRewards, staker1 } = await loadFixture(deployBETRRewardsFixture);

      // Claim all should not revert even with no rewards
      await betrRewards.write.claimAll({
        account: staker1.account
      });

      // Check that no rewards are claimable
      let [tokens, amounts] = await betrRewards.read.claimable([staker1.account.address]);
      expect(tokens).to.have.lengthOf(0);
    });
  });

  describe("Events", function () {
    it("Should emit correct events for reward distribution", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
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
      expect(await betrRewards.write.addReward([mockRewardToken.address, rewardAmount], {
        account: rewarder.account
      })).to.emit(betrRewards, "RewardAdded").withArgs(mockRewardToken.address, rewardAmount);
    });

    it("Should emit correct events for reward claiming", async function () {
      const { betrRewards, betrStaking, mockStakingToken, mockRewardToken, staker1, rewarder, owner } = await loadFixture(deployBETRRewardsFixture);

      // Set reward token as rewardable
      await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
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
      await betrRewards.write.addReward([mockRewardToken.address, rewardAmount], {
        account: rewarder.account
      });

      // Claim reward
      expect(await betrRewards.write.claim([mockRewardToken.address], {
        account: staker1.account
      })).to.emit(betrRewards, "RewardClaimed").withArgs(staker1.account.address, mockRewardToken.address, rewardAmount);
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

    it("Should emit correct events for rewardable token setting", async function () {
      const { betrRewards, mockRewardToken, owner } = await loadFixture(deployBETRRewardsFixture);

      expect(await betrRewards.write.setRewardableToken([mockRewardToken.address, true], {
        account: owner.account
      })).to.emit(betrRewards, "RewardableTokenSet").withArgs(mockRewardToken.address, true);

      expect(await betrRewards.write.setRewardableToken([mockRewardToken.address, false], {
        account: owner.account
      })).to.emit(betrRewards, "RewardableTokenSet").withArgs(mockRewardToken.address, false);
    });
  });
}); 