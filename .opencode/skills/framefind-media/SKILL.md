---
name: framefind-media
description: Framefind audio/video media techniques — battle-tested ffmpeg/ffprobe for probing, representative-frame extraction, and thumbnails; requiresVideoAnalysis dual-path (browser canvas vs ffmpeg); and the /manus-storage object-storage proxy route. Use when touching upload, sampling, thumbnail/media URL serving, duration probing, or any ffmpeg call in this repo. Borrows conventions from ychoi-kr/claude-ffmpeg-skill but narrowed to Framefind's needs.
---

# Framefind Media Techniques

Framefind only needs a small slice of ffmpeg: probe metadata, extract a few
representative frames, produce thumbnails. It does **not** do transcoding or
full editing in-app (editing handoff targets DaVinci Resolve). Keep media work
within this slice; do not drift into a general ffmpeg editing suite.

## Probing duration (ffprobe)

Used by the CLI (`cli/framefind.mjs`). Filter v=error so non-media files fail
cleanly, use `-show_entries format=duration` with `default=noprint_wrappers=1:nokey=1`:

```
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 file.mp4
```

Always wrap in a try/catch with timeout (~12s) and return finite duration or
null. ffprobe/ffmpeg may be absent; always check and fail with a readable
message ("Install ffmpeg, then try again.").

## Representative-frame sampling (two paths)

### Browser path (client-side upload, default)

`client/src/lib/footage.ts` samples **four chronological views** of each clip:
`REPRESENTATIVE_FRAME_RATIOS = [0.1, 0.35, 0.6, 0.85]` of duration. `time =
min(max(duration * ratio, 0.1), duration - 0.1)` with a floor of `[0.1]` for
clips ≤ 0.25s. Each frame is drawn to a canvas capped at **960×540** and
encoded `image/jpeg` quality `0.82` → data URL. This is the canonical model
input: 4 small JPEGs per clip, sent with the analysis prompt.

- Frames are chronological thumbnails, one clip-level analysis result.
- Keep the ≤960px and 0.82 JPEG defaults; larger inputs inflate cost without
  improving Qwen metadata quality.
- `seekVideo` resolves on `onseeked`, rejects on `onerror`.

### ffmpeg path (CLI only)

CLI `analyze` extracts **one** representative frame at `00:00:01`:

```
ffmpeg -y -ss 00:00:01 -i input.mp4 -frames:v 1 -vf "scale='min(960,iw)':-2" frame.jpg
```

This is a deliberately minimal, reliable command: `-ss` before `-i` (fast
seek), single frame, capped width/auto height. It is **not** the browser
4-frame approach; do not fan it out. Write the temp frame to a temp file and
unlink it in a `finally` after analysis.

## Storage object and /manus-storage proxy

- `server/storage.ts` `storagePut(key, buffer, contentType)` uploads to
  S3-compatible object storage and returns `{ key, url }` where `url` is
  app-relative: `/manus-storage/<key>`. `storageGet` returns the same
  app-relative URL without touching S3; `storageGetSignedUrl` returns a real
  S3 presigned URL. **Only store keys/URLs in MySQL, never the bytes.**
- `server/_core/storageProxy.ts` registers `app.get("/manus-storage/*")` which
  307-redirects to the signed S3 URL. Do not stream bytes through the app.
- Upload flow lives in `server/_core/index.ts`: multipart
  `/api/footage/upload/:clipId` → `storagePut('framefind/${userId}/videos/${fileName}',
  ...)`. The frame-analysis procedure in `server/routers.ts` stores the
  frontend's sampled-frame data URL as a thumbnail (`framefind/${userId}/thumbnails/...`)
  before calling `db.createAnalyzedClip`. When you change storage behavior,
  keep the proxy route and `client/src/lib/footage.ts` media/thumbnail URL
  handling in sync.
- Demo clips serve static images from `/manus-storage/framefind-*.jpg`
  (`client/src/lib/footage.ts` `demoImages`) — these are the sample-library
  thumbnails, clearly read-only sample content.
- Missing storage config must fail with a readable error (e.g. "Storage config
  missing: set S3_ENDPOINT"), never a silent 500.

## Guardrails

- 50 MB per-clip upload limit (`MAX_UPLOAD_BYTES`); enforce with a readable
  error naming the file size (see `getOversizeUploadError`).
- Check video capabilities (canvas + `requestVideoFrameCallback` era APIs) only
  where sampling happens; fail with a user-facing message when unsupported.
- Never shell out to ffmpeg from the browser path; the browser path is
  canvas-based, the CLI path is ffmpeg-based — they stay separate.
- Never let a single ffmpeg call run unboundedly (timeouts ~12–45s).
- Keep commands dependency-free of pipe/`&&` shell tricks; arguments as an
  argv array via `execFile`, never string-shell injection with user paths.