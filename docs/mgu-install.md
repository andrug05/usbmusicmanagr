# MGU validation notes

This scaffold is not yet a validated installable OAP release. Do not deploy until the package schema and entry-point requirements are confirmed against the target MGU deployment version.

## Read-only test plan

1. Confirm the package is recognized by deployment tooling without deploying it.
2. Confirm the application process has supplementary group 909 (mgu_usb).
3. Confirm /proc/mounts exposes USB volumes under /media/<label>.
4. Run node javascript/runner.js from the package directory and inspect JSON output.
5. Verify the USB mount remains read-only and no files are created, modified, renamed, or removed.

The runner writes its report to stdout only; it does not create a report file on USB.
