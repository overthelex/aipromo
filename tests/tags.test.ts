import { describe, it, expect } from "vitest";
import { parseTags, hasTag, hasTagPrefix, addTag, removeTag } from "../src/utils/tags.js";

describe("parseTags", () => {
  it("parses comma-separated tags", () => {
    expect(parseTags("foo,bar,baz")).toEqual(["foo", "bar", "baz"]);
  });
  it("trims whitespace", () => {
    expect(parseTags(" foo , bar ")).toEqual(["foo", "bar"]);
  });
  it("returns empty array for empty string", () => {
    expect(parseTags("")).toEqual([]);
  });
  it("filters out empty segments", () => {
    expect(parseTags("foo,,bar,")).toEqual(["foo", "bar"]);
  });
});

describe("hasTag", () => {
  it("finds exact tag", () => {
    expect(hasTag("campaign-d1,search", "search")).toBe(true);
  });
  it("returns false for partial match", () => {
    expect(hasTag("campaign-d1", "campaign")).toBe(false);
  });
  it("returns false for empty string", () => {
    expect(hasTag("", "foo")).toBe(false);
  });
});

describe("hasTagPrefix", () => {
  it("matches tag prefix", () => {
    expect(hasTagPrefix("campaign-d1,search", "campaign")).toBe(true);
  });
  it("returns false when no match", () => {
    expect(hasTagPrefix("search,import", "campaign")).toBe(false);
  });
});

describe("addTag", () => {
  it("adds new tag", () => {
    expect(addTag("foo", "bar")).toBe("foo,bar");
  });
  it("does not duplicate", () => {
    expect(addTag("foo,bar", "bar")).toBe("foo,bar");
  });
  it("adds to empty", () => {
    expect(addTag("", "foo")).toBe("foo");
  });
});

describe("removeTag", () => {
  it("removes tag", () => {
    expect(removeTag("foo,bar,baz", "bar")).toBe("foo,baz");
  });
  it("handles missing tag", () => {
    expect(removeTag("foo,bar", "xyz")).toBe("foo,bar");
  });
});
