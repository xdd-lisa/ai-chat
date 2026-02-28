"use client";

import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const PRD_KEYWORDS = [
  "原型",
  "PRD",
  "需求文档",
  "产品文档",
  "产品需求",
  "功能设计",
  "需求设计",
  "写个需求",
  "写个PRD",
  "生成文档",
];

function detectPRD(text: string): boolean {
  return PRD_KEYWORDS.some((kw) => text.includes(kw));
}

function parsePRDSavePath(content: string): string | null {
  const match = content.match(/\[PRD_SAVED]\s*(.+)/);
  return match ? match[1].trim() : null;
}

function formatDisplayContent(content: string): string {
  return content
    .replace(/\n---\n\[PRD_SAVED]\s*.+/, "")
    .replace(/\n---\n\[PRD_SAVE_FAILED]\s*.+/, "");
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [isPRDGenerating, setIsPRDGenerating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const prdDetected = useMemo(() => detectPRD(inputValue), [inputValue]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever messages array changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const content = inputValue.trim();
    if (!content || isLoading) return;

    setError("");
    setSavedPath(null);

    const isPRD = detectPRD(content);

    const newUserMessage: Message = { role: "user", content };
    const newMessages = [...messages, newUserMessage];
    setMessages(newMessages);
    setInputValue("");
    setIsLoading(true);
    if (isPRD) setIsPRDGenerating(true);

    try {
      const url = isPRD ? "/api/generate-prd" : "/api/chat";
      const body = isPRD
        ? JSON.stringify({ description: content })
        : JSON.stringify({ messages: newMessages });

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!response.ok) {
        let errorMsg = `请求失败 (${response.status})`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          // non-JSON response
        }
        throw new Error(errorMsg);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("无法读取响应流");

      const decoder = new TextDecoder();
      let assistantContent = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        assistantContent += chunk;

        setMessages((prev) =>
          prev.map((msg, idx) =>
            idx === prev.length - 1
              ? { ...msg, content: assistantContent }
              : msg,
          ),
        );
      }

      if (!assistantContent) {
        throw new Error("未收到有效回复，请重试");
      }

      if (isPRD) {
        const path = parsePRDSavePath(assistantContent);
        if (path) setSavedPath(path);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "发送消息失败";
      setError(errorMsg);
      setMessages(newMessages);
    } finally {
      setIsLoading(false);
      setIsPRDGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const renderMessageContent = (msg: Message) => {
    const display =
      msg.role === "assistant"
        ? formatDisplayContent(msg.content)
        : msg.content;

    if (!display && msg.role === "assistant" && isLoading) {
      return isPRDGenerating ? "正在生成PRD文档..." : "思考中...";
    }
    return display;
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Claude 聊天助手</h1>

      <div style={styles.chatContainer}>
        <div style={styles.messagesContainer}>
          {messages.length === 0 ? (
            <div style={styles.emptyState}>
              <div>输入消息开始聊天吧</div>
              <div style={styles.emptyHint}>
                输入含「原型」「PRD」「需求文档」等关键字可自动生成PRD文档
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={`${msg.role}-${idx}`}
                style={{
                  ...styles.messageRow,
                  justifyContent:
                    msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                {msg.role === "assistant" && (
                  <div style={styles.avatar}>AI</div>
                )}
                <div
                  style={{
                    ...styles.messageBubble,
                    backgroundColor:
                      msg.role === "user" ? "#1890ff" : "#ffffff",
                    color: msg.role === "user" ? "#fff" : "#333",
                    borderBottomRightRadius: msg.role === "user" ? 4 : 16,
                    borderBottomLeftRadius: msg.role === "assistant" ? 4 : 16,
                  }}
                >
                  <div style={styles.messageContent}>
                    {renderMessageContent(msg)}
                  </div>
                </div>
                {msg.role === "user" && <div style={styles.avatarUser}>我</div>}
              </div>
            ))
          )}

          {savedPath && (
            <div style={styles.savedBanner}>
              <span style={styles.savedIcon}>&#9989;</span>
              PRD文档已保存至：<strong>{savedPath}</strong>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div style={styles.error}>
            <span>&#9888;</span> {error}
          </div>
        )}

        <div style={styles.inputArea}>
          {prdDetected && !isLoading && (
            <div style={styles.prdBadge}>
              <span style={styles.prdBadgeIcon}>&#128196;</span>
              将以 PRD 模式生成需求文档并保存到 Docs 目录
            </div>
          )}
          <div style={styles.inputContainer}>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息，按回车发送（Shift+Enter换行）..."
              disabled={isLoading}
              style={styles.textarea}
              rows={1}
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={isLoading || !inputValue.trim()}
              style={{
                ...styles.sendButton,
                backgroundColor:
                  isLoading || !inputValue.trim()
                    ? "#b0c4de"
                    : prdDetected
                      ? "#722ed1"
                      : "#1890ff",
                cursor:
                  isLoading || !inputValue.trim() ? "not-allowed" : "pointer",
              }}
            >
              {isLoading
                ? isPRDGenerating
                  ? "生成中..."
                  : "发送中..."
                : prdDetected
                  ? "生成PRD"
                  : "发送"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    maxWidth: 800,
    margin: "0 auto",
    padding: 20,
    height: "100vh",
    display: "flex",
    flexDirection: "column",
  },
  title: {
    textAlign: "center",
    color: "#1890ff",
    margin: "0 0 16px 0",
    fontSize: 22,
    fontWeight: 600,
  },
  chatContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    border: "1px solid #e0e0e0",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fafafa",
    minHeight: 0,
  },
  messagesContainer: {
    flex: 1,
    padding: 20,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#999",
    fontSize: 16,
    gap: 8,
  },
  emptyHint: {
    fontSize: 13,
    color: "#bbb",
  },
  messageRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    backgroundColor: "#1890ff",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  },
  avatarUser: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    backgroundColor: "#52c41a",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  },
  messageBubble: {
    padding: "10px 16px",
    borderRadius: 16,
    maxWidth: "70%",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    lineHeight: 1.6,
    wordBreak: "break-word" as CSSProperties["wordBreak"],
  },
  messageContent: {
    fontSize: 15,
    whiteSpace: "pre-wrap" as CSSProperties["whiteSpace"],
  },
  error: {
    padding: "8px 16px",
    backgroundColor: "#fff2f0",
    color: "#f5222d",
    fontSize: 14,
    borderTop: "1px solid #ffccc7",
  },
  savedBanner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    backgroundColor: "#f6ffed",
    border: "1px solid #b7eb8f",
    borderRadius: 8,
    fontSize: 14,
    color: "#389e0d",
  },
  savedIcon: {
    fontSize: 16,
  },
  inputArea: {
    borderTop: "1px solid #e0e0e0",
    backgroundColor: "#fff",
  },
  prdBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 16px",
    backgroundColor: "#f9f0ff",
    color: "#722ed1",
    fontSize: 13,
    borderBottom: "1px solid #efdbff",
  },
  prdBadgeIcon: {
    fontSize: 14,
  },
  inputContainer: {
    display: "flex",
    gap: 10,
    padding: 16,
  },
  textarea: {
    flex: 1,
    padding: "10px 14px",
    border: "1px solid #d9d9d9",
    borderRadius: 8,
    fontSize: 15,
    outline: "none",
    resize: "none" as CSSProperties["resize"],
    fontFamily: "inherit",
    lineHeight: 1.5,
    minHeight: 20,
    maxHeight: 120,
  },
  sendButton: {
    padding: "10px 24px",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    whiteSpace: "nowrap" as CSSProperties["whiteSpace"],
    transition: "background-color 0.2s",
    alignSelf: "flex-end",
  },
};
