import { describe, it, expect } from "vitest";
import {
  CAMPAIGN_NAME,
  DAILY_SEARCH_QUERIES,
  MESSAGE_ANGLES,
  OPTIMAL_HOURS_UTC,
  getMessageAngle,
} from "../src/campaigns/registry-access-2w.js";

describe("Campaign Config", () => {
  it("has 14 daily search queries", () => {
    expect(DAILY_SEARCH_QUERIES).toHaveLength(14);
  });

  it("each query has keywords and title", () => {
    for (const q of DAILY_SEARCH_QUERIES) {
      expect(q.keywords).toBeTruthy();
      expect(q.title).toBeTruthy();
      expect(q.day).toBeGreaterThanOrEqual(1);
    }
  });

  it("has 7 message angles", () => {
    expect(MESSAGE_ANGLES).toHaveLength(7);
  });

  it("campaign name is set", () => {
    expect(CAMPAIGN_NAME).toBe("registry-access-2w");
  });

  it("optimal hours are valid UTC hours", () => {
    for (const h of OPTIMAL_HOURS_UTC) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(24);
    }
  });

  it("getMessageAngle rotates through angles", () => {
    const angles = new Set<string>();
    for (let i = 0; i < 14; i++) {
      angles.add(getMessageAngle(1, i));
    }
    expect(angles.size).toBe(7);
  });

  it("different days give different angles for same index", () => {
    const a1 = getMessageAngle(1, 0);
    const a2 = getMessageAngle(2, 0);
    expect(a1).not.toBe(a2);
  });
});
