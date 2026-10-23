"""U3 · The Life of a File"""

from hb.common import *


class Ep(Beat):
    EPISODE = "U3-the-life-of-a-file"


def chip_swap(chip, code):
    new = StatusChip(code).move_to(chip)
    return Transform(chip, new)


class U3_Clock(Ep):
    BEAT = 1

    def build(self):
        timeline = Timeline(14, 11, size=16).move_to(DOWN * 1.2)
        expiry = timeline.expiry(12, height=2.2)
        file = FileIcon(width=0.7, height=0.9).move_to(timeline.x(0) + UP * 1.0)
        head = timeline.playhead(0, height=1.8)
        chip = StatusChip(200).next_to(file, UP, buff=0.3)
        self.at("Every file on HashBin has a clock", FadeIn(timeline), FadeIn(file), FadeIn(head), rt=0.8)
        self.at("sets an expiration date", Create(expiry), FadeIn(chip), rt=0.8)
        group = VGroup(file, chip)
        self.at("Let's follow one file", head.animate.move_to(timeline.x(11.7), aligned_edge=DOWN),
                group.animate.shift(timeline.x(11.2) - timeline.x(0)), rate_func=linear, rt=4.0)
        title = title_text("The Life of a File", 52).to_edge(UP, buff=0.6)
        self.go(Write(title), rt=1.0)


class U3_ExpirationDate(Ep):
    BEAT = 2

    def build(self):
        months = ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]
        timeline = Timeline(12, 10, label_fn=lambda m: months[m], size=16).move_to(UP * 1.0)
        self.go(FadeIn(timeline), rt=0.6)
        stamp = T("March 31", 22, BLUE_B).next_to(timeline.x(0), UP, buff=0.5)
        self.at("calendar months from the day you upload", FadeIn(stamp, shift=DOWN * 0.3), rt=0.6)
        expiry = timeline.expiry(12, height=1.0, label="March 31, next year", size=18)
        self.at("same date next year", Create(expiry), rt=1.0)

        small = Timeline(2, 4, label_fn=lambda m: ["Jan 31", "Feb 28", "Mar 31"][m], size=16).move_to(DOWN * 1.6 + LEFT * 3.0)
        start = T("Jan 31 + 1 month", 20, BLUE_B).next_to(small.x(0), UP, buff=0.3)
        self.at("one month after January thirty-first", FadeIn(small), FadeIn(start), rt=0.8)
        line = small.expiry(1, height=0.8, label="Feb 28 (or 29)", size=18)
        self.at("last day of the shorter month", Create(line), rt=0.8)
        note = T("months that are shorter\nend on their last day", 20, GREY_A).next_to(small, DOWN, buff=0.5)
        self.go(FadeIn(note), rt=0.5)

        uploads = panel(5.0, 2.6, "My Uploads").move_to(RIGHT * 3.4 + DOWN * 1.8)
        rows = VGroup(T("slides.pdf · 25 MB · Expires in 11 months", 17), T("photo.jpg · 8 MB · Expires in 11 months", 17),
                      T("talk.mp4 · 90 MB · Expires in 2 months", 17)).arrange(DOWN, aligned_edge=LEFT, buff=0.25)
        rows.next_to(uploads.heading, DOWN, buff=0.25).align_to(uploads.heading, LEFT)
        uploads.add(rows)
        self.at("on the file's content page", Indicate(expiry), rt=0.6)
        self.at("listed under My Uploads", FadeIn(uploads, shift=LEFT * 0.3), rt=0.8)


