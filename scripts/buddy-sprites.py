"""Generador de los compañeros (daemon, tty, patito, gato) en pixel art 40×40.

Formas geométricas -> grilla con sombreado y contorno. Las caras (ojos, bocas) y los accesorios
son comunes a todos; cada personaje define su silueta, su paleta y dónde van las partes de la cara.

  python3 scripts/buddy-sprites.py --ts lib/buddy-art.ts     # exporta para la app (sin dependencias)
  python3 scripts/buddy-sprites.py --png sheet.png          # vista previa (necesita Pillow)
"""
import json, math, sys

W = H = 40


def blank():
    return [["." for _ in range(W)] for _ in range(H)]


def ell(x, y, cx, cy, rx, ry):
    return ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0


def pixels(pred):
    return {(x, y) for y in range(H) for x in range(W) if pred(x, y)}


def curve(p0, p1, p2, r0, r1):
    """Trazo grueso sobre una curva cuadrática (cuernos, colas, antenas)."""
    out = set()
    for i in range(240):
        t = i / 239
        px = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0]
        py = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1]
        r = r0 * (1 - t) + r1 * t
        for y in range(max(0, int(py - r - 1)), min(H, int(py + r + 2))):
            for x in range(max(0, int(px - r - 1)), min(W, int(px + r + 2))):
                if (x + 0.5 - px) ** 2 + (y + 0.5 - py) ** 2 <= r * r:
                    out.add((x, y))
    return out


def shade_sphere(g, pts, cx, cy, rx, ry, outside="s"):
    """Luz arriba-izquierda: h (luz) b (base) s (sombra) d (sombra profunda)."""
    lx, ly, lz = -0.45, -0.55, 0.70
    for (x, y) in pts:
        nx, ny = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
        rr = nx * nx + ny * ny
        if rr > 1.0:
            g[y][x] = outside
            continue
        d = nx * lx + ny * ly + math.sqrt(1 - rr) * lz
        g[y][x] = "h" if d > 0.80 else "b" if d > 0.38 else "s" if d > 0.05 else "d"


def shade_flat(g, pts, tone):
    for (x, y) in pts:
        g[y][x] = tone


