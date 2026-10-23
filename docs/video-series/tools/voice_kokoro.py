#!/usr/bin/env python3
"""Voice every beat of every episode with Kokoro-82M, locally.

Writes build/audio/<episode>/<NN>.wav and a matching <NN>.json with word timings, which the Manim
scenes use to cue animations to the narration. Text comes from the episode scripts through the same
parsing and pronunciation rules as extract_narration.py. "[[pause N]]" becomes N seconds of silence.

Beats whose text, voice, and speed haven't changed since the last run are skipped.
Run with the series virtualenv: .venv/bin/python tools/voice_kokoro.py [episode-stem ...]
"""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_narration import EPISODES_DIR, SERIES_DIR, load_replacements, parse_episode, speakable  # noqa: E402

AUDIO_DIR = SERIES_DIR / "build" / "audio"
SAMPLE_RATE = 24000
LEAD_IN_SECONDS = 0.4
PARAGRAPH_GAP_SECONDS = 0.7
BREAK = re.compile(r'<break time="([\d.]+)s" />')


def silence(seconds):
    return np.zeros(int(round(seconds * SAMPLE_RATE)), dtype=np.float32)


def voice_beat(pipeline, paragraphs, voice, speed):
    """Return (audio, words) for one beat, with word times in seconds from the start of the clip."""
    pieces = [silence(LEAD_IN_SECONDS)]
    words = []
    elapsed = LEAD_IN_SECONDS

    for index, paragraph in enumerate(paragraphs):
        if index:
            pieces.append(silence(PARAGRAPH_GAP_SECONDS))
            elapsed += PARAGRAPH_GAP_SECONDS
        parts = BREAK.split(paragraph)
        # parts alternates text, pause seconds, text, ...
        for position, part in enumerate(parts):
            if position % 2:
                pieces.append(silence(float(part)))
                elapsed += float(part)
                continue
            if not part.strip():
                continue
            for result in pipeline(part.strip(), voice=voice, speed=speed, split_pattern=None):
                audio = result.audio.numpy() if hasattr(result.audio, "numpy") else np.asarray(result.audio)
                for token in result.tokens or []:
                    if not re.search(r"\w", token.text):
                        continue
                    start = token.start_ts
                    end = token.end_ts
                    words.append({
                        "w": token.text,
                        "s": None if start is None else round(elapsed + start, 3),
                        "e": None if end is None else round(elapsed + end, 3),
                    })
                pieces.append(audio.astype(np.float32))
                elapsed += len(audio) / SAMPLE_RATE

    # Fill any missing timestamps from neighbors so every word can be cued.
    last = LEAD_IN_SECONDS
    for word in words:
        if word["s"] is None:
            word["s"] = last
        if word["e"] is None:
            word["e"] = word["s"]
        last = word["e"]
    return np.concatenate(pieces), words


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("episodes", nargs="*", help="episode file stems (default: all)")
    parser.add_argument("--voice", default="af_heart")
    parser.add_argument("--speed", type=float, default=0.9)
    parser.add_argument("--force", action="store_true", help="regenerate beats even if unchanged")
    args = parser.parse_args()

    from kokoro import KPipeline

    pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    replacements = load_replacements()
    paths = sorted(EPISODES_DIR.glob("*.md"))
    if args.episodes:
        paths = [path for path in paths if path.stem in args.episodes or path.stem.split("-")[0] in args.episodes]

    for path in paths:
        out_dir = AUDIO_DIR / path.stem
        out_dir.mkdir(parents=True, exist_ok=True)
        total = 0.0
        for number, title, paragraphs in parse_episode(path):
            spoken = [speakable(p, replacements, breaks=True) for p in paragraphs]
            key = hashlib.sha256(json.dumps([spoken, args.voice, args.speed]).encode()).hexdigest()
            wav_path = out_dir / f"{number:02d}.wav"
            json_path = out_dir / f"{number:02d}.json"
            if not args.force and json_path.exists() and wav_path.exists():
                existing = json.loads(json_path.read_text())
                if existing.get("key") == key:
                    total += existing["duration"]
                    continue
            audio, words = voice_beat(pipeline, spoken, args.voice, args.speed)
            sf.write(wav_path, audio, SAMPLE_RATE)
            duration = round(len(audio) / SAMPLE_RATE, 3)
            json_path.write_text(json.dumps({
                "key": key, "episode": path.stem, "beat": number, "title": title,
                "voice": args.voice, "speed": args.speed, "duration": duration,
                "text": "\n\n".join(spoken), "words": words,
            }, indent=1))
            total += duration
            print(f"{path.stem} beat {number}: {duration:.1f}s", flush=True)
        print(f"{path.stem}: {total / 60:.1f} min of narration", flush=True)


if __name__ == "__main__":
    main()
