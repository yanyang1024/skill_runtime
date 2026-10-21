# 实战教程：给你的对话式应用接上专业的 Markdown 流式渲染

> 面向应用构建者。跟着本教程走，你将在 1 小时内得到：一个 FastAPI 流式后端 + React 前端，AI 回复以专业级效果逐字渲染（代码高亮、表格、数学、不闪不卡）。
> 两套渲染器（Astryx Markdown / Streamdown）都会手把手接入，最后你按场景选一个留下。

---

## 你会学到什么

1. 后端怎么用 SSE 把 Markdown 增量推给前端（第 1 课）
2. 前端怎么接收流并交给渲染器（第 2 课）
3. 方案 A：Astryx Markdown 的接入与定制（第 3 课）
4. 方案 B：Streamdown 的接入与定制（第 4 课）
5. 上线前必须处理的 6 个坑（第 5 课）

**前置要求**：Python 3.10+、Node 18+、会写基础 React。不需要真的 LLM——教程用模拟流开发，最后换成你的真实接口即可。

---

## 第 0 步：30 秒选型

| 你的情况 | 选哪个 |
| --- | --- |
| 前端用 Astryx 设计系统（或打算用） | **Astryx Markdown**（第 3 课），零额外依赖，暗色/主题一体 |
| 前端是 shadcn/Tailwind 等其他体系，或需要 Mermaid、重数学 | **Streamdown**（第 4 课），插件生态厚 |
| 拿不准 | 先跟第 3 课（依赖最少），不满意再按第 5 课的方式换 |

两课的前端骨架完全相同，只是渲染组件不同——所以第 1、2 课是公共基础，必做。

---

## 第 1 课：后端——FastAPI SSE 流式接口（15 分钟）

### 1.1 核心概念

SSE（Server-Sent Events）是单向流：后端持续 `yield` 文本块，前端增量接收。协议就是纯文本，每条事件长这样：

```
event: delta
data: {"text": "你好"}

event: delta
data: {"text": "，世界"}

```

### 1.2 可运行的模拟后端

新建 `server/main.py`——这个模拟流会"假装 AI"逐段吐出包含**标题、粗体、代码块、表格、数学**的 Markdown，正好用来考验渲染器：

```python
import asyncio, json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite 开发服务器
    allow_methods=["*"],
    allow_headers=["*"],
)

# 模拟 AI 的完整回复（真实项目里换成你的 LLM 流）
MOCK_REPLY = """## 分析结果

这是**流式渲染**的演示，Markdown 是逐段到达的。

```python
def hello(name: str) -> str:
    return f"Hello, {name}!"
```

| 指标 | 数值 |
|------|------|
| 延迟 | 120ms |
| 准确率 | 96% |

行内公式 $E = mc^2$，以及块级公式：

$$\\int_0^1 x^2 \\, dx = \\frac{1}{3}$$
"""

@app.post("/api/chat")
async def chat():
    async def stream():
        # 按 3~8 字符的随机粒度切分，模拟真实 token 流
        i = 0
        while i < len(MOCK_REPLY):
            n = min(len(MOCK_REPLY) - i, 3 + i % 6)
            chunk = MOCK_REPLY[i : i + n]
            yield f"event: delta\ndata: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"
            i += n
            await asyncio.sleep(0.05)
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
```

安装并启动：

```bash
pip install fastapi uvicorn
uvicorn server.main:app --reload --port 8000
```

### 1.3 验证

```bash
curl -N -X POST http://localhost:8000/api/chat
```

应该看到 `event: delta` 一条条滚出来。**这一步通了再往下走。**

### 1.4 接真实 LLM 时改哪里

把 `MOCK_REPLY` 的循环换成你的模型流，事件格式不变：

```python
async for chunk in your_llm_stream(user_text):   # OpenAI/Anthropic/本地模型均可
    yield f"event: delta\ndata: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"
```

