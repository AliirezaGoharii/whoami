#!/usr/bin/env python3
"""Render the 1200x630 social card with local fonts, ASCII contours and the stack map.

Uses Python's standard library and a system FreeType shared library. Importing
this module exposes the drawing helpers without generating or overwriting files.
"""
import argparse
import atexit
import ctypes as C
from ctypes.util import find_library
import math
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parent
W, H = 1200, 630
BG = (7, 7, 10)

# --------------------------------------------------------------------------
# FreeType bindings (just the small slice we need)
# --------------------------------------------------------------------------
FT = None
for library in (find_library("freetype"), "/system/lib64/libft2.so", "libfreetype.so.6", "libfreetype.dylib"):
    if not library:
        continue
    try:
        FT = C.CDLL(library)
        break
    except OSError:
        pass
if FT is None:
    raise RuntimeError("FreeType is required to regenerate og.png; the site build uses the existing image.")


class FT_Generic(C.Structure):
    _fields_ = [("data", C.c_void_p), ("finalizer", C.c_void_p)]


class FT_BBox(C.Structure):
    _fields_ = [("xMin", C.c_long), ("yMin", C.c_long),
                ("xMax", C.c_long), ("yMax", C.c_long)]


class FT_Vector(C.Structure):
    _fields_ = [("x", C.c_long), ("y", C.c_long)]


class FT_Glyph_Metrics(C.Structure):
    _fields_ = [
        ("width", C.c_long), ("height", C.c_long),
        ("horiBearingX", C.c_long), ("horiBearingY", C.c_long),
        ("horiAdvance", C.c_long),
        ("vertBearingX", C.c_long), ("vertBearingY", C.c_long),
        ("vertAdvance", C.c_long),
    ]


class FT_Bitmap(C.Structure):
    _fields_ = [
        ("rows", C.c_uint), ("width", C.c_uint), ("pitch", C.c_int),
        ("buffer", C.POINTER(C.c_ubyte)),
        ("num_grays", C.c_ushort), ("pixel_mode", C.c_ubyte),
        ("palette_mode", C.c_ubyte), ("palette", C.c_void_p),
    ]


class FT_GlyphSlotRec(C.Structure):
    pass


FT_GlyphSlot = C.POINTER(FT_GlyphSlotRec)
FT_GlyphSlotRec._fields_ = [
    ("library", C.c_void_p), ("face", C.c_void_p), ("next", FT_GlyphSlot),
    ("glyph_index", C.c_uint), ("generic", FT_Generic),
    ("metrics", FT_Glyph_Metrics),
    ("linearHoriAdvance", C.c_long), ("linearVertAdvance", C.c_long),
    ("advance", FT_Vector), ("format", C.c_int),
    ("bitmap", FT_Bitmap), ("bitmap_left", C.c_int), ("bitmap_top", C.c_int),
]


class FT_FaceRec(C.Structure):
    pass


FT_Face = C.POINTER(FT_FaceRec)
FT_FaceRec._fields_ = [
    ("num_faces", C.c_long), ("face_index", C.c_long),
    ("face_flags", C.c_long), ("style_flags", C.c_long),
    ("num_glyphs", C.c_long),
    ("family_name", C.c_char_p), ("style_name", C.c_char_p),
    ("num_fixed_sizes", C.c_int), ("available_sizes", C.c_void_p),
    ("num_charmaps", C.c_int), ("charmaps", C.c_void_p),
    ("generic", FT_Generic), ("bbox", FT_BBox),
    ("units_per_EM", C.c_ushort),
    ("ascender", C.c_short), ("descender", C.c_short), ("height", C.c_short),
    ("max_advance_width", C.c_short), ("max_advance_height", C.c_short),
    ("underline_position", C.c_short), ("underline_thickness", C.c_short),
    ("glyph", FT_GlyphSlot), ("size", C.c_void_p), ("charmap", C.c_void_p),
]

FT.FT_Init_FreeType.argtypes = [C.POINTER(C.c_void_p)]
FT.FT_Init_FreeType.restype = C.c_int
FT.FT_New_Face.argtypes = [C.c_void_p, C.c_char_p, C.c_long, C.POINTER(FT_Face)]
FT.FT_New_Face.restype = C.c_int
FT.FT_Set_Pixel_Sizes.argtypes = [FT_Face, C.c_uint, C.c_uint]
FT.FT_Set_Pixel_Sizes.restype = C.c_int
FT.FT_Load_Char.argtypes = [FT_Face, C.c_ulong, C.c_int32]
FT.FT_Load_Char.restype = C.c_int
FT.FT_Done_Face.argtypes = [FT_Face]
FT.FT_Done_FreeType.argtypes = [C.c_void_p]