class U3_Extend(Ep):
    BEAT = 3

    def build(self):
        timeline = Timeline(48, 11, label_every=6, size=16).move_to(UP * 2.0)
        expiry = timeline.expiry(12, height=1.0, size=18)
        head = timeline.playhead(3, height=0.8)
        self.go(FadeIn(timeline), FadeIn(expiry), FadeIn(head), rt=0.6)
        card = panel(5.4, 3.4, "Extend Retention").move_to(LEFT * 3.2 + DOWN * 1.4)
        options = VGroup(*[button(f"{m}", GREY_D, 18) for m in (1, 3, 6, 12, 24, 60)]).arrange(RIGHT, buff=0.12)
        unit = T("months", 18, GREY_A)
        row = VGroup(options, unit).arrange(RIGHT, buff=0.2).next_to(card.heading, DOWN, buff=0.35).align_to(card.heading, LEFT)
        quote = T("Price: $0.01", 22, GOLD)
        new_exp = T("New expiration: in 36 months", 22)
        info = VGroup(quote, new_exp).arrange(DOWN, aligned_edge=LEFT, buff=0.15).next_to(row, DOWN, buff=0.35).align_to(row, LEFT)
        card.add(row)
        self.at("use Extend Retention", FadeIn(card), rt=0.8)
        pick = SurroundingRectangle(options[4], color=BLUE, buff=0.05, corner_radius=0.1)
        self.at("Choose how many months", Create(pick), rt=0.6)
        self.at("see the price and the new expiration date", FadeIn(info), rt=0.6)
        dialog = panel(5.2, 1.5).move_to(RIGHT * 3.6 + DOWN * 1.4)
        dialog.add(T("Extend by 24 months for $0.01?\nPayments are not refundable.", 20).move_to(dialog.rect).shift(UP * 0.15),
                   button("OK", BLUE_D, 18).move_to(dialog.rect).shift(DOWN * 0.45 + RIGHT * 1.8))
        self.go(FadeIn(dialog), rt=0.5)
        brace = BraceBetweenPoints(timeline.x(12) + DOWN * 0.45, timeline.x(36) + DOWN * 0.45, DOWN, color=BLUE_B)
        brace_label = T("+24 months from the current expiration", 18, BLUE_B).next_to(brace, DOWN, buff=0.05)
        self.at("added to the end of the time", expiry.animate.shift(timeline.x(36) - timeline.x(12)), GrowFromCenter(brace),
                FadeIn(brace_label), rt=1.4)
        self.at("extending early doesn't waste anything", Indicate(head), rt=0.8)

        self.at("There's a second way", FadeOut(VGroup(card, info, pick, dialog, brace, brace_label)), rt=0.5)
        inset = panel(5.4, 2.0, "Upload").move_to(DOWN * 1.4)
        again = VGroup(FileIcon(width=0.4, height=0.5, lines=False), T("same file again · 1 year", 22)).arrange(RIGHT, buff=0.3)
        again.move_to(inset.rect).shift(DOWN * 0.2)
        inset.add(again)
        self.go(FadeIn(inset), rt=0.6)
        self.at("adds the months you choose", expiry.animate.shift(timeline.x(48) - timeline.x(36)), rt=1.2)
        plus = T("+12", 20, BLUE_B).next_to(expiry, LEFT, buff=0.15).shift(DOWN * 0.4)
        self.go(FadeIn(plus), rt=0.4)


class U3_Donations(Ep):
    BEAT = 4

    def build(self):
        page = panel(6.2, 3.8, "Keep this content available").move_to(LEFT * 3.2 + DOWN * 0.3)
        text = T("Anyone can pay to extend this content's\nretention. No account needed.", 20, GREY_A)
        text.next_to(page.heading, DOWN, buff=0.25).align_to(page.heading, LEFT)
        amount = field("Amount ($, minimum 1.00)", "", 3.0).next_to(text, DOWN, buff=0.3).align_to(text, LEFT)
        page.add(text, amount)
        reader = Person(GREEN, label="a reader").next_to(page, UP, buff=0.2).align_to(page, LEFT)
        self.at("Extending a file isn't limited", FadeIn(page), rt=0.6)
        self.at("Anyone can do it", FadeIn(reader), rt=0.5)
        name = T("a donation", 32, GREEN, weight=BOLD).next_to(reader, RIGHT, buff=0.5)
        self.at("It's called a donation", Write(name), rt=0.6)
        typed = M("1.00", 22).move_to(amount.box).align_to(amount.box, LEFT).shift(RIGHT * 0.15)
        self.at("at least a dollar", AddTextLetterByLetter(typed), rt=0.6)
        preview = T("90 MB file: +31 years 7 months", 24, GOLD).next_to(amount, DOWN, buff=0.35).align_to(amount, LEFT)
        self.at("how much time that buys", FadeIn(preview), rt=0.6)
        self.at("a dollar goes further for smaller files", Indicate(preview, color=GOLD), rt=0.6)
        self.at("more than thirty-one years", Circumscribe(preview, color=GOLD), rt=0.8)
        capped = VGroup(T("10 MB file: +100 years", 24, GOLD), T("(cap)", 20, RED)).arrange(RIGHT, buff=0.2).move_to(preview, aligned_edge=LEFT)
        self.at("ten-megabyte file", Transform(preview, capped[0]), rt=0.6)
        self.at("capped at a hundred years", FadeIn(capped[1]), rt=0.5)

        timeline = Timeline(100, 6, label_every=25, label_fn=lambda m: f"{m}y", size=14).move_to(RIGHT * 3.6 + UP * 0.8)
        expiry = timeline.expiry(5, height=0.8, size=16)
        self.go(FadeIn(timeline), FadeIn(expiry), rt=0.5)
        checkout = panel(3.0, 1.6, "Pay by card").move_to(RIGHT * 3.6 + DOWN * 1.4)
        checkout.add(button("Pay $1.00", BLUE_D, 18).move_to(checkout.rect).shift(DOWN * 0.25))
        self.go(FadeIn(checkout), rt=0.4)
        self.go(expiry.animate.shift(timeline.x(36) - timeline.x(5)), rt=1.0)

        uploader = Person(BLUE, height=0.6).move_to(RIGHT * 6.2 + UP * 2.6)
        zz = T("z z", 22, GREY_B).next_to(uploader, UR, buff=0.02)
        self.at("doesn't depend on the original uploader", FadeOut(checkout), FadeIn(uploader), FadeIn(zz), rt=0.8)
        helpers = VGroup(*[Person(GREEN, height=0.55) for _ in range(3)]).arrange(RIGHT, buff=0.5).move_to(RIGHT * 3.6 + DOWN * 1.2)
        self.at("If readers care about it", LaggedStart(*[FadeIn(h, shift=UP * 0.2) for h in helpers], lag_ratio=0.3), rt=0.8)
        self.at("keep it alive themselves", expiry.animate.shift(timeline.x(80) - timeline.x(36)), rt=1.4)


