export type ClientSegment = "advocate" | "law_firm";

export type ClientStatus =
  | "new"
  | "contacted"
  | "replied"
  | "bounced"
  | "complained"
  | "invalid"
  | "unsubscribed";

export interface EmailClient {
  id: number;
  email: string;
  name: string;
  org: string;
  edrpou: string;
  phone: string;
  website: string;
  region: string;
  segment: ClientSegment;
  tags: string;
  status: ClientStatus;
  source: string;
  unsubscribeToken: string;
  lastContactedAt: Date | null;
  unsubscribedAt: Date | null;
  importedAt: Date;
}
