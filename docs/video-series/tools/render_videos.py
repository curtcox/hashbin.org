#!/usr/bin/env python3
"""Render the Manim scenes and join each episode's beats into one narrated video.

Run voice_kokoro.py first: every scene plays its beat's narration and times itself to it.
Output: build/videos/<episode>.mp4. Run with the series virtualenv:

    .venv/bin/python tools/render_videos.py            # every episode, 1080p30
    .venv/bin/python tools/render_videos.py e00 --low  # one episode, quick 480p preview
"""

import argparse
import importlib
import inspect
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SERIES_DIR = Path(__file__).resolve().parent.parent
MANIM_DIR = SERIES_DIR / "manim"
BUILD_DIR = SERIES_DIR / "build"
MEDIA_DIR = BUILD_DIR / "media"
VIDEO_DIR = BUILD_DIR / "videos"
LOG_DIR = BUILD_DIR / "logs"
MODULES = ["e00", "e01", "u1", "u2", "u3", "u4", "x1", "x2", "x3", "d1", "d2", "d3", "d4"]


def scenes_in(module_name):
    sys.path.insert(0, str(MANIM_DIR))
    from hb.common import Beat

    module = importlib.import_module(module_name)
    scenes = [obj for _, obj in inspect.getmembers(module, inspect.isclass)
              if issubclass(obj, Beat) and obj.__module__ == module_name and "BEAT" in vars(obj)]
    scenes.sort(key=lambda cls: cls.BEAT)
    return scenes[0].EPISODE, [cls.__name__ for cls in scenes]


def render_scene(module_name, scene, quality_args, quality_dir):
    log = LOG_DIR / f"{scene}.log"
    command = [sys.executable, "-m", "manim", "render", *quality_args, "--disable_caching", "--progress_bar", "none",
               "--media_dir", str(MEDIA_DIR), f"{module_name}.py", scene]
    with log.open("w") as handle:
        result = subprocess.run(command, cwd=MANIM_DIR, stdout=handle, stderr=subprocess.STDOUT)
    output = MEDIA_DIR / "videos" / module_name / quality_dir / f"{scene}.mp4"
    notes = [line.strip() for line in log.read_text().splitlines() if line.startswith(("OVERRUN", "CUE MISSING"))]
    if result.returncode != 0 or not output.exists():
        return scene, None, notes + [f"FAILED, see {log}"]
    return scene, output, notes


def join(episode, parts, low):
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    listing = BUILD_DIR / f"{episode}.concat.txt"
    listing.write_text("".join(f"file '{part}'\n" for part in parts))
    output = VIDEO_DIR / f"{episode}{'-preview' if low else ''}.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing),
                    "-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k",
                    "-movflags", "+faststart", str(output)], check=True)
    listing.unlink()
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("modules", nargs="*", default=MODULES)
    parser.add_argument("--low", action="store_true", help="480p15 preview")
    parser.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 4) - 2))
    parser.add_argument("--scenes", nargs="*", help="only these scene names (no joining)")
    args = parser.parse_args()

    if args.low:
        quality_args, quality_dir = ["-ql"], "480p15"
    else:
        quality_args, quality_dir = ["-r", "1920,1080", "--fps", "30"], "1080p30"
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    plan = [(module, *scenes_in(module)) for module in args.modules]
    jobs = [(module, scene) for module, _, scenes in plan for scene in scenes
            if not args.scenes or scene in args.scenes]
    results = {}
    with ThreadPoolExecutor(args.jobs) as pool:
        futures = [pool.submit(render_scene, module, scene, quality_args, quality_dir) for module, scene in jobs]
        for future in futures:
            scene, output, notes = future.result()
            results[scene] = output
            print(f"{'ok ' if output else 'ERR'} {scene}", flush=True)
            for note in notes:
                print(f"    {note}", flush=True)

    if args.scenes:
        return
    for module, episode, scenes in plan:
        parts = [results.get(scene) for scene in scenes]
        if all(parts):
            print(f"joined {join(episode, parts, args.low)}", flush=True)
        else:
            print(f"skipped joining {episode}: some scenes failed", flush=True)


if __name__ == "__main__":
    main()
