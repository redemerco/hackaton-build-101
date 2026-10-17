"""Generador del daemon en pixel art: formas -> grilla con sombreado y contorno -> PNG de revisión + JSON de capas."""
import json, math, sys

W, H = 40, 40

PAL = {
    "o": (22, 24, 48),      # contorno
    "h": (206, 210, 255),   # cuerpo luz
    "b": (150, 157, 245),   # cuerpo base
    "s": (108, 114, 214),   # cuerpo sombra
    "d": (76, 80, 168),     # cuerpo sombra profunda
    "H": (255, 243, 210),   # cuerno luz
    "C": (236, 205, 148),   # cuerno base
    "c": (184, 146, 92),    # cuerno sombra
    "k": (16, 18, 38),      # pupila
    "w": (255, 255, 255),   # brillo
    "m": (48, 20, 46),      # boca
    "t": (255, 122, 138),   # lengua
    "p": (255, 160, 185),   # cachete
    "y": (241, 225, 91),    # acento limón
    "Y": (255, 250, 200),
    "r": (255, 107, 94),    # coral
    "a": (95, 214, 198),    # agua
    "f": (255, 179, 64),    # mango
    "l": (167, 172, 255),   # lavanda
    "L": (230, 232, 255),
    "B": (120, 190, 255),   # gota
}


def blank():
    return [["." for _ in range(W)] for _ in range(H)]


def in_ellipse(x, y, cx, cy, rx, ry):
    return ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0


