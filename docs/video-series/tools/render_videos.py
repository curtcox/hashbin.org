#!/usr/bin/env python3
"""Render the Manim scenes and join each episode's beats into one narrated video.

Run voice_kokoro.py first: every scene plays its beat's narration and times itself to it.
Output: build/videos/<episode>.mp4, with one narration track built from the Kokoro clips. Run with
the series virtualenv:

    .venv/bin/python tools/render_videos.py            # every episode, 1080p30
    .venv/bin/python tools/render_videos.py e00 --low  # one episode, quick 480p preview
"""

import argparse
import importlib
import inspect
import json
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
AUDIO_DIR = BUILD_DIR / "audio"
LOG_DIR = BUILD_DIR / "logs"
MODULES = ["e00", "e01", "u1", "u2", "u3", "u4", "x1", "x2", "x3", "d1", "d2", "d3", "d4"]


def scenes_in(module_name):
    sys.path.insert(0, str(MANIM_DIR))
    from hb.common import Beat

    module = importlib.import_module(module_name)
    scenes = [obj for _, obj in inspect.getmembers(module, inspect.isclass)
              if issubclass(obj, Beat) and obj.__module__ == module_name and "BEAT" in vars(obj)]
    scenes.sort(key=lambda cls: cls.BEAT)
    return scenes[0].EPISODE, [(cls.BEAT, cls.__name__) for cls in scenes]


def render_scene(module_name, scene, quality_args, quality_dir):
    log = LOG_DIR / f"{scene}.log"
    command = [sys.executable, "-m", "manim", "render", *quality_args, "--disable_caching", "--progress_bar", "none",
               "--media_dir", str(MEDIA_DIR), f"{module_name}.py", scene]
    with log.open("w") as handle:
        result = subprocess.run(command, cwd=MANIM_DIR, stdout=handle, stderr=subprocess.STDOUT)
    output = MEDIA_DIR / "videos" / module_name / quality_dir / f"{scene}.mp4"
    notes = [line.strip() for line in log.read_text().splitlines() if line.startswith(("OVERRUN", "CUE MISSING", "LAYOUT"))]
    if result.returncode != 0 or not output.exists():
        return scene, None, notes + [f"FAILED, see {log}"]
    return scene, output, notes


def video_seconds(path):
    """Exact length of a scene's video: frame count divided by frame rate."""
    rate, frames = subprocess.check_output(
        ["ffprobe", "-v", "error", "-select_streams", "v", "-count_packets", "-show_entries", "stream=r_frame_rate,nb_read_packets",
         "-of", "csv=p=0", str(path)], text=True).strip().split(",")
    numerator, denominator = rate.split("/")
    return int(frames) * int(denominator) / int(numerator)


def soundtrack(episode, parts, output):
    """One continuous narration track: each beat's Kokoro clip placed at the exact time its scene starts.

    Building it from the source clips, rather than concatenating the scenes' own audio, keeps the silent
    tail at the end of each beat. ffmpeg's concat demuxer drops those gaps when it re-encodes audio, which
    pulled every later beat's narration ahead of its picture and made playback stutter.
    """
    import numpy as np
    import soundfile as sf

    starts, total = [], 0.0
    for part in parts.values():
        starts.append(total)
        total += video_seconds(part)
    clips = [(start, sf.read(path, dtype="float32")) for start, path in zip(starts, (AUDIO_DIR / episode / f"{beat:02d}.wav" for beat in parts))
             if path.exists()]  # the intro card (beat 0) has no narration
    rate = clips[0][1][1]
    track = np.zeros(int(round(total * rate)), dtype=np.float32)
    for start, (clip, _) in clips:
        offset = int(round(start * rate))
        clip = clip[:len(track) - offset]
        track[offset:offset + len(clip)] += clip
    sf.write(output, track, rate)
    return total


def normalize_args(path, target_lufs=-16.0):
    """One fixed gain to reach the target loudness, then a fast limiter for the rare peaks it pushes past -1.5 dBFS.

    loudnorm's single-pass (dynamic) mode keeps re-adjusting gain, which pumps audibly on narration with
    pauses, and it can't stay linear here because Kokoro's speech peaks are too high for the gain needed.
    """
    probe = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "loudnorm=print_format=json", "-f", "null", "-"],
                           capture_output=True, text=True, check=True).stderr
    measured = json.loads(probe[probe.rindex("{"):probe.rindex("}") + 1])
    gain = target_lufs - float(measured["input_i"])
    return f"aresample=48000,volume={gain:.2f}dB,alimiter=limit=0.84:attack=5:release=50:level=false"


def join(episode, parts, low):
    """parts: {beat number: rendered scene path}, in order."""
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    listing = BUILD_DIR / f"{episode}.concat.txt"
    listing.write_text("".join(f"file '{part}'\n" for part in parts.values()))
    narration = BUILD_DIR / f"{episode}.narration.wav"
    soundtrack(episode, parts, narration)
    output = VIDEO_DIR / f"{episode}{'-preview' if low else ''}.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(listing), "-i", str(narration),
                    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-af", normalize_args(narration), "-ac", "2", "-c:a", "aac",
                    "-b:a", "192k", "-movflags", "+faststart", str(output)], check=True)
    listing.unlink()
    narration.unlink()
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("modules", nargs="*", default=MODULES)
    parser.add_argument("--low", action="store_true", help="480p15 preview")
    parser.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 4) - 2))
    parser.add_argument("--scenes", nargs="*", help="only these scene names (no joining)")
    parser.add_argument("--join-only", action="store_true", help="don't render; rejoin the scenes already rendered")
    parser.add_argument("--audit", action="store_true", help="report layout problems (text off the frame, overlapping, "
                        "covered or crossed); no joining")
    args = parser.parse_args()
    if args.audit:
        os.environ["HB_AUDIT"] = "1"

    if args.low:
        quality_args, quality_dir = ["-ql"], "480p15"
    else:
        quality_args, quality_dir = ["-r", "1920,1080", "--fps", "30"], "1080p30"
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    plan = [(module, *scenes_in(module)) for module in args.modules]
    jobs = [(module, scene) for module, _, scenes in plan for _, scene in scenes
            if (not args.scenes or scene in args.scenes) and not args.join_only]
    results = {}
    if args.join_only:
        for module, _, scenes in plan:
            for _, scene in scenes:
                path = MEDIA_DIR / "videos" / module / quality_dir / f"{scene}.mp4"
                results[scene] = path if path.exists() else None
    with ThreadPoolExecutor(args.jobs) as pool:
        futures = [pool.submit(render_scene, module, scene, quality_args, quality_dir) for module, scene in jobs]
        for future in futures:
            scene, output, notes = future.result()
            results[scene] = output
            print(f"{'ok ' if output else 'ERR'} {scene}", flush=True)
            for note in notes:
                print(f"    {note}", flush=True)

    if args.scenes or args.audit:
        return
    for module, episode, scenes in plan:
        parts = {beat: results.get(scene) for beat, scene in scenes}
        if all(parts.values()):
            print(f"joined {join(episode, parts, args.low)}", flush=True)
        else:
            print(f"skipped joining {episode}: some scenes failed", flush=True)


if __name__ == "__main__":
    main()
