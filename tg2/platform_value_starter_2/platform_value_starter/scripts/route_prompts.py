#!/usr/bin/env python3
"""Reversible task hints. No model call and no removal or rewriting of user text."""
import copy
import json
import pickle
from pathlib import Path
from common import digest

VERSION = "task-hints-v2"
RULES = {
    "coding": ["python", "脚本", "代码", "报错", "编程"],
    "data_analysis": ["统计", "均值", "平均", "数据分析", "相关性"],
    "knowledge": ["解释", "说明", "知识", "原理", "是什么"],
}
HINTS = {
    "coding": "任务可能涉及代码。先核对运行环境、接口与输入输出约束；已有错误信息优先作为排查依据。",
    "data_analysis": "任务可能涉及数据分析。核对数据范围、字段、单位、分母和缺失值；依据提供的数据计算，区分观测与解释。",
    "knowledge": "任务可能涉及知识问答。依据可用资料回答，区分来源事实与推断；资料不足时说明缺口。",
}
GENERIC = "先核对用户目标、已有输入与输出约束；只完成请求范围内的工作；缺少必要信息时说明缺口。"
BOUNDARY = "以下是可能有误的自动任务提示，只供参考。遵循原有系统约束和用户原始要求；保留原定输出格式；不得新增事实、改动数值单位、扩大权限或任务范围。不要求输出内部推理过程。"


def load_rules(path=None):
    rules = json.loads(Path(path).read_text()) if path else RULES
    if not isinstance(rules, dict) or not rules or not all(isinstance(k,str) and isinstance(v,list) and v and all(isinstance(w,str) and w for w in v) for k,v in rules.items()):
        raise ValueError("rules must map intent labels to nonempty keyword lists")
    return rules


def keyword_route(text, rules=None):
    matched = [label for label, words in (rules or RULES).items() if any(w.casefold() in text.casefold() for w in words)]
    return matched[0] if len(matched) == 1 else "__abstain__"


class PromptPolicy:
    def __init__(self, name="none", router_path=None, threshold=0.75, rules_path=None, hints_path=None):
        if name not in {"none","generic","keywords","classifier"} or not 0 <= threshold <= 1:
            raise ValueError("invalid policy/threshold")
        self.name, self.threshold = name, threshold
        self.rules = load_rules(rules_path)
        self.hints = json.loads(Path(hints_path).read_text()) if hints_path else HINTS
        if not isinstance(self.hints,dict) or not all(isinstance(k,str) and isinstance(v,str) and 0 < len(v) <= 500 for k,v in self.hints.items()):
            raise ValueError("hints must be short reviewed strings indexed by intent")
        self.model, router_hash = None, None
        if name == "classifier":
            if not router_path: raise ValueError("classifier policy needs --router-model")
            payload = Path(router_path).read_bytes()
            import hashlib
            router_hash = hashlib.sha256(payload).hexdigest()
            self.model = pickle.loads(payload)  # Only trusted internal training artifacts.
            self.training_meta = json.loads(Path(router_path).with_name("metrics.json").read_text())
        self.manifest = {"name":name,"version":VERSION,"threshold":threshold if name=="classifier" else None,
            "router_sha256":router_hash,"rules_sha256":digest(self.rules) if name=="keywords" else None,
            "hints_sha256":digest({"boundary":BOUNDARY,"generic":GENERIC,"hints":self.hints}),
            "script_sha256":digest(Path(__file__).read_text())}

    def validate_tasks(self, tasks):
        if self.name == "none": return
        if any(t.get("task_type") == "intent_routing" for t in tasks):
            raise ValueError("prompt ablation needs downstream tasks, not intent labels which hints could reveal")
        if self.name != "classifier": return
        meta = self.training_meta
        for key in ("train_source_groups","train_case_ids","train_text_hashes"):
            if key not in meta: raise ValueError("re-export router training provenance for leakage checks")
        for t in tasks:
            overlap = t["source_group"] in meta["train_source_groups"] or t.get("case_id") in meta["train_case_ids"]
            overlap |= any(digest(" ".join(m["content"].casefold().split())) in meta["train_text_hashes"] for m in t["messages"] if m["role"]=="user")
            if overlap: raise ValueError("downstream benchmark overlaps classifier training sources/text")

    def apply(self, messages):
        original = copy.deepcopy(messages)
        meta = {"policy":self.name,"original_input_sha256":digest(messages),"hint_applied":False,"intent":None,"score":None}
        if self.name == "none": return original, meta
        hint = GENERIC
        if self.name != "generic":
            users = [m["content"] for m in messages if m["role"] == "user"]
            if len(users) != 1:
                return original, {**meta,"fallback":"multi_turn_requires_context_router"}
            if self.name == "keywords":
                label = keyword_route(users[0],self.rules)
            else:
                scores = self.model.predict_proba(users).tolist()[0]
                pos = max(range(len(scores)),key=scores.__getitem__)
                label, score = str(self.model.classes_[pos]), float(scores[pos])
                meta["score"] = score
                if score < self.threshold:
                    return original, {**meta,"fallback":"low_score"}
            meta["intent"] = label
            if label not in self.hints:
                return original, {**meta,"fallback":"ambiguous_or_unmapped_intent"}
            hint = self.hints[label]
        at = 0
        while at < len(original) and original[at]["role"] == "system": at += 1
        original.insert(at,{"role":"system","content":BOUNDARY+"\n"+hint})
        return original,{**meta,"hint_applied":True,"augmented_input_sha256":digest(original),"hint_characters":len(BOUNDARY)+len(hint)+1}
