import { useCallback, useEffect, useRef, useState } from "react";
import { api, fileDownloadUrl, setUnauthorizedHandler } from "../api";
import { subscribeConversationEvents } from "../sse";
import type {
  ChatMessage,
  Conversation,
  FileEntry,
  MessagePart,
  PendingPermission,
  PendingQuestion,
  QuestionItem,
  Recommendation,
  ServerEvent,
  SessionStatus,
  SkillSummary,
  TodoItem,
} from "../types";
import ConversationList from "../components/ConversationList";
import MessageList from "../components/MessageList";
import Composer from "../components/Composer";
import RecommendationPanel from "../components/RecommendationPanel";
import FilePanel from "../components/FilePanel";
import SkillPanel from "../components/SkillPanel";

type RightTab = "recommendation" | "files" | "skills";

const TAB_LABELS: Record<RightTab, string> = {
  recommendation: "下一句",
  files: "文件",
  skills: "Skills",
};

/** 流式消息状态：按 part_id 有序累积 */
interface StreamState {
  order: string[];
  byId: Record<string, MessagePart>;
}

const EMPTY_STREAM: StreamState = { order: [], byId: {} };

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 容错解析 opencode 原始 questions 结构 */
function parseQuestions(raw: unknown): QuestionItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((q) => {
    if (q && typeof q === "object") {
      const o = q as Record<string, unknown>;
      return {
        question: typeof o.question === "string" ? o.question : undefined,
        header: typeof o.header === "string" ? o.header : undefined,
        multiple: o.multiple === true,
        options: Array.isArray(o.options)
          ? o.options.map((opt) => {
              if (opt && typeof opt === "object") {
                const oo = opt as Record<string, unknown>;
                return {
                  label: typeof oo.label === "string" ? oo.label : String(opt),
                  description: typeof oo.description === "string" ? oo.description : undefined,
                };
              }
              return { label: String(opt) };
            })
          : undefined,
      };
    }
    return { question: String(q) };
  });
}

