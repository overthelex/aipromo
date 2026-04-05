import { describe, it, expect } from "vitest";
import { getTemplate, listTemplateNames, defaultTemplates } from "../src/templates/outreach-templates.js";

describe("Outreach Templates", () => {
  it("has at least 3 templates", () => {
    expect(listTemplateNames().length).toBeGreaterThanOrEqual(3);
  });

  it("getTemplate returns existing template", () => {
    const t = getTemplate("intro-short");
    expect(t).toBeTruthy();
    expect(t).toContain("{{name}}");
  });

  it("getTemplate returns undefined for missing", () => {
    expect(getTemplate("nonexistent")).toBeUndefined();
  });

  it("all templates contain placeholder variables", () => {
    for (const [name, tpl] of Object.entries(defaultTemplates)) {
      expect(tpl).toContain("{{");
    }
  });
});
