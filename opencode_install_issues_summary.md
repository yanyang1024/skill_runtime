# OpenCode 安装与使用问题汇总

> 本文档汇总了近期在使用 OpenCode 过程中遇到的各种安装、配置及运行问题，并扩展了部分常见的通用安装场景，供快速排查参考。

---

## 一、安装阶段问题

### 1. npm 全局安装报错 `npm error code EINVAL`

**现象**
- Windows CMD 执行 `npm i -g opencode-ai` 报错：
  ```
  npm error code EINVAL
  npm error syscall connect
  npm error request to xxxx failed
  ```

**可能原因**
- npm 缓存损坏或 registry 配置异常
- 网络代理/防火墙拦截了 npm 请求
- 本地 `node_modules` 或缓存目录权限不足

**解决方案**
1. 清理 npm 缓存并重试：
   ```bash
   npm cache clean --force
   npm i -g opencode-ai
   ```
2. 切换国内镜像源：
   ```bash
   npm config set registry https://registry.npmmirror.com
   npm i -g opencode-ai
   ```
3. 检查代理设置，临时关闭代理：
   ```bash
   npm config set proxy null
   npm config set https-proxy null
   ```
4. 使用 npx 临时安装运行：
   ```bash
   npx opencode-ai
   ```

---

### 2. Windows 安装后命令行找不到 `opencode`

**现象**
- `npm i -g opencode-windows-x64` 安装成功，但命令行输入 `opencode` 报错：
  ```
  系统找不到指定的路径
  ```

**可能原因**
- npm 全局安装路径未加入系统 `PATH` 环境变量
- 安装包名称与实际可执行文件名不一致

**解决方案**
1. 查找全局安装路径：
   ```bash
   npm config get prefix
   # 检查 <prefix> 目录下的 node_modules/.bin/ 或 直接可执行文件
   ```
2. 手动将对应路径加入系统 `PATH`：
   - 例如：`C:\Users\<用户名>\AppData\Roaming\npm`
3. 直接使用完整路径调用：
   ```bash
   C:\Users\<用户名>\AppData\Roaming\npm\opencode.cmd
   ```

---

### 3. 可执行文件报错：无法定位程序输入点 `closepseudoconsole`

**现象**
- 找到 `opencode.exe` 后直接运行，报错：
  ```
  无法定位程序输入点 closepseudoconsole 用于动态链接库 ...
  ```

**可能原因**
- Windows 系统版本过低，缺少必要的 Windows Terminal / ConPTY 支持
- 该函数在 Windows 10 早期版本或 Windows Server 2016/2019 中可能不可用

**解决方案**
1. **升级系统**：确保 Windows 版本为 Windows 10 1903 或更高（推荐 20H2+）
2. **安装 Windows Terminal**：从 Microsoft Store 安装最新版 Windows Terminal
3. **使用 WSL 环境**：在 WSL2 (Ubuntu) 中安装运行 OpenCode，绕过 Windows 原生终端限制
4. **使用旧版本**：尝试安装不含伪终端依赖的旧版 OpenCode

---

### 4. Linux 安装后无法启动 / 缺少依赖

**扩展场景**

**现象**
- Linux 下安装成功但运行报错，提示缺少 `libssl`、`libcrypto` 等动态库

**解决方案**
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y libssl-dev libffi-dev python3-dev build-essential

# CentOS/RHEL/Fedora
sudo yum install -y openssl-devel libffi-devel python3-devel gcc

# 重新安装 opencode
npm i -g opencode-ai
```

---

## 二、配置阶段问题

### 5. Linux 中如何配置模型

**现象**
- 在 Linux 环境下不清楚如何为 OpenCode 配置 LLM 模型

**解决方案**
1. 查看当前配置：
   ```bash
   opencode config list
   ```
2. 设置模型 provider 和 API key：
   ```bash
   # 以 OpenAI 为例
   opencode config set model.provider openai
   opencode config set model.api_key sk-xxxxxxxx
   opencode config set model.name gpt-4o
   ```
3. 使用本地模型（Ollama）：
   ```bash
   opencode config set model.provider ollama
   opencode config set model.base_url http://localhost:11434
   opencode config set model.name llama3
   ```
4. 配置文件通常位于：
   - Linux: `~/.config/opencode/config.yaml` 或 `~/.opencode/config.yaml`
   - Windows: `%APPDATA%\opencode\config.yaml`

---

### 6. 报错 `failed to fetch models.dev`

**现象**
- 启动 OpenCode 时报错：
  ```
  failed to fetch models.dev
  ```

**可能原因**
- 网络无法访问 OpenCode 的模型列表服务（models.dev）
- 配置的 provider 或 API endpoint 有误
- 本地防火墙/代理拦截了请求

**解决方案**
1. 检查网络连通性：
   ```bash
   curl -I https://models.dev
   ```
2. 手动指定模型配置，跳过自动获取：
   ```bash
   opencode config set model.provider openai
   opencode config set model.api_key <your-key>
   opencode config set model.name gpt-4o
   ```
3. 使用本地模型绕过远程模型列表：
   ```bash
   opencode config set model.provider ollama
   opencode config set model.base_url http://localhost:11434
   ```
4. 检查代理/VPN 设置，确保能正常访问外部网络

---

### 7. Git LFS 文件限制导致仓库拉取失败

**扩展场景**

**现象**
- 克隆 OpenCode 相关仓库或 skill 仓库时，Git LFS 文件拉取失败

**解决方案**
```bash
# 安装 Git LFS
git lfs install

# 重新拉取仓库
git lfs pull

