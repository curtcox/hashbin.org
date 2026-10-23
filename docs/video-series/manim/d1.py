"""D1 · First API Calls"""

from hb.common import *

CURL = '''curl -X POST "https://hashbin.org/api/content?retention_months=12" \\
  -H "Authorization: ApiKey $HASHBIN_KEY" \\
  -H "Content-Type: application/pdf" \\
  --data-binary @slides.pdf'''

RESPONSE = '''{
  "cid": "AAAAJdwAk3…",
  "size_bytes": 2481152,
  "expires_at": "2027-10-23T…",
  "cost_cents": 1,
  "new_balance_cents": 999,
  "url": "https://256t.us/AAAAJdwAk3…"
}'''

PYTHON = '''import base64, hashlib

def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def name_256t(data: bytes) -> str:
    prefix = b64(len(data).to_bytes(6, "big"))
    body = data if len(data) <= 64 else hashlib.sha512(data).digest()
    return prefix + b64(body)'''


class Ep(Beat):
    EPISODE = "D1-first-api-calls"


class D1_Intro(Intro, Ep):
    BEAT = 0


class D1_Hook(Ep):
    BEAT = 1

    def build(self):
        page = panel(6.0, 3.6, "Upload").move_to(UP * 0.4)
        page.add(VGroup(DashedVMobject(RoundedRectangle(corner_radius=0.1, width=5.0, height=1.0, color=GREY_B), num_dashes=40),
                        button("Upload Content", BLUE_D, 18)).arrange(DOWN, buff=0.3).move_to(page.rect).shift(DOWN * 0.2))
        self.at("Everything the HashBin website does", FadeIn(page), rt=0.6)
        calls = VGroup(M("POST /api/content", 24, BLUE_B), M("GET /api/balance", 24, BLUE_B), M("GET https://256t.us/…", 24, TEAL_B))
        calls.arrange(DOWN, aligned_edge=LEFT, buff=0.35).move_to(UP * 0.4)
        arrows = VGroup(*[Arrow(LEFT * 4.6, LEFT * 3.0, color=GREY_B, buff=0).match_y(c) for c in calls])
        self.at("the same public API", FadeOut(page, scale=0.9), LaggedStart(*[FadeIn(VGroup(a, c)) for a, c in zip(arrows, calls)],
                                                                             lag_ratio=0.2), rt=1.0)
        term = terminal(["$ "], width=8.0, size=26).move_to(DOWN * 0.2)
        cursor = Rectangle(width=0.16, height=0.36, stroke_width=0, fill_color=GREEN_B, fill_opacity=1).next_to(term.texts[0], RIGHT, buff=0.08)
        self.at("smallest program", ReplacementTransform(VGroup(calls, arrows), term), rt=1.0)
        self.add(cursor)
        for _ in range(3):
            self.go(cursor.animate.set_opacity(0), rt=0.35)
            self.go(cursor.animate.set_opacity(1), rt=0.35)
        one = T("one command, plus a few lines that check the result", 24, GREY_A).next_to(term, DOWN, buff=0.4)
        self.at("a single command", FadeIn(one), rt=0.6)


class D1_TwoDomains(Ep):
    BEAT = 2

    def build(self):
        left = HashBinPanel(5.0, 3.2).move_to(LEFT * 3.6 + UP * 0.4)
        left_url = M("https://hashbin.org/api/…", 20, BLUE_B).move_to(left.label)
        left.label.become(left_url)
        left_list = T("accounts · balance · upload · metadata\nextend · delete · OAuth", 20, GREY_A).move_to(left.box).shift(DOWN * 0.2)
        right = Sandbox(5.0, 3.2).move_to(RIGHT * 3.6 + UP * 0.4)
        right.label.become(M("https://256t.us/{cid}", 20, TEAL_B).move_to(right.label))
        right_list = T("downloads only · no cookies\nany website can fetch (CORS: *)", 20, GREY_A).move_to(right.box).shift(DOWN * 0.2)
        wall = Rectangle(width=0.25, height=3.6, stroke_width=0, fill_color=GREY_C, fill_opacity=1).move_to(UP * 0.4)
        script = VGroup(M("script.sh", 20, PURPLE_B), Person(PURPLE, height=0.6)).arrange(LEFT, buff=0.2).move_to(DOWN * 2.6)
        self.at("two hosts", FadeIn(wall), FadeIn(script), rt=0.6)
        self.at("goes to the API at hashbin dot org", FadeIn(left), FadeIn(left_list), GrowArrow(Arrow(script.get_top(), left.get_bottom(), color=PURPLE_B)),
                rt=0.8)
        self.at("Downloads come from", FadeIn(right), GrowArrow(Arrow(script.get_top(), right.get_bottom(), color=TEAL_B)), rt=0.8)
        self.at("ignores cookies", FadeIn(right_list), rt=0.6)
        self.at("allows requests from any website", Indicate(right_list, color=TEAL_B, scale_factor=1.04), rt=0.8)


