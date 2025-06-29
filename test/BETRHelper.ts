import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, encodeFunctionData, parseEther } from "viem";

describe("BETRHelper", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployBETRHelperFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await hre.viem.getWalletClients();

    const betrHelper = await hre.viem.deployContract("BETRHelper", [owner.account.address]);
    const mock = await hre.viem.deployContract("Mock");

    const publicClient = await hre.viem.getPublicClient();

    return {
      betrHelper,
      mock,
      owner,
      otherAccount,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { betrHelper, owner } = await loadFixture(deployBETRHelperFixture);

      expect(await betrHelper.read.owner()).to.equal(
        getAddress(owner.account.address)
      );
    });
  });

  describe("Ownership", function () {
    it("Should prepare the ownership transfer", async function () {
      const { betrHelper, owner, otherAccount } = await loadFixture(deployBETRHelperFixture);

      await betrHelper.write.setProposedOwner([otherAccount.account.address], {
        account: owner.account
      });
      expect(await betrHelper.read.proposedOwner()).to.equal(
        getAddress(otherAccount.account.address)
      );
    });

    it("Should not prepare the ownership transfer if the proposed owner is the zero address", async function () {
      const { betrHelper, owner } = await loadFixture(deployBETRHelperFixture);
      await expect(betrHelper.write.setProposedOwner([getAddress("0x0000000000000000000000000000000000000000")], {
        account: owner.account
      })).to.be.rejectedWith("InvalidInput");
    });

    it("Should not prepare the ownership transfer if the sender is not the owner", async function () {
      const { betrHelper, otherAccount } = await loadFixture(deployBETRHelperFixture);
      await expect(betrHelper.write.setProposedOwner([otherAccount.account.address], {
        account: otherAccount.account
      })).to.be.rejectedWith("NotOwner");
    });

    it("Should accept the ownership transfer", async function () {
      const { betrHelper, owner, otherAccount, publicClient } = await loadFixture(deployBETRHelperFixture);

      let hash = await betrHelper.write.setProposedOwner([otherAccount.account.address], {
        account: owner.account
      });
      await publicClient.waitForTransactionReceipt({ hash });

      expect(await betrHelper.write.acceptOwnership({
        account: otherAccount.account
      })).to.emit(betrHelper, "OwnershipTransferred").withArgs(owner.account.address, otherAccount.account.address);

      expect((await betrHelper.read.owner()).toLocaleLowerCase()).to.equal(otherAccount.account.address.toLocaleLowerCase());
    });

    it("Should not accept the ownership transfer if the sender is not the proposed owner", async function () {
      const { betrHelper, otherAccount } = await loadFixture(deployBETRHelperFixture);
      await expect(betrHelper.write.acceptOwnership({
        account: otherAccount.account
      })).to.be.rejectedWith("NotProposedOwner");
    });

    it("Should cancel the ownership transfer", async function () {
      const { betrHelper, owner, otherAccount, publicClient } = await loadFixture(deployBETRHelperFixture);

      let hash = await betrHelper.write.setProposedOwner([otherAccount.account.address], {
        account: owner.account
      });
      await publicClient.waitForTransactionReceipt({ hash });

      await betrHelper.write.cancelProposedOwnership({
        account: owner.account
      });

      expect((await betrHelper.read.owner()).toLocaleLowerCase()).to.equal(owner.account.address.toLocaleLowerCase());
      expect((await betrHelper.read.proposedOwner()).toLocaleLowerCase()).to.equal("0x0000000000000000000000000000000000000000");
    });

    it("Should not cancel the ownership transfer if the sender is not the owner", async function () {
      const { betrHelper, otherAccount } = await loadFixture(deployBETRHelperFixture);
      await expect(betrHelper.write.cancelProposedOwnership({
        account: otherAccount.account
      })).to.be.rejectedWith("NotOwner");
    });
  });

  describe("Available calls", function () {
    it("Should set the available calls", async function () {
      const { betrHelper, owner } = await loadFixture(deployBETRHelperFixture);
      expect(await betrHelper.write.setAvailableCalls([100n], {
        account: owner.account
      })).to.emit(betrHelper, "AvailableCallsUpdated").withArgs(100n);
      expect(await betrHelper.read.availableCalls()).to.equal(100n);
    });

    it("Should not set the available calls if the sender is not the owner", async function () {
      const { betrHelper, otherAccount } = await loadFixture(deployBETRHelperFixture);
      await expect(betrHelper.write.setAvailableCalls([100n], {
        account: otherAccount.account
      })).to.be.rejectedWith("NotOwner");
    });
  });

  describe("Subcall", function () {
    it("Should call the smart contract", async function () {
      const { betrHelper, owner, mock } = await loadFixture(deployBETRHelperFixture);
      await betrHelper.write.setAvailableCalls([100n], {
        account: owner.account
      });

      const data = encodeFunctionData({
        abi: mock.abi,
        functionName: "testSuccess",
        args: []
      });
      await expect(betrHelper.write.subcall([1n, mock.address, data])).not.to.be.rejected;
      expect(await mock.read.getCalls()).to.equal(1n);
    });

    it("Should revert if the smart contract reverts", async function () {
      const { betrHelper, owner, mock } = await loadFixture(deployBETRHelperFixture);
      await betrHelper.write.setAvailableCalls([100n], {
        account: owner.account
      });

      const data = encodeFunctionData({
        abi: mock.abi,
        functionName: "testRevert",
        args: []
      });
      await expect(betrHelper.write.subcall([1n, mock.address, data])).to.be.rejectedWith("SubcallFailed");
      expect(await mock.read.getCalls()).to.equal(0n);
    });

    it("Should revert if the amount is not enough", async function () {
      const { betrHelper, owner, mock } = await loadFixture(deployBETRHelperFixture);
      await betrHelper.write.setAvailableCalls([100n], {
        account: owner.account
      });

      const data = encodeFunctionData({
        abi: mock.abi,
        functionName: "testSuccess",
        args: []
      });
      await expect(betrHelper.write.subcall([101n, mock.address, data])).to.be.rejectedWith("NotEnoughCalls");
      expect(await mock.read.getCalls()).to.equal(0n);
    });

    it("Should revert if the amount is 0", async function () {
      const { betrHelper, owner, mock } = await loadFixture(deployBETRHelperFixture);
      await betrHelper.write.setAvailableCalls([100n], {
        account: owner.account
      });

      const data = encodeFunctionData({
        abi: mock.abi,
        functionName: "testSuccess",
        args: []
      });
      await expect(betrHelper.write.subcall([0n, mock.address, data])).to.be.rejectedWith("InvalidInput");
      expect(await mock.read.getCalls()).to.equal(0n);
    });
  });

  describe("LoopSubcall", function () {
    it("Should call the smart contract", async function () {
      const { betrHelper, owner, mock } = await loadFixture(deployBETRHelperFixture);
      await betrHelper.write.setAvailableCalls([100n], {
        account: owner.account
      });

      const data = encodeFunctionData({
        abi: mock.abi,
        functionName: "testSuccess",
        args: []
      });
      await expect(betrHelper.write.loopSubcall([5n, mock.address, data])).not.to.be.rejected;
      expect(await mock.read.getCalls()).to.equal(5n);
    });

    it("Should revert if the smart contract reverts", async function () {
      const { betrHelper, owner, mock } = await loadFixture(deployBETRHelperFixture);
      await betrHelper.write.setAvailableCalls([100n], {
        account: owner.account
      });

      const data = encodeFunctionData({
        abi: mock.abi,
        functionName: "testRevert",
        args: []
      });
      await expect(betrHelper.write.loopSubcall([5n, mock.address, data])).to.be.rejectedWith("SubcallFailed");
      expect(await mock.read.getCalls()).to.equal(0n);
    });

    it("Should revert if the amount is not enough", async function () {
      const { betrHelper, owner, mock } = await loadFixture(deployBETRHelperFixture);
      await betrHelper.write.setAvailableCalls([100n], {
        account: owner.account
      });

      const data = encodeFunctionData({
        abi: mock.abi,
        functionName: "testSuccess",
        args: []
      });
      await expect(betrHelper.write.loopSubcall([101n, mock.address, data])).to.be.rejectedWith("NotEnoughCalls");
      expect(await mock.read.getCalls()).to.equal(0n);
    });

    it("Should revert if the amount is 0", async function () {
      const { betrHelper, owner, mock } = await loadFixture(deployBETRHelperFixture);
      await betrHelper.write.setAvailableCalls([100n], {
        account: owner.account
      });

      const data = encodeFunctionData({
        abi: mock.abi,
        functionName: "testSuccess",
        args: []
      });
      await expect(betrHelper.write.loopSubcall([0n, mock.address, data])).to.be.rejectedWith("InvalidInput");
      expect(await mock.read.getCalls()).to.equal(0n);
    });
  });

  describe("Multiple calls", function () {
    it("Should call the smart contract", async function () {
      const { betrHelper, owner, mock } = await loadFixture(deployBETRHelperFixture);
      await betrHelper.write.setAvailableCalls([100n], {
        account: owner.account
      });

      const smartContracts = [mock.address, mock.address];
      const values = [0n, 0n];
      const data = [
        encodeFunctionData({
          abi: mock.abi,
          functionName: "testSuccess",
          args: []
        }),
        encodeFunctionData({
          abi: mock.abi,
          functionName: "testSuccess",
          args: []
        })
      ];
      await expect(betrHelper.write.multiCall([smartContracts, data, values])).to.be.fulfilled;
      expect(await mock.read.getCalls()).to.equal(2n);
    });

    it("Should revert if the smart contract reverts", async function () {
      const { betrHelper, owner, mock } = await loadFixture(deployBETRHelperFixture);
      await betrHelper.write.setAvailableCalls([100n], {
        account: owner.account
      });

      const data = [
        encodeFunctionData({
          abi: mock.abi,
          functionName: "testSuccess",
          args: []
        }),
        encodeFunctionData({
          abi: mock.abi,
          functionName: "testRevert",
          args: []
        })
      ];
      await expect(betrHelper.write.multiCall([[mock.address, mock.address], data, [0n, 0n]])).to.be.rejectedWith("SubcallFailed");
      expect(await mock.read.getCalls()).to.equal(0n);
    });

    it("Should revert if the data is not the same length as the smart contracts", async function () {
      const { betrHelper, owner, mock } = await loadFixture(deployBETRHelperFixture);
      await betrHelper.write.setAvailableCalls([100n], {
        account: owner.account
      });

      await expect(betrHelper.write.multiCall([[mock.address, mock.address], [encodeFunctionData({
        abi: mock.abi,
        functionName: "testSuccess",
        args: []
      })], [0n, 0n]])).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if the values is not the same length as the smart contracts", async function () {
      const { betrHelper, owner, mock } = await loadFixture(deployBETRHelperFixture);
      await betrHelper.write.setAvailableCalls([100n], {
        account: owner.account
      });

      await expect(betrHelper.write.multiCall([[mock.address], [encodeFunctionData({
        abi: mock.abi,
        functionName: "testSuccess",
        args: []
      })], [0n, 0n]])).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if the smart contract is the zero address", async function () {
      const { betrHelper, owner, mock } = await loadFixture(deployBETRHelperFixture);
      await betrHelper.write.setAvailableCalls([100n], {
        account: owner.account
      });

      await expect(betrHelper.write.multiCall([[getAddress("0x0000000000000000000000000000000000000000")], [encodeFunctionData({
        abi: mock.abi,
        functionName: "testSuccess",
        args: []
      })], [0n]])).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if called with no calls", async function () {
      const { betrHelper, owner, mock } = await loadFixture(deployBETRHelperFixture);
      await betrHelper.write.setAvailableCalls([100n], {
        account: owner.account
      });

      await expect(betrHelper.write.multiCall([[], [], []])).to.be.rejectedWith("InvalidInput");
    });

    it("Should revert if the value is not enough", async function () {
      const { betrHelper, owner, mock } = await loadFixture(deployBETRHelperFixture);
      await betrHelper.write.setAvailableCalls([100n], {
        account: owner.account
      });

      await expect(betrHelper.write.multiCall([[mock.address, mock.address], [encodeFunctionData({
        abi: mock.abi,
        functionName: "testSuccess",
        args: []
      }), encodeFunctionData({
        abi: mock.abi,
        functionName: "testSuccess",
        args: []
      })], [parseEther("0.3"), parseEther("0.3")]], {
        account: owner.account,
        value: parseEther("0.5")
      })).to.be.rejectedWith("NotEnoughValue");
    });
  });

  describe("Recover ETH", function () {
    it("Should recover ETH", async function () {
      const { betrHelper, owner, otherAccount, publicClient, mock } = await loadFixture(deployBETRHelperFixture);

      // Send ETH unused value to the betrHelper
      await betrHelper.write.setAvailableCalls([100n], {
        account: owner.account
      });
      await betrHelper.write.multiCall([[mock.address], [encodeFunctionData({
        abi: mock.abi,
        functionName: "testSuccess",
        args: []
      })], [0n]], {
        account: owner.account,
        value: parseEther("1")
      });

      const ownerBalance = await publicClient.getBalance({ address: owner.account.address });
      const betrHelperBalance = await publicClient.getBalance({ address: betrHelper.address });
      expect(betrHelperBalance).to.be.equal(parseEther("1"));
      await expect(betrHelper.write.recoverETH({
        account: otherAccount.account
      })).to.be.fulfilled;
      expect(await publicClient.getBalance({ address: owner.account.address })).to.equal(ownerBalance + betrHelperBalance);
    });
  });
});
