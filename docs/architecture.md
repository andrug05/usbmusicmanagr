# Architecture

## Safety boundary

Milestone 0.1.0 is read-only. The scanner discovers mounted removable volumes through /proc/mounts, scans mount points under /media and /run/media, and reads MP3 metadata. It never remounts a volume and never writes to media.

## Runtime

Target MGU Node.js 8.16.2. Source avoids optional chaining, async iterators, and third-party dependencies.

## USB access

The package requests supplementary group 909 (mgu_usb) through oapAppSettings.startUpGroups. This is based on the observed Road Ahead process configuration and must be verified on the target MGU after deployment.

## Metadata

Initial support: MP3 ID3v1 and basic ID3v2 title, artist, album, track, year, genre, and APIC cover art. The scanner reads at most the first 1 MiB per file.

## UI bridge

The UI shell is implemented, but the OAP filesystem bridge is deliberately not guessed. Confirm the installed OAP SDK IPC API before wiring window.UsbMusicManager.scan.

## Next

1. Confirm OAP packaging and bridge API on ID7/ID8.
2. Connect scanner results and progress to the UI.
3. Add FLAC/AAC metadata, cover cache, and duplicate detection.
4. Keep all file modifications disabled until explicitly designed and validated.