class U3_Delete(Ep):
    BEAT = 5

    def build(self):
        bins = Bins(3, 4, width=0.85, height=0.45).move_to(LEFT * 3.8 + UP * 0.8)
        drawer = bins.drawer(5)
        file = FileIcon(width=0.28, height=0.36, lines=False).move_to(drawer[0])
        chip = StatusChip(200).next_to(bins, UP, buff=0.3)
        self.go(FadeIn(bins), FadeIn(file), FadeIn(chip), rt=0.6)
        card = panel(4.6, 1.8, "Delete").move_to(RIGHT * 3.4 + UP * 1.8)
        card.add(T("Delete this upload permanently?", 20, GREY_A).next_to(card.heading, DOWN, buff=0.2).align_to(card.heading, LEFT),
                 button("Delete", RED_D, 18).move_to(card.rect).shift(DOWN * 0.45 + RIGHT * 1.4))
        self.at("delete it from its detail page", FadeIn(card), rt=0.6)
        owner = T("only the uploading account", 20, BLUE_B).next_to(card, DOWN, buff=0.2)
        self.at("Only the account that uploaded", FadeIn(owner), rt=0.5)

        x = cross_mark(RED, 0.5).move_to(drawer)
        self.at("The link stops working", Create(x), chip_swap(chip, 404), rt=0.8)
        refund = T("no refund for unused months", 22, GOLD).move_to(RIGHT * 3.4 + DOWN * 0.2)
        self.at("aren't refunded", FadeOut(card), FadeOut(owner), FadeIn(refund), rt=0.6)
        records = panel(6.0, 1.4, "Public records").move_to(RIGHT * 3.0 + DOWN * 1.8)
        row = VGroup(M("AAAAAABB…", 18, YELLOW), T("deleted by uploader · Oct 23", 20)).arrange(RIGHT, buff=0.3)
        row.next_to(records.heading, DOWN, buff=0.2).align_to(records.heading, LEFT)
        self.at("public records page", FadeIn(records), rt=0.5)
        self.go(FadeIn(row, shift=LEFT * 0.3), rt=0.5)
        not_you = T("not who you are", 18, GREY_B).next_to(records, DOWN, buff=0.15)
        self.at("but not with who you are", FadeIn(not_you), rt=0.5)
        skip = T("within about a day", 20, GREY_A).next_to(bins, DOWN, buff=0.3)
        self.go(FadeIn(skip), FadeOut(file), rt=0.6)
        again = FileIcon(width=0.4, height=0.5, lines=False).move_to(LEFT * 6.4 + DOWN * 2.4)
        gone = StatusChip(410).move_to(LEFT * 3.8 + DOWN * 2.4)
        self.at("can't be uploaded to HashBin again", FadeIn(again), rt=0.4)
        self.go(again.animate.move_to(drawer), rt=0.6)
        self.go(again.animate.move_to(LEFT * 6.4 + DOWN * 2.4), FadeIn(gone, scale=0.6), rt=0.6)

        self.at("reach into other people's computers", FadeOut(VGroup(refund, records, row, not_you)), rt=0.5)
        laptop = VGroup(RoundedRectangle(corner_radius=0.08, width=2.0, height=1.3, color=GREY_B),
                        Line(LEFT * 1.25, RIGHT * 1.25, color=GREY_B, stroke_width=5).shift(DOWN * 0.75))
        laptop.move_to(RIGHT * 3.4 + DOWN * 0.6)
        copy = FileIcon(width=0.4, height=0.5).move_to(laptop[0])
        self.go(FadeIn(laptop), rt=0.5)
        self.at("still has their copy", FadeIn(copy, scale=0.5), rt=0.6)


