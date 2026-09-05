#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
session_value_charts.py
=======================
进阶分析版（依赖 pandas / matplotlib，内网 pip 镜像安装即可）：

    pip install pandas matplotlib

在 session_value_report.py 的解析与特征基础上，增加：
    1. 周粒度趋势图（会话量 / 活跃会话主人数 / 估算 token / 完成率）
    2. 投入-产出象限散点图
    3. 部门/业务线切片（配合用户身份映射表 mapping.csv）
    4. 交付物文件路径 → 业务线分布（用路径里的项目目录做归因）

用法：
    python session_value_charts.py /path/to/sessions/ --out-dir ./charts/
    python session_value_charts.py /path/to/sessions/ --map mapping.csv --out-dir ./charts/

用户身份识别约定（--owner-from）：
    dir   : 取会话文件相对路径的第一级子目录名作为 owner（默认，适合按人分目录存放）
    name  : 取文件名前缀（下划线或 - 前的部分）作为 owner

mapping.csv 格式（UTF-8）：
    owner,dept,project
    zhangsan,验证部,chipA
    lisi,后端设计部,chipB
"""

import argparse
import os
import re
import sys
from collections import Counter

import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# 中文显示：按常见字体逐个尝试，都不存在时降级为英文标签
def setup_chinese_font():
    from matplotlib import font_manager
    candidates = ["Microsoft YaHei", "SimHei", "SimSun", "WenQuanYi Zen Hei",
                  "Noto Sans CJK SC", "PingFang SC", "Source Han Sans SC"]
    installed = {f.name for f in font_manager.fontManager.ttflist}
    for c in candidates:
        if c in installed:
            plt.rcParams["font.sans-serif"] = [c]
            plt.rcParams["axes.unicode_minus"] = False
            return True
    return False


# 复用核心版的解析与特征提取
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
try:
    from session_value_report import (load_session, session_features,
                                      effort_score, output_score, FILE_PATH_RE)
except ImportError:
    print("需要 session_value_report.py 与本脚本放在同一目录", file=sys.stderr)
    sys.exit(1)

CN = setup_chinese_font()
# 标签中英文对照（无中文字体时自动用英文）
L = {
    "week": "周" if CN else "Week",
    "sessions": "会话数" if CN else "Sessions",
    "tokens": "估算token(万)" if CN else "Est. tokens (10k)",
    "completion": "完成率" if CN else "Completion rate",
    "effort": "投入分（轮次+token+纠正）" if CN else "Effort score",
    "output": "产出分（代码块+文件+收尾）" if CN else "Output score",
    "dept": "部门" if CN else "Department",
    "count": "数量" if CN else "Count",
    "biz": "业务线分布(按产出文件路径)" if CN else "Business lines (by output path)",
}


def owner_of(path, root, mode):
    rel = os.path.relpath(path, root)
    if mode == "dir":
        parts = rel.split(os.sep)
        return parts[0] if len(parts) > 1 else "_root"
    base = os.path.splitext(os.path.basename(path))[0]
    return re.split(r"[_\-]", base)[0]


def week_of(dt):
    return dt.strftime("%Y-W%W") if dt else None


def main():
    ap = argparse.ArgumentParser(description="会话价值进阶分析（图表版）")
    ap.add_argument("path", help="会话文件目录")
    ap.add_argument("--map", dest="map_csv", help="用户身份映射表 mapping.csv")
    ap.add_argument("--owner-from", choices=["dir", "name"], default="dir")
    ap.add_argument("--out-dir", default="./charts")
    args = ap.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)

    from session_value_report import collect_files
    files = collect_files(args.path)

    rows = []
    for p in files:
        s = load_session(p)
        f = session_features(s)
        tss = [m.ts for m in s.messages if m.ts]
        rows.append({
            "file": os.path.relpath(p, args.path),
            "owner": owner_of(p, args.path, args.owner_from),
            "week": week_of(min(tss)) if tss else None,
            "turns": f["turns"], "est_tokens": f["est_tokens"],
            "duration_min": f["duration_min"],
            "code_blocks": f["n_code_blocks"], "files": f["n_files_mentioned"],
            "corrections": f["n_correction"],
            "ended_positive": f["ended_positive"],
            "completed_proxy": f["completed_proxy"],
            "effort": effort_score(f), "output": output_score(f),
        })
    df = pd.DataFrame(rows)
    print(f"解析 {len(df)} 个会话", file=sys.stderr)

    # ---- 身份映射 ----
    if args.map_csv and os.path.exists(args.map_csv):
        mp = pd.read_csv(args.map_csv, encoding="utf-8-sig")
        df = df.merge(mp, on="owner", how="left")
        df["dept"] = df["dept"].fillna("未映射")
        print(f"身份映射命中率：{(df['dept'] != '未映射').mean():.0%}", file=sys.stderr)
    else:
        df["dept"] = "未映射"

    df.to_csv(os.path.join(args.out_dir, "session_features.csv"),
              index=False, encoding="utf-8-sig")

    # ---- 图1：周趋势 ----
    if df["week"].notna().any():
        g = df.dropna(subset=["week"]).groupby("week").agg(
            sessions=("file", "count"),
            tokens=("est_tokens", lambda x: x.sum() / 10000),
            completion=("completed_proxy", "mean"),
        ).sort_index()
        fig, ax1 = plt.subplots(figsize=(10, 5))
        ax1.bar(g.index, g["sessions"], color="#4C78A8", alpha=0.8, label=L["sessions"])
        ax1.set_ylabel(L["sessions"]); ax1.set_xlabel(L["week"])
        plt.xticks(rotation=45)
        ax2 = ax1.twinx()
        ax2.plot(g.index, g["completion"], color="#F58518", marker="o",
                 label=L["completion"])
        ax2.set_ylabel(L["completion"]); ax2.set_ylim(0, 1)
        fig.tight_layout()
        fig.savefig(os.path.join(args.out_dir, "1_周趋势.png"), dpi=150)
        plt.close(fig)

    # ---- 图2：投入-产出象限散点 ----
    fig, ax = plt.subplots(figsize=(8, 6))
    colors = df["ended_positive"].map({True: "#54A24B", False: "#E45756"})
    ax.scatter(df["effort"], df["output"], c=colors, alpha=0.7, s=60,
               edgecolors="white")
    ax.axvline(df["effort"].median(), color="gray", ls="--", lw=1)
    ax.axhline(df["output"].median(), color="gray", ls="--", lw=1)
    ax.set_xlabel(L["effort"]); ax.set_ylabel(L["output"])
    fig.tight_layout()
    fig.savefig(os.path.join(args.out_dir, "2_价值象限.png"), dpi=150)
    plt.close(fig)

    # ---- 图3：部门切片 ----
    if (df["dept"] != "未映射").any():
        g = df.groupby("dept").agg(
            sessions=("file", "count"), completion=("completed_proxy", "mean"),
            output_sum=("output", "sum"))
        fig, axes = plt.subplots(1, 2, figsize=(12, 5))
        axes[0].barh(g.index, g["sessions"], color="#4C78A8")
        axes[0].set_xlabel(L["sessions"])
        axes[1].barh(g.index, g["output_sum"], color="#72B7B2")
        axes[1].set_xlabel(L["output"])
        fig.tight_layout()
        fig.savefig(os.path.join(args.out_dir, "3_部门切片.png"), dpi=150)
        plt.close(fig)

    # ---- 图4：产出文件路径 → 业务线归因 ----
    path_counter = Counter()
    for p in files:
        s = load_session(p)
        text = "\n".join(m.text for m in s.messages)
        for fp in set(FILE_PATH_RE.findall(text)):
            seg = [x for x in fp.replace("\\", "/").split("/") if x]
            # 取路径中的"项目级"目录：/project/xxx/... 下的 xxx，否则取一级目录
            biz = seg[1] if len(seg) > 1 and seg[0].lower() in ("project", "proj") \
                else (seg[0] if seg else "其他")
            path_counter[biz] += 1
    if path_counter:
        top = path_counter.most_common(10)
        fig, ax = plt.subplots(figsize=(9, 5))
        ax.barh([k for k, _ in top][::-1], [v for _, v in top][::-1],
                color="#F2CF5B")
        ax.set_title(L["biz"]); ax.set_xlabel(L["count"])
        fig.tight_layout()
        fig.savefig(os.path.join(args.out_dir, "4_业务线归因.png"), dpi=150)
        plt.close(fig)

    print(f"图表与明细已输出到：{args.out_dir}", file=sys.stderr)


if __name__ == "__main__":
    main()
