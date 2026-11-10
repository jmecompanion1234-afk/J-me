"""Pull a YouTube video's captions into the J-me transcript shape.

    python tools/yt_captions.py URL_OR_ID [out.json]

Writes samples/<video id>.json as [{t0, t1, text}] (seconds), then run:
    node engine/src/main.ts --backtest samples/<id>.json --fetch
    node engine/src/main.ts --companion sessions/backtests/<id>.map.json --youtube <id>
"""
import json
import re
import sys
from pathlib import Path

from youtube_transcript_api import YouTubeTranscriptApi


def video_id(s: str) -> str:
    m = re.search(r"(?:v=|youtu\.be/|shorts/|live/)([A-Za-z0-9_-]{11})", s)
    if m:
        return m.group(1)
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", s):
        return s
    sys.exit(f"not a YouTube URL or id: {s}")


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    vid = video_id(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "samples" / f"{vid}.json"
    api = YouTubeTranscriptApi()
    tl = api.list(vid)
    try:
        t = tl.find_manually_created_transcript(["en", "en-US", "en-GB"])
        kind = "manual"
    except Exception:
        t = tl.find_transcript(["en", "en-US", "en-GB"])
        kind = "auto"
    segs = [
        {"t0": round(c.start, 2), "t1": round(c.start + c.duration, 2), "text": c.text.replace("\n", " ").strip()}
        for c in t.fetch()
        if c.text.strip() and not c.text.startswith("[")
    ]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(segs, ensure_ascii=False, indent=0), encoding="utf-8")
    mins = segs[-1]["t1"] / 60 if segs else 0
    print(f"{vid}: {len(segs)} caption lines, {mins:.1f} min, {kind} captions -> {out}")
    print(f"next: node engine/src/main.ts --backtest {out} --fetch")
    print(f"then: node engine/src/main.ts --companion sessions/backtests/{vid}.map.json --youtube {vid} --title \"...\"")


if __name__ == "__main__":
    main()
