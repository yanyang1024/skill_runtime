# 企业自部署 MinerU 与内部工具接入 OpenCode：原生轻工具适配指南

> 配套完整源码：`企业OCR工具网关最小实现.md`
>
> 本版面向多用户、多 OpenCode 实例的企业 Agent 平台：OpenCode 侧只注册轻量原生工具，中央共享 HTTP 网关统一接入 MinerU、识图和其他内部服务，不再为每个实例启动或连接独立 MCP Server。

## 1. 目标架构与适配边界

```text
用户／平台会话
└── OpenCode 实例
    └── .opencode/plugins/corp-tools.ts
        ├── 轻量工具 Schema
        ├── 本地文件读取与 multipart 上传
        ├── 环境变量身份
        ├── sessionID／agent 上下文
        └── HTTP 调用
              │
              ▼
中央共享 HTTP Gateway
├── 用户、设备、IP、会话审计
├── 工具 ACL 与用户级限流
├── 文件校验、错误归一化
└── 后端适配器
    ├── MinerU CLI／企业 MinerU HTTP 服务
    ├── OpenAI 兼容识图服务
    └── 其他内部工具
```

适配时保持四个边界：

1. **OpenCode 插件**：只负责工具注册、本地输入和上下文采集，不加载重型运行时。
2. **中央网关**：统一负责身份、IP、ACL、限流、审计和错误契约。
3. **后端适配器**：只处理 MinerU 或其他企业服务的协议差异。
4. **企业推理服务**：负责实际 OCR、识图和 GPU 调度，由所有会话共享。

“按需”发生在后端执行层，不是等用户提到工具后才注册工具。工具 Schema 必须提前存在，模型才能选择调用。

## 2. 从旧 MCP 版本迁移

如果已经使用之前的参考文件，按以下顺序迁移：

1. 删除 OpenCode 配置中的整个 `mcp` 段。
2. 不再启动 FastMCP／STDIO MCP Server。
3. 将 `.opencode/plugins/corp-tools.ts` 放入每个工作区，或打包成企业 OpenCode 插件统一下发。
4. 为每个 OpenCode 实例设置 `CORP_TOOL_GATEWAY` 和企业身份环境变量。
5. 启动新的 `gateway.py`，它是普通 FastAPI HTTP 服务。
6. 将策略中的工具名改为 `corp_ocr`、`corp_vision`。
7. 保留中央 ACL、限流和审计，不把治理逻辑移到用户实例。

迁移后的 OpenCode 配置只需要：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "corp_ocr": "ask",
    "corp_vision": "ask"
  }
}
```

这里的 `ask` 只用于客户端防误触，不能替代中央授权。

## 3. 部署中央共享网关

### 3.1 安装

```bash
cd opencode-native-tools-gateway-reference
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3.2 配置 MinerU 与识图后端

```bash
# 默认 MinerU CLI 后端；MinerU >=4,<5 单独安装。
mineru server start
export MINERU_BIN="mineru"
export MINERU_TIMEOUT_SEC="600"

# OpenAI 兼容识图服务。
export VISION_BASE_URL="http://your-internal-vlm/v1"
export VISION_MODEL="your-real-model-name"
export VISION_API_KEY="optional-internal-key"
export VISION_TIMEOUT_SEC="180"

# 文件、结果和代理。
export MAX_FILE_BYTES="15728640"
export MAX_RESULT_CHARS="30000"
export CORP_TRUSTED_PROXY_IPS="10.0.0.2,10.0.0.3"
export POLICY_FILE="/absolute/path/policy.json"
export PORT="8000"

python gateway.py
```

