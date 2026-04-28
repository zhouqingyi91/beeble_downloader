# Beeble Downloader

Headed Playwright Chromium automation for Beeble VFX Pass image rendering.

## Usage

```bash
npm install
npm run install-browsers
npm run run -- --dry-run --limit 1
npm run run -- --limit 1
```

First run opens Chromium with the persistent profile in `./chrome-profile`.
If login is required, complete Google/Beeble login manually in that window, then press Enter in the terminal.
After Enter, the script waits up to 2 minutes for the Beeble home page to become usable.

Optional timeout override:

```bash
npm run run -- --limit 1 --login-timeout-ms 120000
```

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
npm run upload -- --base-url http://pre-pp.lightmeta.com:3001
npm run upload -- --poll-interval-ms 3000 --timeout-ms 1800000
```

Defaults: `batch_name=周通0422-1`, `version=SwitchLight 3.0`, `structure=auto`, `check_oss_path=false`.
You can also set `LIGHTING_LAB_BASE_URL` instead of passing `--base-url`.

## Safety

- The script never clicks `Generate`.
- It only moves an input image to `images/rendered/` after at least one non-empty image is downloaded.
- The upload script only moves an output directory to `images/uploaded/` after its import job returns `completed`.
- Only `Specular`, `Depth`, `Alpha`, `Roughness`, `Metallic`, `Normal`, and `BaseColor` pass images are downloaded.
- Pass images are saved under `images/output/<input-name>/<Pass>/<Pass>_<input-name>.<ext>`.
- The source image is copied as `images/output/<input-name>/Source/Source_<input-name><source-ext>`.
