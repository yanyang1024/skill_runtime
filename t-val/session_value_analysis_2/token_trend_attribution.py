#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
token_trend_attribution.py
==========================
定位"单任务 token 上升"的原因：把月度 token 总量增长分解为
    会话量变化 × 单会话强度变化 × 模型结构变化
并输出复杂度结构变化，回答"是任务变重了，还是模型变贵了"。

汇报价值：若增长主要来自会话量+复杂度上升 → "用户把更重的任务交给平台"（成熟度证据）；
          若来自模型结构 → 检查路由策略/知识库命中（成本治理证据）。

依赖：pandas（内网 pip 镜像）
用法：python token_trend_attribution.py /path/to/sessions/ -o attribution.md

会话文件预期结构（JSON，字段缺失会跳过相应分析）：
    {
      "start_ms": 1717200000000,           # 或 created_at / date 字段
      "stats": {"tokens_input": 1390000, "user_turns": 5},
      "model": "deepseek-v3",              # 或 runs[].model
      "comp": "L4",                        # 人工复杂度标注（可选）
      "runs": [{"end_reason": "stop", "stages": ["执行","编辑"]}],
      "n_w_files": 3
    }
"""

import argparse
import json
import os
import sys
from datetime import datetime

import pandas as pd


def _get(d, *keys, default=None):
    for k in keys:
        if isinstance(d, dict) and d.get(k) is not None:
            return d[k]
    return default


def _month_of(rec):
    ms = _get(rec, "start_ms", "startMs")
    if ms:
        return datetime.fromtimestamp(ms / 1000).strftime("%Y-%m")
    for k in ("created_at", "date", "createdAt"):
        v = rec.get(k)
        if v:
            s = str(v)[:10].replace("/", "-")
            try:
                return datetime.strptime(s, "%Y-%m-%d").strftime("%Y-%m")
            except ValueError:
                pass
    return None


def _model_of(rec):
    m = _get(rec, "model", "model_name")
    if m:
        return str(m)
    for r in rec.get("runs") or []:
        if isinstance(r, dict) and r.get("model"):
            return str(r["model"])
    return "未知模型"


def load_sessions(root):
    rows = []
    for dirpath, _, fns in os.walk(root):
        for fn in fns:
            if not fn.lower().endswith((".json", ".jsonl")):
                continue
            p = os.path.join(dirpath, fn)
            try:
                text = open(p, encoding="utf-8", errors="replace").read()
                try:
                    recs = [json.loads(text)]
                except json.JSONDecodeError:
                    recs = []
                    for l in text.splitlines():
                        l = l.strip()
                        if not l:
                            continue
                        try:
                            recs.append(json.loads(l))
                        except json.JSONDecodeError:
                            continue  # 容忍混入的非 JSON 行
            except Exception:
                continue
            for rec in recs:
                if not isinstance(rec, dict):
                    continue
                stats = rec.get("stats") or {}
                tok = _get(stats, "tokens_input", "token_input",
                           default=_get(rec, "tokens_input", "token_input"))
                if tok is None:
                    continue
                rows.append({
                    "month": _month_of(rec),
                    "tokens": float(tok),
                    "turns": _get(stats, "user_turns", default=rec.get("user_turns")),
                    "model": _model_of(rec),
                    "comp": _get(rec, "comp", "complexity"),
                    "n_w_files": _get(rec, "n_w_files", default=len(rec.get("write_files") or [])),
                })
    return pd.DataFrame(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("-o", "--out", default=None)
    args = ap.parse_args()

    df = load_sessions(args.path)
    if df.empty:
        sys.exit("未解析到任何带 token 字段的会话，请检查字段名（stats.tokens_input）")
    df = df.dropna(subset=["month"])
    out = ["# token 增长归因分析\n"]

    monthly = df.groupby("month").agg(
        sessions=("tokens", "count"),
        total_tokens=("tokens", "sum"),
        mean_tokens=("tokens", "mean"),
        median_tokens=("tokens", "median"),
    ).sort_index()
    base = monthly.iloc[0]
    monthly["量效应(会话数指数)"] = monthly["sessions"] / base["sessions"]
    monthly["强度效应(均值指数)"] = monthly["mean_tokens"] / base["mean_tokens"]

    out.append("## 1. 增长分解（对数可加：总量指数 ≈ 量效应 × 强度效应）\n")
    out.append(monthly.assign(
        总量指数=lambda d: d["total_tokens"] / base["total_tokens"]
    )[["sessions", "总量指数", "量效应(会话数指数)", "强度效应(均值指数)",
       "median_tokens"]].round(2).to_markdown())
    out.append("")

    out.append("## 2. 模型结构变化（各模型 token 占比）\n")
    model_pivot = (df.pivot_table(index="month", columns="model",
                                  values="tokens", aggfunc="sum", fill_value=0)
                   .apply(lambda r: r / r.sum(), axis=1).round(3))
    out.append(model_pivot.to_markdown())
    out.append("")

    if df["comp"].notna().any():
        out.append("## 3. 复杂度结构变化（人工标注 comp 的占比）\n")
        comp_pivot = (df.pivot_table(index="month", columns="comp",
                                     values="tokens", aggfunc="count", fill_value=0)
                      .apply(lambda r: r / r.sum(), axis=1).round(3))
        out.append(comp_pivot.to_markdown())
        out.append("")
    else:
        out.append("## 3. 复杂度结构：会话中无 comp 标注字段，跳过")
        out.append("（可用 user_turns≥4 的深度迭代占比作为复杂度代理：）\n")
        if df["turns"].notna().any():
            deep = df.assign(deep=df["turns"] >= 4).groupby("month")["deep"].mean().round(3)
            out.append(deep.to_frame("深度迭代占比(turns≥4)").to_markdown())
            out.append("")

    # 结论提示
    out.append("## 4. 归因结论模板（按上表手工填空）\n")
    if len(monthly) >= 2:
        last = monthly.iloc[-1]
        vol = last["量效应(会话数指数)"]
        inten = last["强度效应(均值指数)"]
        out.append(f"- 从 {monthly.index[0]} 到 {monthly.index[-1]}："
                   f"会话量 ×{vol:.2f}，单会话强度 ×{inten:.2f}")
        if inten > vol:
            out.append("- 强度增长 > 量级增长 → **重点排查任务变重 or 模型变贵**："
                       "对照表 2 看贵模型占比、表 3 看高复杂度占比的月度变化")
        else:
            out.append("- 量级增长主导 → 增长来自用户用得更多，属健康扩张；"
                       "汇报话术：『平台承载的任务量在快速增长』")
    out.append("")

    text = "\n".join(out)
    if args.out:
        open(args.out, "w", encoding="utf-8").write(text)
        print(f"已写入 {args.out}", file=sys.stderr)
    else:
        print(text)


if __name__ == "__main__":
    main()
