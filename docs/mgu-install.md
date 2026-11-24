# MGU validation notes

This source is not yet a validated installable OAP release. Confirm the package schema and entry-point requirements against the target MGU deployment version before installation.

## Direct filesystem test

1. Confirm the USB drive is mounted below `/media/<label>` or `/run/media/<label>`.
2. Confirm the real application process has supplementary group 909 (`mgu_usb`).
3. Run `node javascript/runner.js` from the package directory in the target runtime.
4. Confirm the JSON output lists the expected MP3 files, including files in nested directories.
5. Confirm no files on USB were created, modified, renamed, or removed.

The scanner reads `/proc/mounts` and uses Node.js `fs` directly. It writes its scan report to stdout only; it does not create a report file on USB.

## UI integration

The current HTML shell still needs a verified OAP UI-to-Node bridge. Do not assume `window.UsbMusicManager.scan` exists in the MGU runtime until it is explicitly connected and tested.
