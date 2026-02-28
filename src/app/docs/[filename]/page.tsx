"use client";

import { marked } from "marked";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

marked.setOptions({ gfm: true, breaks: true });

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function DocEditorPage({
  params,
}: {
  params: { filename: string };
}) {
  const filename = decodeURIComponent(params.filename);
  const displayName = filename.replace(/\.md$/, "");

  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [mode, setMode] = useState<"split" | "edit" | "preview">("split");
  const [fetchError, setFetchError] = useState("");

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const hasChanges = content !== originalContent;

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/docs/${encodeURIComponent(filename)}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `加载失败 (${res.status})`);
        }
        const data = await res.json();
        setContent(data.content);
        setOriginalContent(data.content);
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : "加载文档失败");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filename]);

  const saveDoc = useCallback(async () => {
    setSaveStatus("saving");
    try {
      const res = await fetch(`/api/docs/${encodeURIComponent(filename)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "保存失败");
      }
      setOriginalContent(content);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [filename, content]);

  const handleContentChange = (value: string) => {
    setContent(value);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setSaveStatus("idle");
    }, 500);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (hasChanges) saveDoc();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasChanges, saveDoc]);

  const renderedHTML = (() => {
    try {
      return marked.parse(content) as string;
    } catch {
      return "<p>渲染失败</p>";
    }
  })();

  if (loading) {
    return (
      <div style={s.loadingContainer}>
        <div style={s.spinner} />
        <span>加载文档中...</span>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div style={s.loadingContainer}>
        <div style={s.errorBox}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>加载失败</div>
          <div style={{ marginTop: 8 }}>{fetchError}</div>
          <a href="/" style={s.backLink}>
            返回聊天
          </a>
        </div>
      </div>
    );
  }

  const saveLabel: Record<SaveStatus, string> = {
    idle: "保存",
    saving: "保存中...",
    saved: "已保存",
    error: "保存失败",
  };

  return (
    <div style={s.page}>
      {/* Top Bar */}
      <div style={s.topBar}>
        <div style={s.topLeft}>
          <a href="/" style={s.backBtn}>
            &#8592; 聊天
          </a>
          <span style={s.filename}>{displayName}</span>
          {hasChanges && <span style={s.unsavedDot} />}
        </div>
        <div style={s.topRight}>
          <div style={s.modeSwitch}>
            {(["edit", "split", "preview"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  ...s.modeBtn,
                  ...(mode === m ? s.modeBtnActive : {}),
                }}
              >
                {m === "edit" ? "编辑" : m === "split" ? "分栏" : "预览"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={saveDoc}
            disabled={!hasChanges || saveStatus === "saving"}
            style={{
              ...s.saveBtn,
              opacity: !hasChanges || saveStatus === "saving" ? 0.5 : 1,
              cursor: !hasChanges ? "default" : "pointer",
              backgroundColor:
                saveStatus === "error"
                  ? "#f5222d"
                  : saveStatus === "saved"
                    ? "#52c41a"
                    : "#1890ff",
            }}
          >
            {saveLabel[saveStatus]}
          </button>
        </div>
      </div>

      {/* Editor Area */}
      <div style={s.editorArea}>
        {(mode === "edit" || mode === "split") && (
          <div
            style={{
              ...s.pane,
              ...(mode === "split" ? s.paneHalf : s.paneFull),
            }}
          >
            <div style={s.paneHeader}>Markdown</div>
            <textarea
              ref={editorRef}
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              style={s.textarea}
              spellCheck={false}
            />
          </div>
        )}
        {mode === "split" && <div style={s.divider} />}
        {(mode === "preview" || mode === "split") && (
          <div
            style={{
              ...s.pane,
              ...(mode === "split" ? s.paneHalf : s.paneFull),
            }}
          >
            <div style={s.paneHeader}>预览</div>
            <div
              ref={previewRef}
              className="md-preview"
              style={s.previewContent}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: rendering trusted user-edited markdown
              dangerouslySetInnerHTML={{ __html: renderedHTML }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "#fff",
  },
  loadingContainer: {
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    gap: 12,
    color: "#666",
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #e0e0e0",
    borderTopColor: "#1890ff",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  errorBox: {
    textAlign: "center",
    color: "#f5222d",
  },
  backLink: {
    display: "inline-block",
    marginTop: 16,
    color: "#1890ff",
    textDecoration: "none",
  },

  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 20px",
    borderBottom: "1px solid #e5e7eb",
    background: "#fafafa",
    gap: 12,
    flexShrink: 0,
  },
  topLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  topRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexShrink: 0,
  },
  backBtn: {
    color: "#1890ff",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 500,
    whiteSpace: "nowrap",
  },
  filename: {
    fontSize: 15,
    fontWeight: 600,
    color: "#333",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  unsavedDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: "#faad14",
    flexShrink: 0,
  },
  modeSwitch: {
    display: "flex",
    border: "1px solid #d9d9d9",
    borderRadius: 6,
    overflow: "hidden",
  },
  modeBtn: {
    padding: "5px 14px",
    border: "none",
    background: "#fff",
    fontSize: 13,
    cursor: "pointer",
    color: "#666",
    borderRight: "1px solid #d9d9d9",
    transition: "all 0.15s",
  },
  modeBtnActive: {
    background: "#1890ff",
    color: "#fff",
  },
  saveBtn: {
    padding: "6px 20px",
    border: "none",
    borderRadius: 6,
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    transition: "all 0.2s",
  },

  editorArea: {
    flex: 1,
    display: "flex",
    minHeight: 0,
    overflow: "hidden",
  },
  pane: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
  },
  paneHalf: {
    width: "50%",
  },
  paneFull: {
    width: "100%",
  },
  paneHeader: {
    padding: "6px 16px",
    fontSize: 12,
    fontWeight: 600,
    color: "#999",
    background: "#f5f5f5",
    borderBottom: "1px solid #e5e7eb",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flexShrink: 0,
  },
  divider: {
    width: 1,
    background: "#e5e7eb",
    flexShrink: 0,
  },
  textarea: {
    flex: 1,
    padding: 16,
    border: "none",
    outline: "none",
    resize: "none",
    fontFamily:
      "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
    fontSize: 14,
    lineHeight: 1.7,
    background: "#fdfdfd",
    color: "#333",
    overflowY: "auto",
  },
  previewContent: {
    flex: 1,
    padding: "16px 24px",
    overflowY: "auto",
    background: "#fff",
  },
};
