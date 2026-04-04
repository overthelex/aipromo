import { appConfig, resolveAccountId } from "../config.js";
import { withRetry } from "../utils/retry.js";
import { sleepWithJitter } from "../utils/rate-limiter.js";
import { logger } from "../utils/logger.js";
import type {
  UnipileAccount,
  UnipileChat,
  UnipileMessage,
  UnipileRelation,
  UnipilePaginatedResponse,
  UnipileSearchFilters,
  UnipileSearchResult,
  UnipilePost,
} from "../types/unipile.types.js";

export class UnipileService {
  private baseUrl: string;
  private headers: Record<string, string>;
  public accountId: string;

  constructor(accountAlias?: string) {
    this.baseUrl = `https://${appConfig.unipileDsn}/api/v1`;
    this.headers = {
      "X-API-KEY": appConfig.unipileAccessToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    this.accountId = resolveAccountId(accountAlias);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    if (method !== "GET") {
      await sleepWithJitter();
    }

    return withRetry(async () => {
      const url = `${this.baseUrl}${path}`;
      logger.debug({ method, url }, "Unipile API request");

      const res = await fetch(url, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Unipile ${method} ${path}: ${res.status} — ${text}`);
      }

      return (await res.json()) as T;
    }, `Unipile ${method} ${path}`);
  }

  // --- Accounts ---

  async listAccounts(): Promise<UnipileAccount[]> {
    const data = await this.request<{ items: UnipileAccount[] }>(
      "GET",
      "/accounts"
    );
    return data.items;
  }

  // --- Relations (connections) ---

  async getRelations(
    cursor?: string
  ): Promise<UnipilePaginatedResponse<UnipileRelation>> {
    const params = new URLSearchParams();
    params.set("account_id", this.accountId);
    if (cursor) params.set("cursor", cursor);
    return this.request<UnipilePaginatedResponse<UnipileRelation>>(
      "GET",
      `/users/relations?${params.toString()}`
    );
  }

  async getAllRelations(): Promise<UnipileRelation[]> {
    const all: UnipileRelation[] = [];
    let cursor: string | undefined;

    do {
      const page = await this.getRelations(cursor);
      all.push(...page.items);
      cursor = page.cursor;
    } while (cursor);

    return all;
  }

  // --- Chats ---

  async getChats(
    cursor?: string
  ): Promise<UnipilePaginatedResponse<UnipileChat>> {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    params.set("account_id", this.accountId);
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request<UnipilePaginatedResponse<UnipileChat>>(
      "GET",
      `/chats${query}`
    );
  }

  async getChatMessages(
    chatId: string,
    cursor?: string
  ): Promise<UnipilePaginatedResponse<UnipileMessage>> {
    const query = cursor ? `?cursor=${cursor}` : "";
    return this.request<UnipilePaginatedResponse<UnipileMessage>>(
      "GET",
      `/chats/${chatId}/messages${query}`
    );
  }

  // --- Messaging ---

  async sendMessage(chatId: string, text: string): Promise<void> {
    await this.request("POST", `/chats/${chatId}/messages`, { text });
    logger.info({ chatId }, "Message sent");
  }

  async startChat(attendeeProviderId: string, text: string): Promise<string> {
    const data = await this.request<{ chat_id: string }>(
      "POST",
      "/chats",
      {
        account_id: this.accountId,
        attendees_ids: [attendeeProviderId],
        text,
      }
    );
    logger.info({ chatId: data.chat_id, attendeeProviderId }, "Chat started");
    return data.chat_id;
  }

  // --- Invitations ---

  async sendInvitation(
    providerProfileId: string,
    message?: string
  ): Promise<void> {
    await this.request("POST", "/users/invite", {
      account_id: this.accountId,
      provider_id: providerProfileId,
      message,
    });
    logger.info({ providerProfileId }, "Invitation sent");
  }

  // --- Posts ---

  async getUserPosts(
    userProviderId: string,
    cursor?: string,
    isCompany?: boolean
  ): Promise<UnipilePaginatedResponse<UnipilePost>> {
    const params = new URLSearchParams();
    params.set("account_id", this.accountId);
    if (isCompany) params.set("is_company", "true");
    if (cursor) params.set("cursor", cursor);
    return this.request<UnipilePaginatedResponse<UnipilePost>>(
      "GET",
      `/users/${userProviderId}/posts?${params.toString()}`
    );
  }

  // --- Search ---

  async searchProfiles(
    filters: UnipileSearchFilters
  ): Promise<UnipileSearchResult[]> {
    const data = await this.request<{ items: UnipileSearchResult[] }>(
      "POST",
      `/linkedin/search?account_id=${this.accountId}`,
      filters
    );
    return data.items;
  }

  async searchPeople(
    body: Record<string, unknown>
  ): Promise<{ items: any[]; cursor?: string }> {
    return this.request<{ items: any[]; cursor?: string }>(
      "POST",
      `/linkedin/search?account_id=${this.accountId}`,
      body
    );
  }

  async getSearchParameters(
    type: string,
    keyword: string
  ): Promise<{ items: Array<{ id: string; title: string }> }> {
    const params = new URLSearchParams();
    params.set("account_id", this.accountId);
    params.set("type", type);
    params.set("keyword", keyword);
    return this.request<{ items: Array<{ id: string; title: string }> }>(
      "GET",
      `/linkedin/search/parameters?${params.toString()}`
    );
  }
}
