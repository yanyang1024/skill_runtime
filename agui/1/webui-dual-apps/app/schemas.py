from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Department = Literal["研发", "工艺", "设备"]
Metric = Literal["sessions", "active_users", "tool_failure_rate"]
START = date(2026, 9, 1)
END = date(2026, 9, 14)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Selection(StrictModel):
    metric: Metric
    departments: list[Department] = Field(min_length=1, max_length=3)
    date_from: date
    date_to: date

    @model_validator(mode="after")
    def check_range(self):
        if self.date_from > self.date_to:
            raise ValueError("开始日期不能晚于结束日期")
        if self.date_from < START or self.date_to > END:
            raise ValueError("样例数据仅覆盖 2026-09-01 至 2026-09-14")
        if len(set(self.departments)) != len(self.departments):
            raise ValueError("部门不能重复")
        return self


class FormValues(Selection):
    title: str = Field(default="部门使用分析", min_length=1, max_length=100)


class SuggestRequest(StrictModel):
    instruction: str = Field(min_length=1, max_length=2000)
    current: FormValues


class FormPatch(StrictModel):
    title: str | None = Field(max_length=100)
    metric: Metric | None
    departments: list[Department] | None
    date_from: date | None
    date_to: date | None
    explanation: str = Field(min_length=1, max_length=1500)


class Explanation(StrictModel):
    summary: str = Field(min_length=1, max_length=1500)
    recommendations: list[str] = Field(min_length=1, max_length=5)
    notes: str = Field(max_length=1000)


class GoalRequest(StrictModel):
    goal: str = Field(min_length=1, max_length=3000)


class FollowupRequest(StrictModel):
    message: str = Field(default="继续任务", min_length=1, max_length=3000)
    selection: Selection | None = None


class SaveArtifactRequest(StrictModel):
    text: str = Field(min_length=1, max_length=30000)
    expected_version: int = Field(ge=0)


class AcceptDraftRequest(StrictModel):
    draft_id: str = Field(min_length=1, max_length=100)


class AnalyzeArgs(Selection):
    pass


class ClarifyArgs(StrictModel):
    question: str = Field(min_length=1, max_length=1000)
    fields: list[Literal["metric", "departments", "date_from", "date_to"]] = Field(min_length=1, max_length=4)


class ProposeArgs(StrictModel):
    stats_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=100)
    summary: str = Field(min_length=1, max_length=2000)
    recommendations: list[str] = Field(min_length=1, max_length=5)


def strict_schema(schema: dict) -> dict:
    """Responses strict schemas require every object property to be required."""
    if schema.get("type") == "object":
        schema["additionalProperties"] = False
        schema["required"] = list(schema.get("properties", {}))
    for value in schema.values():
        if isinstance(value, dict):
            strict_schema(value)
        elif isinstance(value, list):
            for child in value:
                if isinstance(child, dict):
                    strict_schema(child)
    return schema
