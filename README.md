# BMW USB Music Manager

A read-only MP3 library scanner for BMW MGU ID7/ID8.

## Direct USB access

The scanner uses Node.js built-in `fs` directly. It reads `/proc/mounts`, discovers USB device mounts below `/media/` and `/run/media/`, recursively scans folders, and reads ID3 metadata from MP3 files.

It does not depend on Road Ahead's FileManager, the OAP SDK `fileAccess` module, or a separate filesystem service.

## Current status

- Direct, read-only MP3 scanner implemented.
- Recursive folder scan.
- ID3v1 and basic ID3v2 metadata, including embedded APIC artwork.
- Search UI shell present.
- OAP UI-to-Node bridge is not yet connected.
- OAP packaging and deployment are not yet validated on the target MGU.

## USB access permissions

The package requests supplementary group 909 (`mgu_usb`) using `oapAppSettings.startUpGroups`. The actual application process must be checked after deployment.

## Safety

Only files with the `.mp3` extension are processed. The scanner opens files read-only, does not follow symlinks, and never remounts, writes, renames, moves, or deletes anything on the USB drive.

See [architecture](docs/architecture.md) and [MGU validation notes](docs/mgu-install.md).
