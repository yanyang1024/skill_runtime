#!/usr/bin/env python3
"""Create entirely fictional fixtures. Nothing here is the user's company data."""
import argparse
from pathlib import Path

from common import digest, write_json, write_jsonl, write_text
from value_loop import case_id

PROMPT = "识别用户请求的主要任务类型，只输出 JSON：intent 为 knowledge、coding 或 data_analysis。"
ROUTING = {
 "train": {
  "knowledge": ["解释一下晶圆和芯片的区别", "介绍刻蚀工艺中的选择比", "说明均匀性的定义", "什么是 endpoint detection", "帮我理解薄膜沉积原理", "介绍 recipe 的基本概念"],
  "coding": ["帮我写一个读取日志的 Python 脚本", "修复这个脚本的报错", "给这段代码增加异常处理", "用 Python 解析配置文件", "帮我调试脚本里的索引错误", "给现有代码增加命令行参数"],
  "data_analysis": ["统计这份表格的均值", "分析不同批次的量测分布", "计算各组数据的标准差", "对 CSV 数据做分组统计", "统计实验表格中每列的平均值", "分析两组量测结果的差异"]},
 "dev": {
  "knowledge": ["请介绍一下光刻的基本流程", "解释 critical dimension 这个术语"],
  "coding": ["Python 脚本出现类型错误，请修复", "给我一段批量重命名文件的代码"],
  "data_analysis": ["统计表中各批次的中位数", "对这两组观测数据做差异分析"]},
 "holdout": {
  "knowledge": ["介绍晶圆加工中清洗的作用", "解释工艺窗口的含义"],
  "coding": ["这段 Python 报错了，帮我定位", "为日志转换编写一个脚本"],
  "data_analysis": ["求不同组的均值并比较", "统计量测结果的均值和极差"]}}


