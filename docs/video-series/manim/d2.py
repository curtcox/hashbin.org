"""D2 · Letting Apps Publish: OAuth and PKCE"""

import random

from hb.common import *

SDK = '''import { HashBinClient } from "https://hashbin.org/sdk/hashbin.js";

const hb = new HashBinClient({
  clientId: "YOUR_CLIENT_ID",
  redirectUri: "https://you.github.io/notes/",
  baseUrl: "https://hashbin.org",
});

if (new URLSearchParams(location.search).has("code")) await hb.handleCallback();

if (!hb.getTokens()) await hb.authorize({ scopes: ["content:write"] });
else console.log(await hb.publish("Hello, HashBin!", { contentType: "text/plain" }));'''


class Ep(Beat):
    EPISODE = "D2-oauth-and-pkce"


def ticket(text="code", timer="10 min", color=GOLD):
    body = RoundedRectangle(corner_radius=0.08, width=1.3, height=0.6, color=color, fill_color=PANEL_BG, fill_opacity=1)
    label = M(text, 16, color).move_to(body).shift(UP * 0.08)
    sub = T(timer, 12, GREY_B).next_to(label, DOWN, buff=0.03)
    return VGroup(body, label, sub)


def lanes():
    names = [("App (Notes)", PURPLE_B), ("User's browser", BLUE), ("hashbin.org", BLUE_D)]
    group = VGroup()
    for i, (name, color) in enumerate(names):
        x = -4.6 + i * 4.6
        head = T(name, 22, color, weight=BOLD).move_to([x, 3.2, 0])
        line = DashedLine([x, 2.9, 0], [x, -3.6, 0], color=GREY_D)
        group.add(VGroup(head, line))
    return group


class D2_Problem(Ep):
    BEAT = 1

    def build(self):
        dev = Person(PURPLE, label="developer").move_to(LEFT * 5.6 + UP * 1.2)
        app = AppWindow("Notes", 4.0, 2.6).move_to(LEFT * 1.6 + UP * 1.2)
        save = button("Save to HashBin", PURPLE_B, 18).move_to(app.frame).shift(DOWN * 0.6)
        self.at("Suppose you're building a notes app", FadeIn(dev), FadeIn(app), rt=0.8)
        users = VGroup(*[Person(BLUE, height=0.55) for _ in range(5)]).arrange(RIGHT, buff=0.3).move_to(RIGHT * 4.2 + UP * 1.2)
        self.at("a button that saves a note", FadeIn(save), FadeIn(users), rt=0.6)
        balance = T("paid from their own balance", 20, GOLD).next_to(users, DOWN, buff=0.2)
        self.at("paid from their own balance", FadeIn(balance), rt=0.5)

        pw = field("Your HashBin password", "", 3.4).move_to(LEFT * 3.6 + DOWN * 1.8)
        self.at("You can't ask for their HashBin password", FadeIn(pw), rt=0.5)
        shatter = T("HashBin doesn't have passwords.", 18, RED).next_to(pw, DOWN, buff=0.15)
        self.go(Create(cross_mark(RED, 0.6).move_to(pw.box)), FadeIn(shatter), rt=0.6)
        key = field("Paste your API key", "hb_…", 3.4).move_to(RIGHT * 0.6 + DOWN * 1.4)
        self.at("paste in an API key", FadeIn(key), rt=0.5)
        harms = VGroup(T("delete all your files", 18, RED), T("spend your whole balance", 18, RED), T("act as you, everywhere", 18, RED))
        harms.arrange(DOWN, aligned_edge=LEFT, buff=0.15).next_to(key, RIGHT, buff=0.6)
        arrows = VGroup(*[Arrow(key.box.get_right(), h.get_left(), buff=0.1, color=RED, stroke_width=2) for h in harms])
        self.at("It can delete everything", LaggedStart(*[GrowArrow(a) for a in arrows], lag_ratio=0.2), FadeIn(harms), rt=1.0)
        ext = VGroup(Square(0.5, color=ORANGE), T("ext", 14, ORANGE)).next_to(key, DOWN, buff=0.4)
        ext[1].move_to(ext[0])
        self.at("anything else running in that page could read it", FadeIn(ext), ext.animate.shift(UP * 0.2), rt=0.8)
        self.go(Create(cross_mark(RED, 0.6).move_to(key.box)), rt=0.4)
        self.at("revoke that key", Indicate(key, color=RED), rt=0.6)
        cap = caption("We need a key that only opens one door.", size=28, color=YELLOW)
        self.at("only opens one door", FadeIn(cap), rt=0.8)
        oauth = T("OAuth", 40, PURPLE_B, weight=BOLD).move_to(UP * 3.3)
        self.at("OAuth is for", FadeIn(oauth, scale=0.7), rt=0.6)