LIB = C.c_void_p()
assert FT.FT_Init_FreeType(C.byref(LIB)) == 0
atexit.register(FT.FT_Done_FreeType, LIB)
FT_LOAD_RENDER = 0x4


class Glyph:
    __slots__ = ("w", "h", "pitch", "left", "top", "advance", "alpha")


class Face:
    def __init__(self, path, px):
        self.face = FT_Face()
        if FT.FT_New_Face(LIB, path.encode(), 0, C.byref(self.face)) != 0:
            raise RuntimeError("cannot load font " + path)
        FT.FT_Set_Pixel_Sizes(self.face, 0, px)
        self.cache = {}

    def glyph(self, ch):
        g = self.cache.get(ch)
        if g is not None:
            return g
        if FT.FT_Load_Char(self.face, ord(ch), FT_LOAD_RENDER) != 0:
            raise RuntimeError("cannot render %r" % ch)
        slot = self.face.contents.glyph.contents
        bm = slot.bitmap
        g = Glyph()
        g.w, g.h, g.pitch = bm.width, bm.rows, abs(bm.pitch)
        g.left, g.top = slot.bitmap_left, slot.bitmap_top
        g.advance = slot.advance.x / 64.0
        g.alpha = C.string_at(bm.buffer, g.pitch * g.h) if g.w and g.h else b""
        self.cache[ch] = g
        return g

    def width(self, text, spacing=0.0):
        return sum(self.glyph(c).advance + spacing for c in text) - (spacing if text else 0)

    def close(self):
        FT.FT_Done_Face(self.face)