服务入口：

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/healthz` | 进程存活检查，不代表后端健康 |
| POST | `/v1/ocr/parse` | MinerU OCR／文档解析 |
| POST | `/v1/vision/understand` | 内部 VLM 识图 |

两个工具端点都使用 multipart 文件上传，不再要求模型处理 Base64。

## 4. 部署 OpenCode 原生轻工具

### 4.1 文件位置

```text
.opencode/plugins/corp-tools.ts
```

该插件启动时只注册：

```text
corp_ocr
corp_vision
```

注册阶段不启动 MCP、不加载 MinerU、不创建 GPU Worker，也不建立重型连接池。

### 4.2 每个实例需要的环境变量

```bash
export CORP_TOOL_GATEWAY="https://tools.corp.example.com"
export CORP_USER_ID="alice"
export CORP_DEVICE_ID="dev-1"             # 可选
export CORP_CLIENT_IP="172.16.8.20"      # 平台部署时建议传入
export CORP_TOOL_MAX_FILE_BYTES="15728640"
```

`CORP_TOOL_GATEWAY` 是中央 HTTP 服务根地址，不要拼接具体工具路径。插件会调用：

```text
/v1/ocr/parse
/v1/vision/understand
```

### 4.3 用户环境变量如何进入网关

插件在每次执行时读取环境变量并设置：

```http
X-Corp-User-Id: alice
X-Corp-Device-Id: dev-1
X-Corp-Client-IP: 172.16.8.20
X-OpenCode-Session-Id: <context.sessionID>
X-OpenCode-Agent: <context.agent>
X-Request-Id: <uuid>
```

缺少 `CORP_USER_ID` 时插件会直接报错，网关也会再次拒绝缺失身份的请求。两层检查的目的不同：

- 插件检查用于尽早给出明确错误；
- 网关检查用于防止其他客户端绕过插件。

当前身份标记为 `env_header_unverified`，即用户或实例环境声明的身份。生产授权需要平台签发并验证短期 Token，不能把可修改环境变量当成可信认证。

## 5. 用户 IP 在两种部署拓扑中的处理

### 5.1 OpenCode 运行在用户企业机器

```text
用户机器 → 中央网关
```

网关的 socket 来源通常就是用户机器、企业出口或代理 IP。字段含义：

- `peer_ip`：直接连接网关的一方；
- `client_ip`：按受信代理规则得到的 OpenCode 运行时 IP；
- `end_user_ip`：如果额外传入 `CORP_CLIENT_IP`，则单独记录。

### 5.2 OpenCode 运行在平台容器

```text
用户浏览器 → 平台入口 → OpenCode 容器 → 中央网关
```

中央网关只能直接从连接中看到容器、Pod 或平台出口 IP。终端用户 IP 必须由平台入口在登录／创建会话时取得，并在创建 OpenCode 实例时注入：

```bash
CORP_CLIENT_IP=<平台入口获得的用户 IP>
```

审计中记录为：

```json
{
  "client_ip": "10.20.0.15",
  "end_user_ip": "172.16.8.20",
  "end_user_ip_source": "platform_ingress_asserted"
}
```

不要把容器 IP 误报为终端用户 IP。`end_user_ip` 也是平台断言值，其可信程度取决于实例环境是否可被用户修改。

### 5.3 受信代理

只有直接连接方属于：

```bash
CORP_TRUSTED_PROXY_IPS="10.0.0.2,10.0.0.3"
```

网关才使用 `X-Forwarded-For` 推导 `client_ip`。未受信客户端伪造该请求头不会改变审计结果。复杂多级代理还需按企业网络拓扑确认取哪一跳，不能盲目信任任意转发头。

## 6. 默认 MinerU CLI 后端如何工作

OCR 请求处理过程：

```text
OpenCode 本地文件
→ multipart 上传
→ 网关校验文件名、扩展名和大小
→ 流式写入临时文件
→ mineru parse <临时文件> --tier <tier> --json
→ 归一化结果并限制返回长度
→ 删除临时文件
→ 写审计事件
```

支持档位：

```text
flash / basic / standard / advanced
```

成功和异常路径都要清理临时文件。 MinerU 非零退出、超时、非法 JSON、解析错误和任务 pending 均会返回明确错误，不会把空文本当成成功。

当前同步适配器适合小文件联调。大文件或长文档建议改为：

```text
ocr_submit → job_id
ocr_status → queued/running/succeeded/failed
ocr_result → 分页内容或受控结果引用
```

## 7. 接入企业已有 MinerU HTTP 服务

不需要改变 OpenCode 插件和网关治理层，只替换后端适配器。

### 7.1 保持后端契约

```python
class MinerUBackend(Protocol):
    async def parse(self, path: Path, tier: str) -> str:
        ...
