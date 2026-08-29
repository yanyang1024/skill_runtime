---
description: 校验课程并构建静态站点
agent: course-director
---

校验并构建课程站点：$ARGUMENTS

对该课程目录实跑 `python3 tools/course_validate.py --course <目录>`。ERROR == 0 后跑
`python3 tools/build_player.py <目录> --mode site` 构建静态站点；ERROR 非零则停止构建，
向我列出错误清单。

最后向我汇报：校验结果（ERROR/WARNING 计数）、站点输出路径、WARNING 汇总。
不要把场景内容贴进对话。
