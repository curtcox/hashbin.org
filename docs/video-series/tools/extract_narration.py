#!/usr/bin/env python3
"""Extract ElevenLabs narration text from the episode scripts.

Narration is every blockquote line ("> ") in an episode file. Each "## Beat" heading starts a new
clip. "[[pause 1.5]]" becomes a timed break. See ../README.md, "Producing the audio".
"""

import argparse
import json
import re
from pathlib import Path

SERIES_DIR = Path(__file__).resolve().parent.parent
EPISODES_DIR = SERIES_DIR / "episodes"
NARRATION_DIR = SERIES_DIR / "narration"
PRONUNCIATIONS = Path(__file__).resolve().parent / "pronunciations.json"

BEAT_HEADING = re.compile(r"^## Beat (\d+): (.+?)(?: · .*)?$")
PAUSE = re.compile(r"\[\[pause (\d+(?:\.\d+)?)\]\]")
BEAT_BREAK_SECONDS = 1.5
WORDS_PER_MINUTE = 150
# Characters that usually mean something was written for the eye, not the ear.
UNSPOKEN = re.compile(r"[\d$%#/=_*`{}<>\[\]]")


def parse_episode(path):
    """Return [(beat_number, beat_title, [paragraph, ...]), ...]."""
    beats = []
    paragraph = []

    def end_paragraph():
        if paragraph and beats:
            beats[-1][2].append(" ".join(paragraph))
        paragraph.clear()

    for line in path.read_text(encoding="utf-8").splitlines():
        heading = BEAT_HEADING.match(line)
        if heading:
            end_paragraph()
            beats.append((int(heading.group(1)), heading.group(2).strip(), []))
        elif line.startswith(">"):
            text = line[1:].strip()
            if text:
                paragraph.append(text)
            else:
                end_paragraph()
        else:
            end_paragraph()
    end_paragraph()
    return [beat for beat in beats if beat[2]]


def load_replacements():
    data = json.loads(PRONUNCIATIONS.read_text(encoding="utf-8"))
    return [(re.compile(rf"(?<![\w-]){re.escape(term)}(?![\w-])"), spoken) for term, spoken in data["replacements"]]


def speakable(text, replacements, breaks):
    text = re.sub(r"\*(.+?)\*", r"\1", text)  # emphasis markers aren't spoken
    for pattern, spoken in replacements:
        text = pattern.sub(spoken, text)
    if breaks:
        text = PAUSE.sub(lambda match: f'<break time="{match.group(1)}s" />', text)
    else:
        text = PAUSE.sub("", text)
    return re.sub(r"\s+", " ", text).strip()


def slugify(title):
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def warn_unspoken(episode, beat_number, paragraph):
    without_breaks = re.sub(r'<break time="[\d.]+s" />', "", paragraph)
    for match in UNSPOKEN.finditer(without_breaks):
        start = max(0, match.start() - 25)
        print(f"  warning: {episode} beat {beat_number}: {match.group()!r} in "
              f"\"…{without_breaks[start:match.end() + 25]}…\"")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--per-beat", action="store_true", help="also write one file per beat")
    parser.add_argument("--no-breaks", action="store_true", help="omit <break/> tags")
    parser.add_argument("--no-pronunciations", action="store_true", help="don't apply pronunciations.json")
    args = parser.parse_args()

    replacements = [] if args.no_pronunciations else load_replacements()
    breaks = not args.no_breaks
    NARRATION_DIR.mkdir(exist_ok=True)

    for path in sorted(EPISODES_DIR.glob("*.md")):
        episode = path.stem
        beats = parse_episode(path)
        clips = []
        for number, title, paragraphs in beats:
            spoken = [speakable(p, replacements, breaks) for p in paragraphs]
            for paragraph in spoken:
                warn_unspoken(episode, number, paragraph)
            clips.append((number, title, "\n\n".join(spoken)))

        separator = f'\n\n<break time="{BEAT_BREAK_SECONDS}s" />\n\n' if breaks else "\n\n"
        full_text = separator.join(text for _, _, text in clips) + "\n"
        (NARRATION_DIR / f"{episode}.txt").write_text(full_text, encoding="utf-8")

        if args.per_beat:
            beat_dir = NARRATION_DIR / episode
            beat_dir.mkdir(exist_ok=True)
            for old in beat_dir.glob("*.txt"):
                old.unlink()
            for number, title, text in clips:
                (beat_dir / f"{number:02d}-{slugify(title)}.txt").write_text(text + "\n", encoding="utf-8")

        words = len(re.sub(r"<break[^>]*>", "", full_text).split())
        print(f"{episode}: {len(clips)} beats, {words} words, ~{words / WORDS_PER_MINUTE:.1f} min spoken")


if __name__ == "__main__":
    main()