def outline(g):
    filled = {(x, y) for y in range(H) for x in range(W) if g[y][x] not in ".g"}
    for y in range(H):
        for x in range(W):
            if g[y][x] in ".g" and any((x + dx, y + dy) in filled for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                g[y][x] = "o"


def ground(g, cx=20, cy=38.2, rx=11, ry=1.3):
    """Sombra en el piso: lo ancla a la tarjeta en vez de flotar."""
    for (x, y) in pixels(lambda x, y: ell(x, y, cx, cy, rx, ry)):
        if g[y][x] == ".":
            g[y][x] = "g"


def stamp(g, x0, y0, rows, mirror=False):
    for dy, row in enumerate(rows):
        r = row[::-1] if mirror else row
        for dx, ch in enumerate(r):
            if ch != "." and 0 <= y0 + dy < H and 0 <= x0 + dx < W:
                g[y0 + dy][x0 + dx] = ch


def drips(pts, spots):
    out = set(pts)
    for (cx, top, ln) in spots:
        for yy in range(top, top + ln):
            out.add((cx, yy))
            if yy < top + ln - 1:
                out.add((cx + 1, yy))
    return out


# ---------------- personajes ----------------

def build_daemon(melt):
    g = blank()
    body = pixels(lambda x, y: ell(x, y, 20, 21.5, 12.8, 11.8) or ell(x, y, 14.5, 34.6, 3.4, 2.3) or ell(x, y, 25.5, 34.6, 3.4, 2.3)
                  or ell(x, y, 7.0, 25.5, 2.3, 3.2) or ell(x, y, 33.0, 25.5, 2.3, 3.2))
    if melt:
        body = drips(body, [(11, 29, 6), (17, 33, 4), (27, 32, 5), (31, 28, 5)])
    horn = set()
    for side in (-1, 1):
        horn |= curve((20 + side * 7.5, 11.5), (20 + side * 13.5, 7.0), (20 + side * 13.0, 1.5), 2.6, 0.5)
    horn -= body
    tail = curve((30, 31), (38.5, 31), (36.5, 22.5), 0.92, 0.92)
    for (dx, dy) in [(0, -4), (-1, -3), (0, -3), (1, -3), (-2, -2), (-1, -2), (0, -2), (1, -2), (2, -2), (-2, -1), (-1, -1), (0, -1), (1, -1), (2, -1)]:
        tail.add((36 + dx, 21 + dy))
    shade_flat(g, tail - body, "s")
    shade_sphere(g, body, 20, 21.5, 12.8, 11.8)
    for (x, y) in horn:  # cuernos: luz a la izquierda/arriba, sombra a la derecha
        g[y][x] = "H" if ((x - 1, y) not in horn or (x, y - 1) not in horn) else "c" if (x + 1, y) not in horn else "C"
    outline(g)
    stamp(g, 11, 12, [".ww", "ww.", "w.."])
    ground(g)
    return g


def build_tty(melt):
    """Terminal CRT: carcasa crema, pantalla oscura con scanlines, antena. La cara va en la pantalla."""
    g = blank()
    def rrect(x, y, x0, y0, x1, y1, r):
        cx = min(max(x + 0.5, x0 + r), x1 - r)
        cy = min(max(y + 0.5, y0 + r), y1 - r)
        return (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r and x0 <= x + 0.5 <= x1 and y0 <= y + 0.5 <= y1
    case = pixels(lambda x, y: rrect(x, y, 6, 7, 34, 31, 4.5))
    stand = pixels(lambda x, y: (16 <= x <= 23 and 31 <= y <= 33) or (11 <= x <= 28 and 34 <= y <= 35))
    if melt:
        case = drips(case, [(9, 30, 5), (16, 31, 3), (26, 31, 4), (31, 29, 5)])
    antenna = curve((24, 7), (26, 4), (29, 2.2), 0.7, 0.7)
    # carcasa: luz arriba-izquierda, sombra abajo-derecha
    for (x, y) in case:
        t = (x - 6) / 28 * 0.45 + (y - 7) / 24 * 0.55
        g[y][x] = "h" if t < 0.22 else "b" if t < 0.6 else "s" if t < 0.85 else "d"
    for (x, y) in stand:
        g[y][x] = "s" if y < 34 else "d"
    shade_flat(g, antenna - case, "N")
    stamp(g, 28, 0, [".AA.", "AAAA", ".AA."])
    # pantalla con scanlines
    for y in range(10, 27):
        for x in range(9, 31):
            if rrect(x, y, 9, 10, 31, 27, 2.5):
                g[y][x] = "S" if y % 2 else "T"
    # perilla y rejilla
    stamp(g, 27, 28, ["nn", "nn"])
    stamp(g, 10, 28, ["n.n.n.n"])
    outline(g)
    stamp(g, 8, 8, ["ww", "w."])
    ground(g, rx=12)
    return g


def build_patito(melt):
    """Patito de goma (rubber duck debugging): cabeza redonda sobre cuerpo, pico mango, colita."""
    g = blank()
    head = pixels(lambda x, y: ell(x, y, 20, 15.5, 10.2, 9.6))
    body = pixels(lambda x, y: ell(x, y, 20, 28.5, 14.5, 8.2))
    tail = pixels(lambda x, y: ell(x, y, 33.5, 23.5, 3.2, 2.6))
    wing = pixels(lambda x, y: ell(x, y, 25.5, 28.5, 6.5, 4.2))
    allp = head | body | tail
    if melt:
        allp = drips(allp, [(10, 34, 4), (17, 36, 2), (27, 35, 3), (31, 33, 4)])
    shade_sphere(g, (body | tail) - head, 20, 26, 15, 11)
    shade_sphere(g, head, 20, 15.5, 10.2, 9.6)
    for (x, y) in wing - head:  # ala: sombra suave sobre el cuerpo
        if g[y][x] in "hb":
            g[y][x] = "s"
    for (x, y) in allp - head - body - tail:
        g[y][x] = "s"
    outline(g)
    # pico
    stamp(g, 15, 18, [".QQQQQQQQ.", "QQQQQQQQQQ", "qqqqqqqqqq", ".qqqqqqqq."])
    stamp(g, 12, 8, [".ww", "ww.", "w.."])
    ground(g, rx=13)
    return g


def build_gato(melt):
    """Gato negro (por `cat`): orejas triangulares, ojos amarillos, bigotes, cola."""
    g = blank()
    head = pixels(lambda x, y: ell(x, y, 20, 19.5, 13.0, 10.6))
    def tri(x, y, a, b, c):
        def s(p1, p2, p3):
            return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
        p = (x + 0.5, y + 0.5)
        d1, d2, d3 = s(p, a, b), s(p, b, c), s(p, c, a)
        return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))
    ears = pixels(lambda x, y: tri(x, y, (8.5, 15), (8.0, 3.0), (18, 10)) or tri(x, y, (31.5, 15), (32.0, 3.0), (22, 10)))
    inner = pixels(lambda x, y: tri(x, y, (11, 12.5), (10, 6.0), (16, 10.4)) or tri(x, y, (29, 12.5), (30, 6.0), (24, 10.4)))
    body = pixels(lambda x, y: ell(x, y, 20, 32.5, 9.5, 5.4) or ell(x, y, 15, 35.6, 3.0, 1.9) or ell(x, y, 25, 35.6, 3.0, 1.9))
    tail = curve((28, 34), (37, 34), (35.5, 24), 1.4, 1.0)
    if melt:
        head = drips(head, [(9, 25, 6), (31, 25, 6)])
    shade_flat(g, tail - body, "s")
    shade_sphere(g, body - head, 20, 32.5, 9.5, 5.4)
    for (x, y) in ears - head:
        g[y][x] = "b" if x < 20 else "s"
    for (x, y) in inner - head:
        g[y][x] = "I"
    shade_sphere(g, head, 20, 19.5, 13.0, 10.6)
    outline(g)
    # bigotes por fuera de la cara
    for row, y in ((0, 23), (1, 25)):  # salen de los cachetes hacia afuera, cruzando el contorno
        stamp(g, 3, y, ["VVVVVV" if row == 0 else ".VVVVV"])
        stamp(g, 31, y, ["VVVVVV" if row == 0 else "VVVVV."])
    stamp(g, 11, 12, [".ww", "ww."])
    ground(g, rx=12)
    return g


