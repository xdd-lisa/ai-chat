import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";

const BASE_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

function errorResponse(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status });
}

function buildSystemPrompt(template: string): string {
  const today = new Date().toISOString().split("T")[0];
  return `你是一个专业的产品经理助手，擅长撰写PRD（产品需求文档）。
请根据用户的描述，生成一份完整的PRD文档。

## 模板格式（必须严格遵循）

${template}

## 生成规则

1. 严格按照上述模板的章节结构输出，不要遗漏任何章节
2. YAML frontmatter 中 title 填写简洁的需求标题（不带方括号），created 和 updated 填写 ${today}，status 填写"草稿"
3. 根据用户描述尽可能充实各章节内容
4. 必填章节（标注 * 的）如果用户没提到，填写"暂无"
5. 选填章节保留标题，内容填"暂无"
6. 保留模板中所有表格结构，根据描述填入对应行
7. 如果用户描述了多个功能点，每个功能用独立的"# N. 功能N 功能标题"章节描述
8. 直接输出 markdown 内容，不要用代码块包裹`;
}

export async function POST(req: Request) {
  try {
    if (!AUTH_TOKEN) {
      return errorResponse("请在 .env.local 中配置 ANTHROPIC_AUTH_TOKEN");
    }

    const { description } = await req.json();
    if (!description || typeof description !== "string") {
      return errorResponse("参数错误，description 必须是字符串", 400);
    }

    const templatePath = join(process.cwd(), "Templates", "PRD模板.md");
    let template: string;
    try {
      template = readFileSync(templatePath, "utf-8");
    } catch {
      return errorResponse("无法读取 PRD 模板文件 (Templates/PRD模板.md)");
    }

    const systemPrompt = buildSystemPrompt(template);

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
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `请根据以下描述生成PRD文档：\n\n${description}`,
          },
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
              let filename = "未命名需求文档";
              const titleMatch = fullContent.match(/title:\s*"?([^"\n]+)"?/);
              if (titleMatch) {
                filename = titleMatch[1].replace(/[[\]]/g, "").trim();
              } else {
                const headingMatch = fullContent.match(/^#\s+(.+)$/m);
                if (headingMatch) {
                  filename = headingMatch[1].trim();
                }
              }

              // sanitize filename
              filename = filename.replace(/[/\\:*?"<>|]/g, "_");

              const docsDir = join(process.cwd(), "Docs");
              if (!existsSync(docsDir)) {
                mkdirSync(docsDir, { recursive: true });
              }

              const filePath = join(docsDir, `${filename}.md`);
              writeFileSync(filePath, fullContent, "utf-8");

              const saveMsg = `\n\n---\n[PRD_SAVED] Docs/${filename}.md`;
              controller.enqueue(encoder.encode(saveMsg));
            } catch (err) {
              const msg = err instanceof Error ? err.message : "未知错误";
              controller.enqueue(
                encoder.encode(`\n\n---\n[PRD_SAVE_FAILED] ${msg}`),
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
    console.error("PRD生成失败:", error);
    return errorResponse(`服务器错误：${errorMsg}`);
  }
}
