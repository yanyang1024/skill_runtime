# OpenCode 多交互方式使用指南：终端、Web 与桌面端全对比

> 文档版本：2026-07-15  
> 适用 OpenCode 版本：v1.4.x+  
> 官方文档：https://opencode.ai/docs/

---

## 目录

- [一、三种交互方式概览](#一三种交互方式概览)
- [二、OpenCode 终端（TUI / CLI）](#二opencode-终端tui--cli)
- [三、OpenCode Web](#三opencode-web)
- [四、OpenCode 桌面端（Desktop）](#四opencode-桌面端desktop)
- [五、三种方式的核心差异对比](#五三种方式的核心差异对比)
- [六、配置文件体系与通用配置](#六配置文件体系与通用配置)
- [七、Windows 与 Linux 平台踩坑指南](#七windows-与-linux-平台踩坑指南)
- [八、常见问题速查（FAQ）](#八常见问题速查faq)
- [九、选择建议：哪种方式适合你](#九选择建议哪种方式适合你)

---

## 一、三种交互方式概览

OpenCode 提供 **终端（TUI）**、**Web 界面** 和 **桌面应用** 三种核心交互方式，分别适用于不同的工作场景：

| 维度 | 终端（TUI） | Web | 桌面端（Desktop） |
|------|-----------|-----|----------------|
| **启动命令** | `opencode` | `opencode web` | 双击 `.exe` 或应用图标 |
| **运行环境** | 终端模拟器 | 浏览器（现代浏览器） | 独立应用窗口 |
| **后端依赖** | 内置，无额外依赖 | 本地服务器（`opencode web` 启动） | 内置本地服务器 |
| **适用场景** | 日常开发、快速操作 | 远程访问、团队协作、偏好 GUI | 完整功能体验、多项目管理 |
| **终端集成** | 原生 | 通过浏览器标签页 | 内置终端模拟 |
| **文件系统访问** | 直接访问 | 通过服务器代理 | 直接访问 |
| **跨平台支持** | Win/macOS/Linux | 任何有浏览器的设备 | Win/macOS/Linux |

### 三者的关系架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenCode 核心引擎                          │
│                   （配置、模型、工具、Agent）                      │
└──────────────┬───────────────────────┬──────────────────────────┘
               │                       │
      ┌────────▼────────┐    ┌────────▼────────┐    ┌──────────────▼──────────┐
      │   终端 TUI       │    │   Web 服务器     │    │      桌面端应用          │
      │  (INK/React)     │    │  (HTTP Server)   │    │   (Electron/WebView2)   │
      └─────────────────┘    └────────┬────────┘    └─────────────────────────┘
                                      │
                               ┌──────▼──────┐
                               │   浏览器      │
                               │ (UI 渲染层)   │
                               └─────────────┘
```

**核心要点**：三种方式共享同一套配置体系和核心引擎，区别在于 **UI 渲染层** 和 **交互模式** 不同。

---

## 二、OpenCode 终端（TUI / CLI）

### 2.1 简介

终端界面是 OpenCode 的 **默认且最成熟** 的交互方式。它通过终端用户界面（TUI，Text User Interface）将 AI 对话、代码编辑、Shell 命令执行融为一体。

### 2.2 安装方式

#### Linux / macOS（推荐）

```bash
# 官方安装脚本（推荐）
curl -fsSL https://opencode.ai/install | bash

# Homebrew（macOS/Linux）
brew install anomalyco/tap/opencode

# npm
npm install -g opencode-ai

# Arch Linux
sudo pacman -S opencode
paru -S opencode-bin  # AUR 最新版
```

#### Windows

```powershell
# Chocolatey
choco install opencode

# Scoop
scoop install opencode

# npm
npm install -g opencode-ai

# 注意：Windows 上 Bun 安装方式仍在开发中
```

### 2.3 启动与基本使用

```bash
# 在当前目录启动 TUI
opencode

# 指定项目目录
opencode /path/to/project

# 继续上次会话
opencode --continue
opencode -c

# 指定会话
opencode --session <session-id>

# 指定模型
opencode --model anthropic/claude-sonnet-4-5

# 指定 Agent
opencode --agent plan
```

### 2.4 核心交互语法

| 语法 | 说明 | 示例 |
|------|------|------|
| `@文件名` | 模糊搜索并引用文件 | `How is auth handled in @src/api/index.ts?` |
| `!命令` | 执行 Shell 命令 | `!ls -la` |
| `/命令` | 执行内置斜杠命令 | `/help`, `/connect`, `/undo` |
| `Ctrl+X` | 快捷键前缀（Leader Key） | `Ctrl+X C` = `/compact` |

### 2.5 常用斜杠命令

| 命令 | 别名 | 功能 | 快捷键 |
|------|------|------|--------|
| `/connect` | - | 添加/配置模型提供商 | - |
| `/compact` | `/summarize` | 压缩当前会话上下文 | `Ctrl+X C` |
| `/details` | - | 切换工具执行详情显示 | `Ctrl+X D` |
| `/editor` | - | 打开外部编辑器 | `Ctrl+X E` |
| `/exit` | `/quit`, `/q` | 退出 TUI | `Ctrl+X Q` |
| `/export` | - | 导出对话为 Markdown | `Ctrl+X X` |
| `/help` | - | 显示帮助面板 | `Ctrl+X H` |
| `/init` | - | 创建/更新 AGENTS.md | `Ctrl+X I` |
| `/models` | - | 列出可用模型 | `Ctrl+X M` |
| `/new` | `/clear` | 新建会话 | `Ctrl+X N` |
| `/redo` | - | 重做上次撤销 | `Ctrl+X R` |
| `/sessions` | `/resume` | 会话列表与切换 | `Ctrl+X L` |
| `/share` | - | 分享当前会话 | `Ctrl+X S` |
| `/themes` | - | 列出/切换主题 | `Ctrl+X T` |
| `/thinking` | - | 显示/隐藏推理过程 | - |
| `/undo` | - | 撤销上条消息（含文件变更） | `Ctrl+X U` |

### 2.6 CLI 命令（非交互式）

```bash
# 直接运行单条命令（无 TUI）
opencode run "Explain how closures work in JavaScript"

# 启动无头服务器
opencode serve --port 4096 --hostname 0.0.0.0

# 附加 TUI 到远程服务器
opencode attach http://10.20.30.40:4096

# 查看调试信息
opencode debug
opencode debug config      # 查看配置
opencode debug paths       # 查看路径
opencode debug skill       # 查看技能

# 管理提供商
opencode providers list

# 管理模型
opencode models
opencode models nvidia     # 查看指定提供商的模型

# 管理 MCP 服务器
opencode mcp list
opencode mcp add

# 升级
opencode upgrade

# Agent 管理
opencode agent list
opencode agent create
```

### 2.7 终端环境变量

| 变量 | 类型 | 说明 |
|------|------|------|
| `OPENCODE_CONFIG` | string | 自定义配置文件路径 |
| `OPENCODE_TUI_CONFIG` | string | TUI 配置文件路径 |
| `OPENCODE_CONFIG_DIR` | string | 配置目录路径 |
| `OPENCODE_AUTO_SHARE` | boolean | 自动分享会话 |
| `OPENCODE_SERVER_PASSWORD` | string | Web/serve 基本认证密码 |
| `OPENCODE_SERVER_USERNAME` | string | Web/serve 基本认证用户名 |
| `OPENCODE_DISABLE_AUTOUPDATE` | boolean | 禁用自动更新检查 |
| `OPENCODE_DISABLE_AUTOCOMPACT` | boolean | 禁用自动上下文压缩 |
| `OPENCODE_ENABLE_EXPERIMENTAL_MODELS` | boolean | 启用实验性模型 |
| `OPENCODE_GIT_BASH_PATH` | string | Windows Git Bash 路径 |

---

## 三、OpenCode Web

### 3.1 简介

Web 模式允许通过浏览器使用 OpenCode，适合 **远程访问**、**团队协作** 或 **偏好图形界面** 的用户。Web 界面通过启动本地 HTTP 服务器，在浏览器中提供与 TUI 相同的核心功能。

### 3.2 启动方式

```bash
# 基础启动（自动打开浏览器，随机端口）
opencode web

# 指定端口
opencode web --port 4096

# 允许外部访问（局域网/远程）
opencode web --hostname 0.0.0.0

# 启用 mDNS（局域网自动发现）
opencode web --mdns
opencode web --mdns --mdns-domain myproject.local

# 配置 CORS
opencode web --cors https://example.com

# 设置密码保护
OPENCODE_SERVER_PASSWORD=secret opencode web
```

### 3.3 与 `opencode serve` 的区别

| 特性 | `opencode web` | `opencode serve` |
|------|---------------|-----------------|
| **自动打开浏览器** | 是 | 否 |
| **适用场景** | 本地开发、临时使用 | 长期运行、后台服务 |
| **守护进程化** | 否 | 更适合 |
| **API 功能** | 完整 UI + API | 纯 API 端点 |
| **systemd 服务** | 不推荐 | 推荐 |

```bash
# serve 更适合作为后台服务
opencode serve --hostname 0.0.0.0 --port 4096

# 然后可在另一终端附加 TUI
opencode attach http://localhost:4096
```

### 3.4 Web 界面功能

- **会话管理**：查看和管理所有会话
- **服务器状态**：查看连接的服务器及其状态
- **多项目切换**：通过服务器选择器切换不同项目
- **基本认证**：通过环境变量设置用户名/密码

### 3.5 Web 服务器配置（配置文件方式）

```json
{
  "$schema": "https://opencode.ai/config.json",
  "server": {
    "port": 4096,
    "hostname": "0.0.0.0",
    "mdns": true,
    "mdnsDomain": "myproject.local",
    "cors": ["http://localhost:5173"]
  }
}
```

---

## 四、OpenCode 桌面端（Desktop）

### 4.1 简介

桌面应用是 OpenCode 的 **图形化版本（BETA）**，提供独立的应用窗口，结合了 Web 界面的可视化体验和原生应用的系统集成能力。

### 4.2 下载与安装

| 平台 | 安装包 | 安装方式 |
|------|--------|----------|
| macOS (Apple Silicon) | `opencode-desktop-mac-arm64.dmg` | 官网下载或 Homebrew |
| macOS (Intel) | `opencode-desktop-mac-x64.dmg` | 官网下载 |
| **Windows** | **`opencode-desktop-windows-x64.exe`** | 官网下载或 Scoop |
| Linux | `.deb` / `.rpm` / `.AppImage` | 官网下载 |

```bash
# macOS (Homebrew)
brew install --cask opencode-desktop

# Windows (Scoop)
scoop bucket add extras
scoop install extras/opencode-desktop
```

### 4.3 桌面端架构

桌面端本质是一个 **封装了 Web UI 的本地应用**，内部运行机制：

```
┌─────────────────────────────────────┐
│        桌面应用窗口 (UI 层)           │
│   (Electron / WebView2 / WebKit)    │
└──────────────┬──────────────────────┘
               │
      ┌────────▼────────┐
      │   本地服务器      │
      │  (opencode-cli   │
      │   子进程)        │
      └─────────────────┘
```

- 桌面应用在后台启动一个 `opencode-cli` 本地服务器进程
- UI 层通过本地 HTTP/WebSocket 与服务器通信
- 大多数问题来源于 **插件异常**、**缓存损坏** 或 **错误的服务器设置**

### 4.4 桌面端特有的功能

| 功能 | 说明 |
|------|------|
| **系统集成** | 系统通知、文件关联、Dock/Taskbar 集成 |
| **多项目管理** | 可视化项目切换 |
| **服务器选择器** | 可连接远程服务器或本地服务器 |
| **自动更新** | 内置自动更新检查 |

### 4.5 桌面端数据存储位置

| 平台 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/opencode/` |
| Linux | `~/.local/share/opencode/` |
| Windows | `%APPDATA%\opencode\` |

关键文件：

- `opencode.settings.dat`：桌面默认服务器 URL
- `opencode.global.dat`：全局 UI 状态
- `opencode.workspace.*.dat`：工作区状态（最近服务器/项目）

---

## 五、三种方式的核心差异对比

### 5.1 功能特性对比

| 特性 | 终端 TUI | Web | 桌面端 |
|------|----------|-----|--------|
| **交互方式** | 键盘驱动、命令行 | 鼠标+键盘、图形界面 | 鼠标+键盘、原生应用 |
| **文件引用 `@`** | 支持 | 支持 | 支持 |
| **Shell 命令 `!`** | 原生执行 | 通过服务器代理 | 内置终端 |
| **会话管理** | `/sessions` | 可视化界面 | 可视化界面 |
| **撤销/重做** | `/undo`, `/redo` | 支持 | 支持 |
| **主题切换** | `/themes` | 支持 | 支持 |
| **图片输入** | 拖放 | 拖放/上传 | 拖放 |
| **桌面通知** | 需配置 `attention` | 浏览器通知 | 系统原生通知 |
| **多项目并行** | 多终端窗口 | 多浏览器标签 | 内置多项目管理 |
| **远程访问** | `opencode attach` | 内置 | 需配置服务器地址 |
| **离线能力** | 完全离线 | 需本地服务器运行 | 完全离线 |

### 5.2 配置差异

| 配置维度 | 终端 TUI | Web | 桌面端 |
|----------|----------|-----|--------|
| **主配置文件** | `~/.config/opencode/opencode.json` | 同左 | 同左 |
| **TUI 配置** | `~/.config/opencode/tui.json` | 不适用 | 不适用 |
| **服务器配置** | CLI 参数 | `server` 配置节 | 可视化设置 |
| **数据存储** | `~/.local/share/opencode/` | 同左 | 额外桌面应用数据 |

### 5.3 性能与资源占用

| 维度 | 终端 TUI | Web | 桌面端 |
|------|----------|-----|--------|
| **内存占用** | 低（纯终端） | 中（浏览器+服务器） | 中（应用+服务器） |
| **启动速度** | 快 | 中（需启动服务器） | 中（需启动应用+服务器） |
| **GPU 需求** | 无 | 无 | Windows 需 WebView2 |
| **终端模拟器** | 需要（推荐 GPU 加速） | 不需要 | 内置 |

### 5.4 使用场景推荐

| 场景 | 推荐方式 | 理由 |
|------|----------|------|
| 日常快速编码 | TUI | 启动快、键盘驱动效率高 |
| 长时间复杂任务 | TUI / Desktop | 稳定性好、会话管理强 |
| 团队协作/远程 | Web | 易于共享访问 |
| CI/CD 集成 | CLI (`opencode run`) | 无交互、脚本化 |
| 偏好 GUI 用户 | Desktop / Web | 可视化操作 |
| Windows 用户 | Desktop + WSL 后端 | 最佳兼容性 |

---

## 六、配置文件体系与通用配置

### 6.1 配置文件优先级（从高到低）

```
1. Managed Config (企业强制配置)  ← 最高优先级
2. Project Config (./opencode.json)
3. Environment Variable (OPENCODE_CONFIG)
4. Global Config (~/.config/opencode/opencode.json)
5. Remote Config (组织默认配置)    ← 最低优先级
```

### 6.2 全局配置（所有方式共用）

**路径**：

- Linux/macOS：`~/.config/opencode/opencode.json`
- Windows：`%USERPROFILE%\.config\opencode\opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-5",
  "provider": {
    "anthropic": {
      "options": {
        "apiKey": "sk-ant-..."
      }
    }
  },
  "autoupdate": true,
  "share": "manual",
  "tools": {
    "write": true,
    "bash": true,
    "edit": true,
    "read": true
  },
  "permission": {
    "*": "allow",
    "bash": {
      "*": "allow",
      "rm *": "ask",
      "rmdir *": "ask"
    }
  }
}
```

### 6.3 TUI 专属配置

**路径**：

- Linux/macOS：`~/.config/opencode/tui.json`
- Windows：`%USERPROFILE%\.config\opencode\tui.json`

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "theme": "opencode",
  "leader_timeout": 2000,
  "keybinds": {
    "leader": "ctrl+x",
    "command_list": "ctrl+p"
  },
  "scroll_speed": 3,
  "scroll_acceleration": {
    "enabled": true
  },
  "diff_style": "auto",
  "mouse": true,
  "attention": {
    "enabled": true,
    "notifications": true,
    "sound": true,
    "volume": 0.4
  }
}
```

### 6.4 项目级配置

在项目根目录创建 `opencode.json`，可被提交到 Git：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-5",
  "instructions": ["docs/guidelines.md", ".cursor/rules/*.md"],
  "formatter": {
    "prettier": {
      "command": ["npx", "prettier", "--write", "$FILE"]
    }
  }
}
```

### 6.5 重要环境变量（跨平台）

| 变量 | 说明 | 适用场景 |
|------|------|----------|
| `OPENCODE_CONFIG` | 自定义配置文件路径 | 多配置切换 |
| `OPENCODE_TUI_CONFIG` | TUI 配置文件路径 | TUI 个性化 |
| `OPENCODE_CONFIG_DIR` | 配置目录（覆盖默认） | 自定义配置结构 |
| `OPENCODE_SERVER_PASSWORD` | Web/Serve 密码 | 远程访问安全 |
| `OPENCODE_DISABLE_AUTOUPDATE` | 禁用自动更新 | 稳定环境 |

---

## 七、Windows 与 Linux 平台踩坑指南

### 7.1 Windows 平台特有问题

#### 问题 1：路径和 Shell 兼容性

**现象**：OpenCode 在 Windows 上行为异常，路径解析错误，Shell 命令执行失败。

**根因**：OpenCode 的设计偏向 Unix 环境，部分功能在 Windows 原生环境有兼容性问题。

**解决方案**：

```powershell
# 强烈推荐使用 WSL（Windows Subsystem for Linux）
# WSL 安装后，在 WSL 终端中运行 OpenCode：
wsl
cd /mnt/c/Users/YourName/project
opencode
```

**官方明确建议**："Windows 上推荐使用 WSL 以获得最佳体验"。

#### 问题 2：`opencode upgrade` 无法检测安装方式

**现象**：运行 `opencode upgrade` 时提示 "may be managed by a package manager"，无法自动升级。

**根因**：Windows 上 `npm` 实际是 `npm.cmd`，`child_process.spawn()` 无 `shell: true` 时无法解析 `.cmd`/`.bat` 文件。

**影响版本**：v1.2.25 及早期版本

**解决方案**：

```powershell
# 方案 1：手动升级
npm install -g opencode-ai@latest

# 方案 2：通过包管理器升级
choco upgrade opencode
scoop update opencode
```

#### 问题 3：桌面端空白窗口 / 无法启动

**现象**：OpenCode Desktop 打开后显示空白窗口或直接崩溃。

**根因**：缺少 Microsoft Edge WebView2 Runtime。

**解决方案**：

1. 下载并安装 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
2. 重启桌面应用

#### 问题 4：性能缓慢、文件访问问题

**现象**：Windows 上运行缓慢，文件操作卡顿。

**解决方案**：

- 使用 WSL 运行 OpenCode（推荐）
- 将项目克隆到 WSL 文件系统（`~/code/`）而非 `/mnt/c/`
- 关闭 Windows Defender 实时扫描（针对项目目录）

#### 问题 5：WSL 配置文件写入错误路径

**现象**：在 WSL 中运行安装器时，配置被写入 `C:\Users\<user>\.config\opencode\` 而非 WSL 的 `~/.config/opencode/`。

**根因**：安装器错误解析了 home 目录（`os.homedir()` 返回 `/mnt/c/Users/...`）。

**解决方案**：

```bash
# 手动复制配置文件
cp /mnt/c/Users/$USER/.config/opencode/*.json ~/.config/opencode/

# 然后修正模型提供商前缀（如 vercel/ → 实际提供商）
```

#### 问题 6：npm 全局安装后命令不识别

**现象**：安装后运行 `opencode` 提示 "not recognized"。

**解决方案**：

```powershell
# 检查 npm 全局路径是否在 PATH 中
npm config get prefix

# 确保关闭了所有终端后重新打开
# 或使用 npx 临时运行
npx opencode-ai
```

#### 问题 7：WSL 中 `opencode web` 的 localhost 问题

**现象**：WSL 中启动 `opencode web` 后，Windows 浏览器无法访问 `localhost`。

**解决方案**：

```bash
# 使用 --hostname 0.0.0.0
opencode web --hostname 0.0.0.0

# 然后在 Windows 浏览器中使用 WSL IP 地址
# 获取 WSL IP：
hostname -I
# 访问 http://<wsl-ip>:<port>
```

---

### 7.2 Linux 平台特有问题

#### 问题 1：Wayland 显示问题

**现象**：桌面应用在 Wayland 下出现空白窗口或合成器错误。

**解决方案**：

```bash
# 尝试允许 Wayland
OC_ALLOW_WAYLAND=1 opencode-desktop

# 如果问题更严重，切换回 X11
# 或使用 XWayland 兼容模式
```

#### 问题 2：复制/粘贴不可用

**现象**：TUI 中无法复制或粘贴。

**根因**：缺少剪贴板工具。

**解决方案**：

```bash
# X11 系统
sudo apt install -y xclip
# 或
sudo apt install -y xsel

# Wayland 系统
sudo apt install -y wl-clipboard

# 无头环境（服务器）
sudo apt install -y xvfb
Xvfb :99 -screen 0 1024x768x24 > /dev/null 2>&1 &
export DISPLAY=:99.0
```

#### 问题 3：权限错误（EACCES）

**现象**：启动时提示 `EACCES: permission denied`。

**解决方案**：

```bash
# 修复目录权限
sudo chown -R $(whoami) ~/.local
chmod -R 755 ~/.local

# 或使用 sudo 运行（不推荐长期使用）
sudo opencode
```

#### 问题 4：桌面应用存储重置

**现象**：桌面应用无法启动，且无法从 UI 清除设置。

**解决方案**：

```bash
# 完全退出桌面应用
# 删除保存状态文件
rm ~/.local/share/opencode-desktop/opencode.settings.dat
rm ~/.local/share/opencode-desktop/opencode.global.dat
rm ~/.local/share/opencode-desktop/opencode.workspace.*.dat

# 重启应用
```

#### 问题 5：GPU 终端模拟器推荐

虽然 OpenCode TUI 可在标准终端运行，但官方推荐 GPU 加速终端以获得最佳体验：

| 终端 | 平台 | 特点 |
|------|------|------|
| WezTerm | 跨平台 | 官方首推，功能全面 |
| Alacritty | 跨平台 | 极简、高性能 |
| Ghostty | Linux/macOS | 现代化功能丰富 |
| Kitty | Linux/macOS | 支持图像协议 |

---

### 7.3 跨平台通用踩坑点

#### 问题 1：Provider 包缓存损坏

**现象**：API 调用错误、模型无法加载。

**解决方案**：

```bash
# 清除缓存（所有平台）
rm -rf ~/.cache/opencode

# Windows
rmdir /s /q %USERPROFILE%\.cache\opencode
```

#### 问题 2：配置优先级冲突

**现象**：修改全局配置后不生效。

**根因**：项目级配置 `opencode.json` 覆盖了全局配置。

**排查**：

```bash
# 查看当前生效的配置
opencode debug config
```

#### 问题 3：桌面应用服务器连接失败

**现象**：桌面应用显示 "Connection Failed" 或卡在启动画面。

**排查步骤**：

1. 检查是否配置了自定义服务器 URL → 清除默认服务器设置
2. 检查环境变量 `OPENCODE_PORT` 是否冲突
3. 检查 `opencode.json` 中的 `server` 配置 → 临时移除
4. 检查端口是否被占用

#### 问题 4：Git 依赖

**现象**：`/undo` 和 `/redo` 命令不工作。

**根因**：这两个命令依赖 Git 管理文件变更，项目必须是 Git 仓库。

**解决方案**：

```bash
git init
git add .
git commit -m "Initial commit"
```

#### 问题 5：模型引用格式错误

**现象**：`ProviderModelNotFoundError`。

**正确格式**：`<providerId>/<modelId>`

```
正确：openai/gpt-4.1
正确：openrouter/google/gemini-2.5-flash
正确：opencode/kimi-k2
错误：gpt-4.1（缺少提供商前缀）
```

---

## 八、常见问题速查（FAQ）

### Q1: 三种方式可以共用配置吗？

**可以**。三种方式读取相同的配置文件（`~/.config/opencode/opencode.json`），但 TUI 有额外的 `tui.json` 配置。

### Q2: 在 Windows 上到底该用哪种方式？

**推荐组合**：

- **最佳体验**：WSL2 中安装 OpenCode CLI + Windows 桌面应用连接 WSL 服务器
- **快速使用**：直接安装桌面应用（`opencode-desktop-windows-x64.exe`）
- **脚本/CI**：使用 WSL 中的 CLI 模式

### Q3: `opencode web` 和桌面应用有什么关系？

桌面应用 **内部使用了 Web 技术** 渲染 UI，但它是一个独立的可执行文件，不需要手动运行 `opencode web`。桌面应用会自动管理后端服务器进程。

### Q4: 可以同时运行多种方式吗？

**可以**，但需要注意：

- 同一项目同时只能有一个活跃会话
- `opencode serve` 和 `opencode web` 会占用端口
- 桌面应用会启动自己的独立服务器

### Q5: 远程服务器如何附加 TUI？

```bash
# 服务器端
opencode serve --hostname 0.0.0.0 --port 4096

# 客户端（TUI 附加）
opencode attach http://remote-ip:4096 --password your-password
```

### Q6: 桌面应用如何连接 WSL 中的服务器？

```bash
# 在 WSL 中
opencode serve --hostname 0.0.0.0 --port 4096

# 获取 WSL IP
hostname -I

# 在桌面应用的服务器选择器中输入
# http://<wsl-ip>:4096
```

### Q7: 如何清除所有数据重新安装？

```bash
# Linux/macOS
rm -rf ~/.local/share/opencode
rm -rf ~/.cache/opencode
rm -rf ~/.config/opencode

# Windows
rmdir /s /q %USERPROFILE%\.local\share\opencode
rmdir /s /q %USERPROFILE%\.cache\opencode
rmdir /s /q %USERPROFILE%\.config\opencode
```

---

## 九、选择建议：哪种方式适合你

### 决策流程图

```
                    ┌─────────────────┐
                    │  开始使用 OpenCode │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   使用 Windows？   │
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                   是                否
                    │                 │
            ┌───────▼────────┐ ┌──────▼───────┐
            │ 熟悉 WSL/CLI？  │ │  偏好 GUI？   │
            └───────┬────────┘ └──────┬───────┘
                    │                 │
            ┌───────┴───────┐  ┌──────┴───────┐
            │               │  │              │
           是              否  是             否
            │               │  │              │
    ┌───────▼──────┐ ┌──────▼─────┐ ┌──────▼──────┐
    │ WSL+TUI/Attach│ │ 桌面应用    │ │  TUI 终端    │
    │   (最佳体验)  │ │ (推荐)      │ │ (推荐)      │
    └──────────────┘ └────────────┘ └─────────────┘
```

### 快速选择指南

| 你的情况 | 推荐方式 |
|----------|----------|
| 开发者，习惯命令行 | **TUI** |
| Windows 用户，追求最佳兼容性 | **WSL + TUI / Desktop** |
| 偏好图形界面 | **桌面应用** |
| 需要远程访问/共享 | **Web (`opencode web`)** |
| CI/CD 自动化 | **CLI (`opencode run`)** |
| 多设备切换 | **Web + 服务器模式** |

---

## 参考链接

| 资源 | 地址 |
|------|------|
| 官方文档 | https://opencode.ai/docs/ |
| GitHub 仓库 | https://github.com/anomalyco/opencode |
| 配置文件说明 | https://opencode.ai/docs/config/ |
| TUI 文档 | https://opencode.ai/docs/tui/ |
| Web 文档 | https://opencode.ai/docs/web/ |
| CLI 文档 | https://opencode.ai/docs/cli/ |
| Windows/WSL 指南 | https://opencode.ai/docs/windows-wsl |
| 故障排除 | https://opencode.ai/docs/troubleshooting/ |
| 桌面应用下载 | https://opencode.ai/download |
| Discord 社区 | https://opencode.ai/discord |

---

> 本文档基于 OpenCode 官方文档（2026-07-14 版本）及社区实践整理，实际功能可能随版本更新有所变化，建议以官方文档为准。
