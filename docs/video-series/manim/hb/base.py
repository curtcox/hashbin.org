"""Imports, palette, text builders and 256t string helpers shared by every HashBin scene module."""

import json
import re
import sys
from functools import partial
from pathlib import Path

import numpy as np
from manim import *  # noqa: F403

SERIES_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SERIES_DIR / "tools"))
from extract_narration import load_replacements  # noqa: E402

from .audit import layout_findings  # noqa: E402

AUDIO_DIR = SERIES_DIR / "build" / "audio"
ASSETS_DIR = SERIES_DIR / "manim" / "assets"  # made by tools/make_logos.py
REPLACEMENTS = load_replacements()

BG = "#0F1117"
PANEL_BG = "#161A23"
MONO = "JetBrains Mono"
SANS = "Helvetica Neue"
config.background_color = BG
# Parallel renders would otherwise share one text cache and trip over each other's files.
config.text_dir = str(SERIES_DIR / "build" / "texts" / str(__import__("os").getpid()))

TAIL = 1.2  # seconds of picture after the narration ends
FADE = 0.6

DIM = 0.3

AUDIT = __import__("os").environ.get("HB_AUDIT") == "1"


def _fix_image_canvas():
    """Manim 0.22 draws every ImageMobject onto Image.fromarray(np.zeros((h, w)), mode="RGBA"), a float array
    Pillow 12 and later refuse. Give its camera an Image module whose fromarray makes that blank canvas itself."""
    import types

    import manim.camera.camera as camera_module
    from PIL import Image

    def fromarray(array, mode=None):
        if mode == "RGBA" and array.ndim == 2:
            return Image.new("RGBA", (array.shape[1], array.shape[0]))
        return Image.fromarray(array, mode)

    camera_module.Image = types.SimpleNamespace(**{name: getattr(Image, name) for name in dir(Image) if not name.startswith("__")})
    camera_module.Image.fromarray = fromarray


_fix_image_canvas()


# ---------------------------------------------------------------------------- text


def T(text, size=28, color=WHITE, weight=NORMAL, **kwargs):
    return Text(text, font=SANS, font_size=size, color=color, weight=weight, **kwargs)


def M(text, size=24, color=WHITE, **kwargs):
    return Text(text, font=MONO, font_size=size, color=color, **kwargs)


def Number(value, places=0, size=36, color=WHITE):
    """A DecimalNumber drawn with Text (no LaTeX)."""
    return DecimalNumber(value, num_decimal_places=places, mob_class=partial(Text, font=SANS),
                         font_size=size, color=color, group_with_commas=True)


def counting(number, target):
    """Animation that counts a Number to `target` (safe when the digit count changes)."""
    tracker = ValueTracker(number.get_value())
    number.add_updater(lambda m: m.set_value(tracker.get_value()))
    return tracker.animate.set_value(target)


def Money(value, size=36, color=WHITE):
    """Dollar amount that counts: animate with money.tracker."""
    tracker = ValueTracker(value)
    number = DecimalNumber(value, num_decimal_places=2, mob_class=partial(Text, font=SANS),
                           font_size=size, color=color, group_with_commas=True)
    dollar = T("$", size * 0.95, color)
    group = VGroup(dollar, number)

    def update(mob):
        number.set_value(tracker.get_value())
        number.next_to(dollar, RIGHT, buff=0.05)
        number.align_to(dollar, DOWN)

    update(group)
    group.add_updater(update)
    group.tracker = tracker
    group.number = number
    return group


def Expr(*parts, size=40, color=WHITE):
    """A row of math. A part is a string, or (base, exponent) for a power. No LaTeX needed."""
    pieces = VGroup()
    for part in parts:
        if isinstance(part, tuple):
            base, exponent = part
            base_mob = T(base, size, color)
            exp_mob = T(exponent, size * 0.6, color)
            exp_mob.next_to(base_mob, RIGHT, buff=0.03).align_to(base_mob, UP).shift(UP * size * 0.004)
            pieces.add(VGroup(base_mob, exp_mob))
        else:
            pieces.add(T(part, size, color))
    pieces.arrange(RIGHT, buff=size * 0.004 + 0.08, aligned_edge=DOWN)
    for piece in pieces:
        if isinstance(piece, VGroup):
            piece.align_to(pieces[0] if pieces[0] is not piece else piece, DOWN)
    return pieces


def caption(text, size=26, color=GREY_A):
    return T(text, size, color).to_edge(DOWN, buff=0.45)


def title_text(text, size=44):
    return T(text, size, WHITE, weight=BOLD)


def logo(name, height=1.0):
    """The HashBin ("hashbin") or 256t ("256t") logo."""
    path = ASSETS_DIR / f"{name}-logo.webp"
    if not path.exists():
        path = path.with_suffix(".png")
    return ImageMobject(str(path)).scale_to_fit_height(height)


# ---------------------------------------------------------------------------- 256t strings

ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

EXAMPLE_CID = "AAAAAABBRg2doReeYM-O5F0saH5FyWNhHN-H0k8AblA2CN3yhjRM_9xtTs3FjuawqoPa1iVinkuwwisBYRNepTWXpBBoUA"
HELLO_CID = "AAAAAAAPSGVsbG8sIEhhc2hCaW4h"


def b64(data: bytes) -> str:
    import base64
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def name_256t(data: bytes) -> str:
    import hashlib
    prefix = b64(len(data).to_bytes(6, "big"))
    body = data if len(data) <= 64 else hashlib.sha512(data).digest()
    return prefix + b64(body)


def prefix_for(length: int) -> str:
    return b64(length.to_bytes(6, "big"))


def S256(cid, size=24, inline=None, truncate=None):
    """A 256T STRING: prefix YELLOW, body BLUE_C (hashed) or GREEN_C (inline content)."""
    if inline is None:
        inline = len(cid) < 94
    shown = cid if truncate is None or len(cid) <= truncate else cid[:truncate] + "…"
    text = M(shown, size)
    text[:8].set_color(YELLOW)
    text[8:].set_color(GREEN_C if inline else BLUE_C)
    if shown.endswith("…"):
        text[-1].set_color(GREY_B)
    return text
