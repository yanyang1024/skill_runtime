#!/usr/bin/env python3
"""Merge existing outputs into one short, evidence-first action board.

No composite score and no department ranking. Missing optional inputs stay unknown.
"""
import argparse
import json
from itertools import zip_longest
from pathlib import Path

from common import cell, rate, read_jsonl, write_json, write_text


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def optional_jsonl(path):
    # Omitted != supplied but empty. A misspelled explicit path must fail visibly.
    return read_jsonl(path) if path else None


def show(value):
    return "未知（未提供）" if value is None else cell(value)


def tool_actions(rows, limit=8):
    actions = []
    phase_order = {"production": 0, "acceptance": 1, "unknown": 2, "development": 3}
    ranked = sorted(
        (r for r in rows if r.get("unexpected_errors", 0) > 0 or r.get("assertion_failed", 0) > 0),
        key=lambda r: (phase_order.get(r.get("phase"), 4), -r.get("unexpected_errors", 0), r.get("org", "")),
    )
    # Show each phase before adding more from one phase; not a quality ranking.
    queues = [[r for r in ranked if r.get("phase", "unknown") == phase] for phase in phase_order]
    balanced = [r for batch in zip_longest(*queues) for r in batch if r is not None]
    for r in balanced[:limit]:
        phase = r.get("phase", "unknown")
        if phase == "unknown":
            next_step = "先核对该调用属于开发、验收还是生产，再选择一个错误样本复现"
        elif phase == "development":
            next_step = "核对测试断言；保留预期负例，选择未通过断言或未解释错误做回归题"
        else:
            next_step = "选择一个高频 error_kind，在相同版本与输入下复现；无修复权限时冻结为回归题"
        denom = r.get("non_expected_test_calls", 0)
        actions.append({
            "kind": "tool_diagnostic",
            "tenant_id": r.get("tenant_id", "unknown"),
            "org": r.get("org", "unknown"),
            "phase": phase,
            "tool": r.get("tool_id", "unknown"),
            "capability": f"{r.get('capability_kind','unknown')}:{r.get('capability_id','unbound')}",
            "evidence": {"remaining_errors": r.get("unexpected_errors", 0), "eligible_calls": denom,
                         "assertion_failed": r.get("assertion_failed", 0),
                         "observed_sessions": r.get("observed_sessions", 0), "error_kinds": r.get("error_kinds", {})},
            "display": rate(r.get("unexpected_errors", 0), denom) + f"；断言失败 {r.get('assertion_failed',0)}（不相加）",
            "next_step": next_step,
            "not_claim": "不是部门价值排名，也不是已确认工具缺陷率",
        })
    return actions


def build(metrics, tools, capabilities, supply, artifacts):
    human_known = metrics.get("outcome_known")
    sessions = metrics.get("cohort_sessions")
    confirmed = [x for x in (artifacts or []) if x.get("source_attribution_confirmed")]
    hash_candidates = [x for x in (artifacts or []) if x.get("method") == "identical_bytes_candidate"]
    usage = {
        "window": metrics.get("window"),
        "cohort_sessions": sessions,
        "active_users": metrics.get("active_users_with_timestamped_user_message"),
        "input_tokens_observed": metrics.get("input_tokens_observed"),
        "output_tokens_observed": metrics.get("output_tokens_observed"),
        "usage_observations": metrics.get("usage_observations"),
        "human_outcome_known": human_known,
        "human_outcome_coverage": human_known / sessions if sessions and human_known is not None else None,
        "auto_assessed_sessions": metrics.get("auto_assessed_sessions"),
        "confirmed_used_work_items": metrics.get("deduplicated_used_work_items"),
    }
    actions = tool_actions(tools)
    for r in (supply or [])[:5]:
        actions.append({"kind": "capability_supply_check", "org": r.get("org", "unknown"),
            "capability": f"{r.get('kind','unknown')}:{r.get('capability_id','unknown')}@{r.get('version','unknown')}",
            "evidence": r.get("reason"),
            "next_step": "已观察到加载，先核对平台是否定义并采集 invoke" if r.get("reason") == "loaded_but_no_observed_invocation" else "核对版本、可见范围、采集覆盖、发现入口、替代方式和真实需求",
            "not_claim": "未观测到调用不等于无人需要或推广失败"})
    if hash_candidates:
        actions.append({"kind": "artifact_lineage_check", "evidence": {"same_bytes_candidates": len(hash_candidates)},
            "next_step": "抽查少量候选的上传来源；多生产者时保留歧义",
            "not_claim": "字节相同不等于已经业务采用，也不自动归功于某个来源部门"})
    claims = {
        "safe_now": [
            "报告窗口内的观测请求、token、活跃用户与字段覆盖",
            "按组织、阶段、工具及直接绑定 skill/agent 的问题线索",
            "明确来源或同字节候选的产物再次上传/读取路径",
        ],
        "needs_more_evidence": [
            "用户未确认部分的完成率、业务采用和节省工时",
            "部门价值排名、项目收益、良率或研发周期影响",
            "提示路由带来的质量或速度收益，需在下游任务做同模型对照",
        ],
    }
    return {"version": "action-board-v2", "usage": usage,
            "input_availability": {"capabilities": capabilities is not None, "supply": supply is not None, "artifacts": artifacts is not None},
            "capability_groups_observed": len(capabilities) if capabilities is not None else None,
            "artifact_relations_observed": len(artifacts) if artifacts is not None else None,
            "artifact_relations_source_confirmed": len(confirmed) if artifacts is not None else None,
            "actions": actions, "claims": claims}


