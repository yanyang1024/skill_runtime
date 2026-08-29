# HTTP 缓存机制（材料摘录）

> 摘自 RFC 9111 (HTTP Caching) 与 MDN Web Docs「HTTP caching」条目的要点整理。

## 缓存是什么

HTTP 缓存是指客户端（浏览器）或中间代理把响应的副本保存在本地，
后续对同一资源的请求可以直接使用副本，而不必再次访问源服务器。
收益：降低延迟、节省带宽、减轻服务器负载。

## 两类缓存机制

### 强缓存（freshness / heuristic caching）

- 响应头 `Cache-Control: max-age=<秒>` 声明副本的「新鲜期」。
- 新鲜期内再次请求：浏览器**直接读本地副本，不发任何网络请求**（内存缓存状态码常记为 200 from disk/memory cache）。
- 过期（stale）后进入协商阶段。
- `Cache-Control: no-store` 表示任何缓存都不许存这份响应。
- `Cache-Control: no-cache` 不是「不缓存」，而是「每次使用前必须先向服务器验证」。

### 协商缓存（validation）

- 服务器在响应里给出验证器：`ETag`（实体标签）或 `Last-Modified`（最后修改时间）。
- 副本过期后，浏览器带 `If-None-Match: <ETag>`（或 `If-Modified-Since`）发起条件请求。
- 若资源未变，服务器返回 `304 Not Modified`（**无响应体**），浏览器刷新副本的新鲜期继续用；
  若已变化，返回 `200 OK` 与新内容。

## 常见 Cache-Control 指令速查

| 指令 | 含义 |
| --- | --- |
| `max-age=31536000` | 一年内视为新鲜，不再发请求 |
| `no-cache` | 可缓存，但每次用前必须协商验证 |
| `no-store` | 完全不缓存 |
| `private` / `public` | 只允许浏览器缓存 / 允许共享代理也缓存 |
| `immutable` | 声明内容永不变，配合指纹文件名 |

## 工程实践

- 带内容指纹的静态资源（如 `app.a1b2c3.js`）：`max-age=31536000, immutable`。
- HTML 入口文件：`no-cache`（或很短的 max-age），保证用户总能拿到最新版本。
