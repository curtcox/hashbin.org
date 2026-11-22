"""Icons, props, UI pieces and highlighted code for the HashBin scenes. Re-exported by hb.common."""

from .base import *  # noqa: F403


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
    arrow.audit_ignore = True  # it is meant to sit on what it clicks
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
