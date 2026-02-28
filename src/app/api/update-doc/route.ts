import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";

const BASE_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

function errorResponse(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status });
}

const SYSTEM_PROMPT = `你是一个专业的产品经理助手，擅长修改和完善PRD（产品需求文档）。

## 任务

用户会提供一份已有的PRD文档和修改指令，请根据指令对文档进行修改。

## 规则

1. **只修改用户指定的部分**，其余内容保持原样不变
2. 修改后输出完整的文档（包含未修改的部分），确保文档结构完整
3. 保持原文档的 markdown 格式、表格结构、YAML frontmatter 不变
4. 将 frontmatter 中的 updated 日期更新为今天
5. 直接输出 markdown 内容，不要用代码块包裹
6. 不要添加任何解释性文字，只输出修改后的完整文档`;

export async function POST(req: Request) {
  try {
    if (!AUTH_TOKEN) {
      return errorResponse("请在 .env.local 中配置 ANTHROPIC_AUTH_TOKEN");
    }

    const { filename, instructions } = await req.json();

    if (!filename || typeof filename !== "string") {
      return errorResponse("参数错误，filename 必须是字符串", 400);
    }
    if (!instructions || typeof instructions !== "string") {
      return errorResponse("参数错误，instructions 必须是字符串", 400);
    }

    const name = filename.endsWith(".md") ? filename : `${filename}.md`;
    const filePath = join(process.cwd(), "Docs", name);

    if (!existsSync(filePath)) {
      return errorResponse(`文件不存在: Docs/${name}`, 404);
    }

    const currentContent = readFileSync(filePath, "utf-8");
    const today = new Date().toISOString().split("T")[0];

    const userPrompt = `## 当前文档内容

${currentContent}

## 修改指令

${instructions}

请根据上述修改指令，对文档进行修改，并将 frontmatter 中的 updated 日期改为 ${today}。输出修改后的完整文档。`;

    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
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
    let fullContent = "";

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
                  const errMsg = event.error?.message || "API 返回错误";
                  controller.enqueue(encoder.encode(`\n[错误] ${errMsg}`));
                  return;
                }

                const delta = event.choices?.[0]?.delta;
                if (delta?.content) {
                  fullContent += delta.content;
                  controller.enqueue(encoder.encode(delta.content));
                }
              } catch {
                // non-JSON lines, skip
              }
            }
          }

          if (fullContent) {
            try {
              writeFileSync(filePath, fullContent, "utf-8");
              const saveMsg = `\n\n---\n[DOC_UPDATED] Docs/${name}`;
              controller.enqueue(encoder.encode(saveMsg));
            } catch (err) {
              const msg = err instanceof Error ? err.message : "未知错误";
              controller.enqueue(
                encoder.encode(`\n\n---\n[DOC_UPDATE_FAILED] ${msg}`),
              );
            }
          } else {
            controller.enqueue(encoder.encode("[未收到有效回复，请重试]"));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "流式读取失败";
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
    console.error("文档更新失败:", error);
    return errorResponse(`服务器错误：${errorMsg}`);
  }
}