> ⚠️ 要点：`ensure_ascii=False` 否则中文会被转义成 `\uXXXX`；结构化内容（工具调用、卡片）**不要塞进 Markdown**，用 `event: tool_call` 这类独立事件另传。

---

## 第 2 课：前端——接收流的公共骨架（15 分钟）

### 2.1 初始化

```bash
npm create vite@latest web -- --template react-ts
cd web && npm install
```

### 2.2 一个通用的流接收 hook

新建 `web/src/useChatStream.ts`。注意：浏览器原生 `EventSource` **不支持 POST**，所以用 `fetch` + ReadableStream 手动解析 SSE：

```ts
import { useCallback, useRef, useState } from 'react';

export function useChatStream() {
  const [text, setText] = useState('');        // 累积的 Markdown 全文
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async () => {
    setText('');
    setStreaming(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const res = await fetch('/api/chat', {
      method: 'POST',
      signal: abortRef.current.signal,
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE 事件以空行分隔，逐条解析
      const events = buffer.split('\n\n');
      buffer = events.pop()!;                  // 最后半截留到下一轮
      for (const evt of events) {
        const dataLine = evt.split('\n').find(l => l.startsWith('data: '));
        if (!dataLine) continue;
        const payload = dataLine.slice(6);
        if (payload === '{}') continue;        // done 事件
        setText(t => t + JSON.parse(payload).text);
      }
    }
    setStreaming(false);
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  return { text, streaming, send, stop };
}
```

### 2.3 配置开发代理

`web/vite.config.ts` 里把 `/api` 转发给 FastAPI，避免跨域：

```ts
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8000' } },
});
```

到这里骨架完成。下面两课分别往 `App.tsx` 里填渲染器，**二选一**（也可以都装，用按钮切换对比）。

---

## 第 3 课：方案 A —— Astryx Markdown（15 分钟）

### 3.1 安装

```bash
npm install @astryxdesign/core @astryxdesign/theme-neutral react@^19 react-dom@^19
```

### 3.2 最小接入

`web/src/main.tsx` 引入主题预编译 CSS（不需要任何构建插件）：

```tsx
import '@astryxdesign/theme-neutral/theme.css';
```

`web/src/App.tsx`：

```tsx
import { useChatStream } from './useChatStream';
import { ChatLayout } from '@astryxdesign/core/Chat';
import { Markdown } from '@astryxdesign/core/Markdown';
import { Button } from '@astryxdesign/core/Button';

export default function App() {
  const { text, streaming, send, stop } = useChatStream();

  return (
    <ChatLayout
      density="spacious"
      composer={
        <Button
          label={streaming ? '停止' : '发送演示消息'}
          onClick={streaming ? stop : send}
        />
      }>
      {/* text 累积增长，Markdown 内部自动增量解析 + 淡入 */}
      <Markdown density="compact">{text}</Markdown>
    </ChatLayout>
  );
}
```

`npm run dev`，点发送。你会看到：文本一簇簇淡入、`ChatLayout` 自动平滑跟随滚动、代码块带高亮和复制按钮、表格是设计系统组件——**这些一行额外代码都没写**。

### 3.3 它替你做了什么（理解原理，便于排查）

| 你观察到 | 背后的机制 | 源码位置 |
| --- | --- | --- |
| 流式时旧内容不重新解析 | 增量解析状态机：已闭合块冻结进 `settledBlocks`，新 token 只解析尾部 | `core/src/Markdown/parser.ts` → `createIncrementalState` |
| 半截 `**`、未闭合 `$` 不闪裸符号 | 渲染前把未闭合的行尾修剪掉，闭合后再显示（货币 `$5` 场景已排除误判） | 同上 → `trimStreamingArtifacts` |
| 文本一簇簇淡入而非硬跳 | 环形边界缓冲切分文本段，每段稳定 key 只播一次动画 | `core/src/Markdown/streaming.ts` |
| token 突发到达但显示匀速 | rAF 排水 + 字素簇对齐（不会切出半个 emoji/汉字组合） | `core/src/hooks/useStreamingText.ts` |