class D2_Register(Ep):
    BEAT = 2

    def build(self):
        page = panel(7.2, 4.6, "/developers · Register an app").move_to(LEFT * 2.6 + UP * 0.2)
        name = field("Application name", "Notes", 6.2)
        uris = VGroup(T("Redirect URIs (one per line)", 18, GREY_A),
                      VGroup(M("https://notes.example/callback", 18), M("org.example.notes://oauth", 18)).arrange(DOWN, aligned_edge=LEFT, buff=0.12))
        uris.arrange(DOWN, aligned_edge=LEFT, buff=0.12)
        frame = SurroundingRectangle(uris[1], color=GREY_C, buff=0.15, corner_radius=0.08)
        body = VGroup(name, VGroup(uris, frame)).arrange(DOWN, aligned_edge=LEFT, buff=0.35).next_to(page.heading, DOWN, buff=0.3).align_to(page.heading, LEFT)
        self.at("register your app on the developers page", FadeIn(page), rt=0.6)
        self.at("takes effect immediately", Indicate(page.heading, color=GREEN), rt=0.5)
        self.at("a name, which users will see", FadeIn(name), rt=0.5)
        self.at("redirect URIs", FadeIn(VGroup(uris, frame)), rt=0.6)
        chips = VGroup(*[T(t, 18, c) for t, c in (("https ✓", GREEN), ("http://localhost for development ✓", GREEN),
                                                  ("your own scheme for phone apps ✓", GREEN), ("no #fragment", ORANGE), ("up to 10", GREY_A))])
        chips.arrange(DOWN, aligned_edge=LEFT, buff=0.18).move_to(RIGHT * 4.2 + UP * 1.0)
        self.at("HTTPS, or localhost", FadeIn(chips[:2]), rt=0.6)
        self.at("their own URL scheme", FadeIn(chips[2:]), rt=0.6)
        cid = VGroup(M("client_id:", 20, GREY_A), M("app_7Kq2…", 22, PURPLE_B)).arrange(RIGHT, buff=0.2)
        secret = VGroup(M("client_secret:", 20, GREY_D), M("••••••••", 22, GREY_D), T("not needed for browser or phone apps", 16, GREY_B)).arrange(RIGHT, buff=0.2)
        creds = VGroup(cid, secret).arrange(DOWN, aligned_edge=LEFT, buff=0.2).to_edge(DOWN, buff=0.4)
        self.at("client ID", FadeIn(cid), rt=0.6)
        self.at("client secret", FadeIn(secret), rt=0.6)
        self.at("doesn't use one", Indicate(secret[2], color=GREY_A), rt=0.6)


