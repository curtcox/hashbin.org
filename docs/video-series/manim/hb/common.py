"""Shared visual vocabulary and narration timing for the HashBin series.

Every element in the README's "Visual vocabulary" table has a builder here, so the same thing looks
the same in every episode. Scenes subclass Beat, which plays the beat's Kokoro narration and lets
animations wait for a phrase: self.at("the phrase", Create(x)).
"""

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

AUDIO_DIR = SERIES_DIR / "build" / "audio"
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


# ---------------------------------------------------------------------------- vocabulary


class FileIcon(VGroup):
    """FILE: rounded page with a folded corner."""

    def __init__(self, label=None, width=0.7, height=0.9, color=WHITE, fill=PANEL_BG, label_size=18, lines=True):
        super().__init__()
        c = 0.26 * width
        w, h = width / 2, height / 2
        page = Polygon([-w, h, 0], [w - c, h, 0], [w, h - c, 0], [w, -h, 0], [-w, -h, 0],
                       color=color, stroke_width=3, fill_color=fill, fill_opacity=1)
        fold = Polygon([w - c, h, 0], [w - c, h - c, 0], [w, h - c, 0], color=color, stroke_width=2,
                       fill_color=color, fill_opacity=0.25)
        self.page = VGroup(page, fold)
        if lines:
            rows = VGroup(*[Line([-w * 0.6, h * (0.35 - 0.3 * i), 0], [w * (0.6 if i % 3 else 0.2), h * (0.35 - 0.3 * i), 0],
                                 stroke_width=2, color=color, stroke_opacity=0.5) for i in range(4)])
            self.page.add(rows)
        self.add(self.page)
        self.label = None
        if label:
            self.label = T(label, label_size, color).next_to(page, DOWN, buff=0.12)
            self.add(self.label)


class ByteGrid(VGroup):
    """Grid of byte cells showing hex."""

    def __init__(self, data, cols=8, cell=0.42, color=WHITE, fill=None, text_size=14, show_hex=True):
        super().__init__()
        self.cells = VGroup()
        for i, byte in enumerate(data):
            square = Square(cell, color=color, stroke_width=1.5, fill_color=fill or BG, fill_opacity=1)
            group = VGroup(square)
            if show_hex:
                group.add(M(f"{byte:02X}", text_size, color).move_to(square))
            self.cells.add(group)
        self.cells.arrange_in_grid(cols=cols, buff=0)
        self.add(self.cells)


class HashMachine(VGroup):
    """HASH MACHINE: box with a funnel in, character stream out."""

    def __init__(self, label="SHA-512", width=2.4, height=1.4):
        super().__init__()
        self.body = RoundedRectangle(corner_radius=0.18, width=width, height=height, color=GREY_B,
                                     fill_color="#2A2E38", fill_opacity=1, stroke_width=3)
        self.label = M(label, 26, GREY_A).move_to(self.body)
        left = self.body.get_left()
        self.funnel = Polygon(left + UP * 0.45, left + LEFT * 0.55 + UP * 0.7, left + LEFT * 0.55 + DOWN * 0.7,
                              left + DOWN * 0.45, color=GREY_B, fill_color="#2A2E38", fill_opacity=1, stroke_width=3)
        right = self.body.get_right()
        self.spout = Rectangle(width=0.35, height=0.4, color=GREY_B, fill_color="#2A2E38", fill_opacity=1,
                               stroke_width=3).move_to(right + RIGHT * 0.17)
        self.add(self.funnel, self.spout, self.body, self.label)

    @property
    def in_point(self):
        return self.funnel.get_left()

    @property
    def out_point(self):
        return self.spout.get_right()


class HashBinPanel(VGroup):
    """HASHBIN: the front desk."""

    def __init__(self, width=3.2, height=2.0, label="hashbin.org", size=26):
        super().__init__()
        self.box = RoundedRectangle(corner_radius=0.25, width=width, height=height, color=BLUE_D,
                                    fill_color=BLUE_D, fill_opacity=0.18, stroke_width=4)
        self.label = M(label, size, BLUE_B).next_to(self.box.get_top(), DOWN, buff=0.2)
        self.add(self.box, self.label)


