#!/usr/bin/env python3
"""vl_query.py — Qwen3.6（vLLM，OpenAI 兼容接口）视觉理解统一入口（零第三方依赖）

用法：
  python vl_query.py <图片...> --prompt "<问题>"
                     [--base-url http://localhost:8000/v1] [--model qwen3.6-27b]
                     [--max-tokens 4096] [--timeout 120] [--json]
"""
import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

IMG_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp"}


def to_data_url(p):
    return "data:%s;base64,%s" % (MIME[p.suffix.lower()],
                                  base64.b64encode(p.read_bytes()).decode())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="+")
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--base-url", default=os.environ.get("VL_BASE_URL", "http://localhost:8000/v1"))
    ap.add_argument("--model", default=os.environ.get("VL_MODEL", "qwen3.6-27b"))
    ap.add_argument("--api-key", default=os.environ.get("VL_API_KEY", "EMPTY"))
    ap.add_argument("--max-tokens", type=int, default=4096)
    ap.add_argument("--timeout", type=int, default=120)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    t0 = time.time()

    parts = [{"type": "text", "text": args.prompt}]
    for raw in args.inputs:
        p = Path(raw).expanduser().resolve()
        if not p.exists():
            print(json.dumps({"status": "failed", "error": f"文件不存在: {p}"},
                             ensure_ascii=False))
            sys.exit(1)
        if p.suffix.lower() not in IMG_EXTS:
            print(json.dumps({"status": "failed", "error": f"非图片格式: {p.suffix}"},
                             ensure_ascii=False))
            sys.exit(1)
        parts.append({"type": "image_url", "image_url": {"url": to_data_url(p)}})

    body = {"model": args.model, "max_tokens": args.max_tokens,
            "messages": [{"role": "user", "content": parts}]}
    req = urllib.request.Request(
        args.base_url.rstrip("/") + "/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {args.api_key}"})
    try:
        with urllib.request.urlopen(req, timeout=args.timeout) as r:
            resp = json.loads(r.read())
    except urllib.error.URLError as e:
        msg = (f"无法连接 {args.base_url}（vLLM 未启动？）。启动: "
               "vllm serve <model> --reasoning-parser qwen3 "
               f"--enable-auto-tool-choice --tool-call-parser qwen3_coder  原始错误: {e}")
        print(json.dumps({"status": "failed", "error": msg}, ensure_ascii=False))
        sys.exit(1)

    text = resp["choices"][0]["message"]["content"]
    if args.json:
        print(json.dumps({"status": "success", "model": resp.get("model", args.model),
                          "elapsed": round(time.time() - t0, 2),
                          "usage": resp.get("usage"), "text": text}, ensure_ascii=False))
    else:
        print(text)


if __name__ == "__main__":
    main()
