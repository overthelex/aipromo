import { Router, Request, Response } from "express";
import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import { sql } from "../storage/store.js";
import { appConfig } from "../config.js";
import { logger } from "../utils/logger.js";
import { CHAT_SYSTEM_PROMPT, CHAT_TOOLS, executeTool } from "../services/chat-tools.js";

export const chatRouter = Router();

const client = new AnthropicBedrock({
  awsAccessKey: appConfig.awsAccessKeyId,
  awsSecretKey: appConfig.awsSecretAccessKey,
  awsRegion: appConfig.awsRegion,
});

const MODEL = appConfig.bedrockModel;
const MAX_HISTORY = 50; // max messages to include in context
const activeStreams = new Set<number>(); // prevent concurrent streams per conversation

// ─── List conversations ────────────────────────────────────────────────────────

chatRouter.get("/conversations", async (req: Request, res: Response) => {
  const user = (req as any).user;
  const rows = await sql`
    SELECT * FROM chat_conversations
    WHERE user_id = ${user.id}
    ORDER BY updated_at DESC
    LIMIT 50
  `;
  res.json({ items: rows });
});

// ─── Create conversation ───────────────────────────────────────────────────────

chatRouter.post("/conversations", async (req: Request, res: Response) => {
  const user = (req as any).user;
  const [conv] = await sql`
    INSERT INTO chat_conversations (user_id, title)
    VALUES (${user.id}, '')
    RETURNING *
  `;
  res.json(conv);
});

// ─── Delete conversation ───────────────────────────────────────────────────────

chatRouter.delete("/conversations/:id", async (req: Request, res: Response) => {
  const user = (req as any).user;
  await sql`DELETE FROM chat_conversations WHERE id = ${req.params.id} AND user_id = ${user.id}`;
  res.json({ ok: true });
});

// ─── Get messages ──────────────────────────────────────────────────────────────

chatRouter.get("/conversations/:id/messages", async (req: Request, res: Response) => {
  const rows = await sql`
    SELECT * FROM chat_messages
    WHERE conversation_id = ${req.params.id}
    ORDER BY created_at ASC
  `;
  res.json({ items: rows });
});

// ─── Send message (SSE streaming response) ─────────────────────────────────────