class D2_Flow(Ep):
    BEAT = 3

    def build(self):
        lane = lanes()
        self.go(FadeIn(lane), rt=0.6)
        xs = [-4.6, 0, 4.6]
        a1 = Arrow([xs[0], 2.5, 0], [xs[1], 2.5, 0], buff=0.1, color=PURPLE_B)
        a1_label = M("→ hashbin.org/oauth/authorize", 15, PURPLE_B).next_to(a1, UP, buff=0.02)
        self.at("sends their browser to HashBin's authorize page", GrowArrow(a1), FadeIn(a1_label), rt=0.8)
        params = VGroup(*[M(p, 15) for p in ("client_id", "redirect_uri", "scope=content:write balance:read", "state",
                                             "code_challenge  ?", "code_challenge_method=S256")])
        params.arrange(DOWN, aligned_edge=LEFT, buff=0.06).next_to(a1, DOWN, buff=0.1).align_to(a1, LEFT)
        params[4].set_opacity(0.4)
        for i, cue in enumerate(("your client ID", "where to come back to", "which permissions you want", "a random value called state",
                                 "code challenge")):
            self.at(cue, FadeIn(params[i]), rt=0.35)
        self.go(FadeIn(params[5]), rt=0.3)

        a2 = Arrow([xs[1], 0.5, 0], [xs[2], 0.5, 0], buff=0.1, color=BLUE)
        self.at("makes sure the user is signed in", GrowArrow(a2), rt=0.6)
        consent = panel(4.0, 2.4).move_to([xs[2] - 0.2, -0.9, 0])
        consent.add(VGroup(T("Notes wants to use your\nHashBin account.", 16, WHITE), T("· publish content (billed to you)\n· see your balance", 14, GREY_A),
                           T("Monthly spending limit: $2.00", 14, GOLD),
                           VGroup(button("Approve", GREEN_D, 14), button("Deny", GREY_D, 14)).arrange(RIGHT, buff=0.2)).arrange(DOWN, buff=0.12)
                    .move_to(consent.rect))
        self.at("consent screen", FadeIn(consent), rt=0.6)
        self.at("monthly spending limit", Indicate(consent[-1][2], color=GOLD), rt=0.6)

        a3 = Arrow([xs[2], -2.3, 0], [xs[0], -2.3, 0], buff=0.1, color=GOLD)
        redirect = M("notes.example/callback?code=…&state=…", 15, GOLD).next_to(a3, UP, buff=0.05)
        code = ticket().move_to([xs[0] + 1.0, -2.9, 0])
        self.at("If they approve", Indicate(consent[-1][3][0], color=GREEN), rt=0.4)
        self.go(GrowArrow(a3), FadeIn(redirect), rt=0.6)
        self.at("authorization code", FadeIn(code, scale=0.6), rt=0.5)
        self.at("claim ticket", Wiggle(code), rt=0.6)
        self.at("only good for ten minutes", Indicate(code[2], color=YELLOW, scale_factor=1.6), rt=0.6)

        self.at("token endpoint", FadeOut(VGroup(params, consent, a1_label, redirect)), rt=0.4)
        a4 = Arrow([xs[0], -0.2, 0], [xs[2], -0.2, 0], buff=0.1, color=GOLD)
        a4_label = M("POST /oauth/token  (back channel)", 15, GOLD).next_to(a4, UP, buff=0.05)
        self.go(GrowArrow(a4), FadeIn(a4_label), code.animate.move_to([xs[2] - 0.8, -0.8, 0]), rt=0.8)
        access = ticket("access", "1 hour", GREEN).move_to([xs[0] + 0.9, 1.6, 0])
        refresh = ticket("refresh", "30 days", BLUE_B).next_to(access, RIGHT, buff=0.2)
        self.at("an access token", FadeOut(code), FadeIn(access, shift=LEFT), rt=0.6)
        self.at("a refresh token", FadeIn(refresh, shift=LEFT), rt=0.6)
        a5 = Arrow([xs[0], -1.4, 0], [xs[2], -1.4, 0], buff=0.1, color=GREEN)
        a5_label = M("POST /api/content  Authorization: Bearer <access>", 14, GREEN).next_to(a5, DOWN, buff=0.05)
        self.at("Now your app can publish", GrowArrow(a5), FadeIn(a5_label), rt=0.8)
        file = FileIcon(width=0.3, height=0.4, lines=False).move_to([xs[2] + 1.2, -1.4, 0])
        self.go(FadeIn(file, shift=RIGHT * 0.3), rt=0.4)
        state = T("state must match what you sent", 20, YELLOW).move_to([0, -3.0, 0])
        self.at("The state value", FadeIn(state), rt=0.6)
        self.at("ignore the response", Indicate(state, color=YELLOW), rt=0.6)


