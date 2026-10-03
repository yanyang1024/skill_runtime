"""Run from the project root: python run.py"""
import os
import uvicorn
from app.config import Settings
from app.main import create_app

if __name__ == "__main__":
    settings = Settings.from_env()
    host, port = os.getenv("APP_HOST", "127.0.0.1"), int(os.getenv("APP_PORT", "8000"))
    print(f"用量观察 | {'Responses API' if settings.live else '演示规则'}")
    print(f"A · 表单增强: http://{host}:{port}/adapted")
    print(f"B · 目标工作台: http://{host}:{port}/native")
    uvicorn.run(create_app(settings), host=host, port=port, log_level="warning")
