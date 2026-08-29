# -*- coding: utf-8 -*-
"""tests/test_tools.py — maic-workspace tools/ 的 unittest 安全网（stdlib-only，无网络）

从 workspace 根目录运行：
    python3 -m unittest discover tests -v

约定：tools/ 不在包路径里，统一用 subprocess 跑 CLI，最贴近真实使用方式。
夹具全部用 tempfile.TemporaryDirectory 现场构造；正例直接使用仓库内的
examples/demo-course（兼作 fixture）。
"""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # workspace 根目录
TOOLS = ROOT / "tools"
DEMO = ROOT / "examples" / "demo-course"


def run_cli(script, *args, cwd=ROOT, input_text=None):
    """跑 tools/ 下某个 CLI，返回 CompletedProcess（不抛异常）。"""
    return subprocess.run(
        [sys.executable, str(TOOLS / script), *args],
        capture_output=True, text=True, cwd=str(cwd), input=input_text)


def minimal_stage(course: Path, scene_files):
    """写一个最小合法 stage.json（场景清单由参数给出）。"""
    (course / "stage.json").write_text(json.dumps({
        "dslVersion": "maic-lite/0.2",
        "id": "stage_t",
        "name": "测试课程",
        "languageDirective": "全课中文",
        "scenes": scene_files,
    }, ensure_ascii=False), encoding="utf-8")


def minimal_interactive_html():
    return "<!DOCTYPE html><html><head><title>t</title></head><body><p>自包含</p></body></html>"


def minimal_scene(sid="s1", stype="interactive", order=1, content=None):
    """构造一个最小合法场景 dict（默认 interactive/tutorial）。"""
    if content is None:
        content = {"type": "interactive", "widgetType": "tutorial",
                   "description": "测试", "html": minimal_interactive_html()}
    return {"id": sid, "stageId": "stage_t", "type": stype, "title": "测试场景",
            "order": order, "content": content}


def validation_errors(proc):
    """从校验器输出的最后一行机器可读摘要里取 errors 数。"""
    summary = json.loads(proc.stdout.strip().splitlines()[-1])
    return summary["errors"]


class TestJsonRepair(unittest.TestCase):
    """json_repair.py：围栏剥离 / 截断补齐 / 尾随逗号 / 非法输入。"""

    def test_strip_code_fence(self):
        raw = '这是模型输出：\n```json\n{"a": 1, "b": [2, 3]}\n```\n以上。'
        p = run_cli("json_repair.py", input_text=raw)
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(json.loads(p.stdout), {"a": 1, "b": [2, 3]})

    def test_fix_truncated_json(self):
        # 截断的 JSON：最后一个元素不完整，应砍掉并补齐括号
        raw = '{"scenes": [{"id": "s1"}, {"id": "s2'
        p = run_cli("json_repair.py", input_text=raw)
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(json.loads(p.stdout), {"scenes": [{"id": "s1"}]})

    def test_fix_trailing_comma(self):
        p = run_cli("json_repair.py", input_text='{"a": 1, "b": 2,}')
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(json.loads(p.stdout), {"a": 1, "b": 2})

    def test_invalid_input_exit_1(self):
        p = run_cli("json_repair.py", input_text='完全没有 JSON 的散文')
        self.assertEqual(p.returncode, 1)
        self.assertIn("找不到 JSON 起点", p.stderr)

    def test_expect_array(self):
        p = run_cli("json_repair.py", "--array", input_text='{"a": 1}')
        self.assertEqual(p.returncode, 1)  # 顶层不是数组
        p = run_cli("json_repair.py", "--array", input_text='[1, 2, 3]')
        self.assertEqual(p.returncode, 0)


