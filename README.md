# Beeble Downloader

用于批量处理 Beeble 图片：初始化账号、生成图片、上传到指定批次。

## 准备环境

```bash
npm install
npm run install-browsers
```

把待处理图片放到：

```txt
images/input/
```

支持：`.jpg`、`.jpeg`、`.png`、`.webp`、`.bmp`、`.gif`、`.tif`、`.tiff`。

## 1. 初始化账号

```bash
npm run init
```

这个命令会打开 Chromium，用于登录 Beeble / Google。

如果提示没有安装图片助手插件，请先在 Chrome 浏览器里安装：

[ImageAssistant 图片助手](https://chromewebstore.google.com/detail/imageassistant-batch-imag/dbjbempljhcmhlfpfacalomonjpalpko)

安装完成后，再运行：

```bash
npm run init
```

登录完成后，手动关闭打开的 Chromium 窗口，初始化才会结束。

## 2. 生成图片

```bash
npm run run -- --use-source-name
```

脚本会处理 `images/input/` 下的图片，并把结果保存到：

```txt
images/output/
```

处理成功后，原图会移动到：

```txt
images/rendered/
```

如果缺少必需 pass，输出目录会移动到：

```txt
images/missing/
```

## 3. 按指定批次上传

```bash
npm run upload -- --batch-name "填入你的批次名称"
```

脚本会上传 `images/output/` 下的结果目录。上传并导入成功后，目录会移动到：

```txt
images/uploaded/
```

## 常用补充命令

只检查，不生成、不移动：

```bash
npm run run -- --dry-run --use-source-name
```

只处理 1 张：

```bash
npm run run -- --use-source-name --limit 1
```

只上传 1 个目录：

```bash
npm run upload -- --batch-name "填入你的批次名称" --limit 1
```

运行测试：

```bash
npm test
```

## 目录说明

```txt
images/input/      待处理原图
images/output/     生成结果
images/rendered/   已处理原图
images/missing/    缺少必需 pass 的结果
images/uploaded/   已上传结果
logs/              失败截图等日志
chrome-profile/    浏览器登录态
```

## 注意

- 给脚本传参数时，`npm run` 后面要加 `--`。
- `--use-source-name` 会用原图文件名作为输出文件编号。
- 如果 Chromium 提示 profile 被占用，关闭上一次打开的 Chromium 后重试。