def markdown(board):
    u = board["usage"]
    lines = ["# 平台价值与改进行动看板", "",
        "这是一页观测事实和下一步动作，不是部门/个人价值排名。", "",
        "## 1. 本期可以直接说明", "",
        "| 项目 | 观测结果 |", "|---|---|",
        f"| 窗口 | {cell(u.get('window'))} |",
        f"| 新建会话 | {show(u.get('cohort_sessions'))}（会话不等于任务） |",
        f"| 主动活跃用户 | {show(u.get('active_users'))} |",
        f"| 输入 / 输出 token | {show(u.get('input_tokens_observed'))} / {show(u.get('output_tokens_observed'))} |",
        f"| 人工结果确认覆盖 | {rate(u['human_outcome_known'],u['cohort_sessions']) if u['human_outcome_known'] is not None and u['cohort_sessions'] is not None else show(None)} |",
        f"| 自动分析候选 | {show(u.get('auto_assessed_sessions'))}（不计人工确认） |",
        f"| 已确认采用的去重事项 | {show(u.get('confirmed_used_work_items'))} |",
        f"| 观察到的能力分组 | {show(board.get('capability_groups_observed'))} |",
        f"| 产物关联 | {show(board.get('artifact_relations_observed'))}；来源确认 {show(board.get('artifact_relations_source_confirmed'))} |",
        "", "## 2. 下一步只处理这些候选", ""]
    if not board["actions"]:
        lines.append("当前没有达到展示条件的候选；先核对事件采集覆盖，不把空记录解释为没有问题。")
    else:
        lines += ["| 类型 | 组织 / 阶段 | 对象 | 证据 | 建议动作 |", "|---|---|---|---|---|"]
        for a in board["actions"]:
            obj = a.get("tool") or a.get("capability") or "产物来源"
            scope = f"{a.get('org','-')} / {a.get('phase','-')}"
            evidence = a.get("display") or json.dumps(a.get("evidence"), ensure_ascii=False, sort_keys=True)
            lines.append(f"| {cell(a['kind'])} | {cell(scope)} | {cell(obj)} | {cell(evidence)} | {cell(a['next_step'])} |")
    lines += ["", "缺少输入与输入为空分开显示；空文件中的 0 仅指本次观测，不证明覆盖完整。工具候选按阶段轮流展示，不是部门排名或完整故障清单。", "", "## 3. 汇报边界", "", "相应数据已提供且口径核对后可以说：", ""]
    lines += [f"- {x}" for x in board["claims"]["safe_now"]]
    lines += ["", "仍需补证据：", ""] + [f"- {x}" for x in board["claims"]["needs_more_evidence"]]
    lines += ["", "建议本期只选 1 个可复现问题和 1 个产物/能力使用案例继续核对；没有增量证据时不启动 SFT。"]
    return "\n".join(lines) + "\n"


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--metrics", required=True); p.add_argument("--tools", required=True)
    p.add_argument("--capabilities"); p.add_argument("--supply"); p.add_argument("--artifacts")
    p.add_argument("--out", required=True)
    a = p.parse_args()
    board = build(load_json(a.metrics), read_jsonl(a.tools), optional_jsonl(a.capabilities),
                  optional_jsonl(a.supply), optional_jsonl(a.artifacts))
    out = Path(a.out)
    write_json(out / "action_board.json", board)
    write_text(out / "action_board.md", markdown(board))
    print(out / "action_board.md")


if __name__ == "__main__":
    main()
