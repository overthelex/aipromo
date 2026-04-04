import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import { appConfig } from "../config.js";
import { logger } from "../utils/logger.js";
import { getSystemPrompt } from "../templates/system-prompt.js";
import type { UnipileMessage } from "../types/unipile.types.js";

export interface LeadProfile {
  name: string;
  headline?: string;
  company?: string;
  title?: string;
  location?: string;
}

export class ClaudeService {
  private client: AnthropicBedrock;
  private model: string;

  constructor() {
    this.client = new AnthropicBedrock({
      awsAccessKey: appConfig.awsAccessKeyId,
      awsSecretKey: appConfig.awsSecretAccessKey,
      awsRegion: appConfig.awsRegion,
    });
    this.model = appConfig.bedrockModel;
  }

  async ping(): Promise<void> {
    await this.client.messages.create({
      model: this.model,
      max_tokens: 10,
      messages: [{ role: "user", content: "ping" }],
    });
  }

  async generateReply(
    messages: UnipileMessage[],
    lead: LeadProfile
  ): Promise<string> {
    const conversationContext = messages
      .slice(-10)
      .map(
        (m) =>
          `[${m.is_sender ? appConfig.senderName || "Me" : lead.name}]: ${m.text}`
      )
      .join("\n");

    const systemPrompt = getSystemPrompt();
    const userPrompt = [
      `Lead profile:`,
      `- Name: ${lead.name}`,
      lead.headline ? `- Headline: ${lead.headline}` : null,
      lead.company ? `- Company: ${lead.company}` : null,
      lead.title ? `- Title: ${lead.title}` : null,
      lead.location ? `- Location: ${lead.location}` : null,
      ``,
      `Conversation:`,
      conversationContext,
      ``,
      `Generate a reply to the last message. Be concise, professional, and personalized. Write ONLY the reply text, no quotes or labels.`,
    ]
      .filter(Boolean)
      .join("\n");

    logger.debug({ lead: lead.name }, "Generating reply");

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    return text.trim();
  }

  async generateOutreachMessage(
    lead: LeadProfile,
    template: string
  ): Promise<string> {
    const systemPrompt = getSystemPrompt();
    const userPrompt = [
      `Lead profile:`,
      `- Name: ${lead.name}`,
      lead.headline ? `- Headline: ${lead.headline}` : null,
      lead.company ? `- Company: ${lead.company}` : null,
      lead.title ? `- Title: ${lead.title}` : null,
      lead.location ? `- Location: ${lead.location}` : null,
      ``,
      `Message template:`,
      template,
      ``,
      `Personalize this outreach message for the lead. Make it natural, not spammy. Write ONLY the message text.`,
    ]
      .filter(Boolean)
      .join("\n");

    logger.debug({ lead: lead.name }, "Generating outreach message");

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    return text.trim();
  }
}