### 3.4 常用定制

**启用数学公式**：提供一个渲染器即自动开启 `$...$` 解析（Astryx 只传原始表达式，不替你执行）：

```tsx
import katex from 'katex';
import 'katex/dist/katex.min.css';

<Markdown
  density="compact"
  components={{
    math: ({ value, display }) => (
      <span
        dangerouslySetInnerHTML={{
          __html: katex.renderToString(value, { displayMode: display === 'block' }),
        }}
      />
    ),
  }}
>
  {text}
</Markdown>
```

**RAG 引用溯源**：传入 `sources`，正文里的 `[1]` 或 `【1】` 自动变成可点的引用 pill（做检索增强应用时开箱即用）：

```tsx
<Markdown
  sources={[{ title: '产品文档', url: 'https://example.com/docs' }]}
>
  {text}
</Markdown>
```

**自定义链接行为**（比如在应用内路由打开）：

```tsx
<Markdown components={{ link: ({ href, children }) =>
  <a href={href} onClick={e => { e.preventDefault(); navigate(href); }}>{children}</a>
}}>
```

---

## 第 4 课：方案 B —— Streamdown（15 分钟）

### 4.1 安装

```bash
npm install streamdown @streamdown/code @streamdown/math @streamdown/cjk katex
```

### 4.2 接入（含最大的坑）

`App.tsx` 只需换掉渲染组件，骨架不动：

```tsx
import { useChatStream } from './useChatStream';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { cjk } from '@streamdown/cjk';   // 中文项目建议必装
import 'katex/dist/katex.min.css';
import 'streamdown/styles.css';

export default function App() {
  const { text, streaming, send } = useChatStream();
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <button onClick={send} disabled={streaming}>发送演示消息</button>
      <Streamdown
        animated
        isAnimating={streaming}
        plugins={{ code, math, cjk }}
      >
        {text}
      </Streamdown>
    </div>
  );
}
```

> ⚠️ **Tailwind 项目的必踩坑**：如果项目用了 Tailwind，必须在全局 CSS 里加下面这行，否则 Streamdown 的样式类不会被扫描进产物，表现为"样式缺了一半"：
> ```css
> @source "../node_modules/streamdown/dist/index.js";
> ```
> 不用 Tailwind 则忽略。

### 4.3 它替你做了什么

- **未闭合语法补全**：`**bold` 没输完就先按粗体渲染（与 Astryx"先藏起"的哲学相反，更生动）；
- **块级 memo**：按段落/代码块拆分，已完成的块跳过解析和重渲染，流式期间只有尾部在更新；
- **代码高亮**：Shiki（VS Code 同款引擎），默认 `github-light` / `github-dark` 双主题跟随暗色模式。

### 4.4 常用定制

**只改代码块**（字体、复制按钮等），不用 fork 库：

```tsx
<Streamdown
  plugins={{ code, math, cjk }}
  components={{ code: MyCustomCodeBlock }}
>
```

**加 Mermaid 图表**：

```bash
npm install @streamdown/mermaid
```
```tsx
import { mermaid } from '@streamdown/mermaid';
// plugins={{ code, math, cjk, mermaid }}
```

**混进 Astryx 的壳**：两套方案不冲突，可以把 Streamdown 嵌进 Astryx 的气泡里：

```tsx
<ChatMessageBubble variant="ghost">
  <Streamdown plugins={{ code, math, cjk }} isAnimating={streaming}>{text}</Streamdown>
</ChatMessageBubble>
```

---

## 第 5 课：上线前必查的 6 件事

1. **XSS**：AI 输出永远当不可信内容。两套方案默认都不渲染原始 HTML（安全）；如果你任何地方用了 `dangerouslySetInnerHTML`（如第 3 课手写的 KaTeX 渲染器），确认内容来源是模型生成的公式而非用户原文，或先过 DOMPurify。
2. **中文输入法（IME）**：自己写的输入框在 Enter 提交前必须加守卫，否则拼音选词的 Enter 会误发消息：
   ```ts
   if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
   ```
