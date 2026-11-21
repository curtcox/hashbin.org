"""Shared visual vocabulary and narration timing for the HashBin series.

Every element in the README's "Visual vocabulary" table has a builder here, so the same thing looks
the same in every episode (icons, props and code live in hb/props.py and are re-exported). Scenes subclass Beat, which plays the beat's Kokoro narration and lets
animations wait for a phrase: self.at("the phrase", Create(x)).
"""

from .base import *  # noqa: F403
from .props import *  # noqa: F403


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

    def playhead(self, month=0, label="today", height=1.2, side=UP):
        tri = Triangle(color=WHITE, fill_opacity=1).scale(0.09).rotate(PI)
        line = DashedLine(ORIGIN, UP * height, color=WHITE, stroke_width=2)
        tri.next_to(line, UP, buff=0)
        text = T(label, 18, WHITE).next_to(tri, side, buff=0.05 if side is UP else 0.1)
        head = VGroup(line, tri, text)
        head.shift(self.x(month) - line.get_bottom())
        return head

    def head_to(self, head, month):
        """Move a playhead so its line, not the middle of its label, stands on `month`."""
        return head.animate.shift(self.x(month) - head[0].get_bottom())


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


def episode_code(episode):
    """'U1-your-first-upload' -> 'U1'"""
    return episode.split("-")[0].upper()


def NextCard(*items, heading="Next"):
    """NEXT CARD: items are (code, tag, big)."""
    thumbs = VGroup(*[thumbnail(code, tag, big) for code, tag, big in items]).arrange(RIGHT, buff=1.0, aligned_edge=DOWN)
    head = T(heading, 30, GREY_A).next_to(thumbs, UP, buff=0.5)
    return VGroup(head, thumbs).move_to(ORIGIN)


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
        self.layout_seen = set()
        self.wav = str(meta_path.with_suffix(".wav"))

    def construct(self):
        self.add_sound(self.wav)
        self.build()
        self.finish()

    def build(self):
        raise NotImplementedError

    def play(self, *args, **kwargs):
        super().play(*args, **kwargs)
        if AUDIT:
            for kind, description in layout_findings(self):
                if (kind, description) not in self.layout_seen:
                    self.layout_seen.add((kind, description))
                    print(f"LAYOUT {type(self).__name__} t={self.time:.1f} {kind}: {description}", flush=True)

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


class Intro(Beat):
    """A silent title card before an episode's first beat: the HashBin logo, the episode, and the 256t mark.

    Each episode module declares one with BEAT = 0, so the renderer puts it first.
    """

    LENGTH = 3.6

    def setup(self):
        self.layout_seen = set()

    def construct(self):
        code = episode_code(self.EPISODE)
        mark = logo("hashbin", 4.2)
        number = T(code, 72, TRACK_COLORS.get(code[0], WHITE), weight=BOLD)
        name = T(EPISODES[code], 44, WHITE, weight=BOLD)
        if name.width > 6.4:
            name.scale_to_fit_width(6.4)
        heading = VGroup(number, name).arrange(DOWN, aligned_edge=LEFT, buff=0.3)
        heading.next_to(mark, RIGHT, buff=0.9).align_to(mark, UP).shift(DOWN * 0.9)
        standard = VGroup(T("Every link is a 256t string,", 20, GREY_A), T("an open standard:", 20, GREY_A))
        standard.arrange(DOWN, aligned_edge=LEFT, buff=0.08)
        standard[1].add(M("256t.org", 20, TEAL_B).next_to(standard[1], RIGHT, buff=0.12))
        t256 = logo("256t", 0.9)
        footer = Group(t256, standard).arrange(RIGHT, buff=0.3).next_to(heading, DOWN, buff=0.8).align_to(heading, LEFT)
        Group(mark, heading, footer).move_to(ORIGIN)

        self.play(FadeIn(mark, scale=0.92), run_time=0.8)
        self.play(FadeIn(heading, shift=RIGHT * 0.3), run_time=0.6)
        self.play(FadeIn(footer), run_time=0.5)
        self.wait(self.LENGTH - 0.8 - 0.6 - 0.5 - FADE)
        self.play(FadeOut(Group(mark, heading, footer)), run_time=FADE)
