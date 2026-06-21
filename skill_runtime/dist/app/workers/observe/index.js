import fs from "node:fs/promises";
import path from "node:path";
import { skillStableDir } from "../../shared/utils/paths.js";
import { createRunDir, writeJson, writeMarkdown, writeYaml } from "../../shared/utils/growthRun.js";
import { utcTimestamp } from "../../shared/utils/time.js";
export async function runObserve(skillId) {
    const evalPath = path.join(skillStableDir(skillId), "evals", "evals.json");
    const raw = await fs.readFile(evalPath, "utf-8");
    const evals = JSON.parse(raw);
    const utterances = evals.evals.map((e, i) => ({
        turn_id: `u${i + 1}`,
        text: e.prompt,
    }));
    const trace = {
        trace_id: `trace-${Date.now()}`,
        skill_id: skillId,
        skill_version: "stable",
        session_id: "eval-simulated",
        created_at: utcTimestamp(),
        raw_user_utterances: utterances,
        intent_summary: `基于 ${evals.evals.length} 条 eval prompt 模拟的会话轨迹，用于复盘 skill 的教学转化能力。`,
        runtime_context: {
            skill_files: ["SKILL.md", "evals/evals.json"],
            tools_available: [],
            api_docs_available: false,
        },
        tool_calls: [],
        script_calls: [
            {
                script_name: "normalize_trace.py",
                status: "success",
                summary: "从 evals.json 提取原始用户语句并构造 Runtime Trace",
            },
        ],
        hard_signals: {
            tool_failures: [],
            api_failures: [],
            schema_errors: [],
            quality_gate_failures: [],
        },
        soft_signals: {
            user_experience: [
                "用户希望 Agent 完成完整复盘，而不是在分析中间停顿提问",
                "用户希望批量编辑后自动进行交叉 review",
                "用户希望 Growth Proposal 后一键确认执行",
            ],
            director_notes: [],
        },
        growth_candidates: [
            { type: "positive_guidance", summary: "在 SKILL.md 中增加‘先完成全量分析，不中途提问’的正向引导" },
            { type: "quality_gate", summary: "批量编辑后自动运行交叉一致性检查" },
            { type: "workflow", summary: "补充 Observe / Grow / Rehearse / Stabilize 四阶段工作流说明" },
        ],
    };
    const replayCard = {
        card_id: `rc-${Date.now()}`,
        trace_id: trace.trace_id,
        skill_id: skillId,
        created_at: trace.created_at,
        markdown: buildReplayCardMarkdown(trace, evals.evals),
        sections: {
            learned: "用户在教学转化场景下希望 Agent 主动完成全量分析、减少中断，并支持一键确认。",
            evidence: utterances.map((u) => u.text.slice(0, 120) + "..."),
            behavior_observations: [
                "用户倾向于提供详细背景后要求直接输出方案",
                "用户不愿意回答细碎确认问题",
            ],
            success_signals: ["Eval prompt 覆盖零基础解释、客户汇报、技术分享三类典型场景"],
            growth_directions: [
                "强化 SKILL.md 的全量分析优先规则",
                "增加自动 Quality Gate 机制",
                "完善四阶段工作流 reference",
            ],
            preliminary_suggestions: [
                "更新 SKILL.md 正向引导",
                "新增 references/workflow.md",
                "新增 evals/quality_gate_post_edit.yaml",
            ],
        },
    };
    const opportunities = {
        opportunities_id: `opp-${Date.now()}`,
        trace_id: trace.trace_id,
        skill_id: skillId,
        created_at: trace.created_at,
        opportunities: trace.growth_candidates.map((c, i) => ({
            id: `opp-${i + 1}`,
            type: c.type,
            summary: c.summary,
            evidence: trace.soft_signals.user_experience,
            priority: i === 0 ? "high" : "medium",
            proposed_action: `在下一轮 Grow 中生成对应 ${c.type} 的修改/新增方案`,
        })),
    };
    const { runId, dir } = await createRunDir(skillId);
    await writeJson(path.join(dir, "runtime-trace.json"), trace);
    await writeMarkdown(path.join(dir, "replay-card.md"), replayCard.markdown);
    await writeYaml(path.join(dir, "growth-opportunities.yaml"), opportunities);
    return { runId, trace };
}
function buildReplayCardMarkdown(trace, evals) {
    const lines = [
        "# Runtime Replay Card",
        "",
        "## 1. 本次会话学到了什么",
        trace.intent_summary,
        "",
        "## 2. 原始用户语句证据",
        ...trace.raw_user_utterances.map((u) => `> ${u.text.replace(/\n/g, "\n> ")}`),
        "",
        "## 3. 行为观察",
        ...trace.soft_signals.user_experience.map((s) => `- ${s}`),
        "",
        "## 4. 成功信号",
        `- 覆盖 ${evals.length} 个 eval 场景`,
        "",
        "## 5. 需要生长的方向",
        ...trace.growth_candidates.map((c) => `- **${c.type}**: ${c.summary}`),
        "",
        "## 6. 初步生长建议",
        "- 更新 SKILL.md 增加全量分析优先规则",
        "- 新增 references/workflow.md 描述四阶段工作流",
        "- 批量编辑后自动触发 Quality Gate",
    ];
    return lines.join("\n");
}
//# sourceMappingURL=index.js.map