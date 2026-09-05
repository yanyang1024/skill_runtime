#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
case_miner.py
=============
从会话数据中自动挖掘 good case / bad case，输出版本化、可增量更新的案例库。

输出结构（闭环的关键：数据有版本、可增量）：
    cases/
      v20260905_120000/
        cases.jsonl        # 每条一个案例，带 label 和证据
        summary.md         # 本次挖掘摘要
      latest -> v20260905_120000/   # 软链或文本指针
    case_miner_state.json  # 增量状态：记录已处理文件的 mtime

案例标签体系（三档，避免二值化的误判）：
    good   : 正向收尾 + 有产出 + 纠正少      → 候选 SFT 素材 / 汇报 good case
    bad    : 放弃信号 或 高纠正 + 无产出     → 平台改进点 / DPO 负例素材
    review : 有产出但过程摩擦大（攻坚型）     → 人工复核（可能是最好的案例）

依赖：无（纯标准库）
用法：
    python case_miner.py /path/to/sessions/ --cases-dir ./cases/
    # 再跑一次只会处理新增/变更的会话文件（增量）
"""

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from session_value_report import (load_session, session_features,  # noqa: E402
                                  CORRECTION_WORDS, COMPLETION_WORDS, ABANDON_WORDS)

STATE_FILE = "case_miner_state.json"


def _case_id(path, mtime):
    return hashlib.md5(f"{path}:{mtime}".encode()).hexdigest()[:12]


def classify(f):
    """三档分类。返回 (label, reasons)"""
    reasons = []
    has_output = (f["n_code_blocks"] > 0 or f["n_files_mentioned"] > 0)
    if f["ended_abandon"]:
        return "bad", ["用户明确放弃"] + (["有产出但未达预期"] if has_output else [])
    if f["ended_positive"] and f["n_correction"] <= 1 and has_output:
        return "good", ["正向收尾", "低纠正", f"产出(代码块{f['n_code_blocks']}/文件{f['n_files_mentioned']})"]
    if f["ended_positive"] and has_output and f["n_correction"] >= 2:
        return "review", ["正向收尾但纠正多（攻坚型，可能高价值）"]
    if f["n_correction"] >= 3 and not has_output:
        return "bad", ["高纠正且无产出"]
    if f["ended_positive"]:
        return "good", ["正向收尾（无显式文件产出，可能为问答类）"]
    return "review", ["无明确信号，需人工判断"]


def extract_dialog(session):
    """提取 (user, assistant) 交替的对话序列，供下游 SFT/DPO 使用。"""
    dialog = []
    for m in session.messages:
        if m.role in ("user", "assistant"):
            dialog.append({"role": m.role, "content": m.text.strip()})
    return dialog


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path", help="会话目录")
    ap.add_argument("--cases-dir", default="./cases")
    ap.add_argument("--full", action="store_true", help="忽略增量状态，全量重挖")
    args = ap.parse_args()

    os.makedirs(args.cases_dir, exist_ok=True)
    state_path = os.path.join(args.cases_dir, STATE_FILE)
    state = {} if args.full else (
        json.load(open(state_path)) if os.path.exists(state_path) else {})

    # 收集候选文件（新增或 mtime 变化）
    targets = []
    for dirpath, _, fns in os.walk(args.path):
        for fn in fns:
            if fn.lower().endswith((".md", ".json", ".jsonl", ".txt")):
                p = os.path.join(dirpath, fn)
                mt = os.path.getmtime(p)
                if state.get(p) != mt:
                    targets.append((p, mt))
    print(f"增量：{len(targets)} 个新/变更会话（已处理 {len(state)} 个）", file=sys.stderr)

    cases = []
    for p, mt in targets:
        s = load_session(p)
        if not s.parse_ok:
            continue
        f = session_features(s)
        # JSON 会话的结构化字段补充：write_files / n_w_files 直接反映产出，
        # 修正"产出写在结构化字段里、消息正文没提"导致的漏检
        if s.fmt in ("json", "jsonl"):
            try:
                rec = json.loads(open(p, encoding="utf-8", errors="replace").read())
                nwf = rec.get("n_w_files") or len(rec.get("write_files") or [])
                f["n_files_mentioned"] = max(f["n_files_mentioned"], nwf)
            except Exception:
                pass
        label, reasons = classify(f)
        cases.append({
            "case_id": _case_id(p, mt),
            "source_file": os.path.relpath(p, args.path),
            "label": label,
            "label_source": "heuristic_v1",   # 人工复核后改成 human_v1，区分来源
            "reasons": reasons,
            "features": {k: f[k] for k in
                         ("turns", "est_tokens", "n_correction", "n_code_blocks",
                          "n_files_mentioned", "ended_positive", "ended_abandon")},
            "dialog": extract_dialog(s),
            "mined_at": datetime.now().isoformat(timespec="seconds"),
        })
        state[p] = mt

    json.dump(state, open(state_path, "w"))
    if not cases:
        print("无新增案例，跳过本次版本生成", file=sys.stderr)
        return

    ver = "v" + datetime.now().strftime("%Y%m%d_%H%M%S")
    base_ver, suffix = ver, 1
    while os.path.exists(os.path.join(args.cases_dir, ver)):
        suffix += 1
        ver = f"{base_ver}_{suffix}"
    outdir = os.path.join(args.cases_dir, ver)
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, "cases.jsonl"), "w", encoding="utf-8") as fo:
        for c in cases:
            fo.write(json.dumps(c, ensure_ascii=False) + "\n")
    # latest 指针（Windows 内网可能无软链权限，用文本指针兜底）
    ptr = os.path.join(args.cases_dir, "latest")
    try:
        if os.path.islink(ptr) or os.path.exists(ptr):
            os.remove(ptr)
        os.symlink(ver, ptr)
    except OSError:
        open(ptr + ".txt", "w").write(ver)

    from collections import Counter
    cnt = Counter(c["label"] for c in cases)
    summary = [f"# 案例挖掘摘要 {ver}", "",
               f"- 新增案例：{len(cases)}（good {cnt.get('good',0)} / "
               f"bad {cnt.get('bad',0)} / review {cnt.get('review',0)}）",
               f"- 累计已处理会话：{len(state)}", "",
               "## 后续动作", "",
               f"1. 人工复核 review 档（{cnt.get('review',0)} 条）："
               "确认后把 label_source 改为 human_v1 —— 人工标注过的案例才是高置信训练数据",
               "2. bad 案例逐条归因：平台能力缺陷 / 任务本身难 / 用户用法问题，"
               "前两类分别进平台改进 backlog 和 bench 候选",
               "3. 用 training_data_builder.py 把 good/bad 导出为训练数据"]
    open(os.path.join(outdir, "summary.md"), "w", encoding="utf-8").write("\n".join(summary))
    print("\n".join(summary[:4]), file=sys.stderr)
    print(f"输出：{outdir}", file=sys.stderr)


if __name__ == "__main__":
    main()