class Sandbox(VGroup):
    """SANDBOX: dashed TEAL box, 256t.us."""

    def __init__(self, width=3.2, height=2.0, label="256t.us", size=26):
        super().__init__()
        rect = RoundedRectangle(corner_radius=0.2, width=width, height=height, color=TEAL_C, stroke_width=4)
        self.box = DashedVMobject(rect, num_dashes=40)
        self.fill = rect.copy().set_stroke(width=0).set_fill(TEAL_C, 0.08)
        self.label = M(label, size, TEAL_B).next_to(rect.get_top(), DOWN, buff=0.2)
        self.add(self.fill, self.box, self.label)


class Bins(VGroup):
    """BINS: a wall of labeled drawers (R2)."""

    def __init__(self, rows=3, cols=5, width=0.9, height=0.5, labels=None, label_size=11):
        super().__init__()
        self.drawers = VGroup()
        import random
        rng = random.Random(rows * 100 + cols)
        for i in range(rows * cols):
            box = Rectangle(width=width, height=height, color=GREY_C, stroke_width=2, fill_color="#1C2029",
                            fill_opacity=1)
            handle = Line(LEFT * 0.12, RIGHT * 0.12, color=GREY_C, stroke_width=3).move_to(box).shift(DOWN * height * 0.18)
            text = labels[i] if labels and i < len(labels) else "".join(rng.choice(ALPHABET) for _ in range(6)) + "…"
            tag = M(text, label_size, GREY_B).move_to(box).shift(UP * height * 0.17)
            self.drawers.add(VGroup(box, handle, tag))
        self.drawers.arrange_in_grid(rows=rows, cols=cols, buff=0.06)
        self.add(self.drawers)

    def drawer(self, i):
        return self.drawers[i]


class Balance(VGroup):
    """BALANCE: a GOLD bar with a dollar readout. Animate with balance.tracker."""

    def __init__(self, value=10.0, maximum=10.0, width=3.0, height=0.32, label="Balance", size=24):
        super().__init__()
        self.maximum = maximum
        self.tracker = ValueTracker(value)
        self.outline = RoundedRectangle(corner_radius=height / 2, width=width, height=height, color=GOLD,
                                        stroke_width=2)
        self.bar = RoundedRectangle(corner_radius=height / 2, width=width, height=height, stroke_width=0,
                                    fill_color=GOLD, fill_opacity=0.85)
        self.title = T(label, size * 0.8, GREY_A).next_to(self.outline, UP, buff=0.12).align_to(self.outline, LEFT)
        self.money = Money(value, size, GOLD)
        self.add(self.outline, self.bar, self.title, self.money)
        width_full = width

        def update_bar(bar):
            fraction = max(0.0, min(1.0, self.tracker.get_value() / self.maximum))
            new_width = max(height, width_full * fraction)
            bar.stretch_to_fit_width(new_width).align_to(self.outline, LEFT).match_y(self.outline)
            bar.set_fill(opacity=0.85 if fraction > 0 else 0)

        def update_money(money):
            money.tracker.set_value(self.tracker.get_value())
            money.next_to(self.outline, RIGHT, buff=0.2)

        self.bar.add_updater(update_bar)
        self.money.add_updater(update_money)
        update_bar(self.bar)
        update_money(self.money)

    def animate_to(self, value, **kwargs):
        return self.tracker.animate(**kwargs).set_value(value)


