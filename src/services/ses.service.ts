import {
  SESv2Client,
  GetAccountCommand,
  GetSuppressedDestinationCommand,
  ListSuppressedDestinationsCommand,
  type SuppressedDestinationSummary,
} from "@aws-sdk/client-sesv2";
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
} from "@aws-sdk/client-cloudwatch";
import { appConfig } from "../config.js";
import { logger } from "../utils/logger.js";

export interface SesReputation {
  sendingEnabled: boolean;
  enforcementStatus: string;
  max24HourSend: number;
  maxSendRate: number;
  sentLast24Hours: number;
  bounceRate: number; // 0..1
  complaintRate: number; // 0..1
}

// Thin SES/CloudWatch wrapper used to protect the account's sending reputation
// before/while running email campaigns through the SES relay.
export class SesService {
  private ses: SESv2Client;
  private cw: CloudWatchClient;

  constructor() {
    const credentials = {
      accessKeyId: appConfig.awsAccessKeyId,
      secretAccessKey: appConfig.awsSecretAccessKey,
    };
    const region = appConfig.sesRegion;
    this.ses = new SESv2Client({ region, credentials });
    this.cw = new CloudWatchClient({ region, credentials });
  }

  private async metricRate(metric: string): Promise<number> {
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 25 * 3600 * 1000);
      const res = await this.cw.send(
        new GetMetricStatisticsCommand({
          Namespace: "AWS/SES",
          MetricName: metric,
          StartTime: start,
          EndTime: end,
          Period: 86400,
          Statistics: ["Maximum"],
        })
      );
      const points = res.Datapoints ?? [];
      return points.reduce((m, p) => Math.max(m, p.Maximum ?? 0), 0);
    } catch (e) {
      logger.warn({ metric, err: String(e) }, "CloudWatch metric unavailable");
      return 0;
    }
  }

  async getReputation(): Promise<SesReputation> {
    const acct = await this.ses.send(new GetAccountCommand({}));
    const [bounceRate, complaintRate] = await Promise.all([
      this.metricRate("Reputation.BounceRate"),
      this.metricRate("Reputation.ComplaintRate"),
    ]);
    return {
      sendingEnabled: acct.SendingEnabled ?? false,
      enforcementStatus: acct.EnforcementStatus ?? "UNKNOWN",
      max24HourSend: acct.SendQuota?.Max24HourSend ?? 0,
      maxSendRate: acct.SendQuota?.MaxSendRate ?? 0,
      sentLast24Hours: acct.SendQuota?.SentLast24Hours ?? 0,
      bounceRate,
      complaintRate,
    };
  }

  // True if SES already suppresses this address (previous bounce/complaint).
  async isSuppressed(email: string): Promise<boolean> {
    try {
      await this.ses.send(
        new GetSuppressedDestinationCommand({ EmailAddress: email.toLowerCase() })
      );
      return true;
    } catch (e: any) {
      if (e?.name === "NotFoundException") return false;
      logger.warn({ email, err: String(e) }, "Suppression check failed");
      return false; // fail-open on transient errors; SES will still reject if bad
    }
  }

  // Paginate the full account-level suppression list.
  async listSuppressed(): Promise<SuppressedDestinationSummary[]> {
    const out: SuppressedDestinationSummary[] = [];
    let token: string | undefined;
    do {
      const res = await this.ses.send(
        new ListSuppressedDestinationsCommand({ PageSize: 1000, NextToken: token })
      );
      out.push(...(res.SuppressedDestinationSummaries ?? []));
      token = res.NextToken;
    } while (token);
    return out;
  }
}
