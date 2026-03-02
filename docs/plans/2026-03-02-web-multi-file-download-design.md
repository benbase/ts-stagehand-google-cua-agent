# Web App: Multi-File Download Support

## Context

The Kernel navigator apps now return `files: Array<{filename, remotePath}>` instead of `remotePath: string` on `NavigatorTaskOutput`. The web app needs to match this contract.

## Design Decisions

- **Once-per-file SSE events.** Each downloaded file fires its own `fileDownloaded` event for real-time log feedback.
- **Inline file count in results.** After a run completes, the results card shows "N file(s) downloaded" for quick debugging.
- **No backward compatibility.** Matches the Kernel app's clean break — no fallback for old `remotePath` field.

## Changes

### `web/server.js` — Download loop in `proc.on('close')`

Replace singular `taskResult.remotePath` download (lines 819-846) with iteration over `taskResult.files`:

- Check `taskResult.files` array instead of `taskResult.remotePath`
- Loop over each `{filename, remotePath}` entry
- Call `downloadFromKernel()` per file
- Fire `fileDownloaded` SSE event per file
- Collect all results into `downloadedFiles` for `saveSessionData`

### `web/public/app.js` — `showResult()` method

After displaying status and message, add a file count line when `result.files` has entries. Shows "N file(s) downloaded" in the results container.
