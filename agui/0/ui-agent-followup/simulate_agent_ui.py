#!/usr/bin/env python3
"""Illustrative Agent UI scenarios and effort sensitivity; standard library only.

Run: python3 simulate_agent_ui.py --output simulation-results.json
All effort parameters and interaction plans are hypotheses, not user-study data.
"""
import argparse
import json
from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class Effort:
    monthly_tasks: float = 2000
    adoption: float = 0.6
    saved_minutes: float = 3
    added_review_minutes: float = 1
    development_days: float = 10
    maintenance_hours: float = 12
    working_hours_per_day: float = 8

    def result(self):
        if self.monthly_tasks < 0 or not 0 <= self.adoption <= 1:
            raise ValueError("Invalid volume or adoption")
        if min(self.saved_minutes, self.added_review_minutes,
               self.development_days, self.maintenance_hours,
               self.working_hours_per_day) < 0:
            raise ValueError("Time values must be nonnegative")
        delta = self.saved_minutes - self.added_review_minutes
        user = self.monthly_tasks * self.adoption * delta / 60
        net = user - self.maintenance_hours
        payback = self.development_days * self.working_hours_per_day / net if net > 0 else None
        threshold = self.maintenance_hours * 60 / (self.adoption * delta) if self.adoption > 0 and delta > 0 else None
        return {"assumptions": asdict(self), "user_net_saved_hours_per_month": round(user, 4),
                "net_after_maintenance_hours_per_month": round(net, 4),
                "equal_hour_payback_months": round(payback, 4) if payback is not None else None,
                "positive_net_requires_monthly_tasks_above": round(threshold, 4) if threshold is not None else None}


def effort_cases():
    return {name: Effort(**kw).result() for name, kw in {
        "base_illustration": {},
        "low_adoption": {"adoption": .2},
        "low_volume": {"monthly_tasks": 500},
        "high_review": {"added_review_minutes": 4},
        "lower_build_effort": {"development_days": 3},
        "higher_maintenance": {"maintenance_hours": 40},
        "zero_adoption": {"adoption": 0},
    }.items()}


def scripted_interactions():
    # Every plan includes the final inspection of the output. No wall-clock times
    # are inferred from these action counts; shorter plans may produce worse work.
    plans = {
        "known_repeated_task": {
            "chat": ["type", "model", "inspect"],
            "contextual_shortcut": ["click", "model", "inspect"],
            "forced_form": ["type"] + ["click"] * 6 + ["model", "inspect"],
        },
        "known_fields_three_missing_values": {
            "serial_chat": ["type", "model", "type", "model", "type", "model", "type", "model", "inspect"],
            "optional_structured_clarification": ["type", "model", "click", "click", "click", "model", "inspect"],
            "single_batched_chat_answer": ["type", "model", "type", "model", "inspect"],
        },
        "six_ambiguities_without_task_schema": {
            "batched_chat": ["type", "model", "type", "model", "inspect"],
            "guessed_form_then_correction": ["type", "model"] + ["click"] * 6 + ["type", "model", "inspect"],
        },
    }
    return {task: {variant: {"plan": plan, "user_actions": sum(x != "model" for x in plan),
                             "model_steps": plan.count("model"), "output_inspections": plan.count("inspect")}
                   for variant, plan in variants.items()} for task, variants in plans.items()}


class Proposal:
    def __init__(self):
        self.current = 1
        self.base = 1
        self.title = "平台月报"
        self.preserved_note = False

    def human_edit(self):
        self.current += 1
        self.title = "平台月报（人工补充口径）"

    def recalculate(self):
        self.base = self.current
        self.preserved_note = "人工补充口径" in self.title

    def accept(self):
        if self.base != self.current:
            return "version_conflict"
        self.title = "部门使用情况" + ("（保留人工补充口径）" if self.preserved_note else "")
        self.current += 1
        return "applied"


class Submission:
    def __init__(self):
        self.phase = "not_sent"
        self.execution = "running"
        self.future_actions_allowed = True

    def send(self):
        if not self.future_actions_allowed:
            return "blocked"
        self.phase = "in_flight"
        return "sent"

    def receipt(self):
        self.phase = "committed"

    def request_stop(self):
        self.execution = "stop_requested"
        self.future_actions_allowed = False

    def stop_ack(self):
        self.execution = "stopped"
        # Acknowledging local execution stop does not mutate external effect.

    def reconcile(self, external_committed):
        if self.phase == "in_flight":
            self.phase = "committed" if external_committed else "not_committed"


def scenario_checks():
    results = []
    def check(name, observed, expected):
        passed = observed == expected
        results.append({"name": name, "observed": observed, "expected": expected, "passed": passed})
        if not passed:
            raise AssertionError(name)
    p = Proposal()
    p.human_edit()
    check("old_proposal_blocked", p.accept(), "version_conflict")
    check("human_version_not_overwritten", p.current, 2)
    p.recalculate()
    p.human_edit()
    check("concurrent_edit_after_recalculation_blocked", p.accept(), "version_conflict")
    p.recalculate()
    check("fresh_proposal_applied", p.accept(), "applied")
    check("human_note_preserved_in_scripted_merge", p.title, "部门使用情况（保留人工补充口径）")
    for timing in ("before", "in_flight", "after"):
        s = Submission()
        if timing != "before": s.send()
        if timing == "after": s.receipt()
        s.request_stop()
        check(f"{timing}_request_is_not_ack", s.execution, "stop_requested")
        check(f"{timing}_future_actions_blocked", s.send(), "blocked")
        s.stop_ack()
        check(f"{timing}_local_execution_stopped", s.execution, "stopped")
        check(f"{timing}_effect_remains_independent", s.phase,
              {"before": "not_sent", "in_flight": "in_flight", "after": "committed"}[timing])
        if timing == "in_flight":
            s.reconcile(True)
            check("reconciliation_can_find_committed_effect_after_stop", s.phase, "committed")
    s = Submission()
    s.send(); s.request_stop(); s.stop_ack(); s.reconcile(False)
    check("reconciliation_can_find_uncommitted_effect", s.phase, "not_committed")
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="simulation-results.json")
    args = parser.parse_args()
    result = {
        "kind": "deterministic_illustration_not_empirical_ROI_or_agent_benchmark",
        "limitations": ["人工构造交互路径；未测真实用户耗时", "没有调用真实 LLM、业务服务或沙盒进程",
                        "版本重算是固定示例，不证明模型能正确合并任意文档", "工时等权回收；未计工资差异、token、服务器成本与收益重叠"],
        "effort_cases": effort_cases(), "scripted_interaction_paths": scripted_interactions(),
        "state_checks": scenario_checks(),
    }
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(json.dumps({"output": args.output, "state_checks": len(result["state_checks"]),
                      "all_passed": all(x["passed"] for x in result["state_checks"]),
                      "base_effort": result["effort_cases"]["base_illustration"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