class TestExtractMaterial(unittest.TestCase):
    """extract_material.py：html → md 转换与 md 直通。"""

    SAMPLE_HTML = """<!DOCTYPE html>
<html><head><title>t</title><style>body{color:red}</style>
<script>var x = 1; /* 不应出现 */</script></head>
<body>
<!-- 注释也不应出现 -->
<h1>主标题</h1>
<h2>小节</h2>
<p>正文第一段。</p>
<ul><li>甲</li><li>乙</li></ul>
<pre>def f():\n    return 42</pre>
</body></html>"""

    def test_html_to_markdown(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            src = td / "doc.html"
            src.write_text(self.SAMPLE_HTML, encoding="utf-8")
            out_dir = td / "out"
            p = run_cli("extract_material.py", str(src), "--out", str(out_dir))
            self.assertEqual(p.returncode, 0, p.stderr)
            md = (out_dir / "doc.md").read_text(encoding="utf-8")
            # 标题层级保留
            self.assertIn("# 主标题", md)
            self.assertIn("## 小节", md)
            # 列表保留
            self.assertIn("- 甲", md)
            self.assertIn("- 乙", md)
            # pre → 围栏代码块，内部文本原样保留
            self.assertIn("```", md)
            self.assertIn("    return 42", md)
            # script / style / 注释被剥离
            self.assertNotIn("var x", md)
            self.assertNotIn("color:red", md)
            self.assertNotIn("注释也不应出现", md)

    def test_markdown_passthrough(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            src = td / "note.md"
            body = "# 标题\n\n正文内容。\n"
            src.write_text(body, encoding="utf-8")
            out_dir = td / "out"
            p = run_cli("extract_material.py", str(src), "--out", str(out_dir))
            self.assertEqual(p.returncode, 0, p.stderr)
            md = (out_dir / "note.md").read_text(encoding="utf-8")
            self.assertIn("# 标题", md)
            self.assertIn("正文内容。", md)


class TestCourseValidate(unittest.TestCase):
    """course_validate.py：正例走仓库 fixture，反例现场构造。"""

    def test_demo_course_zero_errors(self):
        """正例：examples/demo-course 全量校验 ERROR==0。"""
        self.assertTrue(DEMO.exists(), "demo-course fixture 缺失")
        p = run_cli("course_validate.py", "--course", str(DEMO))
        self.assertEqual(validation_errors(p), 0, p.stdout)
        self.assertEqual(p.returncode, 0)

    def _bad_course(self, scene):
        """构造只含一个坏场景的课程目录，返回 (course_dir_path, proc)。"""
        td = tempfile.TemporaryDirectory()
        self.addCleanup(td.cleanup)
        course = Path(td.name)
        (course / "scenes").mkdir()
        minimal_stage(course, ["scenes/s1.json"])
        (course / "scenes" / "s1.json").write_text(
            json.dumps(scene, ensure_ascii=False), encoding="utf-8")
        return run_cli("course_validate.py", "--course", str(course))

    def test_external_cdn_link_is_error(self):
        """interactive 场景引用 https://cdn.jsdelivr.net 脚本 → ERROR。"""
        html = ('<!DOCTYPE html><html><head>'
                '<script src="https://cdn.jsdelivr.net/npm/lib@1/index.js"></script>'
                '</head><body><p>x</p></body></html>')
        scene = minimal_scene(content={
            "type": "interactive", "widgetType": "tutorial",
            "description": "坏场景", "html": html})
        p = self._bad_course(scene)
        self.assertGreater(validation_errors(p), 0, p.stdout)
        self.assertEqual(p.returncode, 1)
        self.assertIn("cdn.jsdelivr.net", p.stdout)

    def test_slide_type_is_error(self):
        """slide 类型在 DSL v0.2 已删除 → ERROR。"""
        scene = minimal_scene(stype="slide", content={"type": "slide", "title": "x"})
        p = self._bad_course(scene)
        self.assertGreater(validation_errors(p), 0, p.stdout)
        self.assertIn("非法场景类型", p.stdout)

    def test_quiz_answer_not_in_options_is_error(self):
        """answer 指向不存在的 option value → ERROR。"""
        scene = minimal_scene(stype="quiz", content={
            "type": "quiz",
            "questions": [{
                "id": "q1", "type": "single", "question": "1+1=?",
                "options": [{"label": "1", "value": "A"},
                            {"label": "2", "value": "B"}],
                "answer": ["Z"],  # 不存在于 options
                "analysis": "解析", "points": 10,
            }],
        })
        p = self._bad_course(scene)
        self.assertGreater(validation_errors(p), 0, p.stdout)
        self.assertIn("不在 options", p.stdout)

    def test_bare_array_outline_is_error(self):
        """outline.json 为裸数组 → ERROR。"""
        with tempfile.TemporaryDirectory() as td:
            course = Path(td)
            (course / "scenes").mkdir()
            minimal_stage(course, ["scenes/s1.json"])
            (course / "scenes" / "s1.json").write_text(
                json.dumps(minimal_scene(), ensure_ascii=False), encoding="utf-8")
            (course / "outline.json").write_text(
                json.dumps([{"id": "s1"}], ensure_ascii=False), encoding="utf-8")
            p = run_cli("course_validate.py", "--course", str(course))
            self.assertGreater(validation_errors(p), 0, p.stdout)
            self.assertIn("裸数组", p.stdout)


class TestCourseScaffold(unittest.TestCase):
    """course_scaffold.py：new → jobs → assemble 全流程。"""

    def test_new_jobs_assemble_flow(self):
        with tempfile.TemporaryDirectory() as td:
            course = Path(td) / "my-course"

            # 1) new：生成骨架
            p = run_cli("course_scaffold.py", "new", str(course), "--name", "流程测试课")
            self.assertEqual(p.returncode, 0, p.stderr)
            self.assertTrue((course / "stage.json").exists())
            self.assertTrue((course / "scenes").is_dir())
            stage = json.loads((course / "stage.json").read_text(encoding="utf-8"))
            self.assertEqual(stage["scenes"], [])

            # 2) 写入合法 outline.json（material-analyst 的产出）
            outline = {
                "languageDirective": "全课中文，术语保留英文",
                "courseTitle": "流程测试课",
                "outlines": [{
                    "id": "s1", "type": "interactive", "title": "第一课",
                    "description": "目的", "keyPoints": ["要点"], "order": 1,
                    "widgetType": "tutorial", "widgetOutline": {"sections": ["导入"]},
                }],
            }
            (course / "outline.json").write_text(
                json.dumps(outline, ensure_ascii=False), encoding="utf-8")

            # 3) jobs：由 outline 生成 job card，skill_ref 必须是 skills/ 前缀
            p = run_cli("course_scaffold.py", "jobs", str(course))
            self.assertEqual(p.returncode, 0, p.stderr)
            card_path = course / "jobs" / "s1.json"
            self.assertTrue(card_path.exists())
            card = json.loads(card_path.read_text(encoding="utf-8"))
            self.assertTrue(card["skill_ref"].startswith("skills/"),
                            f"skill_ref 应为 skills/ 前缀: {card['skill_ref']}")
            self.assertEqual(card["task"], "build-scene")
            self.assertEqual(card["scene_id"], "s1")

            # 4) 造一个合法场景后 assemble：stage.json scenes 非空且校验通过
            scene = minimal_scene(sid="s1", order=1)
            scene["stageId"] = stage["id"]  # 与骨架 stage id 对齐
            (course / "scenes" / "s1.json").write_text(
                json.dumps(scene, ensure_ascii=False), encoding="utf-8")
            p = run_cli("course_scaffold.py", "assemble", str(course))
            self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
            stage = json.loads((course / "stage.json").read_text(encoding="utf-8"))
            self.assertEqual(stage["scenes"], ["scenes/s1.json"])


class TestBuildPlayer(unittest.TestCase):
    """build_player.py：site 模式产物完整且零外链；single 模式内联场景数据。"""

    @classmethod
    def setUpClass(cls):
        if not DEMO.exists():
            raise unittest.SkipTest("examples/demo-course fixture 缺失")

    def test_site_mode_outputs(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "site"
            p = run_cli("build_player.py", str(DEMO), "--mode", "site", "-o", str(out))
            self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
            # index.html + 4 个场景页
            self.assertTrue((out / "index.html").exists())
            for sid in ("s1", "s2", "s3", "s4"):
                self.assertTrue((out / "scenes" / f"{sid}.html").exists(),
                                f"缺场景页 {sid}.html")
            # 全部产物无 http(s) 外链
            for f in [out / "index.html"] + sorted((out / "scenes").glob("*.html")):
                text = f.read_text(encoding="utf-8")
                self.assertNotIn("http://", text, f"{f.name} 含 http:// 外链")
                self.assertNotIn("https://", text, f"{f.name} 含 https:// 外链")

    def test_single_mode_inlines_scene_data(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "player.html"
            p = run_cli("build_player.py", str(DEMO), "--mode", "single", "-o", str(out))
            self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
            text = out.read_text(encoding="utf-8")
            # 内联场景数据：course-data script 且能解析出 4 个场景
            self.assertIn('id="course-data"', text)
            import re
            m = re.search(r'<script id="course-data" type="application/json">(.*?)</script>',
                          text, re.S)
            self.assertIsNotNone(m)
            data = json.loads(m.group(1).replace("<\\/", "</"))  # 与 embed_json 的转义对应
            self.assertEqual(len(data["scenes"]), 4)
            self.assertEqual(data["scenes"][0]["id"], "s1")
            # 场景 JSON 里的 "</" 已被转义，不会提前闭合 script
            self.assertNotIn("</html>", m.group(1))
            # 单文件零外链
            self.assertNotIn("http://", text)
            self.assertNotIn("https://", text)


if __name__ == "__main__":
    unittest.main()
