"""A small HTTP adapter for the Responses API, with no client-side secrets."""
import json
import httpx
from pydantic import ValidationError

from .schemas import strict_schema


class ProviderError(Exception):
    def __init__(self, code: str, message: str):
        self.code, self.message = code, message
        super().__init__(message)


class ResponsesClient:
    def __init__(self, settings, transport=None):
        self.settings = settings
        self.client = httpx.AsyncClient(timeout=settings.timeout, transport=transport)

    async def close(self):
        await self.client.aclose()

    async def request(self, *, instructions, inputs, tools=None, output_model=None):
        payload = {"model": self.settings.model, "instructions": instructions,
                   "input": inputs, "store": False, "max_output_tokens": 3000}
        if tools is not None:
            payload.update(tools=tools, parallel_tool_calls=False)
        if output_model is not None:
            payload["text"] = {"format": {"type": "json_schema", "name": output_model.__name__,
                                          "schema": strict_schema(output_model.model_json_schema()), "strict": True}}
        try:
            response = await self.client.post(
                self.settings.base_url.rstrip("/") + "/responses", json=payload,
                headers={"Authorization": f"Bearer {self.settings.api_key}", "Content-Type": "application/json"},
            )
        except httpx.TimeoutException as exc:
            raise ProviderError("llm_timeout", "模型请求超时。可以重试或缩小任务范围。") from exc
        except httpx.HTTPError as exc:
            raise ProviderError("llm_connection", "无法连接模型服务，请检查服务端 API 地址和网络。") from exc
        if response.status_code >= 400:
            code = response.status_code
            message = {401: "模型认证失败，请检查服务端 API Key。", 403: "模型服务拒绝访问，请检查权限。",
                       404: "模型或 Responses 路径不存在，请检查 API 地址和模型名称。",
                       429: "模型服务额度不足或请求过多，请稍后重试。", 400: "模型拒绝了请求格式，请确认该端点支持 Responses、严格结构化输出及函数工具。"}.get(code, "模型服务返回错误，请稍后重试。")
            # Do not expose provider response bodies, credentials, or infrastructure detail.
            raise ProviderError(f"llm_http_{code}", message)
        try:
            data = response.json()
        except ValueError as exc:
            raise ProviderError("llm_invalid_response", "模型服务未返回有效 JSON。") from exc
        if not isinstance(data, dict) or not isinstance(data.get("output"), list):
            raise ProviderError("llm_invalid_response", "模型响应缺少 Responses output 数组。")
        if data.get("status") in {"incomplete", "failed", "cancelled"}:
            raise ProviderError("llm_incomplete", "模型没有完整完成本轮响应，请重试。")
        for item in data["output"]:
            for content in item.get("content", []) if isinstance(item, dict) else []:
                if content.get("type") == "refusal":
                    raise ProviderError("llm_refusal", "模型未能处理此请求，请调整任务描述。")
        return data

    async def structured(self, *, instructions, inputs, output_model):
        data = await self.request(instructions=instructions, inputs=inputs, output_model=output_model)
        text = output_text(data)
        try:
            return output_model.model_validate_json(text)
        except (ValueError, ValidationError) as exc:
            raise ProviderError("llm_invalid_structure", "模型返回的结构不符合应用约定，请重新生成。") from exc


def output_text(data):
    return "\n".join(content.get("text", "") for item in data.get("output", [])
                     if item.get("type") == "message" for content in item.get("content", [])
                     if content.get("type") == "output_text")


def json_text(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
