#!/usr/bin/env python3
"""Frozen self-contained task benchmark. Standard library only.

This tests the model on a fixed text/context packet. It is NOT an OpenCode agent
execution benchmark. See docs/03_benchmark_training.md for runtime replay design.
"""
import argparse
import json
import os
import time
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

from common import canonical, cell, digest, rate, read_jsonl, write_json, write_jsonl, write_text
from evidence import label_source, trusted_target
from route_prompts import PromptPolicy

GRADER = "json_exact_v1"
HARNESS = "fixed-packet-v2"


def grade(output, target):
    try:
        obj = json.loads(output, parse_constant=lambda s: (_ for _ in ()).throw(ValueError(s)))
        return canonical(obj) == canonical(target)
    except (ValueError, TypeError):
        return False


def freeze(rows, out, mode="validated"):
    if not rows:
        raise ValueError("empty benchmark")
    ids = set()
    for r in rows:
        if r["id"] in ids or r.get("split") != "holdout" or r.get("review_status") not in {"approved","candidate"}:
            raise ValueError("duplicate id or non-holdout/invalid-status task")
        if mode not in {"validated","diagnostic"} or (mode=="validated" and not trusted_target(r)):
            raise ValueError("validated benchmark needs approved human or programmatic-gold reference; AUTO labels require diagnostic mode")
        if "bench" not in r.get("allowed_uses", []) or r.get("context_complete") is not True:
            raise ValueError("benchmark use/context has not been reviewed")
        if r.get("grader") != GRADER or not isinstance(r.get("rubric"),list) or not r["rubric"] or not all(isinstance(x,str) and x.strip() for x in r["rubric"]) or not isinstance(r.get("target"), dict):
            raise ValueError("unsupported/unreviewed grader")
        ids.add(r["id"])
    out = Path(out)
    if out.exists():
        raise ValueError("frozen directory exists; create a new version")
    write_jsonl(out / "tasks.jsonl", rows)
    write_json(out / "manifest.json", {"tasks_sha256": digest(rows), "grader": GRADER, "harness": HARNESS,
        "n": len(rows), "mode":mode,"reference_sources":dict(Counter(label_source(r) for r in rows)),
        "script_sha256": digest(Path(__file__).read_text()),
        "note": "Immutable task/context/target/grader packet; fixed text evaluation only."})


def load_bench(path):
    root = Path(path)
    tasks = read_jsonl(root / "tasks.jsonl")
    meta = json.loads((root / "manifest.json").read_text())
    if digest(tasks) != meta["tasks_sha256"] or meta["grader"] != GRADER or meta["harness"] != HARNESS:
        raise ValueError("frozen benchmark changed")
    if meta["script_sha256"] != digest(Path(__file__).read_text()):
        raise ValueError("benchmark script changed; freeze a new version and rerun both models")
    return tasks, meta


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("redirect rejected; configure the final approved gateway URL")


def call_model(base, model, messages, config):
    url = urlparse(base)
    if url.scheme not in {"http", "https"} or not url.netloc or url.username or url.password or url.query:
        raise ValueError("invalid API base")
    payload = {"model": model, "messages": messages, "temperature": config["temperature"], "max_tokens": config["max_tokens"]}
    headers = {"Content-Type": "application/json"}
    key = os.environ.get("BENCH_API_KEY")
    if key:
        headers["Authorization"] = "Bearer " + key
    req = urllib.request.Request(base.rstrip("/") + "/chat/completions", data=canonical(payload).encode(), headers=headers)
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=config["timeout"]) as res:
        raw = json.load(res)
    choice = raw["choices"][0]
    message = choice["message"]
    if message.get("tool_calls") or not isinstance(message.get("content"), str):
        raise ValueError("fixed-packet runner requires text response; runtime tool loop is not implemented")
    return message["content"], raw.get("usage", {}), choice.get("finish_reason")


def mock_output(messages, variant):
    """A deliberately small fake responder to verify report plumbing, no reference input."""
    text = messages[-1]["content"]
    if "统计" in text or "均值" in text or "平均" in text:
        intent = "data_analysis"
    elif any(w in text for w in ("脚本", "报错", "Python", "代码")):
        intent = "coding"
    else:
        intent = "knowledge"
    if variant == "demo_v1" and "均值" in text:
        intent = "knowledge"
    return canonical({"intent": intent}), {}, "stop"


