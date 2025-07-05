// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { vars } from "hardhat/config";

const BETRERC20PayerModule = buildModule("BETRERC20PayerModule", (m) => {
  const owner = m.getParameter("owner", vars.get("BETR_OWNER"));

  const betrERC20Payer = m.contract("BETRERC20Payer", [owner, "0x4200000000000000000000000000000000000006"]);

  return { betrERC20Payer };
});

export default BETRERC20PayerModule;
