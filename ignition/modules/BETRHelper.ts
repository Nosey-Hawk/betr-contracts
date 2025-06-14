// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { vars } from "hardhat/config";

const BETRHelperModule = buildModule("BETRHelperModule", (m) => {
  const owner = m.getParameter("owner", vars.get("BETR_OWNER"));

  const betrHelper = m.contract("BETRHelper", [owner]);

  return { betrHelper };
});

export default BETRHelperModule;
