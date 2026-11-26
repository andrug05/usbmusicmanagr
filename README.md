# BMW USB Music Manager

Standalone read-only MP3 browser for BMW MGU ID7, built with the BMW MGU App Kit.

## Features in 0.1.x

- Detects removable USB volumes mounted under `/media/` and `/run/media/`.
- Recursively scans MP3 files only after the user presses **Scan USB**.
- Reads ID3 metadata (title, artist, album, track, year and genre).
- Shows a browsable track list and selected-track details on the native MGU RHMI screen.
- Sorts tracks by path, title, artist or album using the **Sort** control.
- Browses the library by artists, albums or folders using **View**, then opens a selected group with **Open**.
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


## 0.1.9 Russian ID3 decoding

Legacy ID3 text stored in Windows-1251 (including ID3v1 tags) is decoded as Cyrillic. UTF-16 ID3 text now handles both little-endian and big-endian BOMs and trims only complete UTF-16 null terminators.


## 0.1.10 adaptive ID3 text decoding

For legacy ID3 encoding-0 frames, UTF-8 is accepted only when it round-trips byte-for-byte; otherwise bytes are decoded as Windows-1251. UTF-16LE without a BOM is handled as little-endian for common non-conforming tags.


## 0.1.11 library browsing

Added grouped browsing by artist, album (artist + album) and folder. Select a group and press Open to show its tracks. View returns to the other library categories. USB access remains read-only.


## 0.1.12 — Now Playing diagnostics

Adds a separate **Now Playing** screen. It queries BMW's AudioManager read-only lists (sources, sinks and active connections) to identify which media source is routed to the front audio sink. It does not connect, disconnect, pause or control playback. Track title and artist are not claimed until the MGU's metadata interface is identified on the target head unit.


## 0.1.13 — USB trash

Adds **Move to Trash** for the selected MP3 and a separate **Trash** screen with Previous/Next and Restore. Files are moved to a hidden `.umm_trash` directory on the same USB drive (no permanent deletion). Restore returns a file to its original path and refuses to overwrite an existing file. Tag editing is not included in this build.


## 0.1.14 — ID3 tag editor

Adds a touch-screen editor for title, artist, album, track number, year and genre. Saving writes ID3v2.3 UTF-16 tags, preserves the MP3 audio stream and existing APIC artwork frames when supported, and stores the original MP3 in `.umm_tag_backup` on the same USB before replacing it. Includes Russian and English on-screen keyboard layouts. Reversible USB trash remains available.