CHARACTERS = {
    "daemon": dict(
        name="Daemon", build=build_daemon,
        eyes=[[12, 17], [23, 17]], mouth=[17, 25], cheeks=[[9, 24], [29, 24]], acc=[0, 0],
        palette={"o": "#161830", "h": "#ced2ff", "b": "#969df5", "s": "#6c72d6", "d": "#4c50a8",
                 "H": "#fff3d2", "C": "#eccd94", "c": "#b8925c", "k": "#101226", "w": "#ffffff",
                 "m": "#30142e", "t": "#ff7a8a", "p": "#ffa0b9", "g": "#05060c"}),
    "tty": dict(
        name="TTY", build=build_tty,
        eyes=[[13, 13], [22, 13]], mouth=[17, 21], cheeks=[[11, 20], [28, 20]], acc=[0, 1],
        palette={"o": "#14161f", "h": "#f6efe0", "b": "#ddd2bb", "s": "#b4a88f", "d": "#8a7f69",
                 "S": "#0d2a28", "T": "#123633", "N": "#8a7f69", "n": "#6e6553", "A": "#ff6b5e",
                 "k": "#5fd6c6", "w": "#d8fff8", "m": "#5fd6c6", "t": "#9cf0e4", "p": "#2c6b64", "g": "#05060c"}),
    "patito": dict(
        name="Patito", build=build_patito,
        eyes=[[12, 10], [23, 10]], mouth=[17, 19], cheeks=[[10, 16], [29, 16]], acc=[0, 2],
        palette={"o": "#2a1d08", "h": "#fff7b8", "b": "#f1e15b", "s": "#d3b836", "d": "#a58d1d",
                 "Q": "#ffb340", "q": "#e3891a", "k": "#1a1206", "w": "#ffffff",
                 "m": "#7a3d06", "t": "#ff7a8a", "p": "#ffa98a", "g": "#05060c"}),
    "gato": dict(
        name="Gato", build=build_gato,
        eyes=[[12, 16], [23, 16]], mouth=[17, 24], cheeks=[[9, 22], [29, 22]], acc=[0, 0],
        palette={"o": "#07080d", "h": "#5a6079", "b": "#3a3f55", "s": "#292d3f", "d": "#1b1e2c",
                 "I": "#ff9bb0", "V": "#c9cde0", "k": "#f1e15b", "w": "#ffffff",
                 "m": "#ff9bb0", "t": "#ff6b5e", "p": "#7a4a63", "g": "#05060c"}),
}

