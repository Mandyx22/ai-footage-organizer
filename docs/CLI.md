# Framefind CLI

> **Use Framefind from the folder where your footage already lives.**

The web product is designed for visual exploration. The CLI adds a local-first route for creators who prefer a terminal, already organize their media in folders, or want to retrieve material without first moving it into a browser workspace.

## What stays local

The standard `index`, `list`, `search`, `similar`, and local `plan` commands read filenames, folder paths, file sizes, and modified times from your machine. They create an ordinary JSON index that belongs to you. They do **not** upload video bytes, call an AI service, or need login credentials.

> The folder path itself can reveal private context. Keep the resulting index file somewhere you are comfortable storing its absolute paths and inferred labels.

## Quick start

Run all commands from the repository root:

```bash
pnpm install

# Build an index from a local footage folder.
pnpm framefind index ~/Movies/tokyo-trip --index ~/Movies/tokyo-trip/framefind.index.json

# Retrieve footage using memory-like language.
pnpm framefind search "quiet blue night shots" --index ~/Movies/tokyo-trip/framefind.index.json
```

The indexer scans folders recursively and recognizes `.mp4`, `.mov`, `.m4v`, `.webm`, `.avi`, and `.mkv` files. Before optional AI analysis is applied, it derives lightweight starting labels from folder and file names; for example, a path containing `quiet-blue-night` becomes searchable through those terms.

## Command reference

| Command | Purpose | Example |
| --- | --- | --- |
| `index <folder>` | Recursively creates a local JSON index from supported video files. | `pnpm framefind index ~/Movies/trip --index ./trip.index.json` |
| `list` | Prints all indexed clips and their current local notes. | `pnpm framefind list --index ./trip.index.json` |
| `search <query>` | Ranks clips from local metadata and path-derived labels. | `pnpm framefind search "warm train window" --index ./trip.index.json` |
| `similar <clip>` | Finds clips sharing a metadata dimension with a reference clip. | `pnpm framefind similar "day-1/blue-street.mov" --by color --index ./trip.index.json` |
| `plan <brief>` | Produces a deterministic, local creative outline for selected clips. | `pnpm framefind plan "a reflective opening" --select "day-1/street.mov,day-1/rain.mov" --index ./trip.index.json` |
| `analyze <clip>` | Optionally extracts one representative frame and asks a configured multimodal model for richer visual notes. | See **Optional AI analysis** below. |

The `similar` command accepts `--by all`, `color`, `mood`, `lighting`, `subject`, `composition`, or `motion`. Add `--limit 5` to either `search` or `similar` when you want fewer results.

## Local creative planning

The default planning command makes no model call. It summarizes the selected clips’ locally available labels into an opening, middle, ending detail, and coverage note.

```bash
pnpm framefind plan "a 30-second rainy-city opening" \
  --select "tokyo/night/wide-street.mp4,tokyo/night/close-rain.mov" \
  --index ./tokyo.index.json
```

This is intentionally a transparent heuristic, not an automated director. It is most useful once you have useful path names or optional visual notes.

## Optional AI analysis

AI analysis is opt-in. It uses `ffmpeg` to extract **one representative frame**, then sends that frame to a compatible model endpoint for structured visual notes. The command never sends the entire original video file.

```bash
# Your environment must provide an OpenAI-compatible endpoint and key.
export FRAMEFIND_API_BASE="https://your-provider.example"
export FRAMEFIND_API_KEY="your-key"

# Explicit confirmation is required for each operation that sends material to AI.
pnpm framefind analyze "tokyo/night/wide-street.mp4" \
  --index ./tokyo.index.json \
  --confirm-ai
```

The configured endpoint must provide a model-list endpoint and support an OpenAI-compatible chat-completions API with vision and JSON-schema output. The CLI chooses a currently available fast multimodal model from the provider’s live catalog rather than relying on a fixed model list.

You may also ask the configured model to write a richer plan from **already indexed metadata**. This mode does not extract another frame, but it still sends the selected metadata and therefore requires explicit confirmation.

```bash
pnpm framefind plan "a reflective city opener" \
  --select "tokyo/night/wide-street.mp4,tokyo/night/close-rain.mov" \
  --ai --confirm-ai --index ./tokyo.index.json
```

## CLI and web product

| Need | Recommended route |
| --- | --- |
| Quickly search a local drive by filenames and folder language | CLI `index` + `search` |
| Keep a portable local JSON inventory | CLI `index` |
| Add visual notes from a representative frame | CLI `analyze --confirm-ai` or the web upload flow |
| Browse rich thumbnails, make collections, and use a visual selection interface | Web workspace |
| Ask a creative question from a hand-picked visual group | Web **Ask My Footage** or CLI `plan` |

The two routes currently have separate storage. The CLI index is intentionally portable and local; it does not silently synchronize into the web database. A future import/export bridge can be added once the desired cross-device privacy model is defined.

## Test the CLI

```bash
pnpm test
pnpm framefind help
```

The automated suite exercises recursive local indexing, path-derived labels, natural-language ranking, similar-shot ranking, and non-AI creative planning. For a manual smoke test, use an empty temporary folder with placeholder filenames; `index`, `search`, `similar`, and local `plan` do not need valid video bytes.
