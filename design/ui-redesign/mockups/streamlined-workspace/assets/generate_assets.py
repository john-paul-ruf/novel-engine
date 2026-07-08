#!/usr/bin/env python3
"""Generate raster assets for the Streamlined Workspace mockup.

Produces three literary book covers (480x720) and a dark paper-grain tile.
All imagery is generated locally — no external services.
"""
import math
import random
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance

W, H = 480, 720
OUT = "/Users/the.phoenix/WebstormProjects/novel-engine/design/ui-redesign/mockups/streamlined-workspace/assets/"

DIDOT = "/System/Library/Fonts/Supplemental/Didot.ttc"
BASK = "/System/Library/Fonts/Supplemental/Baskerville.ttc"
AVENIR = "/System/Library/Fonts/Avenir Next.ttc"

random.seed(7)


def vgrad(size, stops):
    """Vertical gradient. stops = [(pos0..1, (r,g,b)), ...]"""
    w, h = size
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if p0 <= t <= p1:
                f = (t - p0) / max(p1 - p0, 1e-6)
                col = tuple(int(c0[k] + (c1[k] - c0[k]) * f) for k in range(3))
                break
        else:
            col = stops[-1][1]
        d.line([(0, y), (w, y)], fill=col)
    return img


def add_grain(img, sigma=14, opacity=0.10):
    noise = Image.effect_noise(img.size, sigma).convert("L")
    grain = Image.merge("RGB", (noise, noise, noise))
    return Image.blend(img, grain, opacity)


def vignette(img, strength=0.55):
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([-w * 0.35, -h * 0.30, w * 1.35, h * 1.30], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(w * 0.25))
    dark = ImageEnhance.Brightness(img).enhance(1 - strength)
    return Image.composite(img, dark, mask)


def tracked_text(draw, xy, text, font, fill, tracking=0, anchor_center_x=None):
    """Draw letter-spaced text. If anchor_center_x given, center on it."""
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = (anchor_center_x - total / 2) if anchor_center_x is not None else xy[0]
    y = xy[1]
    for ch, cw in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=fill)
        x += cw + tracking
    return total


def glow_layer(size, draw_fn, blur, tint):
    layer = Image.new("L", size, 0)
    d = ImageDraw.Draw(layer)
    draw_fn(d)
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    color = Image.new("RGB", size, tint)
    return color, layer


# ---------------------------------------------------------------- burger ----
def cover_best_burger():
    img = vgrad((W, H), [
        (0.0, (26, 22, 19)),
        (0.45, (34, 28, 23)),
        (0.72, (52, 38, 26)),
        (1.0, (24, 20, 17)),
    ])

    # soft amber pool of light behind the emblem
    color, mask = glow_layer((W, H), lambda d: d.ellipse([120, 330, 360, 560], fill=110), 70, (196, 142, 66))
    img = Image.composite(color, img, mask.point(lambda v: int(v * 0.55)))

    d = ImageDraw.Draw(img)
    cx, cy = W // 2, 452

    # thin brass emblem ring
    r = 96
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(178, 138, 84), width=2)

    # minimal flat burger, small + iconic
    bw = 92
    bx0, bx1 = cx - bw // 2, cx + bw // 2
    # top bun (dome)
    d.pieslice([bx0, cy - 46, bx1, cy + 18], 180, 360, fill=(167, 122, 71))
    # sesame flecks
    for fx, fy in [(-24, -26), (-8, -34), (10, -30), (24, -22), (0, -20)]:
        d.ellipse([cx + fx - 2, cy + fy - 1, cx + fx + 2, cy + fy + 1], fill=(216, 186, 140))
    # tomato — the diner-red line
    d.rounded_rectangle([bx0 - 6, cy - 12, bx1 + 6, cy - 5], 3, fill=(158, 48, 40))
    # patty
    d.rounded_rectangle([bx0 - 2, cy - 3, bx1 + 2, cy + 12], 6, fill=(66, 44, 32))
    # bottom bun
    d.rounded_rectangle([bx0, cy + 16, bx1, cy + 28], 6, fill=(150, 108, 62))

    # title — Didot caps, tracked
    t1 = ImageFont.truetype(DIDOT, 54)
    t2 = ImageFont.truetype(DIDOT, 78)
    ivory = (232, 224, 208)
    tracked_text(d, (0, 96), "THE BEST", t1, ivory, tracking=10, anchor_center_x=cx)
    tracked_text(d, (0, 158), "BURGER", t2, ivory, tracking=8, anchor_center_x=cx)
    # rule
    d.line([(cx - 44, 268), (cx + 44, 268)], fill=(178, 138, 84), width=1)
    small = ImageFont.truetype(BASK, 20)
    tracked_text(d, (0, 282), "A NOVEL", small, (168, 148, 118), tracking=6, anchor_center_x=cx)
    author = ImageFont.truetype(BASK, 24)
    tracked_text(d, (0, 636), "D. MORRISON", author, (196, 182, 158), tracking=6, anchor_center_x=cx)

    img = vignette(img, 0.5)
    img = add_grain(img, 16, 0.07)
    img.save(OUT + "cover-best-burger.png")