def run(args):
    tasks, meta = load_bench(args.bench)
    out = Path(args.out)
    if out.exists():
        raise ValueError("run directory exists; use a new directory")
    if args.trials < 1:
        raise ValueError("trials must be positive")
    config = {"temperature": args.temperature, "max_tokens": args.max_tokens,
              "timeout": args.timeout, "harness": HARNESS, "trials": args.trials}
    model = args.mock or args.model
    if not args.mock and (not model or not args.api_base):
        raise ValueError("real run requires --model and --api-base")
    policy_begin = time.monotonic()
    policy = PromptPolicy(args.prompt_policy,args.router_model,args.route_threshold,args.keywords,args.hints)
    policy_init_s = time.monotonic()-policy_begin
    policy.validate_tasks(tasks)
    write_json(out / "run_manifest.json", {"bench": meta, "config": config, "model": model,
        "prompt_policy":policy.manifest,"policy_initialization_s":policy_init_s,
        "api_base": args.api_base, "mock": bool(args.mock), "task_ids": [t["id"] for t in tasks],
        "task_info": {t["id"]:{"task_type":t["task_type"],"subset":t.get("subset","unspecified"),
            "source_kind":t.get("source_kind","synthetic" if t.get("synthetic") else "real"),
            "label_source":label_source(t),"org_section":t.get("org_section","unknown")} for t in tasks}})
    with (out / "results.jsonl").open("x", encoding="utf-8") as f:
        for t in tasks:
            for trial in range(args.trials):
                begin = time.monotonic()
                route = {}; policy_s = None
                try:
                    messages, route = policy.apply(t["messages"])
                    policy_s = time.monotonic()-begin
                    answer, usage, finish = mock_output(messages, args.mock) if args.mock else call_model(args.api_base, model, messages, config)
                    status, error = "ok", None
                except Exception as e:
                    # Do not dump response bodies or headers (may contain company data/keys).
                    answer, usage, finish = "", {}, None
                    status, error = "error", type(e).__name__
                row = {"id": t["id"], "trial": trial, "task_type": t["task_type"],
                       "subset": t.get("subset", "unspecified"), "source_group": t["source_group"],
                       "output": answer, "status": status, "error": error, "finish_reason": finish,
                       "passed": status == "ok" and finish != "length" and grade(answer, t["target"]),
                       "latency_s": time.monotonic() - begin, "policy_latency_s":policy_s,"route":route,"usage": usage}
                f.write(canonical(row) + "\n"); f.flush()
    print(out)


def read_run(path):
    root = Path(path)
    meta = json.loads((root / "run_manifest.json").read_text())
    expected = {(i, j) for i in meta["task_ids"] for j in range(meta["config"]["trials"])}
    rows = {}
    for r in read_jsonl(root / "results.jsonl"):
        key = (r["id"], r["trial"])
        if key not in expected or key in rows or type(r.get("passed")) is not bool:
            raise ValueError("invalid, duplicate or unexpected run row")
        rows[key] = r
    return meta, expected, rows