chatRouter.post("/conversations/:id/messages", async (req: Request, res: Response) => {
  const convId = parseInt(req.params.id as string);
  const { message } = req.body;
  const user = (req as any).user;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message required" });
  }

  // Prevent concurrent streams on same conversation
  if (activeStreams.has(convId)) {
    return res.status(409).json({ error: "Another message is being processed" });
  }
  activeStreams.add(convId);

  // Verify ownership
  const [conv] = await sql`SELECT * FROM chat_conversations WHERE id = ${convId} AND user_id = ${user.id}`;
  if (!conv) {
    activeStreams.delete(convId);
    return res.status(404).json({ error: "Conversation not found" });
  }

  // Save user message
  await sql`
    INSERT INTO chat_messages (conversation_id, role, content)
    VALUES (${convId}, 'user', ${message})
  `;

  // Auto-title on first message
  if (!conv.title) {
    const title = message.slice(0, 60) + (message.length > 60 ? "..." : "");
    await sql`UPDATE chat_conversations SET title = ${title} WHERE id = ${convId}`;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendSSE = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Load conversation history
    const history = await sql`
      SELECT role, content, tool_use_id, tool_name FROM chat_messages
      WHERE conversation_id = ${convId}
      ORDER BY created_at ASC
    `;

    // Build Anthropic messages array from history (last N messages)
    const anthropicMessages = buildAnthropicMessages(
      (history as unknown as Array<{ role: string; content: string; tool_use_id: string | null; tool_name: string | null }>).slice(-MAX_HISTORY)
    );

    // Tool use loop
    let messages = anthropicMessages;
    let loopCount = 0;
    const MAX_LOOPS = 5;

    while (loopCount < MAX_LOOPS) {
      loopCount++;

      const stream = client.messages.stream({
        model: MODEL,
        system: CHAT_SYSTEM_PROMPT,
        messages,
        tools: CHAT_TOOLS,
        max_tokens: 4096,
      });

      let assistantText = "";
      let toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

      // Collect content blocks
      let currentToolUse: { id: string; name: string; input: string } | null = null;

      stream.on("text", (text) => {
        assistantText += text;
        sendSSE("text_delta", { text });
      });

      const finalMessage = await stream.finalMessage();

      // Extract tool_use blocks from final message
      for (const block of finalMessage.content) {
        if (block.type === "tool_use") {
          toolUseBlocks.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
        }
      }

      if (finalMessage.stop_reason === "tool_use" && toolUseBlocks.length > 0) {
        // Save assistant message with tool calls
        await sql`
          INSERT INTO chat_messages (conversation_id, role, content)
          VALUES (${convId}, 'assistant', ${JSON.stringify(finalMessage.content)})
        `;

        // Execute each tool and build tool results
        const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];

        for (const tool of toolUseBlocks) {
          sendSSE("tool_use", { id: tool.id, name: tool.name, input: tool.input });

          try {
            const result = await executeTool(tool.name, tool.input);
            const resultStr = JSON.stringify(result);
            toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: resultStr });
            sendSSE("tool_result", { tool_use_id: tool.id, name: tool.name, result });

            // Save tool result to DB
            await sql`
              INSERT INTO chat_messages (conversation_id, role, content, tool_use_id, tool_name)
              VALUES (${convId}, 'user', ${resultStr}, ${tool.id}, ${tool.name})
            `;
          } catch (err: any) {
            const errorResult = JSON.stringify({ error: err.message });
            toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: errorResult });
            sendSSE("tool_result", { tool_use_id: tool.id, name: tool.name, result: { error: err.message } });

            await sql`
              INSERT INTO chat_messages (conversation_id, role, content, tool_use_id, tool_name)
              VALUES (${convId}, 'user', ${errorResult}, ${tool.id}, ${tool.name})
            `;
          }
        }

        // Continue the loop: add assistant message + tool results to messages
        messages = [
          ...messages,
          { role: "assistant" as const, content: finalMessage.content },
          { role: "user" as const, content: toolResults },
        ];

        continue;
      }

      // Final text response — save and finish
      if (assistantText) {
        await sql`
          INSERT INTO chat_messages (conversation_id, role, content)
          VALUES (${convId}, 'assistant', ${assistantText})
        `;
      }

      break;
    }

    // Update conversation timestamp
    await sql`UPDATE chat_conversations SET updated_at = NOW() WHERE id = ${convId}`;

    sendSSE("done", {});
  } catch (err: any) {
    logger.error({ error: err.message, convId }, "Chat stream error");
    sendSSE("error", { message: err.message });
  } finally {
    activeStreams.delete(convId);
    res.end();
  }
});

// ─── Build Anthropic messages from DB history ──────────────────────────────────

function buildAnthropicMessages(
  history: Array<{ role: string; content: string; tool_use_id: string | null; tool_name: string | null }>
): Array<{ role: "user" | "assistant"; content: any }> {
  const messages: Array<{ role: "user" | "assistant"; content: any }> = [];

  for (const msg of history) {
    if (msg.tool_use_id) {
      // This is a tool result — add as user message with tool_result content
      messages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: msg.tool_use_id, content: msg.content }],
      });
    } else if (msg.role === "assistant") {
      // Could be plain text or JSON content blocks (if it contained tool_use)
      let content: any;
      try {
        const parsed = JSON.parse(msg.content);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) {
          content = parsed; // content blocks array
        } else {
          content = msg.content; // plain text
        }
      } catch {
        content = msg.content; // plain text
      }
      messages.push({ role: "assistant", content });
    } else {
      // Regular user message
      messages.push({ role: "user", content: msg.content });
    }
  }

  return messages;
}
