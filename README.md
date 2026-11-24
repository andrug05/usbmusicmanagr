# BMW USB Music Manager

A read-only USB music library browser for BMW MGU ID7/ID8.

## Status

Early development. The first milestone is safe USB discovery and MP3 metadata scanning. No files are modified on the USB device.

## Target environment

- BMW MGU ID7 / ID8
- Node.js 8.16 compatible runtime
- USB volumes discovered dynamically from `/proc/mounts`
- Initial metadata support: MP3 ID3v1 and ID3v2

## Safety

The scanner is read-only. It does not remount volumes, write test files, rename, move, or delete media.

## Development

See `docs/architecture.md` and `docs/mgu-install.md` for the initial design and deployment notes.
