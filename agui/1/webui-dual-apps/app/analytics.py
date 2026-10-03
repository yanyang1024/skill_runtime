"""Deterministic statistics over a synthetic fixture. No LLM arithmetic."""
from datetime import timedelta
import re

from .schemas import END, START, Selection

DEPARTMENTS = ["研发", "工艺", "设备"]
METRICS = {
    "sessions": {"label": "会话数", "unit": "次", "definition": "日期范围内会话数之和"},
    "active_users": {"label": "活跃用户", "unit": "人", "definition": "日期范围内按 user_id 去重的用户数；各天活跃用户不可直接相加"},
    "tool_failure_rate": {"label": "工具失败率", "unit": "%", "definition": "失败工具调用数 ÷ 全部工具调用数；不是每日失败率的简单平均"},
}


def make_fixture():
    rows = []
    for day in range((END - START).days + 1):
        for dep_i, department in enumerate(DEPARTMENTS):
            for user in range([9, 7, 6][dep_i]):
                if (day + user + dep_i) % 4 == 0:
                    continue
                sessions = 1 + (day * 3 + user + dep_i) % 5
                calls = sessions * (3 + user % 3)
                failed = (day + user) % 4 if dep_i == 0 else (1 if (day + user) % (4 + dep_i * 2) == 0 else 0)
                rows.append({"date": (START + timedelta(days=day)).isoformat(), "department": department,
                             "user_id": f"dep{dep_i}-user{user}", "sessions": sessions,
                             "tool_calls": calls, "failed_tool_calls": min(failed, calls)})
    return rows


ROWS = make_fixture()


def describe_dataset():
    return {"source_id": "sample-usage-v1", "synthetic": True,
            "date_from": START.isoformat(), "date_to": END.isoformat(),
            "departments": DEPARTMENTS, "metrics": METRICS, "row_count": len(ROWS),
            "limitations": ["合成数据，不代表实际部门绩效", "工具失败率不等于用户任务失败率", "聚合结果只能提供排查线索，不能推断原因"]}


def analyze(selection: Selection):
    chosen = [r for r in ROWS if r["department"] in selection.departments
              and selection.date_from.isoformat() <= r["date"] <= selection.date_to.isoformat()]
    result_rows = []
    for department in selection.departments:
        subset = [r for r in chosen if r["department"] == department]
        sessions = sum(r["sessions"] for r in subset)
        users = len({r["user_id"] for r in subset})
        calls = sum(r["tool_calls"] for r in subset)
        failed = sum(r["failed_tool_calls"] for r in subset)
        value = {"sessions": sessions, "active_users": users,
                 "tool_failure_rate": round(100 * failed / calls, 2) if calls else None}[selection.metric]
        result_rows.append({"department": department, "value": value, "sessions": sessions,
                            "active_users": users, "tool_calls": calls, "failed_tool_calls": failed})
    days = []
    day = selection.date_from
    while day <= selection.date_to:
        subset = [r for r in chosen if r["date"] == day.isoformat()]
        calls = sum(r["tool_calls"] for r in subset)
        failed = sum(r["failed_tool_calls"] for r in subset)
        value = {"sessions": sum(r["sessions"] for r in subset),
                 "active_users": len({r["user_id"] for r in subset}),
                 "tool_failure_rate": round(100 * failed / calls, 2) if calls else None}[selection.metric]
        days.append({"date": day.isoformat(), "value": value})
        day += timedelta(days=1)
    scope = {key: value for key, value in selection.model_dump(mode="json").items()
             if key in {"metric", "departments", "date_from", "date_to"}}
    return {"selection": scope, "metric": METRICS[selection.metric],
            "rows": result_rows, "daily": days, "source": describe_dataset(), "matched_rows": len(chosen)}


def demo_explanation(result):
    rows = sorted(result["rows"], key=lambda r: r["value"] or 0, reverse=True)
    top = rows[0]
    metric = result["metric"]
    scope = result["selection"]
    return {"summary": f"{scope['date_from']} 至 {scope['date_to']}，所选部门中{top['department']}的{metric['label']}最高（{top['value']}{metric['unit']}）。这提供了进一步检查的线索。",
            "recommendations": (["按工具和错误类型拆分失败调用，确认问题是否集中在少数工具。", "比较失败数与调用总量，避免只依据百分比安排排查优先级。", "结合日志和用户反馈验证影响，聚合统计本身不能确定失败原因。"]
                                if scope["metric"] == "tool_failure_rate" else
                                ["结合任务类型检查使用量分布，避免把使用量直接等同于业务价值。", "观察更多日期的趋势，确认变化是否持续。", "访谈低使用量部门，验证是否存在需求或使用障碍。"]),
            "notes": "演示规则生成的解释；统计由服务器计算。样例为合成数据，不作绩效判断。"}


def parse_demo_intent(text):
    """Deliberately small parser, NOT an LLM substitute. Unknowns stay unknown."""
    patch = {}
    if any(t in text for t in ("失败", "报错", "错误率")):
        patch["metric"] = "tool_failure_rate"
    elif any(t in text for t in ("活跃", "用户数", "人数")):
        patch["metric"] = "active_users"
    elif any(t in text for t in ("会话", "session")):
        patch["metric"] = "sessions"
    departments = [d for d in DEPARTMENTS if d in text]
    if departments:
        patch["departments"] = departments
    elif "所有部门" in text or "全部部门" in text:
        patch["departments"] = DEPARTMENTS.copy()
    iso = re.findall(r"2026-\d{2}-\d{2}", text)
    if len(iso) >= 2:
        patch.update(date_from=iso[0], date_to=iso[1])
    else:
        dates = re.search(r"(?:9月|九月)\s*(\d{1,2})\s*(?:日|号)?\s*(?:至|到|—|–|-)\s*(?:9月)?\s*(\d{1,2})", text)
        if dates:
            patch.update(date_from=f"2026-09-{int(dates[1]):02d}", date_to=f"2026-09-{int(dates[2]):02d}")
    return patch


def report_markdown(title, summary, recommendations, result):
    # Narrative remains text. The numeric table and provenance are server-built.
    safe_title = title.replace("\n", " ").replace("\r", " ")
    scope, metric = result["selection"], result["metric"]
    lines = [f"# {safe_title}", "", f"范围：{scope['date_from']} 至 {scope['date_to']}",
             f"指标：{metric['label']}。{metric['definition']}", "", "## 统计结果", "",
             f"| 部门 | {metric['label']}（{metric['unit']}） | 调用数 | 失败数 |", "| --- | ---: | ---: | ---: |"]
    lines.extend(f"| {r['department']} | {r['value'] if r['value'] is not None else '无数据'} | {r['tool_calls']} | {r['failed_tool_calls']} |" for r in result["rows"])
    lines += ["", "## 解读", "", summary, "", "## 建议", ""]
    lines.extend(f"{i + 1}. {item}" for i, item in enumerate(recommendations))
    lines += ["", "数据来源：sample-usage-v1（合成数据）。统计由服务器计算；叙述由模型或演示规则提供，需结合日志验证。"]
    return "\n".join(lines)