export default function ChatPage() {
  // 全局
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [opencodeDown, setOpencodeDown] = useState(false);
  const [sseConnected, setSseConnected] = useState(true);
  /** 任意 API 返回 401 时置 true，显示认证失败提示条 */
  const [authError, setAuthError] = useState(false);
  const [tab, setTab] = useState<RightTab>("recommendation");
  const [skills, setSkills] = useState<SkillSummary[]>([]);

  // 当前会话
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stream, setStream] = useState<StreamState>(EMPTY_STREAM);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("idle");
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [questions, setQuestions] = useState<PendingQuestion[]>([]);
  const [permissions, setPermissions] = useState<PendingPermission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  /** 发送失败的消息内容，用于「重试」 */
  const [failedMessage, setFailedMessage] = useState<string | null>(null);

  // 竞态防护：await 后校验会话未切换；发送 POST 在途标记
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const sendingRef = useRef(false);

  // 推荐与文件
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);

  // 健康检查（挂载 / 选中会话 / done / error 后都会刷新）
  const refreshHealth = useCallback(() => {
    api
      .getHealth()
      .then((h) => setOpencodeDown(h.opencode == null))
      .catch(() => setOpencodeDown(true));
  }, []);

  // ---------- 初始加载：健康检查 + 会话列表 + Skills ----------
  useEffect(() => {
    // 注册 401 回调：任意 API 认证失败时提示
    setUnauthorizedHandler(() => setAuthError(true));
    refreshHealth();
    api
      .listConversations()
      .then((list) => {
        setConversations(list);
        if (list.length > 0) setActiveId((cur) => cur ?? list[0].id);
      })
      .catch((e) => setError(`加载会话列表失败：${errMsg(e)}`));
    loadSkills();
  }, []);

  // ---------- 会话切换：拉历史 + 建 SSE + 拉推荐/文件 ----------
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;

    // 清空上一个会话的状态
    setMessages([]);
    setStream(EMPTY_STREAM);
    setTodos([]);
    setQuestions([]);
    setPermissions([]);
    setError(null);
    setFailedMessage(null);
    setSessionStatus("idle");
    setRecommendation(null);
    setRecLoading(false);
    setFiles([]);
    refreshHealth();

    const handleEvent = (ev: ServerEvent) => {
      switch (ev.type) {
        case "text_delta":
        case "reasoning_delta": {
          const partType = ev.type === "text_delta" ? "text" : "reasoning";
          setStream((prev) => {
            const old = prev.byId[ev.part_id];
            const part: MessagePart = old
              ? { ...old, text: (old.text ?? "") + ev.content }
              : { id: ev.part_id, type: partType, text: ev.content };
            return {
              order: old ? prev.order : [...prev.order, ev.part_id],
              byId: { ...prev.byId, [ev.part_id]: part },
            };
          });
          break;
        }
        case "tool_update": {
          setStream((prev) => {
            const old = prev.byId[ev.part_id];
            const part: MessagePart = {
              id: ev.part_id,
              type: "tool",
              tool: ev.tool ?? old?.tool,
              call_id: ev.call_id ?? old?.call_id,
              status: ev.status ?? old?.status,
              input: ev.input !== undefined ? ev.input : old?.input,
              output: ev.output ?? old?.output,
              error: ev.error ?? old?.error,
              title: ev.title ?? old?.title,
            };
            return {
              order: old ? prev.order : [...prev.order, ev.part_id],
              byId: { ...prev.byId, [ev.part_id]: part },
            };
          });
          break;
        }
        case "question_request":
          setQuestions((prev) =>
            prev.some((q) => q.request_id === ev.request_id)
              ? prev
              : [
                  ...prev,
                  {
                    request_id: ev.request_id,
                    call_id: ev.call_id,
                    part_id: ev.part_id,
                    questions: parseQuestions(ev.questions),
                  },
                ]
          );
          break;
        case "question_rejected":
          // 服务端已无该 question 的 pending 记录（如 OpenCode 重启），移除失效卡片
          setQuestions((prev) =>
            prev.filter((q) => {
              const matchCall = ev.call_id !== undefined && q.call_id === ev.call_id;
              const matchPart = ev.part_id !== undefined && q.part_id === ev.part_id;
              return !matchCall && !matchPart;
            })
          );
          break;
        case "permission_request":
          setPermissions((prev) =>
            prev.some((p) => p.request_id === ev.request_id)
              ? prev
              : [
                  ...prev,
                  {
                    request_id: ev.request_id,
                    call_id: ev.call_id,
                    part_id: ev.part_id,
                    permission: ev.permission,
                  },
                ]
          );
          break;
        case "todo_updated":
          setTodos(Array.isArray(ev.todos) ? ev.todos : []);
          break;
        case "session_status":
          setSessionStatus(ev.status);
          break;
        case "title_updated":
          setConversations((prev) =>
            prev.map((c) => (c.id === activeId ? { ...c, title: ev.title } : c))
          );
          break;
        case "done":
          // 本轮结束：以服务端为准重新拉取消息，并刷新文件列表
          setSessionStatus("idle");
          setStream(EMPTY_STREAM);
          api
            .getMessages(activeId)
            .then((res) => !cancelled && setMessages(res.messages))
            .catch(() => {});
          api
            .listFiles(activeId)
            .then((res) => !cancelled && setFiles(res.files))
            .catch(() => {});
          // 顺带刷新会话列表，拿到最新 total_tokens
          api
            .listConversations()
            .then((res) => !cancelled && setConversations(res))
            .catch(() => {});
          refreshHealth();
          break;
        case "error":
          // 非 abort 的 session.error：清空流式残留，回捞服务端已落盘的部分
          setError(ev.content);
          setSessionStatus("idle");
          setStream(EMPTY_STREAM);
          api
            .getMessages(activeId)
            .then((res) => !cancelled && setMessages(res.messages))
            .catch(() => {});
          refreshHealth();
          break;
        case "recommendation_started":
          setRecLoading(true);
          break;
        case "recommendation_ready":
          api
            .getRecommendation(activeId)
            .then((res) => {
              if (cancelled) return;
              setRecommendation(res.recommendation);
              setRecLoading(false);
            })
            .catch(() => !cancelled && setRecLoading(false));
          break;
      }
    };

    api
      .getMessages(activeId)
      .then((res) => !cancelled && setMessages(res.messages))
      .catch((e) => !cancelled && setError(`加载消息失败：${errMsg(e)}`));

    // SSE 断线重连后的自愈：等价补一次 done 处理（首次连接不触发）
    let disconnected = false;
    const recoverFromReconnect = () => {
      setStream(EMPTY_STREAM);
      setSessionStatus("idle"); // 无后续事件时的兜底
      api
        .getMessages(activeId)
        .then((res) => !cancelled && setMessages(res.messages))
        .catch(() => {});
      api
        .listFiles(activeId)
        .then((res) => !cancelled && setFiles(res.files))
        .catch(() => {});
    };
    const closeEvents = subscribeConversationEvents(activeId, handleEvent, (connected) => {
      if (cancelled) return;
      setSseConnected(connected);
      if (!connected) {
        disconnected = true;
      } else if (disconnected) {
        // 由断开转为重连成功，执行自愈
        disconnected = false;
        recoverFromReconnect();
      }
    });

    api
      .getRecommendation(activeId)
      .then((res) => !cancelled && setRecommendation(res.recommendation))
      .catch(() => {});
    api
      .listFiles(activeId)
      .then((res) => !cancelled && setFiles(res.files))
      .catch(() => {});

    return () => {
      cancelled = true;
      closeEvents();
    };
  }, [activeId]);

  // ---------- 会话操作 ----------
  const handleCreate = async () => {
    try {
      const conv = await api.createConversation();
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conv.id);
    } catch (e) {
      setError(`创建会话失败：${errMsg(e)}`);
    }
  };

  // 删除确认已在会话列表内联完成
  const handleDelete = async (id: string) => {
    try {
      await api.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) setActiveId(null);
    } catch (e) {
      setError(`删除会话失败：${errMsg(e)}`);
    }
  };

  // ---------- 消息发送 / 中止 / 重试 ----------
  const sendMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      // 生成中 / 上一条 POST 在途时忽略，防止双击或连按重复发送
      if (!activeId || !text || sendingRef.current || sessionStatus === "running") return;
      const cid = activeId;
      sendingRef.current = true;
      setError(null);
      // 乐观追加用户消息
      const localMsg: ChatMessage = {
        id: `local-${Date.now()}`,
        role: "user",
        time: { created: Date.now() / 1000 },
        parts: [{ id: `local-p-${Date.now()}`, type: "text", text }],
      };
      setMessages((prev) => [...prev, localMsg]);
      setDraft("");
      try {
        await api.sendMessage(cid, text);
        // POST 在途期间用户可能已切换会话，校验后再写状态，避免污染新会话
        if (activeIdRef.current !== cid) return;
        setFailedMessage(null);
        setSessionStatus("running");
      } catch (e) {
        if (activeIdRef.current !== cid) return;
        setFailedMessage(text);
        setError(`发送失败：${errMsg(e)}（OpenCode 可能未运行）`);
        setSessionStatus("idle");
      } finally {
        sendingRef.current = false;
      }
    },
    [activeId, sessionStatus]
  );

  // 重发失败的消息（不重复追加用户气泡）
  const handleRetry = async () => {
    if (!activeId || failedMessage == null || sendingRef.current) return;
    const cid = activeId;
    sendingRef.current = true;
    setError(null);
    try {
      await api.sendMessage(cid, failedMessage);
      if (activeIdRef.current !== cid) return;
      setFailedMessage(null);
      setSessionStatus("running");
    } catch (e) {
      if (activeIdRef.current !== cid) return;
      setError(`发送失败：${errMsg(e)}（OpenCode 可能未运行）`);
      setSessionStatus("idle");
    } finally {
      sendingRef.current = false;
    }
  };

  const handleAbort = async () => {
    if (!activeId) return;
    try {
      await api.abortConversation(activeId);
    } catch (e) {
      setError(`中止失败：${errMsg(e)}`);
    }
  };

  // ---------- Question / Permission ----------
  const handleQuestionReply = async (q: PendingQuestion, answers: string[][]) => {
    if (!activeId) return;
    // 立即移除卡片，再提交
    setQuestions((prev) => prev.filter((x) => x.request_id !== q.request_id));
    try {
      await api.replyQuestion(activeId, q.request_id, answers);
    } catch (e) {
      setError(`提交回答失败：${errMsg(e)}`);
    }
  };

  const handleQuestionReject = async (q: PendingQuestion) => {
    if (!activeId) return;
    setQuestions((prev) => prev.filter((x) => x.request_id !== q.request_id));
    try {
      await api.rejectQuestion(activeId, q.request_id);
    } catch (e) {
      setError(`拒绝提问失败：${errMsg(e)}`);
    }
  };

  const handlePermissionReply = async (
    p: PendingPermission,
    reply: "once" | "always" | "reject"
  ) => {
    if (!activeId) return;
    setPermissions((prev) => prev.filter((x) => x.request_id !== p.request_id));
    try {
      await api.replyPermission(activeId, p.request_id, reply);
    } catch (e) {
      setError(`回复权限请求失败：${errMsg(e)}`);
    }
  };

  // ---------- 文件 ----------
  const refreshFiles = useCallback(async () => {
    if (!activeId) return;
    try {
      const res = await api.listFiles(activeId);
      setFiles(res.files);
    } catch {
      // 忽略刷新失败
    }
  }, [activeId]);

  const handleUploadFile = async (file: File) => {
    if (!activeId) return;
    try {
      await api.uploadFile(activeId, file);
      await refreshFiles();
    } catch (e) {
      setError(`上传文件失败：${errMsg(e)}`);
    }
  };

  const handleDeleteFile = async (path: string) => {
    if (!activeId || !window.confirm(`确定删除文件 ${path}？`)) return;
    try {
      await api.deleteFile(activeId, path);
      await refreshFiles();
    } catch (e) {
      setError(`删除文件失败：${errMsg(e)}`);
    }
  };

  // ---------- Skills ----------
  async function loadSkills() {
    try {
      const res = await api.listSkills();
      setSkills(res.skills);
    } catch {
      // 忽略加载失败
    }
  }

  const handleUploadSkill = async (file: File) => {
    try {
      await api.uploadSkill(file);
      await loadSkills();
    } catch (e) {
      setError(`上传 Skill 失败：${errMsg(e)}`);
    }
  };

  const handleDeleteSkill = async (name: string) => {
    if (!window.confirm(`确定归档 Skill「${name}」？`)) return;
    try {
      await api.deleteSkill(name);
      await loadSkills();
    } catch (e) {
      setError(`归档 Skill 失败：${errMsg(e)}`);
    }
  };

  // ---------- 推荐 / 阶段 ----------
  const handleRegenerate = async () => {
    if (!activeId) return;
    setRecLoading(true);
    try {
      await api.regenerateRecommendation(activeId);
      // 生成完成后由 SSE recommendation_ready 触发刷新
    } catch (e) {
      setRecLoading(false);
      setError(`重新生成推荐失败：${errMsg(e)}`);
    }
  };

  const handleStageChange = async (stage: string | null) => {
    if (!activeId) return;
    try {
      const conv =
        stage === null
          ? await api.updateConversation(activeId, { stage_mode: "auto" })
          : await api.setStage(activeId, stage, "manual");
      setConversations((prev) => prev.map((c) => (c.id === conv.id ? conv : c)));
    } catch (e) {
      setError(`设置阶段失败：${errMsg(e)}`);
    }
  };

  // ---------- 渲染 ----------
  const activeConv = conversations.find((c) => c.id === activeId) ?? null;
  const streamParts = stream.order.map((id) => stream.byId[id]);
  const running = sessionStatus === "running";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="pane-header">会话</div>
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={setActiveId}
          onCreate={handleCreate}
          onDelete={handleDelete}
        />
      </aside>

      <main className="chat">
        <div className="pane-header">{activeConv ? activeConv.title || "未命名会话" : "对话"}</div>
        {opencodeDown && (
          <div className="health-banner">
            OpenCode 未运行，请先执行 runtime/start-opencode.sh
          </div>
        )}
        {authError && (
          <div className="auth-banner">
            <span>认证失败：请检查前端 .env 的 VITE_SIMPLE_TOKEN 是否与后端一致</span>
            <button
              className="auth-banner-close"
              title="关闭"
              onClick={() => setAuthError(false)}
            >
              ×
            </button>
          </div>
        )}
        {activeConv && !sseConnected && (
          <div className="sse-banner">连接中断，重连中…</div>
        )}
        {activeConv ? (
          <>
            <MessageList
              messages={messages}
              streamParts={streamParts}
              streaming={running}
              todos={todos}
              questions={questions}
              permissions={permissions}
              error={error}
              canRetry={failedMessage != null}
              onDismissError={() => setError(null)}
              onRetry={handleRetry}
              onQuestionReply={handleQuestionReply}
              onQuestionReject={handleQuestionReject}
              onPermissionReply={handlePermissionReply}
            />
            <Composer
              value={draft}
              onChange={setDraft}
              onSend={() => sendMessage(draft)}
              onAbort={handleAbort}
              running={running}
              disabled={false}
            />
          </>
        ) : (
          <div className="welcome">
            <h1 className="welcome-title">Skill Growth Chat Lite</h1>
            <p className="welcome-sub">基于 OpenCode 的个人本地对话应用</p>
            <ul className="welcome-steps">
              <li>
                <span className="step-num">1</span>点击左侧「+ 新建会话」，创建一个会话
              </li>
              <li>
                <span className="step-num">2</span>在底部输入框发消息，与 OpenCode 对话
              </li>
              <li>
                <span className="step-num">3</span>在右侧「下一句」面板查看推荐语句
              </li>
            </ul>
          </div>
        )}
      </main>

      <aside className="rightbar">
        <div className="pane-header">{TAB_LABELS[tab]}</div>
        <div className="tabs">
          <button
            className={tab === "recommendation" ? "tab active" : "tab"}
            onClick={() => setTab("recommendation")}
          >
            下一句
          </button>
          <button
            className={tab === "files" ? "tab active" : "tab"}
            onClick={() => setTab("files")}
          >
            文件
          </button>
          <button
            className={tab === "skills" ? "tab active" : "tab"}
            onClick={() => setTab("skills")}
          >
            Skills
          </button>
        </div>
        <div className="tab-content">
          {tab === "recommendation" && (
            <RecommendationPanel
              conversation={activeConv}
              recommendation={recommendation}
              loading={recLoading}
              running={running}
              onRegenerate={handleRegenerate}
              onFill={setDraft}
              onSend={sendMessage}
              onStageChange={handleStageChange}
            />
          )}
          {tab === "files" &&
            (activeId ? (
              <FilePanel
                files={files}
                onUpload={handleUploadFile}
                onDelete={handleDeleteFile}
                onRefresh={refreshFiles}
                downloadUrl={(p) => fileDownloadUrl(activeId, p)}
              />
            ) : (
              <div className="panel-empty">请先选择会话</div>
            ))}
          {tab === "skills" && (
            <SkillPanel
              skills={skills}
              onUpload={handleUploadSkill}
              onDelete={handleDeleteSkill}
              getDetail={api.getSkill}
            />
          )}
        </div>
      </aside>
    </div>
  );
}
