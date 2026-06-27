#!/usr/bin/env node
/**
 * 环境预检脚本 — 在 pnpm dev / pnpm start 之前运行，验证所有前置条件。
 * 用法：pnpm check  或  tsx scripts/check-prereqs.ts
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "cross-spawn";
import net from "node:net";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

let ok = 0;
let warn = 0;
let fail = 0;

function pass(msg: string) { ok++; console.log(`  ✅ ${msg}`); }
function warnMsg(msg: string) { warn++; console.warn(`  ⚠️  ${msg}`); }
function failMsg(msg: string) { fail++; console.error(`  ❌ ${msg}`); }

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(2000);
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
    s.once("timeout", () => { s.destroy(); resolve(false); });
    s.connect(port, "127.0.0.1");
  });
}

async function checkCommand(cmd: string, ...args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: "pipe" });
    let out = "";
    p.stdout?.on("data", (d) => (out += d.toString()));
    p.on("exit", (code) => resolve(code === 0));
    p.on("error", () => resolve(false));
    setTimeout(() => { p.kill(); resolve(false); }, 10000);
  });
}

async function main() {
  console.log("\n🔍 Skill Growth Studio — 环境预检\n");

  // 1. Node version
  const nodeMajor = parseInt(process.versions.node.split(".")[0]!, 10);
  if (nodeMajor >= 20) pass(`Node.js ${process.versions.node}`);
  else failMsg(`Node.js ${process.versions.node} — 需要 >= 20`);

  // 2. node_modules
  if (await exists(path.join(REPO_ROOT, "node_modules", "express")))
    pass("node_modules/ 已安装");
  else
    failMsg("node_modules/ 未安装 — 请运行 pnpm install");

  // 3. skills/ has content
  try {
    const skills = await fs.readdir(path.join(REPO_ROOT, "skills"));
    const valid = [];
    for (const s of skills) {
      if (s.startsWith(".")) continue;
      if (await exists(path.join(REPO_ROOT, "skills", s, "stable", "SKILL.md"))) valid.push(s);
    }
    if (valid.length > 0) pass(`skills/ 有 ${valid.length} 个有效 skill: ${valid.join(", ")}`);
    else warnMsg("skills/ 没有任何有效的 skill — 请创建 skills/<id>/stable/SKILL.md");
  } catch {
    failMsg("skills/ 目录不存在");
  }

  // 4. configs
  if (await exists(path.join(REPO_ROOT, "configs", "model-providers", "local-v1.yaml")))
    pass("configs/model-providers/local-v1.yaml 存在");
  else
    failMsg("configs/model-providers/local-v1.yaml 不存在");

  // 5. opencode CLI
  if (await checkCommand("opencode", "--version"))
    pass("opencode CLI 可用");
  else
    warnMsg("opencode CLI 未安装 — 请运行 npm install -g @opencode-ai/opencode-ai（Stage 启动需要）");

  // 6. bwrap
  if (process.env.STAGE_USE_BWRAP !== "0" && process.env.STAGE_USE_BWRAP !== "false") {
    const bwrapPath = "/usr/bin/bwrap";
    if (await exists(bwrapPath))
      pass("bwrap 可用 (Stage 沙箱已启用)");
    else
      warnMsg(`bwrap 未安装 — Stage 将在无沙箱模式运行。安装: apt install bubblewrap  或设置 STAGE_USE_BWRAP=0`);
  } else {
    pass("bwrap 已通过 STAGE_USE_BWRAP=0 关闭");
  }

  // 7. Port
  const PORT = Number(process.env.SKILL_GROWTH_PORT ?? 3000);
  if (!(await checkPort(PORT)))
    pass(`端口 ${PORT} 空闲`);
  else
    failMsg(`端口 ${PORT} 被占用 — 设置 SKILL_GROWTH_PORT= 换一个端口`);

  // 8. Model endpoint
  const localV1URL = process.env.SKILL_GROWTH_RECOMMENDER_URL
    ?? process.env.SKILL_GROWTH_LOCAL_V1_URL
    ?? "http://172.24.16.1:11434/v1";
  try {
    const resp = await fetch(`${localV1URL}/models`, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) pass(`模型端点可达: ${localV1URL}`);
    else warnMsg(`模型端点返回 ${resp.status}: ${localV1URL} — 请检查配置`);
  } catch {
    warnMsg(`模型端点不可达: ${localV1URL} — Stage 启动后 LLM 调用可能失败`);
  }

  // Summary
  console.log(`\n  ${ok} 通过  ${warn} 警告  ${fail} 失败\n`);
  if (fail > 0) {
    console.log("请修复上面的失败项后再启动。\n");
    process.exit(1);
  }
  console.log("一切就绪，可以启动！\n");
}

main().catch((err) => {
  console.error("预检失败:", err);
  process.exit(1);
});
