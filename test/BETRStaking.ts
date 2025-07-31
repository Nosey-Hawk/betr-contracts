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

      // Second stake
      await betrStaking.write.stake([secondStake], {
        account: staker1.account
      });

      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(firstStake + secondStake);
      expect(await mockToken.read.balanceOf([betrStaking.address])).to.equal(firstStake + secondStake);
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

      // Then unstake
      expect(await betrStaking.write.unstake([unstakeAmount], {
        account: staker1.account
      })).to.emit(betrStaking, "Unstaked").withArgs(staker1.account.address, unstakeAmount);

      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(stakeAmount - unstakeAmount);
      expect(await mockToken.read.balanceOf([betrStaking.address])).to.equal(stakeAmount - unstakeAmount);
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

      // Unstake all
      await betrStaking.write.unstake([stakeAmount], {
        account: staker1.account
      });

      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(0n);
      expect(await mockToken.read.balanceOf([betrStaking.address])).to.equal(0n);
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

  describe("Multiple Stakers", function () {
    it("Should handle multiple stakers correctly", async function () {
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

      const stake1 = parseEther("100");
      const stake2 = parseEther("200");

      // Staker1 stakes
      await betrStaking.write.stake([stake1], {
        account: staker1.account
      });

      // Staker2 stakes
      await betrStaking.write.stake([stake2], {
        account: staker2.account
      });

      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(stake1);
      expect(await betrStaking.read.stakedAmount([staker2.account.address])).to.equal(stake2);
      expect(await mockToken.read.balanceOf([betrStaking.address])).to.equal(stake1 + stake2);
      expect(await mockToken.read.balanceOf([staker1.account.address])).to.equal(parseEther("1000") - stake1);
      expect(await mockToken.read.balanceOf([staker2.account.address])).to.equal(parseEther("1000") - stake2);
    });

    it("Should allow stakers to unstake independently", async function () {
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

      const stake1 = parseEther("100");
      const stake2 = parseEther("200");

      // Both stake
      await betrStaking.write.stake([stake1], {
        account: staker1.account
      });
      await betrStaking.write.stake([stake2], {
        account: staker2.account
      });

      // Staker1 unstakes half
      await betrStaking.write.unstake([parseEther("50")], {
        account: staker1.account
      });

      // Staker2 unstakes all
      await betrStaking.write.unstake([stake2], {
        account: staker2.account
      });

      expect(await betrStaking.read.stakedAmount([staker1.account.address])).to.equal(parseEther("50"));
      expect(await betrStaking.read.stakedAmount([staker2.account.address])).to.equal(0n);
      expect(await mockToken.read.balanceOf([betrStaking.address])).to.equal(parseEther("50"));
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
  });
}); 