# Memory RSI 记忆治理台

面向内部智能体平台的前端参考实现，覆盖个人记忆库、RSI 推荐人工确认、版本轨迹、管理者指定用户迭代、管理员全局分布与审计。默认使用完整 Mock 数据流，迁入内网时可切换为 HTTP 服务适配器。

## 本地运行

```bash
npm install
npm run dev
npm run build
npm run preview
```

技术栈：React 19、TypeScript、Vite、Tailwind CSS、Recharts、Radix UI。数字雨背景沿用初始化模板的 Canvas 实现。

## 已实现模块

- 个人面板：SSO 身份上下文、治理总览、记忆关联图、记忆健康提醒。
- 我的记忆库：Skill 生成文件、个人偏好与其他文档；搜索、筛选、新建、编辑、单文件/全库 Markdown 导出。
- 推荐队列：证据查看、置信度、采纳、编辑采纳、忽略与批量采纳。
- 版本轨迹：历史差异对比、回滚原因、Markdown/JSON 轨迹导出。
- 管理者面板：平台共性记忆及形成原因、按用户 ID 迭代记忆、差异预览。
- 管理员面板：全用户目录、总记忆库分布、共性原因、健康度与全局审计。
- 系统对接：Mock/HTTP 切换、Base URL、SSO 头、超时、连接测试与接口契约导出。
- PWA：桌面/移动端安装，静态资源缓存，页面导航网络优先。

## 数据与状态说明

当前是纯前端交付，不包含真实账号、数据库或服务端持久化：

- Mock 快照仅存在于页面运行时，刷新后恢复初始数据。
- 接口配置使用当前浏览器的 `localStorage`，不会跨设备同步。
- 顶部的角色切换仅用于演示，不是权限控制。
- 生产环境必须由 SSO 网关和服务端完成认证、授权、审计与数据隔离。

## 内网移植方式

页面组件不直接调用 `fetch`，统一通过 `src/services/memoryApi.ts` 中的 `MemoryApi` 接口读写。推荐按以下顺序对接：

1. 保持 `src/types/memory.ts` 的 `Snapshot` 返回结构，先实现 `GET /snapshot`。
2. 在内网实现下列 REST 接口，或在适配层中映射到现有接口。
3. 在“接口与 SSO 对接”页切换 HTTP 模式，填写 Base URL 和身份头并测试连接。
4. 将演示用户、角色和权限集合替换为 SSO 返回值；服务端必须重新校验管理者与管理员权限。
5. 若内网已有导出服务，可替换 `src/lib/download.ts`，保留现有按钮交互。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/snapshot` | 当前身份的记忆、版本、推荐、用户与审计快照 |
| POST | `/memories` | 创建个人记忆 |
| PATCH | `/memories/:fileId` | 编辑内容并追加版本 |
| PATCH | `/recommendations/:id` | 采纳、编辑采纳或忽略推荐 |
| POST | `/memories/:fileId/rollback` | 回滚并记录原因 |
| PATCH | `/users/:userId/memory` | 管理者迭代指定用户 |
| GET | `/health` | 服务与 SSO 健康检查 |

HTTP 适配器默认携带 `credentials: include`，以及可配置的 `X-User-Id`、`X-User-Role` 请求头。写操作统一返回最新 `Snapshot`，让页面内各模块保持一致；如果内网写接口只返回单实体，请在适配层补发快照请求或自行合并状态。

## 目录结构

```text
src/
├── components/app/       # 应用壳、导航、搜索、治理上下文、图谱与通用组件
├── data/mockData.ts      # 可替换的演示快照
├── lib/download.ts       # Markdown / JSON / CSV 浏览器导出
├── pages/                # 个人、管理者、管理员与对接页面
├── services/memoryApi.ts # Mock + HTTP 双适配器，核心对接点
├── store/MemoryStore.tsx # 全局快照、角色、导航与操作状态
├── types/memory.ts       # 数据契约
└── sections/AmberCascades.tsx # 模板数字雨与水面涟漪
```

可通过 `.env.example` 配置部署默认值；页面内的运行时配置优先级更高。构建产物为 `dist/`，可部署到内网静态服务器。若 SSO 依赖网关注入身份头，请按公司网关规范调整适配器，不要把密钥写入前端环境变量。
