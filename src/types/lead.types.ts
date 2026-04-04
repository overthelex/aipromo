export interface Lead {
  id: number;
  linkedinId: string;
  name: string;
  headline: string;
  company: string;
  title: string;
  location: string;
  profileUrl: string;
  tags: string;
  importedAt: string;
  source: "connection" | "csv" | "search";
}

export interface Conversation {
  id: number;
  chatId: string;
  leadId: number | null;
  lastMessageAt: string;
  status: "new" | "drafting" | "awaiting_approval" | "sent" | "archived";
}

export interface Draft {
  id: number;
  conversationId: number;
  leadId: number | null;
  draftText: string;
  status: "pending" | "approved" | "edited" | "rejected" | "sent";
  createdAt: string;
  sentAt: string | null;
}

export interface OutreachCampaign {
  id: number;
  name: string;
  template: string;
  targetTags: string;
  status: "active" | "paused" | "completed";
  createdAt: string;
}

export interface OutreachQueueItem {
  id: number;
  campaignId: number;
  leadId: number;
  messageText: string;
  status: "pending" | "sent" | "failed";
  scheduledAt: string;
  sentAt: string | null;
}

export interface DailyActivity {
  date: string;
  actionType: string;
  count: number;
}
