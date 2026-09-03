// 可选插件：会话开始时把 MEMORY.md 索引硬注入系统提示。
// 注意：experimental.chat.system.transform 在部分 opencode 版本会静默丢弃修改
// （见 anomalyco/opencode#17100）。AGENTS.md 是可靠主路径，此插件只是增强。
// 启用方式：在 opencode.json 的 "plugin" 数组中加入 "file://.opencode/plugin/memory-inject.js"

import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

export const MemoryInject = async ({ directory }) => {
  const indexPath = join(directory, ".opencode", "memory", "MEMORY.md")
  return {
    "experimental.chat.system.transform": async (_input, output) => {
      try {
        if (!existsSync(indexPath)) return
        const index = readFileSync(indexPath, "utf8").trim()
        if (!index) return
        output.system.push(
          `<memory-index source=".opencode/memory/MEMORY.md">\n` +
          `以下是本项目的长期记忆索引。需要细节时按指针用 grep/read 深入对应文件，不要假设索引包含全部信息。\n\n` +
          index +
          `\n</memory-index>`
        )
      } catch {
        // 任何失败都必须静默通过，不得阻断会话
      }
    },
  }
}
