import { config as dotenvConfig } from "dotenv";
dotenvConfig();
import { UnipileService } from "../src/services/unipile.service.js";

const unipile = new UnipileService("ihor");
const accounts = await unipile.listAccounts();
console.log("Accounts in Unipile:");
for (const a of accounts) {
  console.log(`  ${a.id} | ${a.name ?? "no name"} | ${a.type ?? ""} | ${a.status ?? ""}`);
}
