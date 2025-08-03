// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { vars } from "hardhat/config";

const BETRRewardsModule = buildModule("BETRRewardsModule", (m) => {
  const owner = m.getParameter("owner", vars.get("BETR_OWNER"));
  const stakingContract = m.getParameter("stakingContract");

  const betrRewards = m.contract("BETRRewards", [owner, stakingContract]);

  return { betrRewards };
});

export default BETRRewardsModule;