def compare(base, candidate, out, axis="model"):
    ma, ea, a = read_run(base)
    mb, eb, b = read_run(candidate)
    if ma["bench"] != mb["bench"] or ma["config"] != mb["config"] or ea != eb or ma["mock"] != mb["mock"]:
        raise ValueError("comparison requires identical benchmark/config/trials and both real or both mock")
    if axis=="model" and ma.get("prompt_policy") != mb.get("prompt_policy"):
        raise ValueError("model comparison requires identical prompt policy; use --axis prompt for policy ablation")
    if axis=="prompt" and (ma["model"] != mb["model"] or ma.get("api_base") != mb.get("api_base")):
        raise ValueError("prompt comparison requires the same model and gateway")
    if axis not in {"model","prompt"}:raise ValueError("invalid comparison axis")
    lines = ["# 模型对比（" + ("MOCK 演示，非模型能力实测" if ma["mock"] else "固定输入任务评测") + "）", "",
             f"{cell(mb['model'])} vs {cell(ma['model'])}；bench {ma['bench']['tasks_sha256'][:16]}。", "",
             "| 指标 | 基线 | 候选 |", "|---|---|---|"]
    if ma["bench"].get("mode")=="diagnostic":
        lines[2:2]=["本批含弱参考标签，以下‘通过’表示与该参考一致，不能称为真实任务成功率。", ""]
    if axis=="prompt":
        lines[2:2]=[f"同模型提示对照：{cell(ma.get('prompt_policy',{}).get('name'))} → {cell(mb.get('prompt_policy',{}).get('name'))}。耗时包含逐题路由；token 包含追加提示。", ""]
    for name, fn in [("通过/计划试次", lambda d: rate(sum(r["passed"] for r in d.values()), len(ea))),
                     ("实际追加任务提示/计划试次",lambda d:rate(sum(r.get("route",{}).get("hint_applied",False) for r in d.values()),len(ea))),
                     ("收到结果行/计划试次", lambda d: rate(len(d),len(ea))),
                     ("API/协议错误", lambda d: sum(r["status"] == "error" for r in d.values())),
                     ("输出截断", lambda d: sum(r.get("finish_reason") == "length" for r in d.values()))]:
        lines.append(f"| {name} | {fn(a)} | {fn(b)} |")
    paired = sorted(set(a) & set(b))
    wins = sum(b[k]["passed"] and not a[k]["passed"] for k in paired)
    losses = sum(a[k]["passed"] and not b[k]["passed"] for k in paired)
    both = sum(a[k]["passed"] and b[k]["passed"] for k in paired)
    neither = sum(not a[k]["passed"] and not b[k]["passed"] for k in paired)
    lines += ["", f"成对结果：候选新增通过 {wins}；退步 {losses}；双方通过 {both}；双方未通过 {neither}。",
              f"缺失配对 {len(ea)-len(paired)}，不计平局；计划试次分母保留缺失。", "",
              "| 任务 | 基线通过试次 | 候选通过试次 |", "|---|---|---|"]
    for tid in ma["task_ids"]:
        na = sum(r["passed"] for (i,j),r in a.items() if i == tid)
        nb = sum(r["passed"] for (i,j),r in b.items() if i == tid)
        lines.append(f"| {cell(tid)} | {na}/{ma['config']['trials']} | {nb}/{ma['config']['trials']} |")
    lines += ["", "## 样本切片", "", "| 任务族 / 样本来源 | 基线通过/计划 | 候选通过/计划 |", "|---|---|---|"]
    slices = {}
    for tid in ma["task_ids"]:
        info = ma.get("task_info",{}).get(tid,{})
        group = tuple(info.get(k,"unknown") for k in ("org_section","task_type","subset","source_kind","label_source"))
        slices.setdefault(group,set()).add(tid)
    for group, tids in sorted(slices.items()):
        denom = len(tids) * ma["config"]["trials"]
        na = sum(r["passed"] for (i,j),r in a.items() if i in tids)
        nb = sum(r["passed"] for (i,j),r in b.items() if i in tids)
        lines.append(f"| {cell(' / '.join(group))} | {rate(na,denom)} | {rate(nb,denom)} |")
    lines += ["", "## 资源（含失败试次）", ""]
    for name, data in ((ma["model"], a), (mb["model"], b)):
        if ma["mock"]:
            lines.append(f"- {cell(name)}：未调用模型，不报告 token 或耗时表现。")
            continue
        toks = [r["usage"]["total_tokens"] for r in data.values() if isinstance(r.get("usage", {}).get("total_tokens"), (int,float))]
        latencies = sorted(r["latency_s"] for r in data.values())
        p95 = latencies[max(0, (95 * len(latencies) + 99) // 100 - 1)] if latencies else None
        successes = sum(r["passed"] for r in data.values())
        per_success = sum(toks) / successes if successes and len(toks) == len(ea) else None
        lines.append(f"- {cell(name)}：token 已知 {len(toks)}/{len(ea)}，已知和 {sum(toks) if toks else 'N/A'}；计入失败开销的 token/成功任务试次 {per_success}；观测 p95 响应耗时 {p95} 秒。None 表示数据不足。")
    if not ma["mock"]:
        lines.append(f"提示策略单次初始化耗时：基线 {ma.get('policy_initialization_s')} 秒，候选 {mb.get('policy_initialization_s')} 秒；未分摊进逐题耗时。冷启动场景需另行计入。")
    lines += ["", "分别查看代表性样本和失败回归样本；不要把定向挖掘的失败题成绩称为线上成功率。",
              "总通过数仅是运行完整性汇总；真实/合成、弱参考/已验证参考、不同组织切片分别解读。不能用合成题的高分掩盖真实题退步。",
              "先核对退步题是否关键，再比较相同质量要求下的资源。少量题只支持试点判断；脚本不自动作准入决定。",
              "重复试次共享题目，不能当作独立样本扩大统计置信度。Mock 耗时/token 没有业务意义。"]
    write_text(out, "\n".join(lines) + "\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("freeze"); p.add_argument("candidates"); p.add_argument("--out", required=True)
    p.add_argument("--mode",choices=["validated","diagnostic"],default="validated")
    p = sub.add_parser("run"); p.add_argument("bench"); p.add_argument("--out", required=True)
    p.add_argument("--model"); p.add_argument("--api-base"); p.add_argument("--mock", choices=["demo_v1", "demo_v2"])
    p.add_argument("--trials", type=int, default=1); p.add_argument("--temperature", type=float, default=0)
    p.add_argument("--max-tokens", type=int, default=512); p.add_argument("--timeout", type=int, default=60)
    p.add_argument("--prompt-policy",choices=["none","generic","keywords","classifier"],default="none")
    p.add_argument("--router-model");p.add_argument("--route-threshold",type=float,default=0.75)
    p.add_argument("--keywords");p.add_argument("--hints")
    p = sub.add_parser("compare"); p.add_argument("base"); p.add_argument("candidate"); p.add_argument("--out", required=True)
    p.add_argument("--axis",choices=["model","prompt"],default="model")
    a = ap.parse_args()
    if a.cmd == "freeze": freeze(read_jsonl(a.candidates), a.out,a.mode)
    elif a.cmd == "run": run(a)
    else: compare(a.base, a.candidate, a.out,a.axis)


if __name__ == "__main__":
    main()
