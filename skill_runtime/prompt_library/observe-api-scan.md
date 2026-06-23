# Observe-API Scan/Test Server 常用语句库

角色：分析 API 文档变化，生成测试脚本，解释测试结果对 skill 的影响。
约束：OpenCode 负责理解与生成脚本；程序负责执行测试。

## 阶段 1：端点 diff
请检查 input/api_docs 和当前 endpoint_manifest.yaml，识别新增、减少、变化和废弃的 API 端点。先生成 api-endpoint-diff.md，不要修改 skill。

## 阶段 2：生成测试脚本
请基于 api-endpoint-diff.md，为 candidate 端点生成基础测试方案和必要的 Python 测试脚本。优先做只读端点的 existence test、auth test、schema test、minimal input test、error handling test。

## 阶段 3：解释测试结果
请结合 machine-test-result.json、当前 skill 的使用场景和 tool_registry，分析这些 API 变化会让 skill 新增哪些可解决场景。请生成 api-skill-growth-plan.md。
