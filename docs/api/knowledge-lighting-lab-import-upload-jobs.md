# 1. 接口概述
- **接口路径**: `/api/knowledge/lighting-lab/import-upload-jobs`
- **请求地址**: `http://pre-pp.lightmeta.com:3001/api/knowledge/lighting-lab/import-upload-jobs`
- **HTTP方法**: `POST`
- **功能描述**: 上传浏览器选择的本地目录文件，服务端保存到临时导入目录后创建打光实验室异步导入任务。接口立即返回任务 ID，后续可通过 `/api/knowledge/lighting-lab/import-jobs/{job_id}` 查询导入进度。

## 1.1. 请求参数说明

请求类型：`multipart/form-data`

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `files` | `File[]` | 是 | - | 上传的目录文件列表。前端通过 `webkitdirectory` 选择目录后，将每个文件以同名字段 `files` 追加到 `FormData`；文件名应保留相对路径。 |
| `batch_name` | `string` | 否 | `default` | 导入批次名。服务端会去除首尾空白，将连续空白替换为 `_`，并将 `::`、`/`、`\` 替换为 `_`，最长保留 64 个字符。 |
| `version` | `string` | 否 | `SwitchLight 3.0` | 导入版本。可选值：`SwitchLight 3.0`、`SwitchLight 1.0`；其他值会按默认值处理。 |
| `structure` | `string` | 否 | `auto` | 导入目录结构。可选值：`auto` 自动识别、`flat` 平铺目录、`code_nested` 按编号子目录；其他值会按 `auto` 处理。 |
| `check_oss_path` | `boolean/string` | 否 | `false` | 是否检查已存在 OSS 对象。表单值为 `1`、`true`、`yes` 时视为 `true`，其他值视为 `false`。 |
| `code_range_start` | `integer` | 否 | `null` | 导入编号范围起点，闭区间。空值或无法转为整数时按 `null` 处理。 |
| `code_range_end` | `integer` | 否 | `null` | 导入编号范围终点，闭区间。空值或无法转为整数时按 `null` 处理。 |

上传目录内容约定：

- 公共子目录：`Source`、`BaseColor`、`Normal`、`Roughness`、`Alpha`、`Depth`。
- 反射贴图目录：`Specular` 或 `F0`，入库统一为 `F0`。
- 普通贴图支持扩展名：`.png`、`.jpg`、`.jpeg`、`.webp`、`.bmp`、`.tif`、`.tiff`。
- `Depth` 支持扩展名：`.png`、`.exr`；`.exr` 导入时会转为 `.png`。
- 文件命名应与目录名匹配，例如：`Source_001.png`、`Alpha_001.png`、`Specular_001.png`、`Depth_001.png`。
- 浏览器目录上传通常会额外带一层被选择目录名；服务端会在可识别时自动剥离这一层作为导入根目录。

## 1.2. 请求参数示例

```bash
curl -X POST 'http://pre-pp.lightmeta.com:3001/api/knowledge/lighting-lab/import-upload-jobs' \
  -F 'batch_name=2026Q2_A' \
  -F 'version=SwitchLight 3.0' \
  -F 'structure=auto' \
  -F 'check_oss_path=false' \
  -F 'code_range_start=1' \
  -F 'code_range_end=5000' \
  -F 'files=@/Users/zqy/Downloads/relight_assets/Source/Source_001.png;filename=relight_assets/Source/Source_001.png' \
  -F 'files=@/Users/zqy/Downloads/relight_assets/BaseColor/BaseColor_001.png;filename=relight_assets/BaseColor/BaseColor_001.png' \
  -F 'files=@/Users/zqy/Downloads/relight_assets/Normal/Normal_001.png;filename=relight_assets/Normal/Normal_001.png' \
  -F 'files=@/Users/zqy/Downloads/relight_assets/Roughness/Roughness_001.png;filename=relight_assets/Roughness/Roughness_001.png' \
  -F 'files=@/Users/zqy/Downloads/relight_assets/Specular/Specular_001.png;filename=relight_assets/Specular/Specular_001.png' \
  -F 'files=@/Users/zqy/Downloads/relight_assets/Alpha/Alpha_001.png;filename=relight_assets/Alpha/Alpha_001.png'
```

前端 `FormData` 示例：

```js
const formData = new FormData()
formData.append('batch_name', '2026Q2_A')
formData.append('version', 'SwitchLight 3.0')
formData.append('structure', 'auto')
formData.append('check_oss_path', 'false')
formData.append('code_range_start', '1')
formData.append('code_range_end', '5000')

files.forEach((file) => {
  formData.append('files', file, file.webkitRelativePath || file.name)
})
```

## 1.3. 返回参数说明

成功响应 HTTP 状态码：`200`

| 参数名 | 类型 | 说明 |
| --- | --- | --- |
| `code` | `integer` | 业务状态码，成功为 `200`。 |
| `message` | `string` | 响应消息，成功为 `success`。 |
| `data.job_id` | `integer` | 异步导入任务 ID。 |
| `data.version` | `string` | 实际使用的导入版本。 |
| `data.batch_name` | `string` | 规范化后的批次名。 |
| `data.structure` | `string` | 实际使用的导入目录结构。 |
| `data.check_oss_path` | `boolean` | 是否启用 OSS 对象存在性检查。 |
| `data.saved_count` | `integer` | 服务端成功保存的上传文件数量。 |
| `data.upload_root_dir` | `string` | 服务端上传暂存根目录。 |
| `data.source_root_dir` | `string` | 实际用于导入扫描的根目录；可能是 `upload_root_dir`，也可能是自动剥离一级目录后的子目录。 |

## 1.4. 返回参数示例

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "job_id": 128,
    "version": "SwitchLight 3.0",
    "batch_name": "2026Q2_A",
    "structure": "auto",
    "check_oss_path": false,
    "saved_count": 126,
    "upload_root_dir": "/Users/zqy/lightmeta/photo_platform_uploads/lighting_lab_import_uploads/9d3f1a6c2b7d4d40a1e56e0d4f2a9b70",
    "source_root_dir": "/Users/zqy/lightmeta/photo_platform_uploads/lighting_lab_import_uploads/9d3f1a6c2b7d4d40a1e56e0d4f2a9b70/relight_assets"
  }
}
```

## 1.5. 错误响应

| HTTP状态码 | 响应示例 | 触发场景 |
| --- | --- | --- |
| `400` | `{"code":400,"message":"files 不能为空"}` | 未上传任何 `files` 字段。 |
| `400` | `{"code":400,"message":"没有可保存的上传文件"}` | 上传文件名为空、仅包含非法路径片段，或所有文件均未能生成安全相对路径。 |
| `500` | `{"code":500,"message":"<错误信息>"}` | 服务端创建暂存目录、保存文件、创建任务或启动导入线程失败。 |

错误响应示例：

```json
{
  "code": 400,
  "message": "files 不能为空"
}
```