class D1_ThreeAuth(Ep):
    BEAT = 3

    def card(self, title, header, who, extra=None, color=GREY_B):
        rect = RoundedRectangle(corner_radius=0.15, width=4.2, height=3.4, color=color, fill_color=PANEL_BG, fill_opacity=1)
        lines = VGroup(T(title, 26, color, weight=BOLD), M(header, 15, WHITE), T(who, 18, GREY_A))
        if extra:
            lines.add(T(extra, 18, YELLOW))
        lines.arrange(DOWN, buff=0.3).move_to(rect)
        return VGroup(rect, lines)

    def build(self):
        cards = VGroup(self.card("Browser session", "Authorization: Bearer <session>", "you, in your browser"),
                       self.card("API key", "Authorization: ApiKey hb_…\nX-API-Key: hb_…", "your own scripts and servers",
                                 "full access to your account", GOLD),
                       self.card("OAuth token", "Authorization: Bearer <token>", "apps used by other people", "publish only", PURPLE_B))
        cards.arrange(RIGHT, buff=0.3).move_to(UP * 0.2)
        self.at("three ways to identify yourself", FadeIn(cards[0][0]), FadeIn(cards[1][0]), FadeIn(cards[2][0]), rt=0.6)
        self.at("browser session", FadeIn(cards[0][1]), rt=0.5)
        self.at("OAuth", FadeIn(cards[2][1]), rt=0.5)
        d2 = T("→ D2", 20, PURPLE_B).next_to(cards[2], DOWN, buff=0.15)
        self.go(FadeIn(d2), rt=0.3)
        self.at("use an API key", FadeIn(cards[1][1]), cards[0].animate.set_opacity(DIM), cards[2].animate.set_opacity(DIM),
                d2.animate.set_opacity(DIM), rt=0.8)
        self.at("It acts as your account", Circumscribe(cards[1], color=GOLD), rt=0.8)
        where = VGroup(T("✓ environment variable on your machine", 22, GREEN), T("✓ secret on your server", 22, GREEN),
                       T("✗ never in a web page others can load", 22, RED)).arrange(DOWN, aligned_edge=LEFT, buff=0.15)
        where.to_edge(DOWN, buff=0.3)
        self.at("environment variable", FadeIn(where[:2]), rt=0.6)
        self.at("never in a web page", FadeIn(where[2]), rt=0.6)


class D1_CreateKey(Ep):
    BEAT = 4

    def build(self):
        form = panel(6.0, 3.6, "Create API Key").move_to(LEFT * 3.0 + UP * 0.8)
        name = field("Key name", "laptop backups", 5.0)
        exp = field("Expiration date", "Oct 23, 2027", 5.0)
        note = T("Maximum 5 years. Default is 1 year.", 16, GREY_B)
        body = VGroup(name, exp, note).arrange(DOWN, aligned_edge=LEFT, buff=0.2).next_to(form.heading, DOWN, buff=0.3).align_to(form.heading, LEFT)
        self.at("API Keys page", FadeIn(form), rt=0.6)
        self.at("Give it a name", FadeIn(name), rt=0.5)
        self.at("an expiration date", FadeIn(exp), FadeIn(note), rt=0.6)
        key = VGroup(M("hb_", 24, GOLD), Rectangle(width=4.0, height=0.36, stroke_width=0, fill_color=GREY_C, fill_opacity=0.8))
        key.arrange(RIGHT, buff=0.05).move_to(RIGHT * 3.4 + UP * 1.6)
        warning = T("This is the only time you'll see this key.", 18, ORANGE).next_to(key, DOWN, buff=0.2)
        copy = button("Copy", GREY_D, 16).next_to(key, RIGHT, buff=0.2)
        self.at("The key is shown once", FadeIn(key), FadeIn(warning), FadeIn(copy), rt=0.8)
        term = terminal(["$ export HASHBIN_KEY=hb_…"], width=6.0, size=20).move_to(RIGHT * 3.0 + DOWN * 1.0)
        self.at("copy it into your environment", FadeIn(term), rt=0.8)
        keys = panel(6.0, 2.0, "API Keys: 1 of 25").move_to(LEFT * 3.0 + DOWN * 2.2)
        row = VGroup(T("laptop backups · expires Oct 2027", 18), button("Revoke", RED_D, 14)).arrange(RIGHT, buff=0.4)
        row.next_to(keys.heading, DOWN, buff=0.3).align_to(keys.heading, LEFT)
        keys.add(row)
        self.at("up to twenty-five keys", FadeIn(keys), rt=0.6)
        self.at("revoke any of them", Indicate(row[1], color=RED), rt=0.8)


