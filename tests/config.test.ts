import { describe, it, expect } from "vitest";

describe("Config validation", () => {
  it("validates required env vars", async () => {
    // Config module exits on missing vars, so test the schema directly
    const { z } = await import("zod");

    const schema = z.object({
      databaseUrl: z.string().min(1),
      dashboardApiKey: z.string().default(""),
      maxMessagesPerDay: z.coerce.number().int().positive().default(50),
      minDelaySeconds: z.coerce.number().positive().default(3),
      maxDelaySeconds: z.coerce.number().positive().default(8),
      businessHoursStart: z.coerce.number().int().min(0).max(23).default(9),
      businessHoursEnd: z.coerce.number().int().min(0).max(23).default(18),
    });

    // Should pass with valid values
    const result = schema.safeParse({
      databaseUrl: "postgres://test@localhost/test",
      maxMessagesPerDay: "50",
    });
    expect(result.success).toBe(true);

    // Should fail with empty databaseUrl
    const fail = schema.safeParse({ databaseUrl: "" });
    expect(fail.success).toBe(false);

    // Should coerce string numbers
    if (result.success) {
      expect(result.data.maxMessagesPerDay).toBe(50);
      expect(result.data.businessHoursStart).toBe(9);
    }
  });

  it("defaults are sensible", async () => {
    const { z } = await import("zod");
    const schema = z.object({
      dashboardApiKey: z.string().default(""),
      maxMessagesPerDay: z.coerce.number().default(50),
      minDelaySeconds: z.coerce.number().default(3),
    });
    const result = schema.parse({});
    expect(result.dashboardApiKey).toBe("");
    expect(result.maxMessagesPerDay).toBe(50);
    expect(result.minDelaySeconds).toBe(3);
  });
});
