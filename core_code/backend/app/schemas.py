"""请求体 pydantic 模型。"""
from pydantic import BaseModel


class ConversationCreate(BaseModel):
    title: str | None = None


class ConversationPatch(BaseModel):
    title: str | None = None
    selected_stage: str | None = None
    stage_mode: str | None = None


class MessageCreate(BaseModel):
    message: str
    agent: str | None = None


class QuestionReply(BaseModel):
    answers: list[list[str]]


class PermissionReply(BaseModel):
    reply: str  # once | always | reject


class StageSelect(BaseModel):
    stage: str
    mode: str = "manual"
