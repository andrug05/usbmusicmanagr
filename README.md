# BMW USB Music Manager

Standalone read-only MP3 browser for BMW MGU ID7, built with the BMW MGU App Kit.

## Features in 0.1.x

- Detects removable USB volumes mounted under `/media/` and `/run/media/`.
- Recursively scans MP3 files only after the user presses **Scan USB**.
- Reads ID3 metadata (title, artist, album, track, year and genre).
- Shows a browsable track list and selected-track details on the native MGU RHMI screen.
- Sorts tracks by path, title, artist or album using the **Sort** control.
- Detects embedded ID3 album artwork and reports whether a track contains a cover, without retaining image bytes in memory.
- Requests supplementary group 909 (`mgu_usb`) for USB filesystem access.

## Important: read-only

This release only reads files with the `.mp3` extension, does not follow symlinks, and never mounts/remounts, writes, renames, copies, moves, or deletes anything on the USB drive. Tag editing, copying and deletion are not included.

## Build and release

GitHub Actions checks out `aurelmarius/bmw-games`, stages this app in its MGU App Kit, generates native RHMI resources, builds the `.mgu` and `.tgz` packages, verifies the package structure and publishes a GitHub Release.

The app now renders its first screen before scanning. This avoids a synchronous recursive scan blocking OAP process startup on large USB drives. The release is not a claim of in-car validation; test on the target MGU after installation.

## Source layout

- `apps/andrug05_usb_music_manager/app.json` — app and RHMI screen specification.
- `apps/andrug05_usb_music_manager/main.js` — MGU runtime and read-only UI.
- `javascript/scanner.js` — USB discovery and recursive MP3 scan.
- `javascript/id3.js` — ID3 metadata parser.


## 0.1.8 memory fix

The ID3 parser records only the artwork MIME type and a boolean presence flag. It does not Base64-encode or retain cover images while scanning, preventing memory growth across large USB libraries.
