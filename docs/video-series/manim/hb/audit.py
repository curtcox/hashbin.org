"""Layout checks for a rendered beat: text off the frame, text on text, text hidden or crossed by shapes.

Beat runs these after every play when HB_AUDIT=1 (render_videos.py --audit) and prints one LAYOUT
line per new problem. The checks use bounding boxes, so treat a finding as a frame to look at,
not proof of a bug.
"""

import numpy as np
from manim import DecimalNumber, MarkupText, Rectangle, Text, VMobject, config
from manim.utils.family import extract_mobject_family_members

EDGE_TOLERANCE = 0.03  # scene units a mobject may poke past the frame edge
TEXT_OVERLAP = 0.15    # fraction of the smaller text box shared with another text
COVER = 0.25           # fraction of a text box under a later, opaque filled shape
SPILL = 0.04           # scene units a text may stick out of the box its center sits in
VISIBLE = 0.1


def _text_leaves(mobject):
    if isinstance(mobject, (Text, MarkupText, DecimalNumber)):
        return [mobject]
    leaves = []
    for sub in mobject.submobjects:
        leaves += _text_leaves(sub)
    return leaves


def _drawn(mobject):
    """The parts of a mobject that put ink on the frame (ValueTrackers have points but draw nothing)."""
    return [m for m in mobject.family_members_with_points() if isinstance(m, VMobject)]


def _opacity(mobject):
    members = _drawn(mobject)
    if not members:
        return 0.0
    return max(max(m.get_fill_opacity(), m.get_stroke_opacity() if m.get_stroke_width() > 0 else 0) for m in members)


def _box(mobject):
    return np.array([mobject.get_left()[0], mobject.get_bottom()[1], mobject.get_right()[0], mobject.get_top()[1]])


def _area(box):
    return max(0.0, box[2] - box[0]) * max(0.0, box[3] - box[1])


def _shared(a, b):
    return _area(np.array([max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])]))


def _label(mobject):
    if isinstance(mobject, DecimalNumber):
        return f"number {mobject.get_value():g}"
    text = getattr(mobject, "original_text", None) or getattr(mobject, "text", None)
    if text:
        text = " ".join(str(text).split())
        return repr(text[:40])
    leaves = _text_leaves(mobject)
    if leaves:
        return f"{type(mobject).__name__} with {_label(leaves[0])}"
    return type(mobject).__name__


def _ignored(mobject):
    return getattr(mobject, "audit_ignore", False)


def layout_findings(scene):
    """Yield (kind, description) for the scene's current frame."""
    half_w, half_h = config.frame_width / 2, config.frame_height / 2
    top_level = [m for m in scene.mobjects if not _ignored(m)]

    # Anything visible past the frame edge.
    for mobject in top_level:
        members = [m for m in _drawn(mobject) if _opacity(m) > VISIBLE]
        if not members:
            continue
        boxes = np.array([_box(m) for m in members])
        over = {
            "left": -half_w - boxes[:, 0].min(), "right": boxes[:, 2].max() - half_w,
            "bottom": -half_h - boxes[:, 1].min(), "top": boxes[:, 3].max() - half_h,
        }
        for side, amount in over.items():
            if amount > EDGE_TOLERANCE:
                yield "OFF-FRAME", f"{_label(mobject)} past the {side} edge by {amount:.2f}"

    texts = []
    for mobject in top_level:
        for leaf in _text_leaves(mobject):
            if _opacity(leaf) > VISIBLE and _area(_box(leaf)) > 0:
                texts.append(leaf)
    boxes = [_box(t) for t in texts]

    # Text on text.
    for i in range(len(texts)):
        for j in range(i + 1, len(texts)):
            shared = _shared(boxes[i], boxes[j])
            if not shared:
                continue
            if _label(texts[i]) == _label(texts[j]) and np.allclose(boxes[i], boxes[j], atol=0.02):
                continue  # an exact copy left underneath: invisible
            if shared / min(_area(boxes[i]), _area(boxes[j])) > TEXT_OVERLAP:
                yield "TEXT-OVERLAP", f"{_label(texts[i])} and {_label(texts[j])}"

    # Shapes drawn over text, or lines through it.
    order = extract_mobject_family_members(top_level, use_z_index=True, only_those_with_points=True)
    position = {id(m): k for k, m in enumerate(order)}
    glyphs = {id(g) for t in texts for g in t.family_members_with_points()}
    ignored = {id(m) for top in scene.mobjects if _ignored(top) for m in top.get_family()}
    text_order = [min(position.get(id(g), 10**9) for g in t.family_members_with_points()) for t in texts]
    for k, shape in enumerate(order):
        if id(shape) in glyphs or id(shape) in ignored or not isinstance(shape, VMobject):
            continue
        filled = shape.get_fill_opacity() >= 0.6
        stroked = shape.get_stroke_width() > 0.5 and shape.get_stroke_opacity() > 0.3
        if not filled and not stroked:
            continue
        shape_box = _box(shape)
        if isinstance(shape, Rectangle) and stroked:
            for t, box in zip(texts, boxes):
                cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
                inside = shape_box[0] < cx < shape_box[2] and shape_box[1] < cy < shape_box[3]
                if inside and _area(shape_box) > _area(box):
                    out = max(shape_box[0] - box[0], box[2] - shape_box[2], shape_box[1] - box[1], box[3] - shape_box[3])
                    if out > SPILL:
                        yield "SPILL", f"{_label(t)} sticks out of its {type(shape).__name__} by {out:.2f}"
        samples = None
        for index, (t, box) in enumerate(zip(texts, boxes)):
            if not _shared(shape_box, box):
                continue
            if filled and k > text_order[index] and _shared(shape_box, box) / _area(box) > COVER:
                yield "COVERED", f"{_label(t)} under a filled {type(shape).__name__}"
                continue
            if stroked and not filled:
                if samples is None:
                    try:
                        samples = np.array([shape.point_from_proportion(p) for p in np.linspace(0, 1, 60)])
                    except Exception:  # degenerate path
                        samples = shape.points
                # The middle of the text box, so outlines drawn around a label don't count.
                inset_x, inset_y = (box[2] - box[0]) * 0.15, (box[3] - box[1]) * 0.25
                inside = ((samples[:, 0] > box[0] + inset_x) & (samples[:, 0] < box[2] - inset_x)
                          & (samples[:, 1] > box[1] + inset_y) & (samples[:, 1] < box[3] - inset_y))
                if inside.sum() >= 2:
                    yield "CROSSED", f"{_label(t)} crossed by a {type(shape).__name__}"