class D1_Curl(Ep):
    BEAT = 5

    def build(self):
        code = CodeBlock(CURL, "bash", size=18).move_to(UP * 2.3)
        self.at("Here's the upload", FadeIn(code), rt=0.6)
        self.at("POST to slash API", code.highlight_line(0), rt=0.5)
        self.at("how many months to keep it", Indicate(code.lines[0], color=YELLOW, scale_factor=1.02), rt=0.6)
        self.at("authorization header", code.highlight_line(1), rt=0.5)
        self.at("The content type", code.highlight_line(2), rt=0.5)
        self.at("the body is just the file's bytes", code.highlight_line(3), rt=0.5)
        response = CodeBlock(RESPONSE, "json", size=16).next_to(code, DOWN, buff=0.3).align_to(code, LEFT)
        self.at("The response tells you everything", code.clear_highlight(), FadeIn(response, shift=DOWN * 0.2), rt=0.8)
        for i, cue in ((1, "256t string"), (2, "its size"), (3, "when it expires"), (4, "what it cost in cents"), (5, "your new balance"),
                       (6, "the download URL")):
            self.at(cue, response.highlight_line(i), rt=0.4)
        cards = VGroup()
        for code_, text in ((400, "insufficient_balance\nrequired_cents, shortfall_cents"), (413, "max_upload_bytes"),
                            (410, "deleted content can't\nbe uploaded again")):
            chip = StatusChip(code_, short=True)
            cards.add(VGroup(chip, T(text, 16, GREY_A)).arrange(DOWN, buff=0.12))
        cards.arrange(DOWN, buff=0.35).next_to(response, RIGHT, buff=0.6)
        self.at("the errors are specific", response.clear_highlight(), rt=0.4)
        self.at("Not enough balance", FadeIn(cards[0], shift=LEFT * 0.2), rt=0.5)
        self.at("Over ninety megabytes", FadeIn(cards[1], shift=LEFT * 0.2), rt=0.5)
        self.at("can't be uploaded again", FadeIn(cards[2], shift=LEFT * 0.2), rt=0.5)
        again = T("Already on HashBin? Your months are added to its expiration.", 20, BLUE_B).to_edge(DOWN, buff=0.2)
        self.at("If the file is already on HashBin", FadeIn(again), rt=0.6)


class D1_ComputeLocally(Ep):
    BEAT = 6

    def build(self):
        code = CodeBlock(PYTHON, "python", size=17).move_to(UP * 1.4 + LEFT * 1.6)
        self.at("you don't have to upload a file to know its name", FadeIn(code), rt=0.8)
        blocks = VGroup(T("8 chars: length", 20, YELLOW), T("content (≤ 64 B) or SHA-512", 20, BLUE_C), T("94 chars max", 20, WHITE))
        boxes = VGroup(*[SurroundingRectangle(b, buff=0.15, color=b.get_color(), corner_radius=0.08) for b in blocks])
        anatomy = VGroup(*[VGroup(bx, b) for bx, b in zip(boxes, blocks)]).arrange(DOWN, buff=0.3).to_edge(RIGHT, buff=0.4).shift(UP * 1.4)
        self.at("These few lines of Python", FadeIn(anatomy), rt=0.6)
        self.at("Eight characters of length", code.highlight_line(6), Indicate(anatomy[0], color=YELLOW), rt=0.6)
        self.at("Then the content itself", code.highlight_line(7), Indicate(anatomy[1], color=BLUE_C), rt=0.6)
        self.at("without padding", code.highlight_line(3), rt=0.6)
        self.go(code.highlight_line(8), Indicate(anatomy[2]), rt=0.6)
        exists = VGroup(M("GET /api/content/{cid}/exists", 20, TEAL_B), M('→ {"exists": true}', 20, GREEN)).arrange(RIGHT, buff=0.3)
        exists.to_edge(DOWN, buff=1.2)
        self.at("whether a file already exists", code.clear_highlight(), FadeIn(exists), rt=0.6)
        links = T("build links before an upload finishes", 22, GREY_A).next_to(exists, DOWN, buff=0.25)
        self.at("build links before an upload finishes", FadeIn(links), rt=0.6)
        verify = T("check downloads", 26, GREEN, weight=BOLD).next_to(links, DOWN, buff=0.2)
        self.at("check downloads", FadeIn(verify), rt=0.6)


