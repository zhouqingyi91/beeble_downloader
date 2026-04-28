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

## Safety

- The script never clicks `Generate`.
- It only moves an input image to `images/rendered/` after at least one non-empty image is downloaded.
- Only `Specular`, `Depth`, `Alpha`, `Roughness`, `Metallic`, `Normal`, and `BaseColor` pass images are downloaded.
- Pass images are saved under `images/output/<input-name>/<Pass>/<Pass>_<input-name>.<ext>`.
- The source image is copied as `images/output/<input-name>/Source/Source_<input-name><source-ext>`.
