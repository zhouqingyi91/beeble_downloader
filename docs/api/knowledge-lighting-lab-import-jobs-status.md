# 1. 接口概述
- **接口路径**: `/api/knowledge/lighting-lab/import-jobs/136`
- **请求地址**: `http://pre-pp.lightmeta.com:3001/api/knowledge/lighting-lab/import-jobs/136`
- **HTTP方法**: `GET`
- **功能描述**: 查询打光实验室导入任务 `136` 的当前进度与状态。该任务通常由 `/api/knowledge/lighting-lab/import-jobs` 或 `/api/knowledge/lighting-lab/import-upload-jobs` 创建，用于前端轮询展示导入进度。

## 1.1. 请求参数说明

路径参数：

| 参数名 | 类型 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- | --- |
| `job_id` | `integer` | 是 | `136` | 导入任务 ID。当前接口路径中固定为 `136`。 |

Query 参数：无。

Body 参数：无。

## 1.2. 请求参数示例

```bash
curl -X GET 'http://pre-pp.lightmeta.com:3001/api/knowledge/lighting-lab/import-jobs/136'
```

前端调用示例：

```js
const res = await api.get('/knowledge/lighting-lab/import-jobs/136')
const job = res?.data
```

## 1.3. 返回参数说明

成功响应 HTTP 状态码：`200`

| 参数名 | 类型 | 说明 |
| --- | --- | --- |
| `code` | `integer` | 业务状态码，成功为 `200`。 |
| `message` | `string` | 响应消息，成功为 `success`。 |
| `data.id` | `integer` | 导入任务 ID。 |
| `data.source_root_dir` | `string` | 实际用于导入扫描的服务端目录。 |
| `data.import_version` | `string` | 导入版本。可选值通常为 `SwitchLight 3.0`、`SwitchLight 1.0`；异常值会规范化为 `SwitchLight 3.0`。 |
| `data.batch_name` | `string` | 规范化后的导入批次名。 |
| `data.import_structure` | `string` | 导入目录结构：`auto`、`flat`、`code_nested`。 |
| `data.status` | `string` | 任务状态：`pending` 待执行、`running` 执行中、`completed` 已完成、`failed` 失败。 |
| `data.processed_count` | `integer` | 已处理素材数量。 |
| `data.total_count` | `integer` | 预计处理素材总数。 |
| `data.current_file` | `string/null` | 当前正在处理的文件或素材标识。 |
| `data.last_error` | `string/null` | 最近一次错误信息；任务失败时用于展示失败原因。 |
| `data.started_at` | `string/null` | 任务开始时间，ISO 8601 字符串；未开始时为 `null`。 |
| `data.finished_at` | `string/null` | 任务结束时间，ISO 8601 字符串；未结束时为 `null`。 |
| `data.created_at` | `string/null` | 任务创建时间，ISO 8601 字符串。 |

## 1.4. 返回参数示例

执行中：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 136,
    "source_root_dir": "/Users/zqy/lightmeta/photo_platform_uploads/lighting_lab_import_uploads/9d3f1a6c2b7d4d40a1e56e0d4f2a9b70/relight_assets",
    "import_version": "SwitchLight 3.0",
    "batch_name": "2026Q2_A",
    "import_structure": "auto",
    "status": "running",
    "processed_count": 42,
    "total_count": 126,
    "current_file": "Source_000042.png",
    "last_error": null,
    "started_at": "2026-04-28T11:52:03.123456",
    "finished_at": null,
    "created_at": "2026-04-28T11:52:01.987654"
  }
}
```

已完成：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 136,
    "source_root_dir": "/Users/zqy/lightmeta/photo_platform_uploads/lighting_lab_import_uploads/9d3f1a6c2b7d4d40a1e56e0d4f2a9b70/relight_assets",
    "import_version": "SwitchLight 3.0",
    "batch_name": "2026Q2_A",
    "import_structure": "auto",
    "status": "completed",
    "processed_count": 126,
    "total_count": 126,
    "current_file": null,
    "last_error": null,
    "started_at": "2026-04-28T11:52:03.123456",
    "finished_at": "2026-04-28T11:55:18.456789",
    "created_at": "2026-04-28T11:52:01.987654"
  }
}
```

## 1.5. 错误响应

| HTTP状态码 | 响应示例 | 触发场景 |
| --- | --- | --- |
| `500` | `{"code":500,"message":"<错误信息>"}` | 查询任务失败，例如数据库异常。 |
| `500` | `{"code":500,"message":"404 Not Found: The requested URL was not found on the server. If you entered the URL manually please check your spelling and try again."}` | 当前实现中任务不存在时，`get_or_404` 抛出的 404 会被通用异常捕获并包装为 `500`。 |

错误响应示例：

```json
{
  "code": 500,
  "message": "404 Not Found: The requested URL was not found on the server. If you entered the URL manually please check your spelling and try again."
}
```