class D1_Verify(Ep):
    BEAT = 7

    def build(self):
        get = CodeBlock('curl -sSf -o slides.pdf "https://256t.us/$CID"', "bash", size=20).move_to(UP * 2.8)
        check = CodeBlock('data = open("slides.pdf", "rb").read()\nassert name_256t(data) == CID, "content doesn\'t match its name"',
                          "python", size=18).next_to(get, DOWN, buff=0.25)
        self.at("a plain GET", FadeIn(get), rt=0.6)
        self.at("compute the name of what you received", FadeIn(check), rt=0.6)
        ok = check_mark(GREEN, 0.4).next_to(check, RIGHT, buff=0.3)
        self.at("If they match", Create(ok), rt=0.5)
        chips = VGroup()
        for code_, text in ((200, "here it is"), (404, "never stored, expired, or deleted"), (429, "too many requests: wait and retry"),
                            (451, "blocked while a dispute is reviewed")):
            chips.add(VGroup(StatusChip(code_, short=True), T(text, 20, GREY_A)).arrange(RIGHT, buff=0.3))
        chips.arrange(DOWN, aligned_edge=LEFT, buff=0.22).move_to(DOWN * 0.9 + LEFT * 2.6)
        self.at("When a download fails", FadeIn(chips[0]), rt=0.4)
        self.at("Four oh four", FadeIn(chips[1]), rt=0.4)
        self.at("Four twenty-nine", FadeIn(chips[2]), rt=0.4)
        self.at("Four fifty-one", FadeIn(chips[3]), rt=0.4)
        variants = VGroup(VGroup(M("https://256t.us/$CID.pdf", 18, TEAL_B), T("serve as this type", 18, GREY_A)).arrange(DOWN, buff=0.08),
                          VGroup(M("…?download=true", 18, TEAL_B), T("save as a file", 18, GREY_A)).arrange(DOWN, buff=0.08))
        variants.arrange(DOWN, buff=0.4).move_to(DOWN * 0.9 + RIGHT * 4.2)
        self.at("two small conveniences", rt=0.1)
        self.at("add a file extension", FadeIn(variants[0]), rt=0.5)
        self.at("download equals true", FadeIn(variants[1]), rt=0.5)


class D1_Recap(Ep):
    BEAT = 8

    def build(self):
        rows = [("GET", "/api/content/{cid}", "public metadata"), ("POST", "/api/content/{cid}/extend", "add months"),
                ("DELETE", "/api/content/{cid}", "delete your upload"), ("GET", "/api/balance", "your balance"),
                ("POST", "/api/payments/calculate", "price a size and duration"), ("GET", "/api/config", "limits, like max upload size")]
        table = rows_table([list(r) for r in rows], [1.4, 4.6, 4.0], size=20, mono_cols=(0, 1)).move_to(UP * 1.2)
        self.at("The rest of the API follows the same pattern", LaggedStart(*[FadeIn(r, shift=UP * 0.1) for r in table], lag_ratio=0.15), rt=1.6)
        docs = M("hashbin.org/docs", 22, BLUE_B).next_to(table, DOWN, buff=0.3)
        self.at("full reference is on the docs site", FadeIn(docs), rt=0.5)
        card = NextCard(("D2", "", True), ("D4", "", False)).scale(0.6).to_edge(DOWN, buff=0.25)
        self.at("never ask them for theirs", FadeIn(card), rt=0.8)