# caras y accesorios comunes (las coordenadas de los accesorios son para el daemon; cada personaje suma su offset)
EYES = {
    "open": [".kkk.", "kkkkk", "kwwkk", "kwkkk", "kkkkk", ".kkk."],
    "blink": [".....", ".....", ".....", "kkkkk", ".kkk.", "....."],
    "happy": [".....", ".kkk.", "k...k", "k...k", ".....", "....."],
    "sleep": [".....", ".....", "k...k", ".kkk.", ".....", "....."],
    "tired": [".....", "ddddd", "ooooo", "kwwkk", "kkkkk", ".kkk."],
    "x": ["k...k", ".k.k.", "..k..", ".k.k.", "k...k", "....."],
    "wide": [".kkk.", "kwwwk", "kwkwk", "kwwwk", ".kkk.", "....."],
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
ACC_PALETTE = {"y": "#f1e15b", "Y": "#fffac8", "r": "#ff6b5e", "a": "#5fd6c6", "f": "#ffb340",
               "l": "#a7acff", "L": "#e6e8ff", "B": "#78beff"}

PREVIEW = {  # estado -> (ojos, boca, accesorio, cachetes, derretido)
    "enforma": ("open", "smile", "sparkle", True, False),
    "cansado": ("tired", "yawn", "drop", False, False),
    "fundido": ("x", "wavy", "steam", False, True),
    "racha": ("happy", "grin", "stars", True, False),
    "durmiendo": ("sleep", "cat", "zz", True, False),
}


def compose(char, state):
    c = CHARACTERS[char]
    eyes, mouth, acc, cheeks, melt = PREVIEW[state]
    g = c["build"](melt)
    (lx, ly), (rx, ry) = c["eyes"]
    stamp(g, lx, ly, EYES[eyes])
    stamp(g, rx, ry, EYES[eyes], mirror=True)
    stamp(g, c["mouth"][0], c["mouth"][1], MOUTHS[mouth])
    if cheeks:
        for (x, y) in c["cheeks"]:
            stamp(g, x, y, ["pp"])
    if acc:
        x, y, rows = ACCS[acc]
        stamp(g, x + c["acc"][0], y + c["acc"][1], rows)
    return g


def export_ts(path):
    chars = {}
    for key, c in CHARACTERS.items():
        chars[key] = {
            "name": c["name"],
            "palette": {**ACC_PALETTE, **c["palette"]},
            "base": ["".join(r) for r in c["build"](False)],
            "baseMelt": ["".join(r) for r in c["build"](True)],
            "eyes": c["eyes"], "mouth": c["mouth"], "cheeks": c["cheeks"], "acc": c["acc"],
        }
    data = {
        "SIZE": W,
        "CHARACTERS": chars,
        "EYES": EYES,
        "MOUTHS": MOUTHS,
        "ACCESSORIES": {k: {"x": x, "y": y, "rows": rows} for k, (x, y, rows) in ACCS.items()},
    }
    lines = ["// GENERADO por scripts/buddy-sprites.py — no editar a mano: cambiá el generador y corré",
             "//   python3 scripts/buddy-sprites.py --ts lib/buddy-art.ts", ""]
    for k, v in data.items():
        lines.append(f"export const {k} = {json.dumps(v, ensure_ascii=False, indent=2)} as const;\n")
    open(path, "w").write("\n".join(lines))
    print("ts ok", path)


def export_png(path, scale=6):
    from PIL import Image
    states = list(PREVIEW)
    sheet = Image.new("RGBA", (len(states) * W * scale, len(CHARACTERS) * H * scale), (16, 19, 28, 255))
    for r, (key, c) in enumerate(CHARACTERS.items()):
        pal = {**ACC_PALETTE, **c["palette"]}
        for col, st in enumerate(states):
            g = compose(key, st)
            img = Image.new("RGBA", (W * scale, H * scale), (0, 0, 0, 0))
            px = img.load()
            for y in range(H):
                for x in range(W):
                    ch = g[y][x]
                    if ch == ".":
                        continue
                    hx = pal.get(ch, "#ff00ff").lstrip("#")
                    rgb = tuple(int(hx[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
                    for yy in range(scale):
                        for xx in range(scale):
                            px[x * scale + xx, y * scale + yy] = rgb
            sheet.alpha_composite(img, (col * W * scale, r * H * scale))
    sheet.save(path)
    print("png ok", path, sheet.size)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--ts":
        export_ts(sys.argv[2])
    elif len(sys.argv) > 2 and sys.argv[1] == "--png":
        export_png(sys.argv[2])
    else:
        print(__doc__)
