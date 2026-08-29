#!/usr/bin/env python3
"""extract_material.py — 材料提取（零/低依赖，优雅降级）

支持:
  .md / .txt   直接规范化（去多余空行）
  .html/.htm   标准库 html.parser 转 Markdown（标题/列表/代码块/表格）
  .docx        标准库 zipfile + 正则抽正文（word/document.xml）
  .pptx        标准库 zipfile 抽每页幻灯片文本（ppt/slides/slideN.xml）
  .pdf         优先调系统 pdftotext；没有则提示用户转换（PDF 无标准库可解）
  音视频       不支持（需要 ffmpeg+ASR，超出低依赖范围），打印指引

用法:
  python3 tools/extract_material.py <输入文件> [--out <课程目录>/materials/]
输出: <out>/<文件名>.md，并把摘要打印到 stdout。
"""
import argparse
import html
import re
import shutil
import subprocess
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path


def clean(text):
    text = html.unescape(text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


def from_plain(path):
    return clean(path.read_text(encoding="utf-8", errors="replace"))


class HTMLTextExtractor(HTMLParser):
    """极简 HTML → Markdown 提取器（标准库 html.parser，无第三方依赖）。

    规则：
      - 丢弃 script/style/noscript/head/template 内的全部内容与 HTML 注释；
      - h1-h6 → 对应层级的 # 前缀；p/div 等块级标签分段；
      - ul/ol/li → "- "/"1. " 列表（支持嵌套缩进）；
      - pre → 围栏代码块（内部文本原样保留）；行内 code → 反引号；
      - table → 简化为 " | " 分隔的文本行（tr 一行、td/th 一格）；
      - 连续空行最后由 clean() 压缩。
    """

    SKIP_TAGS = {"script", "style", "noscript", "head", "template"}
    HEAD_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
    BLOCK_TAGS = {"p", "div", "section", "article", "header", "footer",
                  "blockquote", "figure", "figcaption", "hr", "br"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []    # 已完成的块
        self.buf = []      # 当前块的文本缓冲
        self.skip = 0      # 丢弃标签的嵌套深度
        self.pre = 0       # <pre> 嵌套深度
        self.prefix = ""   # 当前块前缀（标题 #、列表标记）
        self.lists = []    # 列表栈：[["ul"|"ol", 序号], ...]

    def _flush(self):
        """结束当前块：压入 parts 并清空缓冲与前缀。"""
        text = "".join(self.buf)
        if self.pre:
            text = text.strip("\n")
        else:
            text = re.sub(r"\s+", " ", text).strip()
        if text:
            self.parts.append(self.prefix + text)
        self.buf = []
        self.prefix = ""

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP_TAGS:
            self.skip += 1
            return
        if self.skip or self.pre:
            return  # 丢弃区 / pre 内的标签一律忽略，文本由 handle_data 保留
        if tag in self.HEAD_TAGS:
            self._flush()
            self.prefix = "#" * int(tag[1]) + " "
        elif tag in ("ul", "ol"):
            self._flush()
            self.lists.append([tag, 0])
        elif tag == "li":
            self._flush()
            indent = "  " * max(0, len(self.lists) - 1)
            if self.lists and self.lists[-1][0] == "ol":
                self.lists[-1][1] += 1
                self.prefix = f"{indent}{self.lists[-1][1]}. "
            else:
                self.prefix = f"{indent}- "
        elif tag == "pre":
            self._flush()
            self.pre = 1
            self.parts.append("```")
        elif tag == "code":
            self.buf.append("`")
        elif tag == "tr":
            self._flush()
        elif tag in ("td", "th"):
            if "".join(self.buf).strip():
                self.buf.append(" | ")
        elif tag in self.BLOCK_TAGS:
            self._flush()

    def handle_endtag(self, tag):
        if tag in self.SKIP_TAGS:
            if self.skip:
                self.skip -= 1
            return
        if self.skip:
            return
        if tag == "pre":
            self._flush()
            self.pre = 0
            self.parts.append("```")
        elif tag in ("ul", "ol"):
            self._flush()
            if self.lists:
                self.lists.pop()
        elif tag == "code":
            if not self.pre:
                self.buf.append("`")
        elif tag in self.HEAD_TAGS or tag in ("p", "div", "li", "tr", "table",
                                              "blockquote", "section", "article",
                                              "figure", "figcaption"):
            self._flush()

    def handle_data(self, data):
        if self.skip:
            return
        self.buf.append(data)

    # handle_comment 默认忽略，注释自然被丢弃

    def get_markdown(self):
        self._flush()
        return "\n\n".join(self.parts)


def from_html(path):
    parser = HTMLTextExtractor()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    parser.close()
    return clean(parser.get_markdown())


def _xml_text(xml):
    """从 OOXML 片段里抽文本：取 <a:t>/<w:t> 内容。"""
    parts = re.findall(r"<(?:a|w):t[^>]*>(.*?)</(?:a|w):t>", xml, re.DOTALL)
    return [html.unescape(p) for p in parts]


def from_docx(path):
    try:
        with zipfile.ZipFile(path) as z:
            xml = z.read("word/document.xml").decode("utf-8", errors="replace")
    except (zipfile.BadZipFile, KeyError) as e:
        sys.exit(f"docx 解析失败: {e}")
    # 按段落 <w:p> 切，段内拼接 <w:t>
    paras = []
    for p in re.findall(r"<w:p[ >].*?</w:p>", xml, re.DOTALL):
        texts = re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, re.DOTALL)
        line = "".join(html.unescape(t) for t in texts).strip()
        if line:
            paras.append(line)
    return clean("\n\n".join(paras))


def from_pptx(path):
    try:
        with zipfile.ZipFile(path) as z:
            slide_names = sorted(
                (n for n in z.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)),
                key=lambda n: int(re.search(r"(\d+)", n).group(1)))
            if not slide_names:
                sys.exit("pptx 中没有幻灯片")
            out = []
            for i, name in enumerate(slide_names, 1):
                xml = z.read(name).decode("utf-8", errors="replace")
                texts = _xml_text(xml)
                if texts:
                    out.append(f"## 第 {i} 页\n\n" + "\n".join(texts))
            # 备注
            note_names = [n for n in z.namelist()
                          if re.fullmatch(r"ppt/notesSlides/notesSlide\d+\.xml", n)]
            for name in sorted(note_names):
                xml = z.read(name).decode("utf-8", errors="replace")
                texts = _xml_text(xml)
                if texts:
                    idx = re.search(r"(\d+)", name).group(1)
                    out.append(f"## 第 {idx} 页备注\n\n" + "\n".join(texts))
            return clean("\n\n".join(out))
    except zipfile.BadZipFile as e:
        sys.exit(f"pptx 解析失败: {e}")


