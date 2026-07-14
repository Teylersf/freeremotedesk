# Icons

Placeholder — real icons must live here before `pnpm tauri build` will produce distributable installers.

## Required files

Tauri expects (per `tauri.conf.json`):

- `32x32.png`
- `128x128.png`
- `128x128@2x.png` (256×256)
- `icon.icns` (macOS)
- `icon.ico` (Windows)

## How to generate all of them from one source

1. Design a single square PNG at 1024×1024 or larger. Save as `icon-source.png` in this folder.
2. From the repo root, run:

   ```
   pnpm --filter @freeremotedesk/agent exec tauri icon icons/icon-source.png
   ```

   That will write all the sized variants into this folder (Windows `.ico`, macOS `.icns`, and the PNGs).

Until real icons are here, `tauri dev` still works but `tauri build` will fail.