# --------------------------------------------------------------------------
# Canvas
# --------------------------------------------------------------------------
class Canvas:
    def __init__(self, w, h, bg):
        self.w, self.h = w, h
        self.buf = bytearray(bg * (w * h))

    def blend(self, x, y, color, alpha):
        if alpha <= 0 or x < 0 or y < 0 or x >= self.w or y >= self.h:
            return
        if alpha > 1:
            alpha = 1.0
        i = (y * self.w + x) * 3
        inv = 1.0 - alpha
        b = self.buf
        b[i] = int(b[i] * inv + color[0] * alpha + 0.5)
        b[i + 1] = int(b[i + 1] * inv + color[1] * alpha + 0.5)
        b[i + 2] = int(b[i + 2] * inv + color[2] * alpha + 0.5)

    def fill_rect(self, x, y, w, h, color, alpha=1.0):
        for py in range(max(0, y), min(self.h, y + h)):
            for px in range(max(0, x), min(self.w, x + w)):
                self.blend(px, py, color, alpha)

    def line(self, x1, y1, x2, y2, color, alpha=1.0, width=1.0):
        # Anti-aliased straight segment via distance to the line.
        dx, dy = x2 - x1, y2 - y1
        length2 = dx * dx + dy * dy
        if length2 == 0:
            return self.dot(x1, y1, width / 2, color, alpha)
        x0 = int(math.floor(min(x1, x2) - width))
        x3 = int(math.ceil(max(x1, x2) + width))
        y0 = int(math.floor(min(y1, y2) - width))
        y3 = int(math.ceil(max(y1, y2) + width))
        half = width / 2.0
        for py in range(max(0, y0), min(self.h, y3 + 1)):
            for px in range(max(0, x0), min(self.w, x3 + 1)):
                t = ((px - x1) * dx + (py - y1) * dy) / length2
                t = 0.0 if t < 0 else (1.0 if t > 1 else t)
                qx, qy = x1 + t * dx, y1 + t * dy
                d = math.hypot(px - qx, py - qy)
                a = max(0.0, min(1.0, half + 0.5 - d))
                if a:
                    self.blend(px, py, color, a * alpha)

    def dot(self, cx, cy, r, color, alpha=1.0):
        x0, x1 = int(cx - r - 2), int(cx + r + 2)
        y0, y1 = int(cy - r - 2), int(cy + r + 2)
        for py in range(max(0, y0), min(self.h, y1 + 1)):
            for px in range(max(0, x0), min(self.w, x1 + 1)):
                d = math.hypot(px - cx, py - cy)
                a = max(0.0, min(1.0, r + 0.5 - d))
                if a:
                    self.blend(px, py, color, a * alpha)

    def ring(self, cx, cy, r, width, color, alpha=1.0, arc=None):
        x0, x1 = int(cx - r - width - 2), int(cx + r + width + 2)
        y0, y1 = int(cy - r - width - 2), int(cy + r + width + 2)
        half = width / 2.0
        for py in range(max(0, y0), min(self.h, y1 + 1)):
            for px in range(max(0, x0), min(self.w, x1 + 1)):
                d = math.hypot(px - cx, py - cy)
                dist = abs(d - r)
                a = max(0.0, min(1.0, half + 0.5 - dist))
                if not a:
                    continue
                if arc:
                    ang = math.degrees(math.atan2(py - cy, px - cx))
                    if not (arc[0] <= ang <= arc[1]):
                        continue
                self.blend(px, py, color, a * alpha)

    def rounded_rect(self, x, y, w, h, r, fill=None, fill_alpha=1.0,
                     stroke=None, stroke_alpha=1.0, stroke_width=1.2):
        for py in range(max(0, y - 3), min(self.h, y + h + 4)):
            for px in range(max(0, x - 3), min(self.w, x + w + 4)):
                qx = abs(px - (x + w / 2.0)) - (w / 2.0 - r)
                qy = abs(py - (y + h / 2.0)) - (h / 2.0 - r)
                d = math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r
                if fill is not None and d < 0:
                    a = max(0.0, min(1.0, 0.5 - d))
                    if a:
                        self.blend(px, py, fill, a * fill_alpha)
                if stroke is not None:
                    a = max(0.0, min(1.0, stroke_width / 2.0 + 0.5 - abs(d)))
                    if a:
                        self.blend(px, py, stroke, a * stroke_alpha)

    def text(self, face, text, x, baseline, color=(245, 243, 240),
             alpha=1.0, spacing=0.0, gradient=None, fake_weight=0):
        pen = x
        for ch in text:
            g = face.glyph(ch)
            if g.w and g.h:
                for row in range(g.h):
                    py = baseline - g.top + row
                    if py < 0 or py >= self.h:
                        continue
                    rowbase = row * g.pitch
                    for col in range(g.w):
                        a = g.alpha[rowbase + col] / 255.0
                        if not a:
                            continue
                        px = int(pen + g.left + col)
                        c = gradient(px, py) if gradient else color
                        self.blend(px, py, c, a * alpha)
                        if fake_weight:
                            self.blend(px + 1, py, c, a * alpha * fake_weight)
            pen += g.advance + spacing
        return pen - (spacing if text else 0)

    def png(self):
        raw = bytearray()
        stride = self.w * 3
        for y in range(self.h):
            raw.append(0)
            raw.extend(self.buf[y * stride:(y + 1) * stride])

        def chunk(tag, data):
            return (struct.pack(">I", len(data)) + tag + data +
                    struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))

        return (b"\x89PNG\r\n\x1a\n" +
                chunk(b"IHDR", struct.pack(">IIBBBBB", self.w, self.h, 8, 2, 0, 0, 0)) +
                chunk(b"IDAT", zlib.compress(bytes(raw), 9)) +
                chunk(b"IEND", b""))


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return (a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t)


def clamp8(v):
    return 0 if v < 0 else (255 if v > 255 else int(v + 0.5))


def local_face(kind, size):
    """Prefer the site's own fonts; support FreeType builds without WOFF2 too."""
    candidates = {
        "sans": [ROOT / "fonts/geist-latin.woff2", Path("/system/fonts/Roboto-Regular.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")],
        "serif": [ROOT / "fonts/instrument-serif-italic-latin.woff2", Path("/system/fonts/NotoSerif-Italic.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf")],
        "mono": [ROOT / "fonts/jetbrains-mono-latin.woff2", Path("/system/fonts/DroidSansMono.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf")],
    }
    for path in candidates[kind]:
        if path.is_file():
            try:
                return Face(str(path), size)
            except RuntimeError:
                pass
    raise RuntimeError(f"No supported {kind} font found")


