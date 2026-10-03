from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse
import os

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    api_key: str = ""
    base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4.1-mini"
    mode: str = "auto"
    database_path: str = str(ROOT / "data" / "app.sqlite3")
    timeout: float = 60.0
    max_rounds: int = 8

    @property
    def live(self) -> bool:
        return self.mode != "demo" and bool(self.api_key)

    @classmethod
    def from_env(cls):
        settings = cls(
            api_key=(os.getenv("LLM_API_KEY", "") or os.getenv("OPENAI_API_KEY", "")).strip(),
            base_url=os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
            model=os.getenv("LLM_MODEL", "gpt-4.1-mini"),
            mode=os.getenv("APP_MODE", "auto").lower(),
            database_path=os.getenv("APP_DB_PATH", str(ROOT / "data" / "app.sqlite3")),
            timeout=float(os.getenv("LLM_TIMEOUT_SECONDS", "60")),
            max_rounds=int(os.getenv("AGENT_MAX_ROUNDS", "8")),
        )
        if settings.mode not in {"auto", "demo", "live"}:
            raise ValueError("APP_MODE must be auto, demo or live")
        if settings.mode == "live" and not settings.api_key:
            raise ValueError("APP_MODE=live requires LLM_API_KEY")
        parsed = urlparse(settings.base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("LLM_BASE_URL must be an HTTP(S) API root without credentials")
        if parsed.scheme == "http" and parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
            raise ValueError("Use HTTPS for remote LLM endpoints")
        if not 1 <= settings.max_rounds <= 20 or not 1 <= settings.timeout <= 300:
            raise ValueError("Invalid agent budget or API timeout")
        return settings
