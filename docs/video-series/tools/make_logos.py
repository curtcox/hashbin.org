#!/usr/bin/env python3
"""Make the logo images the scenes use from the projects' own logo files.

The HashBin logo is already transparent around the mark, so it is only cropped. The 256t logo is grey on white; for the dark video it becomes a light mark with
the white parts (the background and the digits) made transparent.

    .venv/bin/python tools/make_logos.py [path/to/256t.org/examples/256t_logo.png]
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

SERIES_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = SERIES_DIR.parent.parent
ASSETS = SERIES_DIR / "manim" / "assets"
HASHBIN_SOURCE = REPO_DIR / "frontend" / "img" / "hashbin-logo.png"
T256_SOURCE = REPO_DIR.parent / "256t.org" / "examples" / "256t_logo.png"
MARK_COLOR = (226, 230, 238)


def hashbin(source, output):
    image = Image.open(source).convert("RGBA")
    image.crop(image.getbbox()).save(output)


def t256(source, output, size=640):
    image = Image.open(source).convert("RGB")
    width, height = image.size
    # The hexagon mark, without the margins (and the generator's watermark in the bottom-right corner).
    side = height * 0.74
    left, top = width / 2 - side / 2, height * 0.13
    image = image.crop((left, top, left + side, top + side)).resize((size, size), Image.LANCZOS)
    lum = np.asarray(image.convert("L")).astype(np.float32) / 255
    alpha = np.clip((0.88 - lum) / 0.3, 0, 1)
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[..., :3] = MARK_COLOR
    rgba[..., 3] = (alpha * 255).astype(np.uint8)
    Image.fromarray(rgba).save(output)


def main():
    ASSETS.mkdir(exist_ok=True)
    hashbin(HASHBIN_SOURCE, ASSETS / "hashbin-logo.png")
    t256(Path(sys.argv[1]) if len(sys.argv) > 1 else T256_SOURCE, ASSETS / "256t-logo.png")


if __name__ == "__main__":
    main()