def body_mask(melt=False):
    """Máscara del cuerpo (cabeza+cuerpo en una sola gota, patitas, bracitos) y de los cuernos."""
    body = set()
    horn = set()
    for y in range(H):
        for x in range(W):
            # cabeza-cuerpo: gota más ancha abajo
            if in_ellipse(x, y, 20, 21.5, 12.8, 11.8):
                body.add((x, y))
            # patitas
            if in_ellipse(x, y, 14.5, 34.6, 3.4, 2.3) or in_ellipse(x, y, 25.5, 34.6, 3.4, 2.3):
                body.add((x, y))
            # bracitos
            if in_ellipse(x, y, 7.0, 25.5, 2.3, 3.2) or in_ellipse(x, y, 33.0, 25.5, 2.3, 3.2):
                body.add((x, y))
    if melt:  # gotas que chorrean del cuerpo
        for (cx, top, ln) in [(11, 29, 6), (17, 33, 4), (27, 32, 5), (31, 28, 5)]:
            for yy in range(top, top + ln):
                body.add((cx, yy))
                if yy < top + ln - 1:
                    body.add((cx + 1, yy))
    # cuernos: curva cuadrática base -> tip, grosor que afina
    for side in (-1, 1):
        bx, by = 20 + side * 7.5, 11.5
        mx, my = 20 + side * 13.5, 7.0
        tx, ty = 20 + side * 13.0, 1.5
        for i in range(200):
            t = i / 199
            px = (1 - t) ** 2 * bx + 2 * (1 - t) * t * mx + t ** 2 * tx
            py = (1 - t) ** 2 * by + 2 * (1 - t) * t * my + t ** 2 * ty
            r = 2.6 * (1 - t) + 0.5
            for y in range(H):
                for x in range(W):
                    if (x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2 <= r * r:
                        horn.add((x, y))
    horn -= body
    tail = set()
    for i in range(160):
        t = i / 159
        px = (1 - t) ** 2 * 30 + 2 * (1 - t) * t * 38.5 + t ** 2 * 36.5
        py = (1 - t) ** 2 * 31 + 2 * (1 - t) * t * 31 + t ** 2 * 22.5
        for y in range(H):
            for x in range(W):
                if (x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2 <= 0.85:
                    tail.add((x, y))
    # punta de pica
    for (dx, dy) in [(0,-4),(-1,-3),(0,-3),(1,-3),(-2,-2),(-1,-2),(0,-2),(1,-2),(2,-2),(-2,-1),(-1,-1),(1,-1),(2,-1),(0,-1)]:
        tail.add((36 + dx, 21 + dy))
    return body, horn | set(), tail - body


def shade_body(g, body, cx=20, cy=21.5, rx=12.8, ry=11.8):
    lx, ly, lz = -0.45, -0.55, 0.70  # luz arriba-izquierda, de frente
    for (x, y) in body:
        nx = (x + 0.5 - cx) / rx
        ny = (y + 0.5 - cy) / ry
        rr = nx * nx + ny * ny
        nz = math.sqrt(max(0.0, 1 - min(rr, 1)))
        d = nx * lx + ny * ly + nz * lz
        if rr > 1.0:  # patitas, bracitos, gotas: fuera de la esfera, van en sombra
            g[y][x] = "s" if y < 34 else "d"
        elif d > 0.80:
            g[y][x] = "h"
        elif d > 0.38:
            g[y][x] = "b"
        elif d > 0.05:
            g[y][x] = "s"
        else:
            g[y][x] = "d"


def shade_horn(g, horn):
    for (x, y) in horn:
        left = (x - 1, y) not in horn
        top = (x, y - 1) not in horn
        right = (x + 1, y) not in horn
        if left or top:
            g[y][x] = "H"
        elif right:
            g[y][x] = "c"
        else:
            g[y][x] = "C"


def outline(g):
    filled = {(x, y) for y in range(H) for x in range(W) if g[y][x] != "."}
    out = []
    for y in range(H):
        for x in range(W):
            if g[y][x] != ".":
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if (x + dx, y + dy) in filled:
                    out.append((x, y))
                    break
    for (x, y) in out:
        g[y][x] = "o"


def stamp(g, x0, y0, rows, mirror=False):
    for dy, row in enumerate(rows):
        r = row[::-1] if mirror else row
        for dx, ch in enumerate(r):
            if ch != "." and 0 <= y0 + dy < H and 0 <= x0 + dx < W:
                g[y0 + dy][x0 + dx] = ch


# ---------- partes de la cara (ojos 5x6 en (12,17) y (23,17); boca centrada en x=20, y=26) ----------
EYES = {
    "open": [".kkk.", "kkkkk", "kwwkk", "kwkkk", "kkkkk", ".kkk."],
    "blink": [".....", ".....", ".....", "kkkkk", ".kkk.", "....."],
    "happy": [".....", ".kkk.", "k...k", "k...k", ".....", "....."],
    "sleep": [".....", ".....", "k...k", ".kkk.", ".....", "....."],
    "tired": [".....", "ddddd", "ooooo", "kwwkk", "kkkkk", ".kkk."],
    "x": ["k...k", ".k.k.", "..k..", ".k.k.", "k...k", "....."],
    "wide": [".kkk.", "kwwwk", "kwkwk", "kwwwk", ".kkk.", "....."],
    "side": [".kkk.", "kkkkk", "kkwwk", "kkkwk", "kkkkk", ".kkk."],
}
MOUTHS = {
    "smile": ["m.....m", ".m...m.", "..mmm.."],
    "grin": ["mmmmmmm", ".mtttm.", "..mmm.."],
    "flat": [".......", ".mmmmm.", "......."],
    "yawn": ["..mmm..", ".mtttm.", "..mmm.."],
    "wavy": [".......", "m.m.m.m", ".m.m.m."],
    "chew": [".......", "..mmm..", "..mmm.."],
    "cat": [".......", "m..m..m", ".mm.mm."],
}
ACCS = {
    "sparkle": (31, 2, ["...y...", "...y...", "..yYy..", "yyYYYyy", "..yYy..", "...y...", "...y..."]),
    "stars": (30, 1, ["..y.....", ".yYy....", "..y..y..", ".....Yy.", "....yYYy", ".....yy.", "........"]),
    "zz": (28, 0, ["......LLLL", ".........L", "........L.", ".......L..", "......LLLL", "LLL.......", "..L.......", ".L........", "LLL......."]),
    "dots": (30, 1, ["aaaaaaa", "aLLLLLa", "aaaaaaa", "aLaLaLa", "aaaaaaa", "aLaLaLa", "aaaaaaa"]),
    "steam": (14, 0, [".r....r....", "r....r....r", ".r....r...r", "..r....r...", ".r....r....", "r....r....."]),
    "moon": (31, 1, ["..LLLL.", ".LLLl..", "LLLl...", "LLLl...", "LLLl...", ".LLLl..", "..LLLL."]),
    "note": (31, 1, ["...ffff", "...f..f", "...f..f", ".fff.ff", "ffff.ff", ".ff...."]),
    "drop": (33, 13, ["..B..", ".BBB.", "BBwBB", "BBBBB", ".BBB."]),
}

STATES = {
    "enforma": dict(eyes="open", mouth="smile", acc="sparkle", cheeks=True),
    "bien": dict(eyes="open", mouth="flat", acc=None, cheeks=False),
    "cansado": dict(eyes="tired", mouth="yawn", acc="drop", cheeks=False),
    "fundido": dict(eyes="x", mouth="wavy", acc="steam", cheeks=False, melt=True),
    "reunionitis": dict(eyes="side", mouth="flat", acc="dots", cheeks=False),
    "buho": dict(eyes="wide", mouth="cat", acc="moon", cheeks=False),
    "racha": dict(eyes="happy", mouth="grin", acc="stars", cheeks=True),
    "durmiendo": dict(eyes="sleep", mouth="cat", acc="zz", cheeks=True),
    "comiendo": dict(eyes="happy", mouth="chew", acc="note", cheeks=True),
}


def render(state, eyes_override=None):
    cfg = STATES[state]
    g = blank()
    body, horn, tail = body_mask(melt=cfg.get("melt", False))
    for (x, y) in tail:
        g[y][x] = "s"
    shade_body(g, body)
    shade_horn(g, horn)
    outline(g)
    stamp(g, 11, 12, [".ww", "ww.", "w.."])  # reflejo: superficie brillante
    eyes = EYES[eyes_override or cfg["eyes"]]
    stamp(g, 12, 17, eyes)
    stamp(g, 23, 17, eyes, mirror=(cfg["eyes"] != "side"))
    stamp(g, 17, 25, MOUTHS[cfg["mouth"]])
    if cfg["cheeks"]:
        stamp(g, 9, 24, ["pp"])
        stamp(g, 29, 24, ["pp"])
    if cfg["acc"]:
        x, y, rows = ACCS[cfg["acc"]]
        stamp(g, x, y, rows)
    return g


def to_img(g, scale):
    from PIL import Image
    img = Image.new("RGBA", (W * scale, H * scale), (0, 0, 0, 0))
    px = img.load()
    for y in range(H):
        for x in range(W):
            ch = g[y][x]
            if ch == ".":
                continue
            col = PAL[ch] + (255,)
            for yy in range(scale):
                for xx in range(scale):
                    px[x * scale + xx, y * scale + yy] = col
    return img


def base_grid(melt=False):
    """Cuerpo + cuernos + cola + contorno + reflejo, sin cara ni accesorio."""
    g = blank()
    body, horn, tail = body_mask(melt=melt)
    for (x, y) in tail:
        g[y][x] = "s"
    shade_body(g, body)
    shade_horn(g, horn)
    outline(g)
    stamp(g, 11, 12, [".ww", "ww.", "w.."])
    return ["".join(r) for r in g]


def export_ts(path):
    hexes = {k: "#%02x%02x%02x" % v for k, v in PAL.items()}
    data = {
        "SIZE": W,
        "PALETTE": hexes,
        "BASE": base_grid(False),
        "BASE_MELT": base_grid(True),
        "EYES": EYES,
        "MOUTHS": MOUTHS,
        "ACCESSORIES": {k: {"x": x, "y": y, "rows": rows} for k, (x, y, rows) in ACCS.items()},
    }
    lines = ["// GENERADO por scripts/daemon-sprite.py — no editar a mano: cambiá el generador y corré", "//   python3 scripts/daemon-sprite.py --ts lib/daemon-art.ts", ""]
    for k, v in data.items():
        lines.append(f"export const {k} = {json.dumps(v, ensure_ascii=False, indent=2)} as const;\n")
    open(path, "w").write("\n".join(lines))
    print("ts ok", path)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--ts":
        export_ts(sys.argv[2])
        sys.exit(0)
    scale = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    names = list(STATES)
    cols = 3
    sheet = Image.new("RGBA", (cols * W * scale, math.ceil(len(names) / cols) * H * scale), (10, 12, 18, 255))
    for i, n in enumerate(names):
        sheet.alpha_composite(to_img(render(n), scale), ((i % cols) * W * scale, (i // cols) * H * scale))
    sheet.save("sheet.png")
    print("ok", sheet.size)