class D2_Interception(Ep):
    BEAT = 4

    def build(self):
        url = M("org.example.notes://oauth?code=Zx81…&state=…", 22, GOLD).to_edge(UP, buff=0.6)
        self.at("weak spot", FadeIn(url), rt=0.6)
        self.at("travels through the browser", Indicate(url[24:34], color=YELLOW, scale_factor=1.2), rt=0.6)
        leaks = VGroup(panel(3.4, 1.4, "Browser history"), panel(3.4, 1.4, "Server log"),
                       panel(3.4, 1.4, "Phone: another app"))
        for leak in leaks:
            leak.add(M("…?code=Zx81…", 15, GOLD).move_to(leak.rect).shift(DOWN * 0.2))
        leaks.arrange(RIGHT, buff=0.4).move_to(UP * 1.0)
        self.at("in history", FadeIn(leaks[0]), rt=0.4)
        self.at("in logs", FadeIn(leaks[1]), rt=0.4)
        evil = AppWindow("malicious app", 2.0, 1.6, phone=True, color=RED, size=14).move_to(DOWN * 1.6 + RIGHT * 3.0)
        self.at("malicious app can register", FadeIn(leaks[2]), FadeIn(evil), rt=0.6)
        endpoint = HashBinPanel(3.0, 1.4, "POST /oauth/token", 18).move_to(DOWN * 1.8 + LEFT * 3.0)
        good = AppWindow("Notes", 1.6, 1.4, phone=True, size=14).move_to(DOWN * 1.6 + LEFT * 0.4)
        self.at("exchange it for tokens", FadeIn(endpoint), FadeIn(good), rt=0.6)
        r1 = Arrow(evil.get_left(), endpoint.get_right(), buff=0.1, color=RED, path_arc=0.4)
        r2 = Arrow(good.get_left(), endpoint.get_right(), buff=0.1, color=PURPLE_B)
        self.go(GrowArrow(r2), GrowArrow(r1), rt=0.8)
        no_secret = T("no client secret", 20, GREY_B).next_to(endpoint, DOWN, buff=0.15)
        self.at("client secret", FadeIn(no_secret), rt=0.5)
        self.at("can't keep one", Indicate(no_secret), rt=0.5)
        q = T("?", 64, YELLOW, weight=BOLD).next_to(endpoint, UP, buff=0.15)
        self.at("how can HashBin tell", FadeIn(q, scale=0.5), rt=0.6)