3. **CJK 断行**：中文流式逐字到达的断行/标点，Streamdown 侧确认装了 `@streamdown/cjk`；Astryx 侧靠字素簇对齐内建处理，实测你的字体下效果。
4. **性能自测**：发一条 2000+ 字含代码块和表格的长回复，打开 React DevTools Profiler 确认：流式期间只有最后一条消息在重渲染，历史消息不动。如果全列表都在动，检查消息组件是否被正确 `memo`、key 是否稳定。
5. **数学公式闪烁**：`$...$` 流式期间的抖动，Astryx 已内建处理；Streamdown 如发现明显抖动，可把数学密度高的段落引导模型独立成块（块闭合后才排版）。
6. **暗色模式**：Astryx 换主题包即成；Streamdown 确认 `shikiTheme` 用双主题数组 `['github-light', 'github-dark']`，页面暗色时验证代码块对比度。

---

## 附录 A：如何迁移到你现有的应用

1. **找到你现在的渲染点**：搜索项目里输出 AI 消息的地方（可能是 `innerHTML`、`v-html`、或一个简单的 `<p>{text}</p>`）。
2. **协议对齐**：确认后端流里传的是 **Markdown 原文增量**（不是 HTML、不是 JSON 转义两遍）。把第 1 课的 `delta` 事件格式作为契约。
3. **替换渲染器**：把渲染点换成 `<Markdown>{text}</Markdown>` 或 `<Streamdown>{text}</Streamdown>`，外面包一层你自己的 `<Response>` 组件收口，方便以后换实现。
4. **滚动跟随**：流式时长列表需要"自动滚到底、用户上翻就停"——Astryx 用户直接用 `ChatLayout`；其他项目把消息区滚动容器抽出来，实现"距底部 <10px 才跟随，向上滚立即解锁"。
5. **结构化内容剥离**：工具调用、卡片、引用源从 Markdown 里拿出来，走独立 SSE 事件和独立组件（参考第 1 课 ⚠️ 要点）。

## 附录 B：故障速查

| 症状 | 大概率原因 | 处理 |
| --- | --- | --- |
| 中文变成 `\u4f60\u597d` | 后端 `json.dumps` 没加 `ensure_ascii=False` | 第 1.2 节 |
| 前端收不到流，一次性全到 | 反向代理/gzip 缓冲了响应 | 开发期确认走 Vite proxy；生产给 SSE 路由加 `X-Accel-Buffering: no` |
| 样式缺一半（Streamdown） | Tailwind 没加 `@source` | 第 4.2 节 |
| 流式时整页卡 | 每条消息都在重渲染 / 每 token 全量高亮 | 第 5 课第 4 条 |
| 选词时消息被发出 | 输入框没做 IME 守卫 | 第 5 课第 2 条 |
| 表格流式时疯狂变形 | 半截表格被实时渲染 | 让表格块闭合后再渲染（Astryx 默认如此；Streamdown 可对该块延后） |

## 附录 C：深入阅读（源码索引）

| 主题 | 位置 |
| --- | --- |
| Astryx 增量解析状态机 | `astryx-repo/packages/core/src/Markdown/parser.ts` → `createIncrementalState` |
| 流式语法修剪（含 `$` 处理） | 同上 → `trimStreamingArtifacts` |
| 分段淡入算法 | `astryx-repo/packages/core/src/Markdown/streaming.ts` |
| 匀速排水 hook | `astryx-repo/packages/core/src/hooks/useStreamingText.ts` |
| 引用 pill 组件 | `astryx-repo/packages/core/src/Citation/Citation.tsx` |
| 两套方案深度对比（原理向） | 同目录《Astryx源码分析-对话式应用设计与交互方案.md》 |
