// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { vars } from "hardhat/config";

const BETRStakingModule = buildModule("BETRStakingModule", (m) => {
  const owner = m.getParameter("owner", vars.get("BETR_OWNER"));
  const stakingToken = m.getParameter("stakingToken");

  const betrStaking = m.contract("BETRStaking", [owner, stakingToken]);

  return { betrStaking };
});

export default BETRStakingModule;
