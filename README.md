# Beeble Downloader

Headed Playwright Chromium automation for Beeble VFX Pass image rendering.

## Usage

```bash
npm install
npm run install-browsers
npm run init
npm run run -- --dry-run --limit 1
npm run run -- --limit 1
```

`init` opens Chromium with the persistent profile in `./chrome-profile` and loads ImageAssistant.
If ImageAssistant is not found, `init` opens the Chrome Web Store install page and asks you to install it first.
Complete Google login and Beeble login manually in that window; `init` does not detect login state.
After login, manually close Chromium; only then `init` writes the initialization marker.
After that, run the downloader.

Use npm's `--` separator when passing downloader options:

```bash
npm run run -- --limit 1
```

Use Beeble's Generate download flow instead of ImageAssistant extraction:

```bash
npm run run -- --use-generate-download --limit 1
```

This clicks `Generate`, downloads `All Passes (PNG)`, confirms `Download Anyway` when needed, and extracts the zip directly under `images/output/` while preserving the zip's directory structure.

On Windows 11, ImageAssistant is auto-detected from:

```txt
%LOCALAPPDATA%\Google\Chrome\User Data\Default\Extensions\dbjbempljhcmhlfpfacalomonjpalpko
```

If Chrome uses another profile/path, pass the unpacked extension version directory explicitly:

```powershell
$env:IMAGE_ASSISTANT_EXTENSION_PATH="C:\Users\<you>\AppData\Local\Google\Chrome\User Data\Default\Extensions\dbjbempljhcmhlfpfacalomonjpalpko\1.70.7_0"
npm run init
```

Optional timeout override:

```bash
npm run run -- --limit 1 --login-timeout-ms 120000
```

Use the source image's trailing number for downloaded file names:

```bash
npm run run -- --limit 1 --use-source-number
```

For `Source_000001.png`, pass images are saved as `Alpha_000001.png`, `Roughness_000001.png`, and so on.
If the source image name has no trailing number, that image fails and the script continues with the next input.

Use the source image's basename for downloaded file names:

```bash
npm run run -- --limit 1 --use-source-name
```

For `木纹地板.png`, pass images are saved as `Source_木纹地板.png`, `Alpha_木纹地板.png`, `Roughness_木纹地板.png`, and so on.
If `--use-source-name` and `--use-source-number` are both passed, `--use-source-name` wins.

After the `Generate` button becomes ready, the script waits 10 seconds before extracting images.
Override it when needed:

```bash
npm run run -- --limit 1 --post-generate-delay-ms 10000
```

## Upload Outputs

Upload each child directory under `images/output/` to Lighting Lab, wait until the import job completes, then move the uploaded directory to `images/uploaded/`.

```bash
npm run upload
```

Useful options:

```bash
npm run upload -- --dry-run
npm run upload -- --limit 1
npm run upload -- --batch-name "你的批次名"
npm run upload -- --base-url http://pre-pp.lightmeta.com:3001
npm run upload -- --poll-interval-ms 3000 --timeout-ms 1800000
```

Defaults: `batch_name=周通0422-1`, `version=SwitchLight 3.0`, `structure=auto`, `check_oss_path=false`.
You can also set `LIGHTING_LAB_BASE_URL` instead of passing `--base-url`.

## Safety

- The default script never clicks `Generate`; `--use-generate-download` opts into Beeble's Generate download flow.
- It only moves an input image to `images/rendered/` after at least one non-empty image is downloaded.
- Generate download mode only moves an input image after the downloaded zip extracts at least one non-empty file.
- Generate download mode refuses zip entries with absolute paths, drive-letter paths, `..`, or existing output targets.
- If any required pass is missing, the output directory is moved to `images/missing/`.
- The upload script only moves an output directory to `images/uploaded/` after its import job returns `completed`.
- Only `Specular`, `Depth`, `Alpha`, `Roughness`, `Metallic`, `Normal`, and `BaseColor` pass images are downloaded.
- Required passes are `Alpha`, `BaseColor`, `Depth`, `Normal`, `Roughness`, and `Specular`; `Metallic` is optional.
- Pass images are saved under `images/output/<input-name>/<Pass>/<Pass>_<YYYYMMDD_HHMMSS>.<ext>`.
- The source image is copied as `images/output/<input-name>/Source/Source_<YYYYMMDD_HHMMSS><source-ext>`.
- With `--use-source-number`, pass images use the source image's trailing number: `images/output/<input-name>/<Pass>/<Pass>_<source-number>.<ext>`.
- With `--use-source-number`, the source image is copied as `images/output/<input-name>/Source/Source_<source-number><source-ext>`.
