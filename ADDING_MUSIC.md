# Adding Music to the Electron Player Library

## Where songs live

The app loads songs from Electron's userData directory:

```
~/Library/Application Support/electron-player/songs/
```

Any `.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`, or `.aac` file placed in this folder will appear in the Library on next app launch.

## Adding songs manually

```bash
cp /path/to/your/songs/*.mp3 ~/Library/Application\ Support/electron-player/songs/
```

Then restart the app — it only scans the songs directory on launch (no hot-reload/file watcher).

## Bulk generating songs with Suno (via Kie.ai)

We have a script that batch-generates instrumental tracks using the Kie.ai hosted Suno API:

```bash
cd /Users/dylan/Desktop/projects/prism-marketing
source .venv/bin/activate
python scripts/generate_suno_music.py
```

**Config** (edit at top of `scripts/generate_suno_music.py`):

| Parameter | Default | Description |
|-----------|---------|-------------|
| `STYLE` | minimal, slow evolving warm synths, atmospheric, ambient electronic beats, lofi | Style prompt |
| `NEGATIVE_TAGS` | piano | Styles to exclude |
| `INSTRUMENTAL` | True | No vocals |
| `MODEL` | V5 | Suno model (V3_5, V4, V4_5, V4_5PLUS, V4_5ALL, V5) |
| `TOTAL_SONGS` | 50 | Number of songs to generate |
| `OUTPUT_DIR` | `../music-player/electron-player/music/` | Where mp3s are saved |

**Requires** `KIE_API_KEY` in `prism-marketing/.env` (get one at https://kie.ai/api-key).

The script generates 2 songs per API call, polls for completion, and downloads the mp3s. It skips files that already exist, so you can re-run safely after failures.

### After generating, copy to the library:

```bash
cp /Users/dylan/Desktop/projects/music-player/electron-player/music/ambient_*.mp3 \
   ~/Library/Application\ Support/electron-player/songs/
```

Then restart the app.

## Current library contents

Generated via Suno:
- `ambient_001.mp3` - `ambient_050.mp3` — V5 model
- `ambient_001_v45.mp3` - `ambient_050_v45.mp3` — V4.5 model
- `track_01.mp3` - `track_10.mp3` — earlier generated tracks
- `kie_jazz_1.mp3`, `kie_jazz_2.mp3` — jazz tracks from Kie
