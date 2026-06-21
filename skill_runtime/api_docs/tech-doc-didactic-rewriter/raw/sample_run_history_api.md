# Run History API

## GET /api/v2/run-history

查询某个 lot 的历史 run 数据。

### Auth
Bearer token required.

### Required Parameters
- `lot_id` (string)

### Optional Parameters
- `tool_id` (string)
- `start_time` (ISO-8601)
- `end_time` (ISO-8601)

### Response Example
```json
{
  "lot_id": "LOT-2026-001",
  "runs": [
    {
      "tool_id": "TOOL-A",
      "run_start_time": "2026-06-01T00:00:00Z",
      "recipe_id": "RCP-1"
    }
  ]
}
```
