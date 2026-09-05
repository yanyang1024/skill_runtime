#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
retention_cohorts.py
====================
真留存曲线：按用户首次使用周分 cohort，计算 W1/W2/W4/W8 留存率，
回击"98.5% 渗透率是不是注册就算活跃"的质疑。

依赖：pandas、matplotlib
用法：
    python retention_cohorts.py /path/to/sessions/ --out-dir ./charts/
    （会话文件需含 owner 可推断的目录结构 + 时间戳 start_ms/created_at）

输入约定：同 session_value_charts.py —— 默认取第一级子目录名作为 owner。
"""

import argparse
import os
import sys
from datetime import datetime

import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from session_value_report import collect_files  # noqa: E402


def _setup_font():
    from matplotlib import font_manager
    candidates = ["Microsoft YaHei", "SimHei", "WenQuanYi Zen Hei",
                  "Noto Sans CJK SC", "PingFang SC", "Source Han Sans SC"]
    installed = {f.name for f in font_manager.fontManager.ttflist}
    for c in candidates:
        if c in installed:
            plt.rcParams["font.sans-serif"] = [c]
            plt.rcParams["axes.unicode_minus"] = False
            return True
    return False


_CN = _setup_font()
T_TITLE = "用户周留存矩阵（按首次使用周分 cohort）" if _CN else "Weekly Retention Cohorts"


def _ts_of_file(path):
    import json
    try:
        text = open(path, encoding="utf-8", errors="replace").read()
        try:
            rec = json.loads(text)
            ms = rec.get("start_ms")
            if ms:
                return datetime.fromtimestamp(ms / 1000)
            for k in ("created_at", "date"):
                if rec.get(k):
                    return datetime.strptime(str(rec[k])[:10].replace("/", "-"), "%Y-%m-%d")
        except Exception:
            pass
        # 兜底1：13 位毫秒时间戳
        import re
        m = re.search(r'"start_ms"\s*:\s*(\d{13})', text)
        if m:
            return datetime.fromtimestamp(int(m.group(1)) / 1000)
        # 兜底2：日期文本
        m = re.search(r"\d{4}-\d{2}-\d{2}", text)
        if m:
            return datetime.strptime(m.group(0), "%Y-%m-%d")
    except Exception:
        pass
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--out-dir", default="./charts")
    args = ap.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)

    rows = []
    for p in collect_files(args.path):
        rel = os.path.relpath(p, args.path)
        parts = rel.split(os.sep)
        owner = parts[0] if len(parts) > 1 else "_root"
        ts = _ts_of_file(p)
        if ts:
            rows.append({"owner": owner, "date": ts})
    df = pd.DataFrame(rows)
    if df.empty:
        sys.exit("未能从会话中提取到时间戳，请确认有 start_ms / created_at / 日期文本")

    df["week"] = df["date"].dt.to_period("W")
    first = df.groupby("owner")["week"].min().rename("cohort")
    df = df.join(first, on="owner")
    df["weeks_since"] = (df["week"] - df["cohort"]).apply(lambda x: x.n)

    cohorts = df.groupby("cohort")["owner"].nunique()
    matrix = {}
    for w in (1, 2, 4, 8):
        stayed = (df[df["weeks_since"] == w].groupby("cohort")["owner"]
                  .nunique().reindex(cohorts.index).fillna(0))
        matrix[f"W{w}留存"] = (stayed / cohorts).round(3)
    mat = pd.DataFrame(matrix)
    mat["cohort规模"] = cohorts
    # 剔除过近、不足以观察的 cohort
    latest = df["week"].max()
    for i, w in enumerate((1, 2, 4, 8)):
        too_young = [(latest - c).n < w for c in mat.index]
        mat.loc[too_young, f"W{w}留存"] = float("nan")

    print("留存矩阵：\n", mat.to_markdown(), file=sys.stderr)
    mat.to_csv(os.path.join(args.out_dir, "留存矩阵.csv"), encoding="utf-8-sig")

    fig, ax = plt.subplots(figsize=(10, 6))
    im = ax.imshow(mat[[f"W{w}留存" for w in (1, 2, 4, 8)]].values,
                   cmap="YlGnBu", vmin=0, vmax=1, aspect="auto")
    ax.set_xticks(range(4), [f"W{w}" for w in (1, 2, 4, 8)])
    ax.set_yticks(range(len(mat)), [str(i) for i in mat.index])
    for i in range(len(mat)):
        for j, w in enumerate((1, 2, 4, 8)):
            v = mat.iloc[i, j]
            if pd.notna(v):
                ax.text(j, i, f"{v:.0%}", ha="center", va="center", fontsize=9)
    ax.set_title(T_TITLE)
    fig.colorbar(im)
    fig.tight_layout()
    fig.savefig(os.path.join(args.out_dir, "5_留存矩阵.png"), dpi=150)

    overall_w4 = mat["W4留存"].dropna()
    if len(overall_w4):
        print(f"W4 留存（各 cohort 均值）：{overall_w4.mean():.0%}", file=sys.stderr)


if __name__ == "__main__":
    main()