```

企业适配器负责：

```text
临时文件
→ 上传或创建文档
→ 创建解析任务
→ 等待或返回 pending
→ 读取结果
→ 返回归一化文本
```

适配器骨架如下。 URL 和字段均为占位，必须替换为企业实际接口：

```python
class MinerUHttpBackend:
    def __init__(self):
        self.base_url = os.environ["MINERU_HTTP_BASE_URL"].rstrip("/")
        self.api_key = os.getenv("MINERU_HTTP_API_KEY", "")

    async def parse(self, path: Path, tier: str) -> str:
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        async with httpx.AsyncClient(timeout=600) as client:
            with path.open("rb") as file:
                upload = await client.post(
                    f"{self.base_url}/your-upload-endpoint",
                    files={"file": file},
                    headers=headers,
                )
            upload.raise_for_status()
            document_id = upload.json()["document_id"]

            job = await client.post(
                f"{self.base_url}/your-parse-endpoint",
                json={"document_id": document_id, "tier": tier},
                headers=headers,
            )
            job.raise_for_status()
            job_id = job.json()["job_id"]

            # 最小示例。生产建议将状态轮询改成独立异步工具。
            while True:
                status = await client.get(
                    f"{self.base_url}/your-job-endpoint/{job_id}",
                    headers=headers,
                )
                status.raise_for_status()
                payload = status.json()
                if payload["state"] == "succeeded":
                    return payload["markdown"]
                if payload["state"] == "failed":
                    raise GatewayError(502, "mineru_failed", str(payload.get("error_code")))
                await asyncio.sleep(2)
```

替换实例：

```python
mineru_backend = MinerUHttpBackend()
```

### 7.2 错误映射

| 后端情况 | 网关处理建议 |
|---|---|
| 401／403 | 企业后端认证或授权错误，返回 502 或专门配置错误，不映射成用户无内容 |
| 404 | 文档或任务不存在；结果读取时还要校验所有者 |
| 413 | 文件超过后端限制 |
| 429 | 后端服务限流，与网关用户限流分别记录 |
| 5xx／连接失败 | 后端不可用 |
| 任务 failed | 返回真实错误码 |
| 任务 pending | 返回 pending 或提供异步状态工具 |
| Schema 变化 | 明确报后端契约错误 |

## 8. 接入 OpenAI 兼容识图服务

`corp_vision` 的 OpenCode 插件把本地图片 multipart 上传到中央网关；网关再转换成内部 VLM 所需的 Base64 数据 URL：

```text
POST {VISION_BASE_URL}/chat/completions
```

主要适配项：

- `VISION_MODEL` 必须是实际部署模型名；
- 服务不支持 Base64 时，在 `OpenAIVisionBackend` 中改为先上传图片再传 URL；
- 返回内容不是字符串时，归一化结构化数组；
- API Key 只放网关环境，不下发到 OpenCode；
- VLM 的失败响应不得被当成空描述成功。

## 9. 接入其他内部工具

新增“发票识别”需要同时改客户端和中央端，但治理代码仍然复用。

### 9.1 中央端增加后端与路由

```python
@app.post("/v1/invoice/recognize")
async def recognize_invoice(file: UploadFile = File(...)):
    temp_path, safe_name = await save_upload(file)
    try:
        result = await invoice_backend.recognize(temp_path)
        return {"filename": safe_name, "result": result}
    finally:
        await file.close()
        temp_path.unlink(missing_ok=True)
