import { describe, it, expect } from "vitest";
import { validateSyntax, isBlockedDomain } from "../src/utils/email-validate.js";

describe("email syntax validation", () => {
  it("accepts normal addresses", () => {
    expect(validateSyntax("ivan@law.ua")).toBe(true);
    expect(validateSyntax("a.b+c@sub.example.co.uk")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    for (const bad of ["", "no-at", "a@b", "a@@b.ua", "a b@c.ua", "a@b.", "@b.ua"]) {
      expect(validateSyntax(bad)).toBe(false);
    }
  });
});

describe("domain blocklist", () => {
  it("blocks RU/SU TLDs", () => {
    for (const d of ["mail.ru", "list.ru", "bk.ru", "example.su", "foo.mail.ru"]) {
      expect(isBlockedDomain(d)).toBe(true);
    }
  });

  it("blocks RU webmail on other TLDs and disposable providers", () => {
    for (const d of ["yandex.com", "ya.ru", "mailinator.com", "yopmail.com", "sub.mailinator.com"]) {
      expect(isBlockedDomain(d)).toBe(true);
    }
  });

  it("allows normal domains", () => {
    for (const d of ["gmail.com", "ukr.net", "i.ua", "meta.ua", "law.com.ua"]) {
      expect(isBlockedDomain(d)).toBe(false);
    }
  });
});