class U3_Expiry(Ep):
    BEAT = 6

    def build(self):
        timeline = Timeline(14, 10, size=16).move_to(UP * 1.4)
        expiry = timeline.expiry(12, height=1.4)
        head = timeline.playhead(11, height=1.2)
        file = FileIcon(width=0.5, height=0.65).move_to(timeline.x(10) + UP * 0.6)
        chip = StatusChip(200).next_to(file, UP, buff=0.25)
        self.go(FadeIn(timeline), FadeIn(expiry), FadeIn(head), FadeIn(file), FadeIn(chip), rt=0.6)
        self.at("reaches its expiration date", head.animate.move_to(timeline.x(12), aligned_edge=DOWN), rt=1.2)
        grace = T("no grace period", 22, RED).next_to(expiry, RIGHT, buff=0.3)
        self.at("no grace period", FadeIn(grace), rt=0.5)
        clock = VGroup(clock_icon(WHITE, 0.4, 2), T("nightly", 20, GREY_A)).arrange(DOWN, buff=0.1).move_to(LEFT * 4.6 + DOWN * 0.8)
        self.at("A job runs every night", FadeIn(clock), Rotate(clock[0][3], -TAU, about_point=clock[0][0].get_center()), rt=1.2)
        self.at("deletes them", FadeOut(file), chip_swap(chip, 404), rt=0.8)
        record = VGroup(M("AAAAAABB…", 18, YELLOW), T("expired", 20)).arrange(RIGHT, buff=0.3).move_to(DOWN * 0.8 + RIGHT * 1.6)
        self.at("notes that it expired", FadeIn(record, shift=LEFT * 0.2), rt=0.6)

        tiny = Timeline(14, 10, tick_labels=False).move_to(DOWN * 2.6)
        string = S256(name_256t(b"see you at 6"), 20).next_to(tiny.x(0), UP, buff=0.3).align_to(tiny, LEFT)
        inf = T("∞", 48, GREEN).next_to(tiny, RIGHT, buff=0.2)
        self.at("the tiny files", FadeIn(tiny), FadeIn(string), rt=0.6)
        self.at("don't have an expiration date at all", FadeIn(inf, scale=0.5), rt=0.6)


class U3_Recap(Ep):
    BEAT = 7

    def build(self):
        timeline = Timeline(40, 12, tick_labels=False).move_to(UP * 0.6)
        expiry = timeline.expiry(8, height=1.2, size=18)
        chip = StatusChip(200, short=True).next_to(timeline.x(0), UP, buff=0.4)
        self.go(FadeIn(timeline), FadeIn(expiry), FadeIn(chip), rt=0.6)
        labels = VGroup()
        for cue, month, text in (("by extending it", 16, "extended"), ("re-uploading it", 24, "re-uploaded"),
                                 ("someone else donating", 34, "donation")):
            label = T(text, 18, BLUE_B).next_to(timeline.x(month), DOWN, buff=0.3)
            self.at(cue, expiry.animate.move_to(timeline.x(month), aligned_edge=DOWN).shift(DOWN * 0.15), FadeIn(label), rt=0.7)
            labels.add(label)
        end = VGroup(StatusChip(404, short=True), T("expired or deleted", 18, GREY_B)).arrange(DOWN, buff=0.1).next_to(expiry, RIGHT, buff=0.2)
        self.at("Deleting it or letting it run out", FadeIn(end), rt=0.6)
        seg = Line(timeline.x(10), timeline.x(13), color=RED, stroke_width=12)
        seg_label = T("451 while a report is reviewed", 18, RED).next_to(seg, UP, buff=0.2)
        self.at("if someone reports it", Create(seg), FadeIn(seg_label), rt=0.8)
        card = NextCard(("U4", "", True), ("X1", "", False)).scale(0.65).to_edge(DOWN, buff=0.3)
        self.at("who can actually see", FadeIn(card), rt=0.8)
