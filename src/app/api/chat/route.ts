import { NextResponse } from "next/server";

const BASE_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

function errorResponse(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(req: Request) {
  try {
    if (!AUTH_TOKEN) {
      return errorResponse("请在 .env.local 中配置 ANTHROPIC_AUTH_TOKEN");
    }

    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return errorResponse("参数错误，messages必须是数组", 400);
    }

    type ContentBlock =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } };

    const chatMessages = messages.map(
      (msg: { role: string; content: string | ContentBlock[] }) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      }),
    );

    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        messages: chatMessages,
        stream: true,
      }),
    });

    const contentType = response.headers.get("content-type") || "";

    if (!response.ok || !contentType.includes("text/event-stream")) {
      const text = await response.text();
      let msg = `API 错误 (${response.status})`;
      try {
        const data = JSON.parse(text);
        msg =
          data.error?.message ||
          (typeof data.error === "string" ? data.error : null) ||
          data.message ||
          msg;
      } catch {
        if (text) msg = text.slice(0, 200);
      }
      return errorResponse(msg, response.ok ? 502 : response.status);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return errorResponse("无法获取响应流");
    }

    const encoder = new TextEncoder();
    let hasContent = false;

    const stream = new ReadableStream({
      async start(controller) {
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;

              const dataStr = trimmed.slice(5).trim();
              if (dataStr === "[DONE]") continue;

              try {
                const event = JSON.parse(dataStr);

                if (event.error) {
                  const errMsg =
                    event.error?.message || "API 返回错误";
                  controller.enqueue(encoder.encode(`\n[错误] ${errMsg}`));
                  return;
                }

                // OpenAI chat completions 流式格式
                const delta = event.choices?.[0]?.delta;
                if (delta?.content) {
                  hasContent = true;
                  controller.enqueue(encoder.encode(delta.content));
                }
              } catch {
                // event: 等非 JSON 行，忽略
              }
            }
          }

          if (!hasContent) {
            controller.enqueue(
              encoder.encode("[未收到有效回复，请重试]"),
            );
          }
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "流式读取失败";
          controller.enqueue(encoder.encode(`\n[错误] ${msg}`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "未知错误";
    console.error("聊天请求失败:", error);
    return errorResponse(`服务器错误：${errorMsg}`);
  }
}
