#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
bench_manager.py
================
内部 bench 的构建 / 跑评 / 对比 —— 引入新模型时用自己的真实任务评价，不看通用榜单。

四个子命令（对应闭环的四个动作）：
    build   : 从案例库采样真实任务 → bench/vN/bench.jsonl（含参考答案+评分要点模板）
    run     : 用 bench 题目调用 OpenAI 兼容接口的模型 → runs/{model}_{ts}.jsonl
    score   : 自动粗评（关键词命中/长度比）+ 生成人工评分表（CSV）
    compare : 对比两个模型 run，出对比报告（新模型准入评审的输入材料）

依赖：无（纯标准库；网络调用走 urllib，OpenAI 兼容 /v1/chat/completions）

用法示例：
    python bench_manager.py build ./cases/ --bench-dir ./bench/ --n 50
    python bench_manager.py run ./bench/ --model deepseek-v3 \
        --api-base http://内网网关/v1 --api-key $KEY
    python bench_manager.py score ./bench/ --model deepseek-v3
    python bench_manager.py compare ./bench/ --base qwen-max --candidate deepseek-v3

设计要点：
    - bench 有版本（vN），每次 build 生成新版本，旧版本冻结 —— 历史模型分数可比
    - 题目来自真实任务（bad/review 案例优先 —— 失败的场景才是准入评审该考的）
    - 参考答案来自真实会话的最终被接受回答；评分要点（rubric）留空由人工补 3-5 条
    - 自动评分只是粗筛，准入决策必须看人工评分表 —— 脚本只出表，不替你打分
