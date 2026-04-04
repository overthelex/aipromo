export interface UnipileAccount {
  id: string;
  type: string;
  name: string;
  status: string;
}

export interface UnipileAccountsResponse {
  items: UnipileAccount[];
}

export interface UnipileRelation {
  object: string;
  connection_urn: string;
  member_id: string;
  member_urn: string;
  first_name: string;
  last_name: string;
  headline?: string;
  public_identifier?: string;
  public_profile_url?: string;
  profile_picture_url?: string;
  created_at: number;
}

export interface UnipilePaginatedResponse<T> {
  items: T[];
  cursor?: string;
}

export interface UnipileChat {
  id: string;
  name: string;
  subject: string;
  type: number;
  folder: string[];
  account_id: string;
  account_type: string;
  content_type: string;
  provider_id: string;
  attendee_provider_id: string;
  attendees?: UnipileChatAttendee[];
  timestamp: string;
  unread: number;
  unread_count: number;
  archived: number;
  read_only: number;
  pinned: number;
  last_message?: UnipileMessage;
}

export interface UnipileChatAttendee {
  id: string;
  provider_id: string;
  name: string;
  is_self: boolean;
}

export interface UnipileMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  sender_attendee_id?: string;
  text: string;
  timestamp: string;
  is_sender: boolean;
  message_type?: string;
  subject?: string | null;
  seen: number;
  delivered: number;
  attachments: unknown[];
}

export interface UnipileSendMessageRequest {
  text: string;
}

export interface UnipileStartChatRequest {
  account_id: string;
  attendees_ids: string[];
  text: string;
}

export interface UnipileInvitationRequest {
  provider_id: string;
  message?: string;
}

export interface UnipilePost {
  id: string;
  social_id: string;
  text: string;
  share_url: string;
  date: string;
  comment_counter: number;
  reaction_counter: number;
  repost_counter: number;
  impressions_counter: number;
  is_repost: boolean;
  parsed_datetime?: string;
  author: {
    id: string;
    name: string;
    public_identifier: string;
    is_company: boolean;
    headline?: string;
    profile_picture_url?: string;
  };
  written_by?: {
    id: string;
    name: string;
    public_identifier: string;
  };
  analytics?: {
    clicks: number;
    clickthrough_rate: number;
    engagements: number;
    engagement_rate: number;
    impressions: number;
  };
  attachments: unknown[];
  mentions: unknown[];
}

export interface UnipileSearchFilters {
  keywords?: string;
  title?: string;
  company?: string;
  location?: string;
}

export interface UnipileSearchResult {
  provider_id: string;
  first_name: string;
  last_name: string;
  headline?: string;
  company?: string;
  title?: string;
  location?: string;
  profile_url?: string;
}
