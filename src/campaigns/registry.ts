import type { CampaignConfig } from "./types.js";
import { config as registryAccess } from "./registry-access-2w.js";
import { config as panopticOsint } from "./panoptic-osint.js";
import { config as investorNl } from "./investor-nl.js";
import { config as investorUs } from "./investor-us.js";
import { config as usDeftech } from "./us-deftech.js";

const campaigns: Record<string, CampaignConfig> = {
  "registry-access-2w": registryAccess,
  "panoptic-osint": panopticOsint,
  "investor-nl": investorNl,
  "investor-us": investorUs,
  "us-deftech": usDeftech,
};

export function getCampaign(name: string): CampaignConfig {
  const campaign = campaigns[name];
  if (!campaign) {
    const available = Object.keys(campaigns).join(", ");
    throw new Error(`Campaign "${name}" not found. Available: ${available}`);
  }
  return campaign;
}

export function listCampaigns(): string[] {
  return Object.keys(campaigns);
}