class D2_PKCE(Ep):
    BEAT = 5

    def build(self):
        title = T("PKCE: Proof Key for Code Exchange", 32, YELLOW, weight=BOLD).to_edge(UP, buff=0.3)
        self.at("PKCE", Write(title), rt=1.0)
        app = AppWindow("Notes", 3.4, 3.0).move_to(LEFT * 4.8 + UP * 0.6)
        vault = VGroup(padlock(GREY_A, 0.35), T("kept in the app", 14, GREY_A)).arrange(RIGHT, buff=0.1).move_to(app.frame).shift(DOWN * 0.9)
        verifier = VGroup(key_icon(GOLD, 0.5), M("verifier", 18, GOLD)).arrange(RIGHT, buff=0.15).move_to(app.frame).shift(UP * 0.1)
        self.go(FadeIn(app), rt=0.4)
        self.at("makes up a long random secret", FadeIn(verifier), FadeIn(vault), rt=0.6)
        self.at("code verifier", Indicate(verifier, color=GOLD), rt=0.5)
        machine = HashMachine("SHA-256", 1.8, 1.0).scale(0.8).move_to(LEFT * 0.6 + UP * 0.6)
        self.at("SHA-256", FadeIn(machine), TransformFromCopy(verifier[0], verifier[0].copy().scale(0.5).move_to(machine.in_point).set_opacity(0)),
                rt=0.8)
        challenge = M("challenge: E9Mel…", 18, BLUE_C).next_to(machine, RIGHT, buff=0.3)
        self.at("code challenge", FadeIn(challenge, shift=RIGHT * 0.3), rt=0.6)
        url = M("…/oauth/authorize?…&code_challenge=E9Mel…&code_challenge_method=S256", 15, BLUE_C).move_to(DOWN * 1.2)
        self.at("Only the challenge goes into the authorize URL", FadeIn(url), rt=0.6)
        hb = HashBinPanel(3.0, 1.8).move_to(RIGHT * 4.6 + DOWN * 2.4)
        tick = ticket("code").move_to(hb.box).shift(DOWN * 0.15 + LEFT * 0.6)
        written = M("E9Mel…", 14, BLUE_C).next_to(tick, RIGHT, buff=0.1)
        self.at("HashBin remembers that challenge", FadeIn(hb), FadeIn(tick), FadeIn(written), rt=0.8)
        present = VGroup(ticket("code").scale(0.8), key_icon(GOLD, 0.35)).arrange(RIGHT, buff=0.2).move_to(LEFT * 3.0 + DOWN * 2.6)
        self.at("present both the code and the original verifier", FadeIn(present), FadeOut(url),
                present.animate.move_to(RIGHT * 1.4 + DOWN * 2.6), rt=1.0)
        match = VGroup(T("SHA-256(verifier) = challenge", 20, GREEN), check_mark(GREEN, 0.3)).arrange(RIGHT, buff=0.2).next_to(hb, UP, buff=0.2)
        self.at("checks that it matches", FadeIn(match), rt=0.6)

        self.at("An attacker who intercepted the code", FadeOut(VGroup(present, match)), rt=0.5)
        evil = AppWindow("malicious app", 2.2, 1.8, phone=True, color=RED, size=14).move_to(LEFT * 0.4 + DOWN * 2.4)
        stolen = ticket("code").scale(0.8).next_to(evil, RIGHT, buff=0.2)
        self.go(FadeIn(evil), FadeIn(stolen), rt=0.5)
        guesses = VGroup(*[M(f"SHA-256(guess{i}) ≠ E9Mel…", 15, RED) for i in range(3)]).arrange(DOWN, aligned_edge=LEFT, buff=0.08)
        guesses.next_to(evil, UP, buff=0.2)
        self.at("a hash only runs one way", LaggedStart(*[FadeIn(g) for g in guesses], lag_ratio=0.3), rt=1.0)
        useless = cross_mark(RED, 0.5).move_to(stolen)
        self.at("the stolen code is useless", Create(useless), rt=0.5)

        self.at("If this feels familiar", FadeOut(VGroup(app, vault, verifier, machine, challenge, hb, tick, written, evil, stolen, guesses, useless)),
                rt=0.6)
        left = VGroup(S256(EXAMPLE_CID, 18, truncate=14), HashMachine(width=1.4, height=0.8).scale(0.6), FileIcon(width=0.5, height=0.65))
        left.arrange(RIGHT, buff=0.3).move_to(LEFT * 3.4 + UP * 0.6)
        right = VGroup(M("E9Mel…", 20, BLUE_C), HashMachine("SHA-256", 1.4, 0.8).scale(0.6), key_icon(GOLD, 0.5)).arrange(RIGHT, buff=0.3)
        right.move_to(RIGHT * 3.4 + UP * 0.6)
        l_cap = T("the name commits to the content", 22).next_to(left, DOWN, buff=0.4)
        r_cap = T("the challenge commits to the secret", 22).next_to(right, DOWN, buff=0.4)
        divider = DashedLine(UP * 2.2, DOWN * 1.2, color=GREY_D)
        self.go(FadeIn(left), FadeIn(right), Create(divider), rt=0.8)
        self.at("commits to a file", FadeIn(l_cap), rt=0.5)
        self.at("commits to a secret", FadeIn(r_cap), rt=0.5)
        rule = T("HashBin requires it, with S256, for every app.", 26, YELLOW).to_edge(DOWN, buff=0.5)
        self.at("HashBin requires PKCE", FadeIn(rule), rt=0.6)