class Timeline(VGroup):
    """TIMELINE: horizontal axis in months, with an optional RED expiration line."""

    def __init__(self, months=12, width=9.0, label_every=None, unit="month", tick_labels=True, size=18,
                 label_fn=None):
        super().__init__()
        self.months = months
        self.axis = NumberLine(x_range=[0, months, 1], length=width, color=WHITE, include_tip=False,
                               stroke_width=3, tick_size=0.08)
        self.add(self.axis)
        self.labels = VGroup()
        if tick_labels:
            every = label_every or max(1, months // 12)
            for m in range(0, months + 1, every):
                text = label_fn(m) if label_fn else str(m)
                self.labels.add(T(text, size, GREY_B).next_to(self.axis.n2p(m), DOWN, buff=0.15))
            self.add(self.labels)

    def x(self, month):
        return self.axis.n2p(month)

    def expiry(self, month, height=1.6, label="expires", size=20):
        line = Line(self.x(month) + DOWN * 0.15, self.x(month) + UP * height, color=RED, stroke_width=5)
        group = VGroup(line)
        if label:
            group.add(T(label, size, RED).next_to(line, UP, buff=0.08))
        return group

    def playhead(self, month=0, label="today", height=1.2):
        tri = Triangle(color=WHITE, fill_opacity=1).scale(0.09).rotate(PI)
        line = DashedLine(ORIGIN, UP * height, color=WHITE, stroke_width=2)
        tri.next_to(line, UP, buff=0)
        text = T(label, 18, WHITE).next_to(tri, UP, buff=0.05)
        head = VGroup(line, tri, text)
        head.move_to(self.x(month), aligned_edge=DOWN)
        return head


def cost_area(axes, width_value, height_value, color=GOLD, opacity=0.4):
    """COST AREA rectangle on axes from the origin."""
    corner0 = axes.c2p(0, 0)
    corner1 = axes.c2p(width_value, height_value)
    return Rectangle(width=max(0.001, corner1[0] - corner0[0]), height=max(0.001, corner1[1] - corner0[1]),
                     stroke_color=color, stroke_width=2, fill_color=color, fill_opacity=opacity
                     ).move_to(corner0, aligned_edge=DL)


class Person(VGroup):
    """A simple original character: circle head, rounded body, two dot eyes."""

    def __init__(self, color=BLUE, height=1.0, label=None, label_size=18):
        super().__init__()
        body = RoundedRectangle(corner_radius=0.22, width=0.62, height=0.52, color=color, fill_color=color,
                                fill_opacity=1, stroke_width=0)
        head = Circle(radius=0.2, color=color, fill_color=color, fill_opacity=1, stroke_width=0)
        head.next_to(body, UP, buff=0.04)
        eyes = VGroup(Dot(radius=0.032, color=BG), Dot(radius=0.032, color=BG)).arrange(RIGHT, buff=0.1)
        eyes.move_to(head).shift(UP * 0.02)
        self.figure = VGroup(body, head, eyes)
        self.eyes = eyes
        self.head = head
        self.add(self.figure)
        self.figure.scale(height / 0.96)
        self.label = None
        if label:
            self.label = T(label, label_size, color).next_to(self.figure, DOWN, buff=0.1)
            self.add(self.label)

    def look(self, direction):
        self.eyes.move_to(self.head).shift(direction * 0.04 * self.figure.height)
        return self


class AppWindow(VGroup):
    """APP: a browser window or phone frame with the app name in the title bar."""

    def __init__(self, title="App", width=4.0, height=3.0, phone=False, color=PURPLE_B, size=20):
        super().__init__()
        if phone:
            self.frame = RoundedRectangle(corner_radius=0.3, width=width, height=height, color=color, stroke_width=4,
                                          fill_color=PANEL_BG, fill_opacity=1)
            bar_y = self.frame.get_top()[1] - 0.45
            self.title = T(title, size, color, weight=BOLD).move_to([self.frame.get_x(), bar_y, 0])
            notch = RoundedRectangle(corner_radius=0.06, width=width * 0.3, height=0.12, color=color, fill_opacity=1,
                                     fill_color=color).next_to(self.frame.get_top(), DOWN, buff=0.1)
            self.add(self.frame, notch, self.title)
        else:
            self.frame = RoundedRectangle(corner_radius=0.12, width=width, height=height, color=color, stroke_width=3,
                                          fill_color=PANEL_BG, fill_opacity=1)
            bar = Rectangle(width=width, height=0.42, stroke_width=0, fill_color=color, fill_opacity=1)
            bar.align_to(self.frame, UP)
            dots = VGroup(*[Dot(radius=0.05, color=BG) for _ in range(3)]).arrange(RIGHT, buff=0.08)
            dots.move_to(bar).align_to(bar, LEFT).shift(RIGHT * 0.2)
            self.title = T(title, size, BG, weight=BOLD).move_to(bar)
            self.bar = bar
            self.add(self.frame, bar, dots, self.title)

    @property
    def content_top(self):
        return self.frame.get_top() + DOWN * 0.55


STATUS_COLORS = {200: GREEN, 404: GREY_B, 410: GREY_B, 429: ORANGE, 451: RED, 400: ORANGE, 413: ORANGE}
STATUS_TEXT = {200: "OK", 404: "Not Found", 410: "Gone", 429: "Too Many Requests", 451: "Unavailable For Legal Reasons",
               400: "Bad Request", 413: "Too Large"}


def StatusChip(code, text=None, size=22, short=False):
    """STATUS CHIP: rounded pill with an HTTP status code."""
    color = STATUS_COLORS.get(code, GREY_B)
    words = str(code) if short else f"{code} {text if text is not None else STATUS_TEXT.get(code, '')}".strip()
    label = M(words, size, BG, weight=BOLD)
    pill = RoundedRectangle(corner_radius=(label.height + 0.2) / 2, width=label.width + 0.4, height=label.height + 0.22,
                            stroke_width=0, fill_color=color, fill_opacity=1)
    label.move_to(pill)
    chip = VGroup(pill, label)
    chip.code = code
    return chip


EPISODES = {
    "00": "HashBin in Five Minutes", "01": "A Name Made of Content", "U1": "Your First Upload",
    "U2": "What It Costs, and Why", "U3": "The Life of a File", "U4": "Who Can See What",
    "X1": "Disputes and Public Records", "X2": "Paying for Popularity", "X3": "Anyone Can Serve It",
    "D1": "First API Calls", "D2": "Letting Apps Publish", "D3": "Building Textpad", "D4": "Under the Hood",
}
TRACK_COLORS = {"0": WHITE, "U": BLUE, "X": ORANGE, "D": PURPLE_B}


def thumbnail(code, tag=None, big=False):
    color = TRACK_COLORS.get(code[0], WHITE)
    scale = 1.3 if big else 1.0
    frame = RoundedRectangle(corner_radius=0.12, width=3.0 * scale, height=1.7 * scale, color=color,
                             stroke_width=5 if big else 3, fill_color=PANEL_BG, fill_opacity=1)
    number = T(code, 54 * scale, color, weight=BOLD).move_to(frame)
    title = T(EPISODES[code], 22 * scale, WHITE).next_to(frame, DOWN, buff=0.15)
    group = VGroup(frame, number, title)
    if tag:
        group.add(T(tag, 18 * scale, GREY_B).next_to(title, DOWN, buff=0.08))
    return group


def NextCard(*items, heading="Next"):
    """NEXT CARD: items are (code, tag, big)."""
    thumbs = VGroup(*[thumbnail(code, tag, big) for code, tag, big in items]).arrange(RIGHT, buff=1.0, aligned_edge=DOWN)
    head = T(heading, 30, GREY_A).next_to(thumbs, UP, buff=0.5)
    return VGroup(head, thumbs).move_to(ORIGIN)


# ---------------------------------------------------------------------------- icons and props


def check_mark(color=GREEN, size=0.5):
    return VMobject(color=color, stroke_width=8).set_points_as_corners(
        [LEFT * 0.45 + UP * 0.02, LEFT * 0.12 + DOWN * 0.36, RIGHT * 0.48 + UP * 0.42]).scale(size)


def cross_mark(color=RED, size=0.5):
    return VGroup(Line(UL, DR, color=color, stroke_width=8), Line(UR, DL, color=color, stroke_width=8)).scale(size * 0.5)


def padlock(color=GREY_A, size=0.5, open_=False):
    body = RoundedRectangle(corner_radius=0.08, width=0.8, height=0.6, color=color, fill_color=color, fill_opacity=1,
                            stroke_width=0)
    shackle = Arc(radius=0.27, start_angle=0, angle=PI, color=color, stroke_width=10).next_to(body, UP, buff=-0.02)
    if open_:
        shackle.shift(UP * 0.15 + RIGHT * 0.27)
    hole = Dot(radius=0.07, color=BG).move_to(body)
    return VGroup(shackle, body, hole).scale(size / 0.8)


def key_icon(color=GOLD, size=0.6):
    ring = Circle(radius=0.2, color=color, stroke_width=8)
    shaft = Line(ring.get_right(), ring.get_right() + RIGHT * 0.7, color=color, stroke_width=8)
    teeth = VGroup(Line(ORIGIN, DOWN * 0.18, color=color, stroke_width=8).move_to(shaft.get_end() + LEFT * 0.08 + DOWN * 0.09),
                   Line(ORIGIN, DOWN * 0.12, color=color, stroke_width=8).move_to(shaft.get_end() + LEFT * 0.28 + DOWN * 0.06))
    return VGroup(ring, shaft, teeth).scale(size)


def clock_icon(color=WHITE, size=0.5, hour=2, minute=0):
    face = Circle(radius=0.5, color=color, stroke_width=4)
    ticks = VGroup(*[Line(UP * 0.42, UP * 0.5, color=color, stroke_width=3).rotate(-i * TAU / 12, about_point=ORIGIN)
                     for i in range(12)])
    hand_h = Line(ORIGIN, UP * 0.28, color=color, stroke_width=5).rotate(-(hour % 12 + minute / 60) * TAU / 12, about_point=ORIGIN)
    hand_m = Line(ORIGIN, UP * 0.4, color=color, stroke_width=3).rotate(-minute * TAU / 60, about_point=ORIGIN)
    return VGroup(face, ticks, hand_h, hand_m).scale(size / 0.5)


def gear(color=BLUE, radius=0.6, teeth=10, label=None, size=20):
    points = []
    for i in range(teeth * 2):
        angle = i * PI / teeth
        r = radius if i % 2 == 0 else radius * 0.78
        points.append([r * np.cos(angle - PI / teeth / 2), r * np.sin(angle - PI / teeth / 2), 0])
        points.append([r * np.cos(angle + PI / teeth / 2), r * np.sin(angle + PI / teeth / 2), 0])
    body = Polygon(*points, color=color, fill_color=color, fill_opacity=0.85, stroke_width=2)
    hole = Circle(radius=radius * 0.3, color=BG, fill_color=BG, fill_opacity=1, stroke_width=0)
    group = VGroup(body, hole)
    if label:
        group.add(T(label, size, color).next_to(body, DOWN, buff=0.15))
    return group


def coin(color=GOLD, radius=0.14):
    return VGroup(Circle(radius=radius, color=color, fill_color=color, fill_opacity=1, stroke_width=0),
                  T("$", radius * 110, BG, weight=BOLD))


def envelope(color=WHITE, width=0.9, seal=False):
    box = Rectangle(width=width, height=width * 0.62, color=color, stroke_width=3, fill_color=PANEL_BG, fill_opacity=1)
    flap = VMobject(color=color, stroke_width=3).set_points_as_corners(
        [box.get_corner(UL), box.get_center() + DOWN * width * 0.05, box.get_corner(UR)])
    group = VGroup(box, flap)
    if seal:
        group.add(Circle(radius=width * 0.12, color=RED_D, fill_color=RED_D, fill_opacity=1, stroke_width=0)
                  .move_to(box.get_center() + DOWN * width * 0.05))
    return group


def search_box(width=4.0, placeholder="Search files…"):
    box = RoundedRectangle(corner_radius=0.25, width=width, height=0.5, color=GREY_B, stroke_width=2, fill_color=PANEL_BG,
                           fill_opacity=1)
    glass = VGroup(Circle(radius=0.1, color=GREY_B, stroke_width=3),
                   Line(ORIGIN, DR * 0.1, color=GREY_B, stroke_width=3)).arrange(DR, buff=-0.03)
    glass.move_to(box).align_to(box, LEFT).shift(RIGHT * 0.25)
    text = T(placeholder, 20, GREY_C).next_to(glass, RIGHT, buff=0.15)
    return VGroup(box, glass, text)


def button(text, color=BLUE_D, size=20, width=None, filled=True):
    label = T(text, size, WHITE if filled else color, weight=BOLD)
    rect = RoundedRectangle(corner_radius=0.12, width=width or label.width + 0.5, height=label.height + 0.3,
                            stroke_color=color, stroke_width=2, fill_color=color, fill_opacity=1 if filled else 0)
    label.move_to(rect)
    return VGroup(rect, label)


def panel(width, height, title=None, color=GREY_B, size=22):
    """A simplified hashbin.org UI card."""
    rect = RoundedRectangle(corner_radius=0.15, width=width, height=height, color=color, stroke_width=2,
                            fill_color=PANEL_BG, fill_opacity=1)
    group = VGroup(rect)
    group.rect = rect
    if title:
        heading = T(title, size, WHITE, weight=BOLD).next_to(rect.get_corner(UL), DR, buff=0.25)
        group.add(heading)
        group.heading = heading
    return group


def field(label, value="", width=4.0, size=18, mono=False):
    lab = T(label, size, GREY_A)
    box = RoundedRectangle(corner_radius=0.08, width=width, height=0.42, color=GREY_C, stroke_width=1.5,
                           fill_color=BG, fill_opacity=1).next_to(lab, DOWN, buff=0.08, aligned_edge=LEFT)
    text = (M if mono else T)(value, size, WHITE) if value else VMobject()
    if value:
        text.move_to(box).align_to(box, LEFT).shift(RIGHT * 0.15)
    group = VGroup(lab, box, text)
    group.box = box
    group.value = text
    return group


def rows_table(rows, col_widths, size=22, header=None, header_color=GREY_A, row_height=0.5, mono_cols=()):
    """A simple table: list of rows of strings. Returns VGroup of row VGroups (header first if given)."""
    table = VGroup()
    all_rows = ([header] if header else []) + rows
    for r, row in enumerate(all_rows):
        line = VGroup()
        x = 0
        for c, (cell, width) in enumerate(zip(row, col_widths)):
            is_header = header and r == 0
            maker = M if c in mono_cols and not is_header else T
            mob = maker(cell, size, header_color if is_header else WHITE, **({"weight": BOLD} if is_header and maker is T else {}))
            mob.move_to([x, -r * row_height, 0], aligned_edge=LEFT)
            line.add(mob)
            x += width
        table.add(line)
    if header:
        rule = Line([0, -row_height / 2, 0], [sum(col_widths) - 0.2, -row_height / 2, 0], color=GREY_C, stroke_width=1.5)
        table[0].add(rule)
    return table


def pointer(color=WHITE):
    """Mouse pointer; its tip is the mobject's top-left corner."""
    arrow = Polygon([0, 0, 0], [0, -0.5, 0], [0.13, -0.37, 0], [0.24, -0.6, 0], [0.32, -0.56, 0], [0.21, -0.33, 0],
                    [0.37, -0.33, 0], color=BG, stroke_width=2, fill_color=color, fill_opacity=1)
    return arrow


def stops_bar(active=None, done=(), labels=("Sign in", "Add funds", "Upload", "Share")):
    """The four numbered stops of U1, drawn small at the top of the frame."""
    group = VGroup()
    for i, label in enumerate(labels, start=1):
        on = i == active or i in done
        color = BLUE if i == active else (GREEN if i in done else GREY_C)
        dot = Circle(radius=0.2, color=color, stroke_width=3, fill_color=color, fill_opacity=0.9 if on else 0)
        num = T(str(i), 18, BG if on else GREY_C, weight=BOLD).move_to(dot)
        text = T(label, 18, color).next_to(dot, RIGHT, buff=0.12)
        group.add(VGroup(dot, num, text))
    group.arrange(RIGHT, buff=0.6).to_edge(UP, buff=0.25)
    return group


# ---------------------------------------------------------------------------- code

CODE_COLORS = {
    "Keyword": "#C792EA", "Name.Builtin": "#82AAFF", "Name.Function": "#82AAFF", "String": "#C3E88D",
    "Literal.String": "#C3E88D", "Comment": "#697098", "Number": "#F78C6C", "Literal.Number": "#F78C6C",
    "Operator": "#89DDFF", "Punctuation": "#89DDFF", "Name.Variable": "#FFCB6B", "Name.Attribute": "#FFCB6B",
}


def _token_color(token_type):
    name = str(token_type).replace("Token.", "")
    while name:
        if name in CODE_COLORS:
            return CODE_COLORS[name]
        name = name.rpartition(".")[0]
    return "#E8EAF0"


def _escape(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class CodeBlock(VGroup):
    """Syntax-colored code in the monospace font, one MarkupText per line, with a highlight bar."""

    def __init__(self, code, language="bash", size=22, width=None, line_spacing=0.42):
        super().__init__()
        from pygments import lex
        from pygments.lexers import get_lexer_by_name

        lexer = get_lexer_by_name(language)
        lines = [[]]
        for token_type, value in lex(code.rstrip("\n"), lexer):
            parts = value.split("\n")
            for i, part in enumerate(parts):
                if i:
                    lines.append([])
                if part:
                    lines[-1].append((token_type, part))
        self.lines = VGroup()
        for i, tokens in enumerate(lines):
            if tokens and "".join(v for _, v in tokens).strip():
                markup = "".join(f'<span foreground="{_token_color(t)}">{_escape(v)}</span>' for t, v in tokens)
                line = MarkupText(markup, font=MONO, font_size=size)
                # Keep leading spaces: pad by measuring a monospace character.
                indent = len("".join(v for _, v in tokens)) - len("".join(v for _, v in tokens).lstrip(" "))
            else:
                line = VMobject()
                indent = 0
            line.indent = indent
            self.lines.add(line)
        char_width = M("M" * 10, size).width / 10
        y = 0
        for line in self.lines:
            if len(line.points) or len(line.submobjects):
                line.move_to([line.indent * char_width, y, 0], aligned_edge=LEFT)
            else:
                line.move_to([0, y, 0])
            y -= line_spacing
        content_width = max(l.get_right()[0] for l in self.lines if len(l.submobjects)) if len(self.lines) else 1
        bg_width = width or content_width + 0.6
        self.background = RoundedRectangle(corner_radius=0.15, width=bg_width, height=-y + 0.4, stroke_color=GREY_D,
                                           stroke_width=2, fill_color="#12151C", fill_opacity=1)
        self.background.move_to([content_width / 2, (y + line_spacing) / 2, 0])
        self.background.align_to([-0.3, 0, 0], LEFT)
        self.highlight = Rectangle(width=bg_width - 0.1, height=line_spacing, stroke_width=0, fill_color=YELLOW,
                                   fill_opacity=0)
        self.highlight.move_to(self.background).match_y(self.lines[0])
        self.add(self.background, self.highlight, self.lines)
        self.line_spacing = line_spacing

    def highlight_line(self, index, opacity=0.14):
        """Animation moving the highlight bar to line `index` (0-based) and dimming the others."""
        anims = [self.highlight.animate.set_fill(opacity=opacity).match_y(self.lines[index])]
        for i, line in enumerate(self.lines):
            anims.append(line.animate.set_opacity(1 if i == index else 0.45))
        return AnimationGroup(*anims)

    def highlight_lines(self, first, last, opacity=0.14):
        top = self.lines[first].get_y()
        bottom = self.lines[last].get_y()
        anims = [self.highlight.animate.set_fill(opacity=opacity)
                 .stretch_to_fit_height(top - bottom + self.line_spacing).move_to([self.highlight.get_x(), (top + bottom) / 2, 0])]
        for i, line in enumerate(self.lines):
            anims.append(line.animate.set_opacity(1 if first <= i <= last else 0.45))
        return AnimationGroup(*anims)

    def clear_highlight(self):
        return AnimationGroup(self.highlight.animate.set_fill(opacity=0), *[l.animate.set_opacity(1) for l in self.lines])


def terminal(lines, width=7.0, size=22, title="Terminal"):
    """A terminal window with mono lines."""
    window = AppWindow(title, width=width, height=0.75 + 0.45 * max(1, len(lines)), color=GREY_B, size=18)
    texts = VGroup(*[M(line, size, GREEN_B if line.startswith("$") else WHITE) for line in lines])
    texts.arrange(DOWN, aligned_edge=LEFT, buff=0.18)
    texts.next_to(window.bar, DOWN, buff=0.2).align_to(window.frame, LEFT).shift(RIGHT * 0.3)
    window.add(texts)
    window.texts = texts
    return window


# ---------------------------------------------------------------------------- timing


def _normalize(text):
    return re.sub(r"[^a-z0-9]", "", text.lower())


def _spoken(phrase):
    for pattern, spoken in REPLACEMENTS:
        phrase = pattern.sub(spoken, phrase)
    return phrase


class Beat(Scene):
    """One narrated beat. Subclasses set EPISODE and BEAT and implement build()."""

    EPISODE = ""
    BEAT = 1

    def setup(self):
        meta_path = AUDIO_DIR / self.EPISODE / f"{self.BEAT:02d}.json"
        meta = json.loads(meta_path.read_text())
        self.narration_length = meta["duration"]
        self.words = meta["words"]
        chars = []
        owners = []
        starts = set()
        for index, word in enumerate(self.words):
            normalized = _normalize(word["w"])
            if normalized:
                starts.add(len(chars))
            for ch in normalized:
                chars.append(ch)
                owners.append(index)
        self.stream = "".join(chars)
        self.owners = owners
        self.word_starts = starts
        self.cursor = 0
        self.overruns = []
        self.wav = str(meta_path.with_suffix(".wav"))

    def construct(self):
        self.add_sound(self.wav)
        self.build()
        self.finish()

    def build(self):
        raise NotImplementedError

    # -- cues

    def cue(self, phrase, end=False):
        """Time (s) when `phrase` is spoken, searching forward from the previous cue."""
        target = _normalize(_spoken(phrase))
        position = self.stream.find(target, self.cursor)
        while position != -1 and position not in self.word_starts:
            position = self.stream.find(target, position + 1)
        if position == -1:
            print(f"CUE MISSING {type(self).__name__}: {phrase!r}")
            return self.time
        self.cursor = position + len(target)
        if end:
            return self.words[self.owners[position + len(target) - 1]]["e"]
        return self.words[self.owners[position]]["s"]

    def wait_until(self, t, label=""):
        dt = t - self.time
        if dt > 1 / 30:
            self.wait(dt)
        elif dt < -0.5:
            self.overruns.append((label, round(-dt, 2)))

    def at(self, phrase, *animations, rt=1.0, end=False, **kwargs):
        """Wait for `phrase`, then play the animations."""
        self.wait_until(self.cue(phrase, end=end), phrase)
        if animations:
            self.play(*animations, run_time=rt, **kwargs)

    def go(self, *animations, rt=1.0, **kwargs):
        self.play(*animations, run_time=rt, **kwargs)

    def click(self, mouse, target, rt=0.7):
        """Move the pointer onto `target` and flash a click there."""
        point = target.get_center() if hasattr(target, "get_center") else target
        self.play(mouse.animate.move_to(point + RIGHT * 0.15 + DOWN * 0.25), run_time=rt)
        self.play(Flash(point, color=WHITE, line_length=0.14, flash_radius=0.22, num_lines=10), run_time=0.35)

    def remaining(self):
        return self.narration_length - self.time

    def finish(self):
        self.wait_until(self.narration_length + TAIL - FADE, "end")
        mobjects = [m for m in self.mobjects if m is not None]
        if mobjects:
            self.play(*[FadeOut(m) for m in mobjects], run_time=FADE)
        else:
            self.wait(FADE)
        if self.overruns:
            print(f"OVERRUN {type(self).__name__}: {self.overruns}")

    # -- helpers

    def dim(self, *mobjects, opacity=DIM):
        return AnimationGroup(*[m.animate.set_opacity(opacity) for m in mobjects])

    def undim(self, *mobjects):
        return AnimationGroup(*[m.animate.set_opacity(1) for m in mobjects])

    def clear_all(self, rt=0.6, keep=()):
        mobjects = [m for m in self.mobjects if m not in keep]
        if mobjects:
            self.play(*[FadeOut(m) for m in mobjects], run_time=rt)