def render_card():
    fonts = []
    def font(kind, size):
        face = local_face(kind, size)
        fonts.append(face)
        return face

    try:
        name = font("sans", 100)
        surname = font("serif", 124)
        body = font("sans", 23)
        label = font("sans", 17)
        mono = font("mono", 13)
        small = font("mono", 10)
        ascii_font = font("mono", 12)
        c = Canvas(W, H, BG)
        ink, soft, muted = (245, 243, 240), (207, 204, 212), (154, 151, 163)
        accent, green = (255, 45, 85), (67, 217, 152)

        chars = " .:-=+*#%@"
        for y in range(18, H - 18, 18):
            for x in range(12, W - 12, 12):
                u, v = (x - W * .72) / 530, (y - H * .44) / 530
                phase = math.hypot(u, v) * 15 - 3.4 + math.sin(math.atan2(v, u) * 3 + .96) * 1.3 + math.sin(u * 3.4 - v * 2.5 + 1.2) * .75
                strength = (.5 + .5 * math.cos(phase)) ** 3
                char = chars[int(strength * (len(chars) - 1))]
                fade = min(1, x / 90, (W - x) / 90, y / 80, (H - y) / 80)
                if x < 720 and 130 < y < 510:
                    fade *= .23
                color = mix((138, 127, 144), (198, 91, 116), x / W)
                c.text(ascii_font, char, x, y, color, strength * fade * .43)

        c.rounded_rect(28, 28, W - 56, H - 56, 18, stroke=ink, stroke_alpha=.11, stroke_width=1)
        c.line(64, 99, W - 64, 99, ink, .10)
        c.text(mono, "INDEPENDENT WEB ARCHITECT", 64, 72, muted, spacing=1.7)
        c.dot(916, 67, 3, green)
        c.text(small, "AVAILABLE FOR PROJECTS", 931, 71, soft, spacing=.8)

        c.text(name, "Alireza", 61, 242, ink, fake_weight=.25)
        gradient = lambda x, y: mix((255, 143, 163), (255, 45, 85), (x - 65) / max(1, surname.width("Gohari")))
        c.text(surname, "Gohari", 64, 365, gradient=gradient)
        c.text(mono, "LARAVEL + VUE / END-TO-END PRODUCTS", 67, 407, (255, 107, 136), spacing=.8)
        c.text(body, "One architect. The whole product.", 64, 458, ink)
        c.text(label, "From database schema to the final pixel.", 64, 488, muted)

        c.rounded_rect(776, 145, 348, 370, 22, (14, 14, 20), 1, ink, .15, 1)
        c.text(small, "THE BUILD", 798, 177, muted, spacing=1.6)
        c.dot(1044, 173, 2.5, green)
        c.text(small, "4 LAYERS", 1054, 177, green)
        c.line(822, 225, 822, 450, accent, .3)
        layers = [("Vue 3", "Reactive client", "UI"), ("Inertia.js", "Server-driven SPA", "SPA"), ("Laravel", "API + domain logic", "API"), ("PostgreSQL", "Data + migrations", "SQL")]
        for i, (title, detail, tag) in enumerate(layers):
            y = 197 + i * 69
            c.rounded_rect(796, y, 308, 58, 11, (22, 22, 30), 1, accent if i == 0 else ink, .4 if i == 0 else .09, 1)
            c.rounded_rect(808, y + 13, 30, 30, 8, accent if i == 0 else (39, 21, 31), 1)
            c.text(small, f"0{i + 1}", 817, y + 33, ink if i == 0 else (255, 107, 136))
            c.text(label, title, 850, y + 25, ink)
            c.text(small, detail, 851, y + 43, muted)
            c.text(small, tag, 1090 - small.width(tag), y + 32, muted)
        c.text(small, "schema -> pixel", 799, 500, muted, spacing=.4)
        c.line(64, 539, W - 64, 539, ink, .10)
        c.text(small, "aliirezagoharii.github.io/whoami", 64, 576, muted, spacing=.45)
        right = "REMOTE / WORLDWIDE"
        c.text(small, right, W - 64 - small.width(right, 1.2), 576, muted, spacing=1.2)
        return c.png()
    finally:
        for face in fonts:
            face.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "og.png")
    output = parser.parse_args().output
    image = render_card()
    output.write_bytes(image)
    print(f"Wrote {output.name}: {W}×{H}, {len(image):,} bytes")


if __name__ == "__main__":
    main()
