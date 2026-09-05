#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
training_data_builder.py
========================
把 case_miner 产出的案例库导出为训练数据：
    1. SFT 数据（good 案例的完整对话，messages 格式，可直接喂大多数微调框架）
    2. DPO 偏好对（从"用户纠正"行为构造：被纠正的回答 = rejected，
       纠正后被接受的回答 = chosen —— 业界标准的 implicit feedback 构造法）
    3. 小模型任务数据（会话首轮用户问题 + 标签，用于训练意图分类/路由小模型）

依赖：无（纯标准库）
用法：
    python training_data_builder.py ./cases/ --out ./training_data/
    # 默认读 cases/latest；可 --ver v20260905_120000 指定版本

质量门槛（重要，别跳过人工环节）：
    - SFT 默认只收 label_source=human_* 的 good 案例；--include-heuristic 才放宽
    - DPO 对的构造是启发式的，导出后建议抽验（导出文件里带 confidence 字段）
"""

import argparse
import json
import os
import sys
from datetime import datetime


def load_cases(cases_dir, ver=None):
    if ver is None:
        ptr = os.path.join(cases_dir, "latest")
        if os.path.islink(ptr):
            ver = os.readlink(ptr)
        elif os.path.exists(ptr + ".txt"):
            ver = open(ptr + ".txt").read().strip()
        else:
            vs = sorted(d for d in os.listdir(cases_dir) if d.startswith("v"))
            if not vs:
                sys.exit("案例库为空，先跑 case_miner.py")
            ver = vs[-1]
    path = os.path.join(cases_dir, ver, "cases.jsonl")
    cases = [json.loads(l) for l in open(path, encoding="utf-8")]
    return cases, ver


def to_sft(case):
    """good 案例 → SFT messages。剔除过短的对话。"""
    dialog = case.get("dialog") or []
    if len(dialog) < 2 or dialog[0]["role"] != "user":
        return None
    # 对齐到 user/assistant 交替，截断到最后一条 assistant
    msgs, last_a = [], -1
    for m in dialog:
        msgs.append({"role": m["role"], "content": m["content"]})
        if m["role"] == "assistant":
            last_a = len(msgs) - 1
    if last_a < 0:
        return None
    return {"messages": msgs[:last_a + 1],
            "meta": {"case_id": case["case_id"], "source": case["label_source"]}}


def to_dpo_pairs(case):
    """
    从纠正行为构造偏好对：
    对话中若出现 user 纠正消息，则 [纠正前的 assistant 回答] = rejected，
    [纠正之后的第一条 assistant 回答] = chosen，prompt = 纠正前的对话上下文。
    一条会话可能产出多对。confidence=medium 因为"纠正后回答"未必是最终满意版。
    """
    dialog = case.get("dialog") or []
    pairs = []
    for i, m in enumerate(dialog):
        if m["role"] != "user" or i == 0:
            continue
        prev_a = dialog[i - 1] if dialog[i - 1]["role"] == "assistant" else None
        next_a = next((d for d in dialog[i + 1:] if d["role"] == "assistant"), None)
        if prev_a and next_a and prev_a["content"] != next_a["content"]:
            pairs.append({
                "prompt": [x for x in dialog[:i - 1]],   # 纠正前的上下文
                "correction": m["content"],               # 保留用户的纠正指令
                "chosen": next_a["content"],
                "rejected": prev_a["content"],
                "confidence": "medium",
                "meta": {"case_id": case["case_id"]},
            })
    return pairs


def to_intent_samples(case):
    """首轮用户输入 → 小模型意图分类/路由训练样本（标签用案例标签+轮次分桶，弱标签）"""
    dialog = case.get("dialog") or []
    if not dialog or dialog[0]["role"] != "user":
        return None
    f = case["features"]
    bucket = "deep" if f["turns"] >= 4 else ("multi" if f["turns"] >= 2 else "single")
    return {"text": dialog[0]["content"][:2000],
            "labels": {"outcome": case["label"], "depth": bucket},
            "weak_label": True,   # 提醒：弱标签，适合预训练后人工精标
            "meta": {"case_id": case["case_id"]}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cases_dir")
    ap.add_argument("--ver", default=None)
    ap.add_argument("--out", default="./training_data")
    ap.add_argument("--include-heuristic", action="store_true",
                    help="SFT 也收启发式标注（未人工复核）的 good 案例")
    args = ap.parse_args()

    cases, ver = load_cases(args.cases_dir, args.ver)
    outdir = os.path.join(args.out, ver)
    os.makedirs(outdir, exist_ok=True)

    sft, dpo, intent = [], [], []
    for c in cases:
        trusted = c["label_source"].startswith("human") or args.include_heuristic
        if c["label"] == "good" and trusted:
            r = to_sft(c)
            if r:
                sft.append(r)
        if c["label"] in ("bad", "review"):
            dpo.extend(to_dpo_pairs(c))
        r = to_intent_samples(c)
        if r:
            intent.append(r)

    def dump(name, rows):
        with open(os.path.join(outdir, name), "w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

    dump("sft.jsonl", sft)
    dump("dpo_pairs.jsonl", dpo)
    dump("intent_weak.jsonl", intent)
    stats = {"version": ver, "built_at": datetime.now().isoformat(timespec="seconds"),
             "sft": len(sft), "dpo_pairs": len(dpo), "intent_weak": len(intent),
             "sft_scope": "human+heuristic" if args.include_heuristic else "human only"}
    json.dump(stats, open(os.path.join(outdir, "stats.json"), "w"),
              ensure_ascii=False, indent=2)
    print(json.dumps(stats, ensure_ascii=False, indent=2), file=sys.stderr)


if __name__ == "__main__":
    main()