def from_pdf(path):
    pdftotext = shutil.which("pdftotext")
    if pdftotext:
        r = subprocess.run([pdftotext, "-layout", str(path), "-"],
                           capture_output=True, text=True)
        if r.returncode == 0 and r.stdout.strip():
            return clean(r.stdout)
    try:
        from pypdf import PdfReader  # 可选依赖，有才用
        reader = PdfReader(str(path))
        return clean("\n\n".join((p.extract_text() or "") for p in reader.pages))
    except ImportError:
        pass
    sys.exit(
        "PDF 提取不可用：系统没有 pdftotext，也没装 pypdf。\n"
        "低依赖方案任选其一：\n"
        "  1) 安装 poppler（提供 pdftotext）\n"
        "  2) pip install pypdf\n"
        "  3) 手动把 PDF 另存/复制为 .txt 或 .md 再喂进来")


def main():
    ap = argparse.ArgumentParser(description="材料提取（低依赖）")
    ap.add_argument("input")
    ap.add_argument("--out", default="materials", help="输出目录，默认 ./materials")
    args = ap.parse_args()
    src = Path(args.input)
    if not src.exists():
        sys.exit(f"文件不存在: {src}")
    ext = src.suffix.lower()
    if ext in (".md", ".txt", ".markdown"):
        text = from_plain(src)
    elif ext in (".html", ".htm"):
        text = from_html(src)
    elif ext == ".docx":
        text = from_docx(src)
    elif ext == ".pptx":
        text = from_pptx(src)
    elif ext == ".pdf":
        text = from_pdf(src)
    elif ext in (".mp3", ".wav", ".mp4", ".mov", ".m4a"):
        sys.exit(
            "音视频提取超出低依赖范围（需 ffmpeg + ASR）。\n"
            "请先用其他工具转写成文本，再作为 .md 喂入。")
    else:
        sys.exit(f"暂不支持的格式: {ext}（支持 md/txt/html/docx/pptx/pdf）")
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / (src.stem + ".md")
    out.write_text(text, encoding="utf-8")
    n = len(text)
    print(f"已提取: {out}（{n} 字符）")
    print("--- 开头 300 字预览 ---")
    print(text[:300])


if __name__ == "__main__":
    main()