class D2_Scopes(Ep):
    BEAT = 6

    def build(self):
        specs = [("content:write", "publish content,\nbilled to the user's balance"), ("content:read", "check whether content exists\nand read its metadata"),
                 ("balance:read", "see the user's balance,\nfor pre-flight checks")]
        cards = VGroup()
        for name, text in specs:
            rect = RoundedRectangle(corner_radius=0.12, width=3.2, height=1.6, color=PURPLE_B, fill_color=PANEL_BG, fill_opacity=1)
            body = VGroup(M(name, 18, PURPLE_B), T(text, 14, GREY_A)).arrange(DOWN, buff=0.15).move_to(rect)
            cards.add(VGroup(rect, body))
        never = VGroup(RoundedRectangle(corner_radius=0.12, width=3.2, height=1.6, color=GREY_D, fill_color=PANEL_BG, fill_opacity=1),
                       T("delete · extend retention\nmanage account\nmanage apps", 13, GREY_C), T("never through OAuth", 14, GREY_B))
        never[1].move_to(never[0]).shift(UP * 0.2)
        never[2].next_to(never[1], DOWN, buff=0.15)
        row = VGroup(*cards, never).arrange(RIGHT, buff=0.2).to_edge(UP, buff=0.4)
        self.at("three permissions, called scopes", rt=0.1)
        for i, cue in enumerate(("Content write", "Content read", "balance read")):
            self.at(cue, FadeIn(cards[i], shift=DOWN * 0.2), rt=0.4)
        self.at("That's all", FadeIn(never), rt=0.4)
        self.at("can never delete anything", Create(cross_mark(GREY_B, 0.8).move_to(never[1])), rt=0.5)
        immutable = T("published content can't be changed", 18, GREY_A).next_to(never, DOWN, buff=0.1).align_to(never, RIGHT)
        self.at("published content can't be changed", FadeIn(immutable), rt=0.5)

        settings = panel(5.4, 1.6, "Account settings").move_to(LEFT * 3.6 + DOWN * 0.8)
        opts = VGroup(*[button(t, GREY_D, 14) for t in ("1", "3", "6", "12")]).arrange(RIGHT, buff=0.1)
        retention = VGroup(T("Default third-party retention (months)", 15, GREY_A), opts).arrange(DOWN, aligned_edge=LEFT, buff=0.1)
        retention.next_to(settings.heading, DOWN, buff=0.15).align_to(settings.heading, LEFT)
        settings.add(retention, SurroundingRectangle(opts[1], color=BLUE, buff=0.04))
        self.at("The app doesn't choose how long", FadeIn(settings), rt=0.6)
        self.at("default retention", Indicate(opts[1], color=BLUE), rt=0.5)
        meter = VGroup(T("Notes spent this month", 16, GREY_A), Rectangle(width=4, height=0.3, color=GOLD)).arrange(DOWN, aligned_edge=LEFT, buff=0.1)
        fill = Rectangle(width=4 * 1.4 / 2, height=0.3, stroke_width=0, fill_color=GOLD, fill_opacity=0.8).move_to(meter[1], aligned_edge=LEFT)
        amount = T("$1.40 of $2.00", 18, GOLD).next_to(meter[1], RIGHT, buff=0.2)
        spend = VGroup(meter, fill, amount).move_to(RIGHT * 3.4 + DOWN * 0.8)
        self.at("spending limit", FadeIn(spend), rt=0.6)
        refused = M("spending_limit_exceeded", 16, RED).next_to(spend, DOWN, buff=0.15)
        self.at("further publishes are refused", fill.animate.stretch_to_fit_width(4).align_to(meter[1], LEFT), FadeIn(refused), rt=0.8)

        apps = panel(6.0, 1.3, "Authorized publishing apps").move_to(DOWN * 2.8)
        apps_row = VGroup(T("Notes", 18), button("Revoke", RED_D, 14)).arrange(RIGHT, buff=3.6).next_to(apps.heading, DOWN, buff=0.12)
        apps_row.align_to(apps.heading, LEFT)
        apps.add(apps_row)
        self.at("revoke your app at any time", FadeIn(apps), rt=0.5)
        self.go(Indicate(apps_row[1], color=RED), rt=0.5)
        expire = T("refresh tokens stop now · access tokens expire within the hour", 18, GREY_A).next_to(apps, UP, buff=0.1)
        self.at("delete your app registration", FadeIn(expire), rt=0.5)


