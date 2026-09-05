#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
session_value_report.py
=======================
AI 平台会话价值分析脚本（零依赖版，仅需 Python 3.8+ 标准库）

用途：
    对 opencode / 类 opencode 的会话记录文件（.md / .json / .jsonl）做
    描述统计 + 交互价值特征提取，输出一份 Markdown 分析报告。

用法：
    python session_value_report.py /path/to/sessions/ -o report.md
    python session_value_report.py /path/to/sessions/            # 报告打印到屏幕
    python session_value_report.py /path/to/one_session.md       # 单文件也可以

设计原则：
    1. 纯标准库：json / re / os / collections / datetime / argparse，内网直接跑
    2. 格式宽容：自动尝试 JSON -> JSONL -> Markdown 三种解析方式，尽力而为
    3. 信号词表集中管理（文件顶部 SIGNAL 配置区），方便按公司实际语境调整
    4. 所有"推断性指标"都在报告中标注了口径，避免向上汇报时被质疑数据来源

注意：
    本脚本所有"价值"判断均为【交互价值】的代理指标（proxy），
    不代表最终业务价值，结论需要结合业务场景人工解读。
"""

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from statistics import mean, median

# ============================================================
# 配置区：信号词表（按公司实际使用语境调整）
# ============================================================

# 用户"纠正/不满"信号 —— 反向价值信号
CORRECTION_WORDS = [
    "不对", "错了", "重来", "重新来", "不是这样", "你理解错", "搞错了",
    "有问题", "报错", "改一下", "改回", "撤销", "不是我要的", "再改",
    "wrong", "incorrect", "not right", "try again", "revert",
]

# 用户"完成/满意"信号 —— 正向价值信号
COMPLETION_WORDS = [
    "谢谢", "感谢", "搞定", "可以了", "完美", "解决了", "好了",
    "不错", "辛苦", "可以", "成了", "没问题了",
    "thanks", "thank you", "perfect", "done", "great", "works",
]

# 用户"放弃/中断"信号（出现在会话末尾时权重更高）
ABANDON_WORDS = [
    "算了", "不用了", "先这样", "我自己来吧", "还是手动", "我自己写",
    "forget it", "never mind",
]

# 常见工具调用模式（Markdown 文本中的痕迹）
TOOL_PATTERNS = [
    r"```(?:bash|sh|shell)[\s\S]*?```",        # shell 代码块
    r"\b(?:edit|write|read|bash|run|execute)\s*[_(]?file",  # 工具名痕迹
    r"<tool[_-]?call",                          # XML 风格工具调用
    r'"tool"\s*:',                              # JSON 风格工具调用
]

# 代码块 / 文件产出的正则
CODE_BLOCK_RE = re.compile(r"```(\w*)\n[\s\S]*?```")
FILE_PATH_RE = re.compile(
    r"[\w\-./\\]+\.(?:py|v|sv|svh|vh|tcl|sh|c|cpp|h|hpp|js|ts|json|yaml|yml|"
    r"md|txt|csv|xdc|sdc|upf|lef|def|lib|sp|cir|f)\b"
)

# 时间戳的常见格式
TS_PATTERNS = [
    (re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}"), "%Y-%m-%dT%H:%M:%S"),
    (re.compile(r"\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}"), "%Y/%m/%d %H:%M:%S"),
]

# ============================================================
# 数据结构
# ============================================================

class Message:
    __slots__ = ("role", "text", "ts")
    def __init__(self, role, text, ts=None):
        self.role = role        # 'user' / 'assistant' / 'tool' / 'unknown'
        self.text = text or ""
        self.ts = ts            # datetime or None


class Session:
    def __init__(self, path):
        self.path = path
        self.messages = []
        self.parse_ok = False
        self.fmt = "unknown"


# ============================================================
# 解析层：尽力而为的三种格式识别
# ============================================================

ROLE_MAP = {
    "user": "user", "human": "user", "Human": "user", "USER": "user",
    "assistant": "assistant", "ai": "assistant", "Assistant": "assistant",
    "ASSISTANT": "assistant", "model": "assistant",
    "tool": "tool", "tool_result": "tool", "function": "tool",
}


def _norm_role(r):
    r = str(r).strip()
    return ROLE_MAP.get(r) or ROLE_MAP.get(r.lower(), "unknown")


def _try_parse_ts(text):
    for pat, fmt in TS_PATTERNS:
        m = pat.search(text)
        if m:
            try:
                return datetime.strptime(m.group(0), fmt.replace("T", "T"))
            except Exception:
                try:
                    return datetime.strptime(m.group(0).replace("T", " "), "%Y-%m-%d %H:%M:%S")
                except Exception:
                    pass
    return None


def parse_json_session(obj):
    """处理 JSON 格式的会话：dict 带 messages，或 message 列表。"""
    msgs = []
    if isinstance(obj, dict):
        raw = obj.get("messages") or obj.get("history") or obj.get("conversation") or []
    elif isinstance(obj, list):
        raw = obj
    else:
        return msgs
    for m in raw:
        if not isinstance(m, dict):
            continue
        role = _norm_role(m.get("role", m.get("author", m.get("type", ""))))
        content = m.get("content", m.get("text", m.get("message", "")))
        if isinstance(content, list):  # content parts 形式
            content = "\n".join(
                p.get("text", "") if isinstance(p, dict) else str(p) for p in content
            )
        ts = None
        for k in ("timestamp", "created_at", "time", "createdAt"):
            if k in m:
                ts = _try_parse_ts(str(m[k]))
                break
        msgs.append(Message(role, str(content), ts))
    return msgs


def parse_markdown_session(text):
    """
    Markdown 会话的宽容解析：
    按常见角色标题（## User / ### Assistant / **User**: / 等）切块；
    识别不出来时，整个文件作为一条 unknown 消息（仍可做文本级统计）。
    """
    msgs = []
    # 常见角色标记：## User、### Assistant、**User**:、👤 等
    role_head = re.compile(
        r"^(?:#{1,4}\s*|\*\*)?\s*(User|Human|Assistant|AI|Model|Tool|用户|助手|用户输入|模型回复)\s*"
        r"(?:\*\*)?\s*[:：]?\s*$",
        re.IGNORECASE | re.MULTILINE,
    )
    parts = role_head.split(text)
    if len(parts) >= 3:
        # split 结果：[前导, 角色1, 内容1, 角色2, 内容2, ...]
        for i in range(1, len(parts) - 1, 2):
            role_raw = parts[i].strip()
            content = parts[i + 1]
            if role_raw in ("用户", "用户输入"):
                role = "user"
            elif role_raw in ("助手", "模型回复"):
                role = "assistant"
            else:
                role = _norm_role(role_raw)
            msgs.append(Message(role, content, _try_parse_ts(content[:200])))
        return msgs
    return [Message("unknown", text, _try_parse_ts(text))]


def load_session(path):
    s = Session(path)
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    except Exception:
        return s

    # 1) 尝试整体 JSON
    try:
        obj = json.loads(text)
        s.messages = parse_json_session(obj)
        s.fmt = "json"
        s.parse_ok = bool(s.messages)
        if s.parse_ok:
            return s
    except Exception:
        pass

    # 2) 尝试 JSONL（每行一个 message 对象）
    try:
        lines = [l for l in text.splitlines() if l.strip()]
        objs = [json.loads(l) for l in lines[:50]]  # 先试前 50 行
        if all(isinstance(o, dict) for o in objs):
            all_objs = [json.loads(l) for l in lines]
            s.messages = parse_json_session(all_objs)
            if s.messages:
                s.fmt = "jsonl"
                s.parse_ok = True
                return s
    except Exception:
        pass

    # 3) 回退 Markdown
    s.messages = parse_markdown_session(text)
    s.fmt = "markdown"
    s.parse_ok = True
    return s


# ============================================================
# 特征层：单会话特征提取
# ============================================================

def count_hits(text, words):
    t = text.lower()
    return sum(1 for w in words if w.lower() in t)


def est_tokens(text):
    """无 tokenizer 时的粗略估计：中英混合按 字符数/2 估算。仅作相对比较用。"""
    return max(1, len(text) // 2)


def session_features(s):
    f = {}
    users = [m for m in s.messages if m.role == "user"]
    assistants = [m for m in s.messages if m.role == "assistant"]
    all_text = "\n".join(m.text for m in s.messages)
    user_text = "\n".join(m.text for m in users)

    f["n_msgs"] = len(s.messages)
    f["n_user"] = len(users)
    f["n_assistant"] = len(assistants)
    f["turns"] = len(users)  # 以用户发言数近似轮次
    f["est_tokens"] = est_tokens(all_text)
    f["user_token_share"] = (est_tokens(user_text) / f["est_tokens"]) if f["est_tokens"] else 0

    # 时长
    tss = [m.ts for m in s.messages if m.ts]
    f["duration_min"] = ((max(tss) - min(tss)).total_seconds() / 60) if len(tss) >= 2 else None

    # 产出特征
    f["n_code_blocks"] = len(CODE_BLOCK_RE.findall(all_text))
    f["n_files_mentioned"] = len(set(FILE_PATH_RE.findall(all_text)))
    f["n_tool_traces"] = sum(len(re.findall(p, all_text)) for p in TOOL_PATTERNS)

    # 行为信号
    f["n_correction"] = count_hits(user_text, CORRECTION_WORDS)
    f["n_completion"] = count_hits(user_text, COMPLETION_WORDS)
    f["n_abandon"] = count_hits(user_text, ABANDON_WORDS)

    # 收尾状态：最后一条用户消息里有没有完成/放弃信号
    last_user = users[-1].text if users else ""
    f["ended_positive"] = count_hits(last_user, COMPLETION_WORDS) > 0
    f["ended_abandon"] = count_hits(last_user, ABANDON_WORDS) > 0

    # 完成率代理：有正向收尾 且 纠正次数不多
    f["completed_proxy"] = f["ended_positive"] and f["n_correction"] <= 2
    return f


def effort_score(f):
    """投入侧：轮次 + token + 纠正次数（纠正多 = 费劲）"""
    return f["turns"] + f["est_tokens"] / 2000 + f["n_correction"] * 1.5


def output_score(f):
    """产出侧：代码块 + 文件 + 正向收尾加权"""
    return f["n_code_blocks"] * 2 + f["n_files_mentioned"] * 1.5 + (3 if f["ended_positive"] else 0)


# ============================================================
# 聚合与报告
# ============================================================

def pct(n, d):
    return f"{n / d * 100:.1f}%" if d else "0.0%"


def dist_line(values, unit=""):
    values = [v for v in values if v is not None]
    if not values:
        return "无数据"
    return (f"中位数 {median(values):.1f}{unit} / "
            f"均值 {mean(values):.1f}{unit} / "
            f"最大 {max(values):.1f}{unit}")


def build_report(sessions, features, scan_dir):
    lines = []
    A = lines.append
    n = len(sessions)
    parsed = sum(1 for s in sessions if s.parse_ok)

    A("# AI 平台会话价值分析报告（自动生成）")
    A("")
    A(f"- 扫描目录：`{scan_dir}`")
    A(f"- 生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}")
    A(f"- 会话文件总数：{n}，成功解析：{parsed}（{pct(parsed, n)}）")
    A(f"- 解析格式分布：{dict(Counter(s.fmt for s in sessions))}")
    A("")
    A("> 口径说明：本报告所有指标为**交互价值代理指标**，由会话文本启发式提取；")
    A("> token 数为字符数/2 的粗略估计，仅用于相对比较；完成/放弃等信号基于词表匹配，存在误判率。")
    A("")

    # ---------- 1. 规模总览 ----------
    A("## 一、使用规模总览")
    A("")
    total_tok = sum(f["est_tokens"] for f in features)
    A(f"- 累计估算 token 消耗：约 **{total_tok/10000:.1f} 万**")
    A(f"- 累计用户消息数：{sum(f['n_user'] for f in features)}")
    A(f"- 会话轮次（用户消息数/会话）：{dist_line([f['turns'] for f in features], ' 轮')}")
    A(f"- 会话时长：{dist_line([f['duration_min'] for f in features], ' 分钟')}")
    A(f"- 单会话估算 token：{dist_line([f['est_tokens'] for f in features])}")
    A("")

    # ---------- 2. 产出统计 ----------
    A("## 二、产出统计（交付物侧）")
    A("")
    nb = [f["n_code_blocks"] for f in features]
    nf = [f["n_files_mentioned"] for f in features]
    A(f"- 含代码产出的会话：{sum(1 for x in nb if x > 0)} 个（{pct(sum(1 for x in nb if x > 0), n)}）")
    A(f"- 代码块总数：{sum(nb)}；每会话分布：{dist_line(nb, ' 个')}")
    A(f"- 涉及文件路径总数（去重后按会话计）：{sum(nf)}；每会话分布：{dist_line(nf, ' 个')}")
    A(f"- 有工具调用痕迹的会话：{sum(1 for f in features if f['n_tool_traces'] > 0)} 个")
    A("")

    # ---------- 3. 用户行为信号 ----------
    A("## 三、用户行为信号（质量侧代理指标）")
    A("")
    pos = sum(1 for f in features if f["ended_positive"])
    abn = sum(1 for f in features if f["ended_abandon"])
    comp = sum(1 for f in features if f["completed_proxy"])
    zero_corr = sum(1 for f in features if f["n_correction"] == 0)
    A(f"- 正向收尾（感谢/完成类信号）：{pos} 个会话（{pct(pos, n)}）")
    A(f"- 完成代理指标（正向收尾且纠正≤2次）：{comp} 个会话（{pct(comp, n)}）")
    A(f"- 放弃信号（算了/自己来）：{abn} 个会话（{pct(abn, n)}）")
    A(f"- 零纠正会话（一次做对）：{zero_corr} 个（{pct(zero_corr, n)}）")
    A(f"- 平均每会话纠正次数：{mean([f['n_correction'] for f in features]):.2f}")
    A("")

    # ---------- 4. 价值象限 ----------
    A("## 四、交互价值象限（投入 × 产出）")
    A("")
    efforts = [effort_score(f) for f in features]
    outputs = [output_score(f) for f in features]
    e_med, o_med = median(efforts), median(outputs)
    quad = Counter()
    quad_sessions = defaultdict(list)
    for s, f, e, o in zip(sessions, features, efforts, outputs):
        hi_e, hi_o = e >= e_med, o >= o_med
        if hi_o and hi_e:
            q = "高投入高产出（攻坚型）"
        elif hi_o and not hi_e:
            q = "低投入高产出（高效型）"
        elif not hi_o and hi_e:
            q = "高投入低产出（摩擦型/探索型）"
        else:
            q = "低投入低产出（轻量问答型）"
        quad[q] += 1
        quad_sessions[q].append((s.path, e, o, f))
    for q in ["低投入高产出（高效型）", "高投入高产出（攻坚型）",
              "低投入低产出（轻量问答型）", "高投入低产出（摩擦型/探索型）"]:
        A(f"- {q}：{quad.get(q, 0)} 个（{pct(quad.get(q, 0), n)}）")
    A("")
    A("> 解读提示：高效型占比高 = 平台顺手好用；攻坚型占比高 = 平台承载了硬核任务；")
    A("> 摩擦型占比需要关注——其中可能包含失败探索（需人工复核其中是否有学习价值）；")
    A("> 若轻量问答型占绝对主导，说明平台尚未嵌入深度工作流。")
    A("")

    # ---------- 5. 重点会话清单 ----------
    A("## 五、值得人工复核的会话 TOP 清单")
    A("")
    A("### 5.1 高价值候选（产出最高）")
    A("")
    A("| 会话文件 | 轮次 | 代码块 | 文件数 | 收尾信号 |")
    A("|---|---|---|---|---|")
    top_out = sorted(zip(sessions, features, outputs), key=lambda x: -x[2])[:10]
    for s, f, o in top_out:
        A(f"| {os.path.basename(s.path)} | {f['turns']} | {f['n_code_blocks']} | "
          f"{f['n_files_mentioned']} | {'✓' if f['ended_positive'] else '-'} |")
    A("")
    A("### 5.2 高摩擦候选（建议排查：平台问题还是任务本身难）")
    A("")
    A("| 会话文件 | 轮次 | 纠正次数 | 产出 | 收尾信号 |")
    A("|---|---|---|---|---|")
    top_friction = sorted(zip(sessions, features),
                          key=lambda x: -x[1]["n_correction"])[:10]
    for s, f in top_friction:
        A(f"| {os.path.basename(s.path)} | {f['turns']} | {f['n_correction']} | "
          f"{f['n_code_blocks'] + f['n_files_mentioned']} | "
          f"{'正向' if f['ended_positive'] else ('放弃' if f['ended_abandon'] else '无')} |")
    A("")

    # ---------- 6. 下一步建议 ----------
    A("## 六、建议的下一步")
    A("")
    A("1. 人工抽验 5.1 清单中 10 个会话，确认高产出会话的业务归属（部门/项目线）")
    A("2. 复核 5.2 清单：区分『任务本身困难』与『平台能力不足』，后者即平台改进点")
    A("3. 若信号词误判较多，调整脚本顶部 CORRECTION_WORDS / COMPLETION_WORDS 后重跑")
    A("4. 本报告可定期（周/月）生成，跟踪各指标趋势——趋势比单点数值更有说服力")
    A("")
    return "\n".join(lines)


# ============================================================
# 主流程
# ============================================================

def collect_files(root):
    exts = (".md", ".json", ".jsonl", ".txt")
    if os.path.isfile(root):
        return [root]
    out = []
    for dirpath, _, filenames in os.walk(root):
        for fn in filenames:
            if fn.lower().endswith(exts):
                out.append(os.path.join(dirpath, fn))
    return sorted(out)


def main():
    ap = argparse.ArgumentParser(description="AI 平台会话价值分析（零依赖版）")
    ap.add_argument("path", help="会话文件目录或单个文件")
    ap.add_argument("-o", "--out", help="报告输出路径（.md），缺省打印到屏幕")
    args = ap.parse_args()

    files = collect_files(args.path)
    if not files:
        print(f"未找到会话文件：{args.path}", file=sys.stderr)
        sys.exit(1)
    print(f"发现 {len(files)} 个文件，开始解析...", file=sys.stderr)

    sessions, features = [], []
    for p in files:
        s = load_session(p)
        sessions.append(s)
        features.append(session_features(s))

    report = build_report(sessions, features, args.path)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(report)
        print(f"报告已写入：{args.out}", file=sys.stderr)
    else:
        print(report)


if __name__ == "__main__":
    main()
