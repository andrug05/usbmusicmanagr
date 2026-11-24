# Architecture

## Direct USB access

The scanner uses the built-in Node.js `fs` and `path` modules directly. It does not use Road Ahead's FileManager, the OAP SDK fileAccess helper, an IPC service, or a custom filesystem bridge.

USB volumes are discovered by reading `/proc/mounts`. Only device-backed mounts below `/media/` and `/run/media/` are considered. The scanner walks those mount points recursively and processes files with the `.mp3` extension only.

The package requests supplementary group 909 (`mgu_usb`) through `oapAppSettings.startUpGroups`. This matches the group observed on the MGU and must still be checked in the actual app process after deployment.

## Safety boundary

This milestone is strictly read-only:
- Uses `readdirSync`, `lstatSync`, `openSync`, and `readSync` only.
- Opens MP3 files with read-only mode.
- Does not remount USB volumes.
- Does not follow symbolic links.
- Does not create, rename, move, modify, or delete files.
- Does not scan non-MP3 file contents.

ID3 metadata is read from at most the first 1 MiB of each MP3. ID3v1, basic ID3v2 text frames, and APIC cover art are supported.

## Runtime

Target runtime: Node.js 8.16.x. The scanner uses synchronous built-in filesystem calls to keep the implementation simple and compatible with the observed MGU environment.

## Entry point and UI status

`javascript/runner.js` runs the direct scanner and writes JSON to stdout. The HTML interface is a separate shell; its OAP UI-to-Node bridge has not yet been connected. Do not treat the Scan button as operational until that bridge is implemented and tested.

## Next

1. Verify the deployed application process has supplementary group 909.
2. Run the scanner from the real application runtime and confirm all expected USB folders are found.
3. Connect the scan result to the UI using the actual OAP runtime entry point.
4. Keep tag editing, copying, and deletion disabled until separately implemented and tested.
