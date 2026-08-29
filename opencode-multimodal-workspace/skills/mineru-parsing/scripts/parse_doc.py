#!/usr/bin/env python3
"""parse_doc.py — MinerU 文档解析统一入口（零第三方依赖，纯标准库）

职责：缓存 → 调用 mineru CLI → 归一化输出 → 自检 → 输出契约 JSON
契约：stdout 输出 JSON；exit 0 = 成功，exit 1 = 失败（禁止假成功）

用法：
  python parse_doc.py <输入文件> --out <输出目录> [--backend auto|pipeline|vlm]
                      [--cache-dir <目录>] [--no-cache] [--timeout 600]
"""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

DOC_EXTS = {".pdf", ".docx", ".pptx", ".xlsx", ".doc", ".ppt"}
IMG_EXTS = {".png", ".jpg", ".jpeg"}


def fail(stage, msg, t0):
    print(json.dumps({"status": "failed", "stage": stage,
                      "error": msg, "elapsed": round(time.time() - t0, 2)},
                     ensure_ascii=False))
    sys.exit(1)


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(1 << 20)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def pdf_pages(path):
    """尽量统计 PDF 页数：优先 pypdf，退化到字节模式扫描。"""
    try:
        from pypdf import PdfReader
        return len(PdfReader(str(path)).pages)
    except Exception:
        pass
    try:
        data = open(path, "rb").read()
        n = len(re.findall(rb"/Type\s*/Page[^s]", data))
        return n or None
    except Exception:
        return None


def normalize_output(raw_dir, out_dir):
    """把 mineru 输出归一化为 out_dir/{content.md, images/}。返回 (content_path, images)。"""
    mds = sorted(raw_dir.rglob("*.md"), key=lambda p: p.stat().st_size, reverse=True)
    if not mds:
        return None, []
    dest = out_dir / "content.md"
    shutil.copy2(mds[0], dest)
    images = []
    img_src = None
    for p in raw_dir.rglob("*"):
        if p.suffix.lower() in IMG_EXTS and p.parent.name in ("images", "imgs"):
            img_src = p.parent
            break
    if img_src:
        img_dest = out_dir / "images"
        if img_dest.exists():
            shutil.rmtree(img_dest)
        shutil.copytree(img_src, img_dest)
        images = sorted(x.name for x in img_dest.iterdir())
    return dest, images


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--out", required=True)
    ap.add_argument("--backend", choices=["auto", "pipeline", "vlm"], default="auto")
    ap.add_argument("--cache-dir", default=None)
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--timeout", type=int, default=600)
    args = ap.parse_args()
    t0 = time.time()

    src = Path(args.input).expanduser().resolve()
    if not src.exists():
        fail("input", f"文件不存在: {src}", t0)
    if src.suffix.lower() not in DOC_EXTS:
        fail("input", f"不支持的格式 {src.suffix}（支持 {sorted(DOC_EXTS)}）", t0)

    out_dir = Path(args.out).expanduser().resolve()
    cache_dir = Path(args.cache_dir).expanduser().resolve() if args.cache_dir \
        else out_dir.parent / ".cache"
    key = sha256_of(src)[:16] + "-" + args.backend
    cached = cache_dir / key

    # 缓存命中：直接复用
    if not args.no_cache and (cached / "manifest.json").exists():
        manifest = json.loads((cached / "manifest.json").read_text(encoding="utf-8"))
        if cached != out_dir:
            if out_dir.exists():
                shutil.rmtree(out_dir)
            shutil.copytree(cached, out_dir)
        manifest["cache_hit"] = True
        print(json.dumps(manifest, ensure_ascii=False))
        return

    mineru = shutil.which("mineru")
    if not mineru:
        fail("env", "未找到 mineru CLI。安装: pip install -U 'mineru[core]'", t0)

    raw_dir = out_dir / "_raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    cmd = [mineru, "-p", str(src), "-o", str(raw_dir)]
    if args.backend == "pipeline":
        cmd += ["-b", "pipeline"]
    elif args.backend == "vlm":
        # vlm 后端名称随 mineru 版本变化，可用环境变量覆盖
        import os
        cmd += ["-b", os.environ.get("MINERU_VLM_BACKEND", "vlm-transformers")]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=args.timeout)
    except subprocess.TimeoutExpired:
        fail("parse", f"mineru 超时（{args.timeout}s）", t0)
    if proc.returncode != 0:
        fail("parse", f"mineru exit {proc.returncode}: {(proc.stderr or '')[-500:]}", t0)

    content, images = normalize_output(raw_dir, out_dir)
    if not content:
        fail("verify", "mineru 成功退出但未产出 Markdown——按失败处理（禁止假成功）", t0)
    text = content.read_text(encoding="utf-8", errors="replace")
    if len(text.encode("utf-8")) < 100:
        fail("verify", "content.md 仅 %d 字节，疑似空解析" % len(text.encode("utf-8")), t0)

    manifest = {
        "status": "success",
        "source": str(src),
        "backend": args.backend,
        "output_dir": str(out_dir),
        "content_md": str(content),
        "pages": pdf_pages(src) if src.suffix.lower() == ".pdf" else None,
        "blocks": {
            "table": text.count("<table"),
            "formula": text.count("$$"),
            "image": len(images),
        },
        "images": images[:20],
        "elapsed": round(time.time() - t0, 2),
        "cache_hit": False,
        "warnings": [],
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    if not args.no_cache:
        if cached.exists():
            shutil.rmtree(cached)
        shutil.copytree(out_dir, cached)
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()
