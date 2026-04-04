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
  id: string;
  provider_id: string;
  first_name: string;
  last_name: string;
  headline?: string;
  company?: string;
  title?: string;
  location?: string;
  profile_url?: string;
  public_identifier?: string;
}

export interface UnipilePaginatedResponse<T> {
  items: T[];
  cursor?: string;
}

export interface UnipileChat {
  id: string;
  account_id: string;
  provider: string;
  attendees: UnipileChatAttendee[];
  timestamp: string;
  unread_count?: number;
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
  text: string;
  timestamp: string;
  is_sender: boolean;
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
