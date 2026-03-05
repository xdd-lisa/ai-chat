"use client";

import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type MessageContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type Message = {
  role: "user" | "assistant";
  content: string | MessageContentBlock[];
};

type DocFile = {
  name: string;
  displayName: string;
  updatedAt: string;
};

const PRD_CREATE_PATTERN =
  /(生成|创建|新增|新加|写|做|出)(个|一个|一份|一篇)?(原型|PRD|prd|需求文档|产品文档|产品需求|功能设计|需求设计|需求)/;

const PRD_EDIT_PATTERN =
  /(修改|更新|编辑|改|调整|完善|补充)(一下|下)?(原型|PRD|prd|需求文档|产品文档|产品需求|功能设计|需求设计|需求)/;

type InputMode = "chat" | "create" | "edit";

function detectMode(text: string): InputMode {
  if (PRD_CREATE_PATTERN.test(text)) return "create";
  if (PRD_EDIT_PATTERN.test(text)) return "edit";
  return "chat";
}

function parseSaveMarker(content: string): string | null {
  const m =
    content.match(/\[PRD_SAVED]\s*(.+)/) ||
    content.match(/\[DOC_UPDATED]\s*(.+)/);
  return m ? m[1].trim() : null;
}

function stripMarkers(content: string): string {
  return content
    .replace(/\n---\n\[PRD_SAVED]\s*.+/, "")
    .replace(/\n---\n\[PRD_SAVE_FAILED]\s*.+/, "")
    .replace(/\n---\n\[DOC_UPDATED]\s*.+/, "")
    .replace(/\n---\n\[DOC_UPDATE_FAILED]\s*.+/, "");
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function findMatchingDoc(input: string, docs: DocFile[]): DocFile | null {
  for (const doc of docs) {
    if (input.includes(doc.displayName)) return doc;
  }
  return null;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<InputMode>("chat");
  const [docList, setDocList] = useState<DocFile[] | null>(null);
  const [selectedImages, setSelectedImages] = useState<
    { id: string; url: string }[]
  >([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentMode = useMemo(() => detectMode(inputValue), [inputValue]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever messages/docList change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, docList]);

  async function streamResponse(
    url: string,
    body: object,
    onDone: (fullText: string) => void,
  ) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorMsg = `请求失败 (${response.status})`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
      } catch {
        // non-JSON
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
          idx === prev.length - 1 ? { ...msg, content: assistantContent } : msg,
        ),
      );
    }

    if (!assistantContent) throw new Error("未收到有效回复，请重试");
    onDone(assistantContent);
  }

  const handleEditMode = async (content: string) => {
    const newUserMessage: Message = { role: "user", content };
    setMessages((prev) => [...prev, newUserMessage]);
    setInputValue("");
    setIsLoading(true);
    setActiveMode("edit");
    setDocList(null);
    setSavedPath(null);

    try {
      const res = await fetch("/api/docs");
      if (!res.ok) throw new Error("获取文档列表失败");
      const data = await res.json();
      const files: DocFile[] = data.files;

      if (files.length === 0) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "当前 Docs 目录下没有文档。请先生成一份需求文档。",
          },
        ]);
        return;
      }

      const matched = findMatchingDoc(content, files);

      if (matched) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `正在用 AI 修改文档「${matched.displayName}」...`,
          },
        ]);

        setMessages((prev) => prev.slice(0, -1));

        await streamResponse(
          "/api/update-doc",
          { filename: matched.name, instructions: content },
          (fullText) => {
            const path = parseSaveMarker(fullText);
            if (path) setSavedPath(path);
          },
        );
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "未能从输入中匹配到具体文档名称，请选择要编辑的文档：",
          },
        ]);
        setDocList(files);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "操作失败";
      setError(msg);
    } finally {
      setIsLoading(false);
      setActiveMode("chat");
    }
  };

  const sendMessage = async () => {
    const text = inputValue.trim();
    const hasImages = selectedImages.length > 0;
    if ((!text && !hasImages) || isLoading) return;

    setError("");
    setSavedPath(null);
    setDocList(null);

    const mode = text ? detectMode(text) : "chat";

    if (mode === "edit") {
      setSelectedImages([]);
      return handleEditMode(text);
    }

    const isPRD = mode === "create";

    const userContent: string | MessageContentBlock[] = hasImages
      ? [
          ...(text ? [{ type: "text" as const, text }] : []),
          ...selectedImages.map(({ url }) => ({
            type: "image_url" as const,
            image_url: { url },
          })),
        ]
      : text;

    const newUserMessage: Message = { role: "user", content: userContent };
    const newMessages = [...messages, newUserMessage];
    setMessages(newMessages);
    setInputValue("");
    setSelectedImages([]);
    setIsLoading(true);
    if (isPRD) setActiveMode("create");

    try {
      const url = isPRD ? "/api/generate-prd" : "/api/chat";
      const body = isPRD ? { description: text } : { messages: newMessages };

      await streamResponse(url, body, (fullText) => {
        if (isPRD) {
          const path = parseSaveMarker(fullText);
          if (path) setSavedPath(path);
        }
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "发送消息失败";
      setError(errorMsg);
      setMessages(newMessages);
    } finally {
      setIsLoading(false);
      setActiveMode("chat");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) addImageFile(file);
    e.target.value = "";
  };

  const addImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setSelectedImages((prev) => [...prev, { id, url }]);
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;
    e.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) addImageFile(file);
    }
  };

  const removeImage = (id: string) => {
    setSelectedImages((prev) => prev.filter((img) => img.id !== id));
  };

  const renderMessageContent = (msg: Message) => {
    if (msg.role === "assistant") {
      const text = typeof msg.content === "string" ? msg.content : "";
      const display = stripMarkers(text);
      if (!display && isLoading) {
        if (activeMode === "create") return "正在生成PRD文档...";
        if (activeMode === "edit") return "正在修改文档...";
        return "思考中...";
      }
      return display;
    }

    if (typeof msg.content === "string") return msg.content;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {msg.content.map((block) => {
          if (block.type === "text") {
            return block.text ? (
              <span
                key={`text-${block.text.slice(0, 32)}`}
                style={{ whiteSpace: "pre-wrap" }}
              >
                {block.text}
              </span>
            ) : null;
          }
          if (block.type === "image_url") {
            const urlKey = block.image_url.url.slice(-32);
            return (
              <img
                key={`img-${urlKey}`}
                src={block.image_url.url}
                alt="图片"
                style={{
                  maxWidth: "100%",
                  maxHeight: 300,
                  borderRadius: 8,
                  objectFit: "contain",
                  display: "block",
                }}
              />
            );
          }
          return null;
        })}
      </div>
    );
  };

  const badgeConfig: Record<
    InputMode,
    { text: string; bg: string; color: string; border: string } | null
  > = {
    chat: null,
    create: {
      text: "将以 PRD 模式生成需求文档并保存到 Docs 目录",
      bg: "#f9f0ff",
      color: "#722ed1",
      border: "#efdbff",
    },
    edit: {
      text: "AI 将自动识别并修改对应的需求文档",
      bg: "#e6f7ff",
      color: "#096dd9",
      border: "#91d5ff",
    },
  };

  const badge = badgeConfig[currentMode];

  const buttonLabel = isLoading
    ? activeMode === "create"
      ? "生成中..."
      : activeMode === "edit"
        ? "修改中..."
        : "发送中..."
    : currentMode === "create"
      ? "生成PRD"
      : currentMode === "edit"
        ? "AI修改"
        : "发送";

  const isInputEmpty = !inputValue.trim() && selectedImages.length === 0;

  const buttonColor =
    isLoading || isInputEmpty
      ? "#b0c4de"
      : currentMode === "create"
        ? "#722ed1"
        : currentMode === "edit"
          ? "#096dd9"
          : "#1890ff";

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Claude 聊天助手</h1>

      <div style={styles.chatContainer}>
        <div style={styles.messagesContainer}>
          {messages.length === 0 ? (
            <div style={styles.emptyState}>
              <div>输入消息开始聊天吧</div>
              <div style={styles.emptyHint}>
                「生成/创建 + 需求文档」自动生成PRD
                <br />
                「修改/更新 + 文档名 + 修改内容」AI 自动修改并保存
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

          {docList && docList.length > 0 && (
            <div style={styles.docListCard}>
              {docList.map((doc) => (
                <a
                  key={doc.name}
                  href={`/docs/${encodeURIComponent(doc.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.docItem}
                >
                  <span style={styles.docIcon}>&#128196;</span>
                  <span style={styles.docName}>{doc.displayName}</span>
                  <span style={styles.docTime}>
                    {formatTime(doc.updatedAt)}
                  </span>
                  <span style={styles.docArrow}>&#8594;</span>
                </a>
              ))}
            </div>
          )}

          {savedPath && (
            <div style={styles.savedBanner}>
              <span style={styles.savedIcon}>&#9989;</span>
              <span>
                文档已保存至：<strong>{savedPath}</strong>
              </span>
              <a
                href={`/docs/${encodeURIComponent(savedPath.replace(/^Docs\//, ""))}`}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.previewLink}
              >
                预览 &amp; 编辑
              </a>
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
          {badge && !isLoading && (
            <div
              style={{
                ...styles.modeBadge,
                backgroundColor: badge.bg,
                color: badge.color,
                borderBottomColor: badge.border,
              }}
            >
              <span style={styles.modeBadgeIcon}>&#128196;</span>
              {badge.text}
            </div>
          )}
          <div style={styles.inputContainer}>
            <div style={styles.inputWrapper}>
              {selectedImages.length > 0 && (
                <div style={styles.imagePreviewArea}>
                  {selectedImages.map((img) => (
                    <div key={img.id} style={styles.imagePreviewItem}>
                      <img
                        src={img.url}
                        alt="预览"
                        style={styles.imagePreviewThumb}
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(img.id)}
                        style={styles.imageRemoveButton}
                        title="移除图片"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="输入消息，按回车发送（Shift+Enter换行）..."
                disabled={isLoading}
                style={styles.textarea}
                rows={1}
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={handleImageSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              style={{
                ...styles.uploadButton,
                cursor: isLoading ? "not-allowed" : "pointer",
                opacity: isLoading ? 0.5 : 1,
              }}
              title="上传图片"
            >
              🖼
            </button>
            <button
              type="button"
              onClick={sendMessage}
              disabled={isLoading || isInputEmpty}
              style={{
                ...styles.sendButton,
                backgroundColor: buttonColor,
                cursor: isLoading || isInputEmpty ? "not-allowed" : "pointer",
              }}
            >
              {buttonLabel}
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
    textAlign: "center",
    lineHeight: 1.8,
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
  docListCard: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginLeft: 46,
    maxWidth: "70%",
  },
  docItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    backgroundColor: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    textDecoration: "none",
    color: "#333",
    transition: "all 0.15s",
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  docIcon: {
    fontSize: 18,
    flexShrink: 0,
  },
  docName: {
    flex: 1,
    fontSize: 14,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as CSSProperties["whiteSpace"],
  },
  docTime: {
    fontSize: 12,
    color: "#999",
    whiteSpace: "nowrap" as CSSProperties["whiteSpace"],
  },
  docArrow: {
    fontSize: 14,
    color: "#1890ff",
    flexShrink: 0,
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
    flexWrap: "wrap" as CSSProperties["flexWrap"],
  },
  savedIcon: {
    fontSize: 16,
  },
  previewLink: {
    marginLeft: "auto",
    padding: "4px 14px",
    backgroundColor: "#1890ff",
    color: "#fff",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    textDecoration: "none",
    whiteSpace: "nowrap" as CSSProperties["whiteSpace"],
  },
  inputArea: {
    borderTop: "1px solid #e0e0e0",
    backgroundColor: "#fff",
  },
  modeBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 16px",
    fontSize: 13,
    borderBottom: "1px solid",
  },
  modeBadgeIcon: {
    fontSize: 14,
  },
  inputContainer: {
    display: "flex",
    gap: 10,
    padding: 16,
    alignItems: "flex-end",
  },
  inputWrapper: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    border: "1px solid #d9d9d9",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  imagePreviewArea: {
    display: "flex",
    flexWrap: "wrap" as CSSProperties["flexWrap"],
    gap: 8,
    padding: "8px 10px 4px",
  },
  imagePreviewItem: {
    position: "relative" as CSSProperties["position"],
    display: "inline-block",
  },
  imagePreviewThumb: {
    width: 60,
    height: 60,
    objectFit: "cover" as CSSProperties["objectFit"],
    borderRadius: 6,
    border: "1px solid #e0e0e0",
    display: "block",
  },
  imageRemoveButton: {
    position: "absolute" as CSSProperties["position"],
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: "50%",
    backgroundColor: "#ff4d4f",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    lineHeight: 1,
    padding: 0,
    fontWeight: 700,
  },
  textarea: {
    flex: 1,
    padding: "10px 14px",
    border: "none",
    outline: "none",
    resize: "none" as CSSProperties["resize"],
    fontFamily: "inherit",
    fontSize: 15,
    lineHeight: 1.5,
    minHeight: 20,
    maxHeight: 120,
    backgroundColor: "transparent",
  },
  uploadButton: {
    padding: "10px 12px",
    border: "1px solid #d9d9d9",
    borderRadius: 8,
    backgroundColor: "#fff",
    fontSize: 18,
    alignSelf: "flex-end",
    lineHeight: 1,
    transition: "background-color 0.2s",
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