def make(out):
    out = Path(out)
    if out.exists(): raise ValueError("demo input output exists")
    sessions, reviews, curated = [], [], []
    n = 0
    for split, categories in ROUTING.items():
        for label, texts in categories.items():
            for text in texts:
                n += 1
                day = 1 + n % 20
                ts = f"2026-08-{day:02d}T09:00:00+08:00"
                end = f"2026-08-{day:02d}T09:10:00+08:00"
                s = {"tenant_id": "DEMO", "session_id": f"demo-{n:03d}", "user_id": f"user-{n%7}",
                     "dept": "演示研发" if n%7%2 else "演示工艺", "title": text,
                     "start_at": ts, "end_at": end,
                     "messages": [{"role":"user","text":text,"ts":ts}, {"role":"assistant","text":"虚构答复，仅供演示","ts":end}],
                     "stats": {"input_tokens": 1000+n*10, "output_tokens": 100+n, "usage_scope":"session_exclusive"},
                     "coverage":{"messages_complete":True,"requests_complete":False,"artifact_events_complete":False},
                     "tool_events": [{"event_id":f"tool-{n}","name":"read_measurement","status":"error","error_kind":"schema_mismatch","ts":ts}] if n%5==0 else [],
                     "artifact_events": []}
                if n == 1:
                    s["artifact_events"] = [{"event_id":"w1","artifact_id":"DEMO/asset-1","version":"sha256:v1","op":"write","success":True,"ts":end}]
                if n == 4:
                    s["artifact_events"] = [{"event_id":"r1","artifact_id":"DEMO/asset-1","version":"sha256:v1","op":"read","success":True,"ts":ts}]
                if n == 5:
                    s["messages"][0]["text"] += "；别把‘报错’当作任务失败。"
                sessions.append(s)
                if n % 3 == 0:
                    reviews.append({"review_id":f"demo-review-{n}", "case_id":case_id(s),"source_revision":digest(s),
                        "reviewer_id":"demo-human","reviewed_at":"2026-08-25T10:00:00+08:00",
                        "outcome":"usable" if n%2 else "partial", "adoption":"used" if n%2 else "not_used",
                        "work_item_id":f"demo-work-{n}","task_type":label,"business_use":"演示报告整理", "evidence_ref":"演示用户确认",
                        "time_basis":"user_estimate","manual_minutes_low":30,"manual_minutes_high":45,
                        "assisted_minutes_low":10,"assisted_minutes_high":20})
                curated.append({"id":f"route-{n:03d}","case_id":case_id(s),"source_revision":digest(s),
                    "source_group":f"DEMO/independent-task-{n}","parent_ids":[],"split":split,
                    "review_status":"approved","reviewer_id":"demo-human","context_complete":True,
                    "task_type":"intent_routing","subset":"regression" if n%5==0 else "representative",
                    "allowed_uses":["bench","sft","router"],"route_text":text,
                    "messages":[{"role":"system","content":PROMPT},{"role":"user","content":text}],
                    "target":{"intent":label},"rubric":["只输出 JSON", "intent 是请求时可判断的任务类型"]})
    # One deliberately unreviewed, untimestamped session. It is not silently completed.
    sessions.append({"tenant_id":"DEMO","session_id":"unknown-time","user_id":"user-unknown",
        "messages":[{"role":"user","text":"谢谢，还没有解决","ts":None}],"stats":{},"title":"缺字段的演示会话"})
    seed = {"tenant_id":"DEMO", "session_id":"extract-seed", "user_id":"demo-extract-user", "dept":"演示工艺",
        "title":"查询条件提取", "start_at":"2026-08-15T09:00:00+08:00", "end_at":"2026-08-15T09:01:00+08:00",
        "messages":[{"role":"user","text":"查询 LOT-DEMO-001，第 3 片晶圆的 cd。","ts":"2026-08-15T09:00:00+08:00"}],
        "stats":{}, "coverage":{"messages_complete":True}}
    sessions.append(seed)
    curated.append({"id":"extract-seed","case_id":case_id(seed),"source_revision":digest(seed),
        "source_group":"DEMO/extract-family-1","parent_ids":[],"split":"train","review_status":"approved",
        "reviewer_id":"demo-human","context_complete":True,"task_type":"query_extract","allowed_uses":["sft"],
        "messages":[{"role":"system","content":"从用户请求提取 lot_id、wafer（整数）、metric，只输出 JSON。"},
                    {"role":"user","content":"查询 LOT-DEMO-001，第 3 片晶圆的 cd。"}],
        "target":{"lot_id":"LOT-DEMO-001","wafer":3,"metric":"cd"},
        "rubric":["lot_id 原样保留","wafer 为整数","不猜测缺失字段"],
        "note":"完全虚构的种子；仅展示接口，真实种子必须对应真实来源证据。"})
    write_jsonl(out/"sessions.jsonl",sessions)
    write_jsonl(out/"reviews.jsonl",reviews)
    write_jsonl(out/"curated.jsonl",curated)
    write_json(out/"costs.json",{"period_start":"2026-08-01T00:00:00+08:00","period_end":"2026-09-01T00:00:00+08:00",
        "fixed_capacity_cost":10000,"variable_cash_cost":2000,"operations_cost":3000,"currency":"DEMO-CNY","basis":"完全虚构演示，不代表实际成本"})
    write_text(out/"session.md", "# 演示会话\n\n## User\n帮我解释这个术语。\n\n## Assistant\n演示回答。\n```md\n## User\n这是代码块里的文本，不应拆成新用户消息。\n```\n")
    write_jsonl(out/"import_manifest.jsonl",[{"path":"session.md","format":"md","tenant_id":"DEMO","session_id":"md-example","user_id":"demo-user","dept":"演示部门"}])
    write_text(out/"NOTICE.md","# 纯虚构演示数据\n\n所有身份、对话、确认、费用和标注均为程序生成；不代表用户公司或真实模型效果。\n")
    print(out)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__); p.add_argument("--out",required=True)
    make(p.parse_args().out)
