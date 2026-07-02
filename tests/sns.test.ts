import { describe, it, expect } from "vitest";
import { buildStringToSign, type SnsMessage } from "../src/utils/sns.js";

describe("SNS string-to-sign", () => {
  it("builds canonical field order for a Notification (Subject omitted when absent)", () => {
    const msg = {
      Type: "Notification",
      MessageId: "id-1",
      TopicArn: "arn:topic",
      Message: "hello",
      Timestamp: "2026-07-02T00:00:00.000Z",
      SignatureVersion: "1",
      Signature: "x",
      SigningCertURL: "https://sns.eu-central-1.amazonaws.com/x.pem",
    } as SnsMessage;
    expect(buildStringToSign(msg)).toBe(
      "Message\nhello\n" +
        "MessageId\nid-1\n" +
        "Timestamp\n2026-07-02T00:00:00.000Z\n" +
        "TopicArn\narn:topic\n" +
        "Type\nNotification\n"
    );
  });

  it("includes Subject when present", () => {
    const msg = {
      Type: "Notification",
      MessageId: "id-1",
      TopicArn: "arn:topic",
      Subject: "hi",
      Message: "hello",
      Timestamp: "t",
    } as SnsMessage;
    expect(buildStringToSign(msg)).toContain("Subject\nhi\n");
  });

  it("builds SubscriptionConfirmation with Token + SubscribeURL", () => {
    const msg = {
      Type: "SubscriptionConfirmation",
      MessageId: "id-2",
      TopicArn: "arn:topic",
      Message: "confirm",
      SubscribeURL: "https://sns.eu-central-1.amazonaws.com/?Action=Confirm",
      Token: "tok",
      Timestamp: "t",
    } as SnsMessage;
    const s = buildStringToSign(msg);
    expect(s).toContain("SubscribeURL\nhttps://sns.eu-central-1.amazonaws.com/?Action=Confirm\n");
    expect(s).toContain("Token\ntok\n");
  });

  it("throws on unknown type", () => {
    expect(() => buildStringToSign({ Type: "Nope" } as SnsMessage)).toThrow();
  });
});
