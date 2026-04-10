import type { CampaignConfig } from "./types.js";
import { config as registryAccess } from "./registry-access-2w.js";
import { config as panopticOsint } from "./panoptic-osint.js";

const campaigns: Record<string, CampaignConfig> = {
  "registry-access-2w": registryAccess,
  "panoptic-osint": panopticOsint,
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
