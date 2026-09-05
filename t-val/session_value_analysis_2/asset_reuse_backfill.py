#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
asset_reuse_backfill.py
=======================
补全跨会话资产复用率的统计口径：
不依赖 file_trace.json 单点，直接全量扫描所有会话文本中的文件路径痕迹
（read 工具输入、消息里出现的文件路径），构建"文件 × 会话"引用关系。

输出：
    1. 可信口径的复用率（被 ≥2 个会话引用的产出文件 ÷ 总产出文件数）
    2. 资产存活代理：产出文件首次出现 → 最后一次被引用的间隔天数分布
    3. 被复用最多的资产 TOP 榜（这就是"平台沉淀资产"的汇报素材）

依赖：pandas
用法：python asset_reuse_backfill.py /path/to/sessions/ -o reuse.md

口径说明（写进汇报）：
    - "产出"定义：会话中 write/edit 工具痕迹或 write_files 字段中出现的文件
    - "引用"定义：产出文件在【其他会话】的文本中出现（read 输入或路径提及）
    - 无法区分"复用代码"与"仅仅是聊天中提到"，存在高估；建议抽样人工确认
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime

import pandas as pd

FILE_RE = re.compile(
    r"[\w\-./\\一-鿿]+\.(?:py|v|sv|svh|tcl|sh|c|cpp|h|js|ts|json|yaml|yml|"
    r"md|html|txt|csv|xdc|sdc|upf|lef|def|lib|sp|cir|f|xlsx|docx)\b"
)
WRITE_HINT = re.compile(r"(write_file|edit_file|apply_patch|已写入|已生成|创建文件)")


def _ts(rec):
    ms = rec.get("start_ms")
    if ms:
        return datetime.fromtimestamp(ms / 1000)
    for k in ("created_at", "date"):
        v = rec.get(k)
        if v:
            try:
                return datetime.strptime(str(v)[:10].replace("/", "-"), "%Y-%m-%d")
            except ValueError:
                pass
    return None


def load(root):
    sessions = []
    for dirpath, _, fns in os.walk(root):
        for fn in fns:
            if not fn.lower().endswith((".json", ".md", ".jsonl", ".txt")):
                continue
            p = os.path.join(dirpath, fn)
            try:
                text = open(p, encoding="utf-8", errors="replace").read()
            except Exception:
                continue
            rec = {}
            if fn.lower().endswith(".json"):
                try:
                    rec = json.loads(text)
                except Exception:
                    rec = {}
            sessions.append({"path": p, "text": text, "ts": _ts(rec), "rec": rec})
    return sessions


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("-o", "--out", default=None)
    args = ap.parse_args()

    sessions = load(args.path)
    if not sessions:
        sys.exit("未找到会话文件")

    written = {}   # basename -> (first_session_idx, first_ts)
    mentioned = {} # basename -> set(session_idx)
    mention_ts = {}  # basename -> [ts]

    for i, s in enumerate(sessions):
        text = s["text"]
        paths = set(os.path.basename(m) for m in FILE_RE.findall(text))
        # 判定产出：write 痕迹附近的文件 或 rec.write_files 字段
        wf = s["rec"].get("write_files") or []
        written_here = {os.path.basename(str(w)) for w in wf}
        if not written_here and WRITE_HINT.search(text):
            # 粗略近似：有写入痕迹的会话里出现的所有文件视为产出（会高估）
            written_here = paths
        for b in written_here:
            if b not in written:
                written[b] = (i, s["ts"])
        for b in paths:
            mentioned.setdefault(b, set()).add(i)
            if s["ts"]:
                mention_ts.setdefault(b, []).append(s["ts"])

    rows = []
    for b, (wi, wts) in written.items():
        other_sessions = mentioned.get(b, set()) - {wi}
        tss = sorted(mention_ts.get(b, []))
        survival = (max(tss) - min(tss)).days if len(tss) >= 2 else 0
        rows.append({"file": b, "reused_by_n_sessions": len(other_sessions),
                     "survival_days": survival,
                     "first_seen": min(tss).date().isoformat() if tss else None})
    df = pd.DataFrame(rows)

    out = ["# 跨会话资产复用分析\n"]
    total = len(df)
    reused = int((df["reused_by_n_sessions"] >= 1).sum()) if total else 0
    out.append(f"- 产出文件总数：{total}")
    out.append(f"- 被其他会话引用过的文件：{reused}"
               f"（复用率 {reused/total:.1%}）" if total else "")
    if total:
        surv = df[df["survival_days"] > 0]["survival_days"]
        if len(surv):
            out.append(f"- 存活天数（首次出现→最后被引用）："
                       f"中位 {surv.median():.0f} 天 / 最大 {surv.max():.0f} 天")
        out.append(f"- 存活≥7天：{(df['survival_days']>=7).sum()} 个；"
                   f"存活≥30天：{(df['survival_days']>=30).sum()} 个")
    out.append("\n## 被复用最多的资产 TOP 20（汇报素材：平台沉淀了什么）\n")
    if total:
        top = df.sort_values("reused_by_n_sessions", ascending=False).head(20)
        out.append(top.to_markdown(index=False))
    out.append("\n> 口径提醒：含『聊天中提及』的高估成分；"
               "若某资产被复用次数异常高，建议人工打开确认是真实复用还是模板文本。")
    out.append("")

    text = "\n".join(out)
    if args.out:
        open(args.out, "w", encoding="utf-8").write(text)
        df.to_csv(args.out.replace(".md", "_detail.csv"),
                  index=False, encoding="utf-8-sig")
        print(f"已写入 {args.out}", file=sys.stderr)
    else:
        print(text)


if __name__ == "__main__":
    main()