"""

import argparse
import glob
import json
import os
import random
import sys
import time
import urllib.request
from datetime import datetime


def latest_cases(cases_dir):
    ptr = os.path.join(cases_dir, "latest")
    if os.path.islink(ptr):
        ver = os.readlink(ptr)
    elif os.path.exists(ptr + ".txt"):
        ver = open(ptr + ".txt").read().strip()
    else:
        ver = sorted(d for d in os.listdir(cases_dir) if d.startswith("v"))[-1]
    return [json.loads(l) for l in
            open(os.path.join(cases_dir, ver, "cases.jsonl"), encoding="utf-8")]


def latest_bench(bench_dir):
    vs = sorted(d for d in os.listdir(bench_dir)
                if d.startswith("v") and os.path.isdir(os.path.join(bench_dir, d)))
    if not vs:
        sys.exit("bench 目录为空，先 build")
    return os.path.join(bench_dir, vs[-1]), vs[-1]


# ---------------- build ----------------
def cmd_build(args):
    cases = latest_cases(args.cases_dir)
    # bad/review 优先（失败与攻坚场景），good 补足
    pool = ([c for c in cases if c["label"] in ("bad", "review")]
            + [c for c in cases if c["label"] == "good"])
    random.seed(args.seed)
    random.shuffle(pool)
    items = []
    for c in pool[:args.n]:
        dlg = c.get("dialog") or []
        if len(dlg) < 2 or dlg[0]["role"] != "user":
            continue
        ref = next((d["content"] for d in reversed(dlg) if d["role"] == "assistant"), "")
        items.append({
            "bench_id": f"b{len(items):04d}",
            "case_id": c["case_id"],
            "origin_label": c["label"],
            "input": dlg[0]["content"][:4000],
            "reference": ref[:4000],
            "rubric": ["", "", ""],   # 人工补 3 条评分要点，如"脚本可直接运行""覆盖XX边界"
        })
    os.makedirs(args.bench_dir, exist_ok=True)
    existing = [d for d in os.listdir(args.bench_dir) if d.startswith("v")]
    ver = f"v{len(existing) + 1}"
    outdir = os.path.join(args.bench_dir, ver)
    os.makedirs(outdir)
    with open(os.path.join(outdir, "bench.jsonl"), "w", encoding="utf-8") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    meta = {"version": ver, "built_at": datetime.now().isoformat(timespec="seconds"),
            "n_items": len(items), "seed": args.seed,
            "note": "出题后请人工补 rubric 并脱敏确认；冻结后勿改"}
    json.dump(meta, open(os.path.join(outdir, "meta.json"), "w"),
              ensure_ascii=False, indent=2)
    print(f"bench {ver} 已生成：{len(items)} 题 → {outdir}", file=sys.stderr)
    print("下一步：人工补 bench.jsonl 里每题的 rubric 评分要点", file=sys.stderr)


# ---------------- run ----------------
def call_model(api_base, api_key, model, prompt, timeout=300):
    req = urllib.request.Request(
        api_base.rstrip("/") + "/chat/completions",
        data=json.dumps({
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
        }).encode(),
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {api_key}"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.loads(r.read())
    return data["choices"][0]["message"]["content"]


def cmd_run(args):
    bdir, ver = latest_bench(args.bench_dir)
    items = [json.loads(l) for l in open(os.path.join(bdir, "bench.jsonl"), encoding="utf-8")]
    rdir = os.path.join(bdir, "runs")
    os.makedirs(rdir, exist_ok=True)
    out = os.path.join(rdir, f"{args.model}_{datetime.now():%Y%m%d_%H%M%S}.jsonl")
    api_key = args.api_key or os.environ.get("BENCH_API_KEY", "")
    with open(out, "w", encoding="utf-8") as f:
        for i, it in enumerate(items):
            try:
                resp = call_model(args.api_base, api_key, args.model, it["input"])
                err = None
            except Exception as e:
                resp, err = "", str(e)
            f.write(json.dumps({"bench_id": it["bench_id"], "model": args.model,
                                "output": resp, "error": err}, ensure_ascii=False) + "\n")
            print(f"[{i+1}/{len(items)}] {it['bench_id']} "
                  f"{'ERR ' + err if err else 'ok'}", file=sys.stderr)
            time.sleep(args.interval)
    print(f"run 完成 → {out}", file=sys.stderr)


# ---------------- score ----------------
def _kw_hit(output, ref):
    """参考答案中长度≥4的 token 片段在输出中的命中率（粗指标）"""
    import re
    kws = set(w for w in re.findall(r"[A-Za-z_][\w.]{3,}", ref))
    if not kws:
        return None
    return sum(1 for k in kws if k in output) / len(kws)


def cmd_score(args):
    bdir, ver = latest_bench(args.bench_dir)
    items = {json.loads(l)["bench_id"]: json.loads(l)
             for l in open(os.path.join(bdir, "bench.jsonl"), encoding="utf-8")}
    runs = sorted(glob.glob(os.path.join(bdir, "runs", f"{args.model}_*.jsonl")))
    if not runs:
        sys.exit(f"找不到模型 {args.model} 的 run，先执行 run 子命令")
    rows = []
    for l in open(runs[-1], encoding="utf-8"):
        r = json.loads(l)
        it = items[r["bench_id"]]
        hit = _kw_hit(r["output"], it["reference"])
        rows.append({
            "bench_id": r["bench_id"], "model": args.model,
            "error": r["error"] or "",
            "ref_keyword_hit": round(hit, 3) if hit is not None else "",
            "len_ratio": round(len(r["output"]) / max(1, len(it["reference"])), 2),
            "rubric": " | ".join(x for x in it["rubric"] if x),
            "人工评分(1-5)": "", "人工备注": "",
        })
    out = os.path.join(bdir, f"score_{args.model}_{ver}.csv")
    import csv
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print(f"评分表 → {out}（请人工填『人工评分』列后再 compare）", file=sys.stderr)


# ---------------- compare ----------------
def cmd_compare(args):
    bdir, ver = latest_bench(args.bench_dir)
    def load_scores(model):
        p = os.path.join(bdir, f"score_{model}_{ver}.csv")
        if not os.path.exists(p):
            return None
        import csv
        return {r["bench_id"]: r for r in csv.DictReader(open(p, encoding="utf-8-sig"))}
    A, B = load_scores(args.base), load_scores(args.candidate)
    if not A or not B:
        sys.exit("两个模型都需要先跑 run + score")
    common = sorted(set(A) & set(B))
    win = lose = tie = 0
    lines = [f"# 模型对比报告：{args.candidate} vs {args.base}（bench {ver}）", ""]
    lines.append("| bench_id | base关键词命中 | cand关键词命中 | base人工分 | cand人工分 |")
    lines.append("|---|---|---|---|---|")
    for bid in common:
        a, b = A[bid], B[bid]
        try:
            sa, sb = float(a["人工评分(1-5)"] or 0), float(b["人工评分(1-5)"] or 0)
            win += sb > sa; lose += sb < sa; tie += sb == sa
        except ValueError:
            pass
        lines.append(f"| {bid} | {a['ref_keyword_hit']} | {b['ref_keyword_hit']} | "
                     f"{a['人工评分(1-5)']} | {b['人工评分(1-5)']} |")
    lines.insert(2, f"- 人工评分对局（已评 {win+lose+tie} 题）："
                    f"**新模型胜 {win} / 平 {tie} / 负 {lose}**")
    lines.insert(3, "- 准入建议：胜率>55% 且 bad 类题目不劣化 → 可灰度；否则暂缓\n")
    out = os.path.join(bdir, f"compare_{args.candidate}_vs_{args.base}_{ver}.md")
    open(out, "w", encoding="utf-8").write("\n".join(lines))
    print(f"对比报告 → {out}", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("build")
    p.add_argument("cases_dir"); p.add_argument("--bench-dir", default="./bench")
    p.add_argument("--n", type=int, default=50); p.add_argument("--seed", type=int, default=42)
    p = sub.add_parser("run")
    p.add_argument("bench_dir"); p.add_argument("--model", required=True)
    p.add_argument("--api-base", required=True); p.add_argument("--api-key", default=None)
    p.add_argument("--interval", type=float, default=0.5)
    p = sub.add_parser("score")
    p.add_argument("bench_dir"); p.add_argument("--model", required=True)
    p = sub.add_parser("compare")
    p.add_argument("bench_dir"); p.add_argument("--base", required=True)
    p.add_argument("--candidate", required=True)
    args = ap.parse_args()
    {"build": cmd_build, "run": cmd_run,
     "score": cmd_score, "compare": cmd_compare}[args.cmd](args)


if __name__ == "__main__":
    main()
