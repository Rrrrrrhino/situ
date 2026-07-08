"""Generate 10 icon design options for 三土, laid out in a contact sheet.

三土 = 垚 (yáo, 'three earths stacked') — a nice visual pun some options use.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "santu_app" / "icon_options"
OUT.mkdir(parents=True, exist_ok=True)

SONGTI = "/System/Library/Fonts/Supplemental/Songti.ttc"   # 衬线，书卷气
HEITI = "/System/Library/Fonts/Hiragino Sans GB.ttc"       # 黑体，现代

S = 1024


def font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size, index=index)
    except Exception:
        return ImageFont.truetype(path, size)


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size, size), radius=radius, fill=255)
    return m


def gradient(size, top, bottom):
    g = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / (size - 1)
        g.putpixel((0, y), tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3)))
    return g.resize((size, size))


def base(fill, radius_frac=0.22, border=None, border_w=0, highlight=False):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    r = int(S * radius_frac)
    if isinstance(fill, tuple) and len(fill) == 2 and isinstance(fill[0], tuple):
        bg = gradient(S, fill[0], fill[1]).convert("RGBA")
    else:
        bg = Image.new("RGBA", (S, S), fill + (255,))
    img.paste(bg, (0, 0), rounded_mask(S, r))
    if highlight:
        hl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(hl).rounded_rectangle(
            (S * 0.05, S * 0.05, S * 0.95, S * 0.5), radius=int(S * 0.18),
            fill=(255, 255, 255, 20))
        img.alpha_composite(hl)
    if border:
        ImageDraw.Draw(img).rounded_rectangle(
            (border_w // 2, border_w // 2, S - border_w // 2, S - border_w // 2),
            radius=r, outline=border, width=border_w)
    return img


def text_center(img, text, fnt, color, dy=0):
    d = ImageDraw.Draw(img)
    b = d.textbbox((0, 0), text, font=fnt)
    tw, th = b[2] - b[0], b[3] - b[1]
    x = (S - tw) // 2 - b[0]
    y = (S - th) // 2 - b[1] + dy
    d.text((x, y), text, font=fnt, fill=color)


def text_vertical(img, chars, fnt, color, gap_frac=0.05):
    d = ImageDraw.Draw(img)
    boxes = [d.textbbox((0, 0), c, font=fnt) for c in chars]
    hs = [b[3] - b[1] for b in boxes]
    gap = int(S * gap_frac)
    total = sum(hs) + gap * (len(chars) - 1)
    y = (S - total) // 2
    for c, b in zip(chars, boxes):
        w = b[2] - b[0]
        x = (S - w) // 2 - b[0]
        d.text((x, y - b[1]), c, font=fnt, fill=color)
        y += (b[3] - b[1]) + gap


def triangle_chars(img, ch, fnt, color):
    d = ImageDraw.Draw(img)
    b = d.textbbox((0, 0), ch, font=fnt)
    w = b[2] - b[0]
    positions = [(0.5, 0.27), (0.32, 0.60), (0.68, 0.60)]
    for fx, fy in positions:
        x = int(S * fx) - w // 2 - b[0]
        y = int(S * fy) - (b[3] - b[1]) // 2 - b[1]
        d.text((x, y), ch, font=fnt, fill=color)


IVORY = (252, 247, 235)
INK = (45, 43, 38)

# (build function) per option
def opt01():  # 暖橙渐变 + 衬线三土（现状基线）
    img = base(((212, 130, 80), (168, 88, 50)), highlight=True)
    text_center(img, "三土", font(SONGTI, int(S * 0.46), 5), IVORY)
    return img

def opt02():  # 深蓝渐变 + 衬线三土
    img = base(((46, 96, 142), (24, 54, 88)), highlight=True)
    text_center(img, "三土", font(SONGTI, int(S * 0.46), 5), IVORY)
    return img

def opt03():  # 米白底 + 墨色竖排三土（书卷）
    img = base((245, 240, 230))
    text_vertical(img, "三土", font(SONGTI, int(S * 0.40), 5), INK)
    return img

def opt04():  # 暖橙渐变 + 大字「垚」
    img = base(((212, 130, 80), (168, 88, 50)), highlight=True)
    text_center(img, "垚", font(SONGTI, int(S * 0.66), 5), IVORY, dy=int(S*0.01))
    return img

def opt05():  # 深蓝渐变 + 大字「垚」
    img = base(((46, 96, 142), (24, 54, 88)), highlight=True)
    text_center(img, "垚", font(SONGTI, int(S * 0.66), 5), IVORY, dy=int(S*0.01))
    return img

def opt06():  # 印章红 + 白边 + 黑体三土（中式）
    img = base((176, 58, 46), radius_frac=0.12, border=(252, 247, 235), border_w=int(S*0.055))
    text_center(img, "三土", font(HEITI, int(S * 0.44), 0), IVORY)
    return img

def opt07():  # 墨绿渐变 + 米金三土
    img = base(((47, 93, 80), (27, 57, 48)), highlight=True)
    text_center(img, "三土", font(SONGTI, int(S * 0.46), 5), (232, 217, 160))
    return img

def opt08():  # 蓝紫渐变 + 黑体三土
    img = base(((92, 112, 178), (58, 74, 140)), highlight=True)
    text_center(img, "三土", font(HEITI, int(S * 0.44), 0), (255, 255, 255))
    return img

def opt09():  # 白底 + 细墨边 + 深蓝三个土三角（垚拆解）
    img = base((246, 243, 236), border=(26, 58, 92), border_w=int(S*0.02))
    triangle_chars(img, "土", font(SONGTI, int(S * 0.30), 5), (26, 58, 92))
    return img

def opt10():  # 靛蓝纯色 + 黑体三土（极简）
    img = base((52, 73, 94))
    text_center(img, "三土", font(HEITI, int(S * 0.44), 0), (255, 255, 255))
    return img


BUILDERS = [opt01, opt02, opt03, opt04, opt05, opt06, opt07, opt08, opt09, opt10]


def main():
    icons = []
    for i, fn in enumerate(BUILDERS, 1):
        img = fn().resize((512, 512), Image.LANCZOS)
        p = OUT / f"icon_{i:02d}.png"
        img.save(p)
        icons.append(img)

    # Contact sheet 5x2
    cell, pad, label_h, cols, rows = 300, 34, 40, 5, 2
    W = cols * cell + pad * (cols + 1)
    H = rows * (cell + label_h) + pad * (rows + 1)
    sheet = Image.new("RGB", (W, H), (250, 249, 245))
    draw = ImageDraw.Draw(sheet)
    lbl = font(HEITI, 30, 0)
    for i, ic in enumerate(icons):
        c, r = i % cols, i // cols
        x = pad + c * (cell + pad)
        y = pad + r * (cell + label_h + pad)
        thumb = ic.resize((cell, cell), Image.LANCZOS)
        sheet.paste(thumb, (x, y), thumb)
        draw.text((x + cell // 2, y + cell + 4), f"方案 {i+1}", font=lbl, fill=(70, 68, 62), anchor="ma")
    sheet_path = OUT / "_contact_sheet.png"
    sheet.save(sheet_path)
    print(f"✓ {sheet_path}")


if __name__ == "__main__":
    main()