# -------------------------------------------------------------- compiler ----
def cover_last_compiler():
    img = vgrad((W, H), [
        (0.0, (8, 11, 18)),
        (0.55, (11, 15, 24)),
        (1.0, (6, 8, 14)),
    ])

    cx = W // 2
    beam_top, beam_bot = 210, 560
    cyan = (142, 196, 208)

    # glow pass
    def beams(d):
        d.line([(cx, beam_top), (cx, beam_bot)], fill=160, width=5)
    color, mask = glow_layer((W, H), beams, 14, (90, 150, 165))
    img = Image.composite(color, img, mask)

    d = ImageDraw.Draw(img)
    # crisp main beam
    d.line([(cx, beam_top), (cx, beam_bot)], fill=(200, 232, 238), width=2)

    # branching circuit lines
    branches = [
        (270, -1, 58, 90), (306, 1, 44, 70), (352, -1, 78, 120),
        (352, 1, 78, 110), (408, 1, 36, 56), (452, -1, 56, 84),
        (452, 1, 96, 40), (500, -1, 30, 46),
    ]
    dim = (96, 138, 148)
    for y, sgn, run, drop in branches:
        x1 = cx + sgn * run
        d.line([(cx, y), (x1, y + run * 0.55)], fill=dim, width=1)
        d.line([(x1, y + run * 0.55), (x1, y + run * 0.55 + drop)], fill=dim, width=1)
        ex, ey = x1, y + run * 0.55 + drop
        d.rectangle([ex - 2, ey - 2, ex + 2, ey + 2], outline=cyan, width=1)
        d.ellipse([cx - 2, y - 2, cx + 2, y + 2], fill=cyan)

    # terminal node
    d.ellipse([cx - 4, beam_bot - 4, cx + 4, beam_bot + 4], outline=cyan, width=1)

    # sparse star-noise
    for _ in range(60):
        x, y = random.randint(0, W - 1), random.randint(0, H - 1)
        v = random.randint(24, 60)
        d.point((x, y), fill=(v, v + 6, v + 12))

    # title — spaced grotesque caps
    t = ImageFont.truetype(AVENIR, 40)
    pale = (214, 226, 232)
    tracked_text(d, (0, 84), "THE LAST", t, pale, tracking=14, anchor_center_x=cx)
    tracked_text(d, (0, 134), "COMPILER", t, pale, tracking=14, anchor_center_x=cx)
    small = ImageFont.truetype(AVENIR, 17)
    tracked_text(d, (0, 646), "R. OKAFOR", small, (128, 146, 156), tracking=8, anchor_center_x=cx)

    img = vignette(img, 0.45)
    img = add_grain(img, 14, 0.05)
    img.save(OUT + "cover-last-compiler.png")


# ----------------------------------------------------------------- reset ----
def cover_reset():
    img = vgrad((W, H), [
        (0.0, (30, 26, 23)),
        (0.5, (38, 33, 28)),
        (1.0, (26, 23, 20)),
    ])

    cx, cy, r = W // 2, 300, 108

    # ivory circle on its own layer
    circle = Image.new("L", (W, H), 0)
    dc = ImageDraw.Draw(circle)
    dc.ellipse([cx - r, cy - r, cx + r, cy + r], fill=235)
    circle = circle.filter(ImageFilter.GaussianBlur(1.2))

    # ragged horizontal wipe erasing part of the circle (chalk wiped clean)
    wipe = Image.new("L", (W, H), 0)
    dw = ImageDraw.Draw(wipe)
    for i in range(500):
        yy = cy - 6 + random.gauss(0, 26)
        x0 = random.randint(0, W)
        ln = random.randint(30, 160)
        dw.line([(x0, yy), (x0 + ln, yy)], fill=random.randint(120, 255),
                width=random.randint(1, 4))
    wipe = wipe.filter(ImageFilter.GaussianBlur(3))
    circle = Image.composite(Image.new("L", (W, H), 0), circle, wipe.point(lambda v: min(255, int(v * 1.4))))

    ivory = Image.new("RGB", (W, H), (226, 216, 198))
    img = Image.composite(ivory, img, circle.point(lambda v: int(v * 0.92)))

    # faint amber undertone glow bottom-left
    color, mask = glow_layer((W, H), lambda d: d.ellipse([-80, 480, 240, 800], fill=70), 90, (150, 110, 60))
    img = Image.composite(color, img, mask.point(lambda v: int(v * 0.4)))

    d = ImageDraw.Draw(img)
    t = ImageFont.truetype(BASK, 34)
    tracked_text(d, (0, 470), "RESET", t, (222, 212, 194), tracking=22, anchor_center_x=cx)
    small = ImageFont.truetype(BASK, 18)
    tracked_text(d, (0, 648), "M. VANCE", small, (158, 146, 128), tracking=6, anchor_center_x=cx)

    img = vignette(img, 0.42)
    img = add_grain(img, 18, 0.09)
    img.save(OUT + "cover-reset.png")


# ----------------------------------------------------------------- grain ----
def paper_grain():
    size = 256
    base = Image.new("RGB", (size, size), (23, 20, 17))
    noise = Image.effect_noise((size, size), 22).convert("L")
    warm = Image.merge("RGB", (
        noise.point(lambda v: int(v * 0.14) + 17),
        noise.point(lambda v: int(v * 0.12) + 15),
        noise.point(lambda v: int(v * 0.10) + 13),
    ))
    img = Image.blend(base, warm, 0.85)
    # fibers
    d = ImageDraw.Draw(img)
    for _ in range(90):
        x, y = random.randint(0, size), random.randint(0, size)
        ln = random.randint(2, 7)
        ang = random.uniform(0, math.pi)
        v = random.randint(26, 34)
        d.line([(x, y), (x + ln * math.cos(ang), y + ln * math.sin(ang))],
               fill=(v, v - 2, v - 4), width=1)
    img.save(OUT + "paper-grain.png")


cover_best_burger()
cover_last_compiler()
cover_reset()
paper_grain()
print("assets generated")