# 如果仍失败，检查 Git LFS 配额或手动下载大文件
```

---

## 三、运行阶段问题

### 8. WebUI 非常卡顿

**现象**
- 终端运行不卡，但 OpenCode Server 的 WebUI 访问非常卡顿

**可能原因**
| 类别 | 可能原因 |
|------|----------|
| 系统 | 服务器资源不足（CPU/内存/磁盘IO瓶颈） |
| 模型 | LLM 推理延迟高，响应慢导致前端等待 |
| 软件 | OpenCode Server 单进程运行，未启用多 worker |
| 浏览器 | 前端渲染大量消息历史，DOM 节点过多 |
| 网络 | 服务器与浏览器之间网络延迟高 |

**解决方案**
1. **启用多 worker 运行**（推荐）：
   ```bash
   # 使用 Gunicorn + Uvicorn 启动多 worker
   gunicorn -w 4 -k uvicorn.workers.UvicornWorker app:app

   # 或使用 uvicorn 多 worker
   uvicorn app:app --workers 4
   ```
2. **限制消息历史长度**：在配置中设置最大上下文长度，避免前端渲染过多消息
3. **检查服务器资源**：
   ```bash
   htop        # 查看 CPU/内存
   iostat -x   # 查看磁盘 IO
   ```
4. **使用本地模型**：如果使用的是远程 API，切换为本地 Ollama 模型减少网络延迟
5. **清理浏览器缓存**：清除浏览器缓存和 LocalStorage，重新加载页面

---

### 9. 会话日志导出不全（`/export` 信息缺失）

**现象**
- 对话次数太多时，使用 `/export` 导出日志，发现内容不全

**可能原因**
- 导出功能对消息数量或总长度有限制
- 浏览器/终端缓冲区溢出导致截断
- 导出格式对大数据量处理不当

**解决方案**
1. **分段导出**：将长会话拆分为多个短会话，分别导出
2. **直接查看日志文件**：
   - 日志通常保存在 `~/.config/opencode/logs/` 或 `~/.opencode/logs/`
   - 直接复制原始日志文件而非使用 `/export` 命令
3. **增加导出限制**（如果配置支持）：
   ```bash
   opencode config set export.max_messages 10000
   ```
4. **使用脚本导出**：通过 API 或脚本批量获取完整对话历史

---

### 10. Subagent 误触发问题

**现象**
- OpenCode 的 Subagent 触发机制过于宽松，容易误触发

**解决方案**
1. **严格触发条件**：在 skill 配置中明确指定触发关键词或正则表达式
2. **禁用自动触发**：不配置自动触发条件，仅在用户显式调用时触发
3. **使用条件判断**：在 subagent 的触发逻辑中加入前置条件判断
   ```yaml
   # 示例：仅在明确指令时触发
   trigger:
     type: explicit
     command: "/call <subagent_name>"
   ```
4. **调整置信度阈值**：提高意图识别的置信度阈值，减少误匹配

---

## 四、Skill 与项目目录问题

### 11. Skill 项目级目录位置

**现象**
- 不清楚 OpenCode 的 skill 项目级目录应该放在哪里

**正确路径**
- 项目级 skill 目录：`./.skills/`（项目根目录下）
- 全局 skill 目录：`~/.config/opencode/skills/` 或 `~/.opencode/skills/`

**注意**
- 不要放在 `<项目根目录>/.skills/` 以外的位置，否则可能无法被正确加载
- 确保目录结构符合 OpenCode 的 skill 规范

---

### 12. Skill 嵌套与递归风险

**扩展场景**

**现象**
- 多个 skill 并发触发或嵌套调用，导致上下文膨胀（"语义爆栈"）

**解决方案**
1. 设计多 skill 协议，明确调用层级限制
2. 实现语义环路检测机制，防止循环调用
3. 设置最大递归深度，超过则自动终止
4. 使用推理预演机制，在正式调用前评估调用链长度

---

## 五、快速排查清单

遇到问题时，建议按以下顺序排查：

| 步骤 | 检查项 | 命令/方法 |
|------|--------|-----------|
| 1 | 确认安装成功 | `opencode --version` |
| 2 | 检查环境变量 | `echo $PATH` / `echo %PATH%` |
| 3 | 查看配置信息 | `opencode config list` |
| 4 | 检查网络连通性 | `curl -I <endpoint>` |
| 5 | 查看日志文件 | `cat ~/.config/opencode/logs/*.log` |
| 6 | 检查系统资源 | `htop` / `free -h` / `df -h` |
| 7 | 清理缓存重试 | `npm cache clean --force` |
| 8 | 使用最小配置测试 | 仅配置必要参数，排除干扰 |

---

## 六、通用安装问题扩展

以下问题不仅限于 OpenCode，也适用于其他 npm/Node.js 工具的安装：

### A. npm 安装权限问题
```bash
# 方案1：使用 nvm 管理 Node.js，避免权限问题
nvm install 20
nvm use 20
npm i -g opencode-ai

# 方案2：修改 npm 全局目录权限
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

### B. 企业内网离线安装
```bash
# 方案1：使用 npm pack 打包离线安装
npm pack opencode-ai
# 将生成的 tgz 文件拷贝到内网
npm i -g opencode-ai-<version>.tgz

# 方案2：使用 verdaccio 搭建私有 npm 仓库
```

### C. Docker 安装运行
```bash
# 使用 Docker 隔离环境，避免系统依赖问题
docker run -it --rm \
  -v ~/.opencode:/root/.opencode \
  -p 8080:8080 \
  opencode-ai:latest
```

---

> **文档版本**: v1.0  
> **更新日期**: 2026-07-04  
> **适用版本**: OpenCode 1.15.x+