```

把路径映射为工具名：

```python
ROUTE_TOOLS["/v1/invoice/recognize"] = "invoice_ocr"
```

这样身份、IP、ACL、限流和审计会自动生效，无需在路由里复制。

### 9.2 OpenCode 插件增加轻量注册

```typescript
invoice_ocr: tool({
  description: "Recognize invoice fields with the central enterprise service",
  args: {
    filePath: tool.schema.string().describe("Local invoice PDF or image"),
  },
  async execute(args, context) {
    return callGateway("/v1/invoice/recognize", args.filePath, {}, context)
  },
})
```

### 9.3 更新 ACL

```json
{
  "users": {
    "alice": {
      "allow_tools": ["corp_ocr", "corp_vision", "invoice_ocr"],
      "rate_limit_per_minute": 10
    }
  }
}
```

如果不同工具需要不同窗口，把单一 `rate_limit_per_minute` 升级为按工具的 `count/window_sec` 配置。GPU 成本还需另做页数、并发或 GPU 毫秒配额，调用次数不等于资源成本。

## 10. 权限、限流与审计

### 10.1 默认拒绝

`policy.json` 中：

- 未匹配用户使用 `*`；
- 工具不在 `allow_tools` 中即返回 403；
- 未匹配任何规则时同样拒绝；
- 权限在中央执行层检查，其他 HTTP 客户端也不能绕过。

### 10.2 用户＋工具限流

限流键：

```text
(user_id, tool_name)
```

后端失败也占用调用频率，避免异常请求形成压力。单进程内存限流只适合最小部署；多副本必须换 Redis 等共享实现。

### 10.3 审计结果

| outcome | 含义 |
|---|---|
| `succeeded` | 工具成功返回 |
| `identity_failed` | 身份缺失或格式错误 |
| `permission_denied` | 工具 ACL 拒绝 |
| `rate_limited` | 用户工具调用超频 |
| `tool_error` | 文件、MinerU、VLM 或其他后端错误 |

审计包含 `request_id`、用户、设备、运行时 IP、终端用户 IP、`sessionID`、agent、工具、耗时和结果状态。默认不要记录文件内容、OCR 全文、Authorization 或 API Key。

## 11. 验证与上线验收

### 11.1 已提供的测试

```bash
python -m unittest -v
python -m py_compile gateway.py
```

当前 9 项测试覆盖：

- 受信与未受信代理 IP；
- 文件名清理与类型限制；
- 默认拒绝和用户 ACL；
- 用户级限流；
- 成功 HTTP 调用与审计；
- 平台终端 IP 和 `sessionID`；
- 身份缺失；
- 临时文件清理；
- 后端失败不伪装成功。

TypeScript 插件可用 esbuild 做静态构建：

```bash
esbuild .opencode/plugins/corp-tools.ts \
  --bundle --platform=node --format=esm \
  --external:@opencode-ai/plugin \
  --outfile=/tmp/corp-tools.js
```

静态构建不等于真实 OpenCode 加载验证。上线前必须在目标 OpenCode 版本内确认：

- [ ] 插件被发现，`corp_ocr` 和 `corp_vision` 可调用；
- [ ] 本地文件能以 multipart 到达中央网关；
- [ ] 用户未调用工具时没有 OCR／MinerU 子进程；
- [ ] OpenCode 实例内没有 MCP Server 和重型模型运行时；
- [ ] 审计能关联用户、设备、运行时 IP、终端 IP 和 `sessionID`；
- [ ] 无权限、超频、后端错误均有明确响应与日志；
- [ ] 真实 MinerU 和 VLM 结果符合质量与延迟要求；
- [ ] 大文件任务不会被同步超时伪装成失败或空结果；
- [ ] 用户不能凭他人的任务 ID 读取结果。

## 12. 推荐的生产演进顺序

1. **最小闭环**：原生轻工具＋中央 HTTP＋环境变量身份＋真实 MinerU 小文件。
2. **企业任务契约**：上传、异步任务、分页结果、结果 ACL。
3. **共享治理升级**：平台短期 Token、OIDC、Redis 限流、部门配额和集中审计。
4. **规模验证**：测量每个 OpenCode 实例的增量 RSS，确认没有每会话重型工具进程，再压测中央网关和 GPU 队列。

最终保持一句话：

> OpenCode 侧永远只做轻量适配；用户身份和会话上下文随调用传递；所有重型工具、权限、限流和资源共享都集中在中央服务。