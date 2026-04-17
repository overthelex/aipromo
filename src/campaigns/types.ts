export interface DailySearchQuery {
  day: number;
  keywords: string;
  title: string;
}

export type Channel = "linkedin" | "instagram";

export interface CampaignConfig {
  name: string;
  productContext: string;
  dailySearchQueries: DailySearchQuery[];
  optimalHoursUtc: number[];
  messageAngles: string[];
  getMessageAngle: (dayNumber: number, leadIndex: number) => string;
  getAngleInstruction: (angle: string) => string;
  channels: Channel[];
  /** Unipile account ID for Instagram DMs (optional) */
  instagramAccountId?: string;
  /** LinkedIn geo IDs to filter search by. Defaults to Ukraine if omitted. */
  locationIds?: string[];
}