class D2_Refresh(Ep):
    BEAT = 7

    def build(self):
        timeline = Timeline(30, 11, label_every=5, label_fn=lambda d: f"day {d}", size=14).move_to(UP * 0.4)
        self.go(FadeIn(timeline), rt=0.5)
        segs = VGroup(*[Rectangle(width=0.32, height=0.3, stroke_color=GREEN, fill_color=GREEN, fill_opacity=0.4)
                        .move_to(timeline.x(0.4 + i * 0.9), aligned_edge=DL).shift(UP * 0.1) for i in range(8)])
        label = T("access token: 1 hour each", 18, GREEN).next_to(segs, UP, buff=0.2).align_to(segs, LEFT)
        self.at("expire after an hour on purpose", FadeIn(segs[0]), FadeIn(label), rt=0.6)
        self.at("uses the refresh token", LaggedStart(*[FadeIn(s) for s in segs[1:]], lag_ratio=0.2), rt=1.2)
        tokens = VGroup(*[ticket(f"refresh {i + 1}", "30 days", BLUE_B).scale(0.8) for i in range(3)]).arrange(RIGHT, buff=0.6).move_to(DOWN * 1.4)
        self.at("rotates refresh tokens", FadeIn(tokens[0]), rt=0.4)
        self.go(FadeIn(tokens[1], shift=LEFT * 0.3), tokens[0].animate.set_opacity(0.35), rt=0.6)
        stamp = T("revoked", 20, RED, weight=BOLD).rotate(0.2).move_to(tokens[0])
        self.at("the old one stops working", FadeIn(stamp), tokens[0].animate.set_opacity(0.15), rt=0.4)
        self.go(FadeIn(tokens[2], shift=LEFT * 0.3), tokens[1].animate.set_opacity(0.35), rt=0.6)
        thief = Person(RED, height=0.6).next_to(tokens[0], DOWN, buff=0.4)
        refused = T("refused", 20, RED).next_to(thief, RIGHT, buff=0.2)
        self.at("copied an old refresh token", FadeIn(thief), rt=0.4)
        self.go(FadeIn(refused), rt=0.4)
        tip = T("Always store the new refresh token from each response.", 24, YELLOW).to_edge(DOWN, buff=0.3)
        self.at("always store the new refresh token", FadeIn(tip), rt=0.6)
        consent = T("→ consent again", 18, GREY_A).next_to(timeline.x(30), UP, buff=0.4)
        self.at("approve your app again", FadeIn(consent), rt=0.5)


class D2_SDK(Ep):
    BEAT = 8

    def build(self):
        code = CodeBlock(SDK, "javascript", size=15).move_to(DOWN * 0.1)
        self.at("hosted SDK", FadeIn(code), code.highlight_line(0), rt=0.8)
        self.at("client ID and redirect URI", code.highlight_lines(2, 6), rt=0.6)
        self.at("Call authorize", code.highlight_line(10), rt=0.5)
        icon1 = VGroup(key_icon(GOLD, 0.35), M("→ challenge", 14, BLUE_C)).arrange(RIGHT, buff=0.1).next_to(code.lines[10], UP, buff=0.05).align_to(code, RIGHT)
        self.go(FadeIn(icon1), rt=0.4)
        self.at("handle callback", code.highlight_line(8), rt=0.5)
        icon2 = VGroup(ticket("code").scale(0.5), T("→", 16), ticket("tokens", "", GREEN).scale(0.5)).arrange(RIGHT, buff=0.08)
        icon2.next_to(code.lines[8], UP, buff=0.05).align_to(code, RIGHT)
        self.go(FadeIn(icon2), rt=0.4)
        self.at("then publish", code.highlight_line(11), rt=0.5)
        icon3 = M("Bearer <access> · auto-refresh", 13, GREEN).next_to(code, DOWN, buff=0.15).align_to(code, RIGHT)
        self.at("keeps the tokens", FadeIn(icon3), rt=0.5)
        result = M('{ cid: "AAAAAAAP…", url: "https://256t.us/AAAAAAAP…" }', 16, GREEN).next_to(code, DOWN, buff=0.15).align_to(code, LEFT)
        self.at("gives you back the 256t string", FadeIn(result), rt=0.5)


class D2_Recap(Ep):
    BEAT = 9

    def build(self):
        steps = VGroup(*[T(t, 26) for t in ("1. register", "2. send the user to consent", "3. trade the ticket for tokens", "4. prove it with PKCE")])
        steps.arrange(DOWN, aligned_edge=LEFT, buff=0.25).move_to(UP * 1.4 + LEFT * 2.2)
        pk = VGroup(key_icon(GOLD, 0.5), M("SHA-256 → challenge", 18, BLUE_C)).arrange(RIGHT, buff=0.2).next_to(steps, RIGHT, buff=0.8)
        for i, cue in enumerate(("register", "send the user to consent", "trade the ticket for tokens", "prove with PKCE")):
            self.at(cue, FadeIn(steps[i], shift=RIGHT * 0.2), rt=0.4)
        self.go(FadeIn(pk), rt=0.4)
        scopes = M("content:write · content:read · balance:read", 20, PURPLE_B).next_to(steps, DOWN, buff=0.4).align_to(steps, LEFT)
        self.at("publish and read, nothing more", FadeIn(scopes), rt=0.5)
        card = NextCard(("D3", "", True), ("D4", "", False)).scale(0.6).to_edge(DOWN, buff=0.25)
        self.at("build a complete app", FadeIn(card), rt=0.8)
