"""Generate macOS .icns for 三土.

Outputs:
  santu_app/三土.iconset/*.png  (intermediate)
  santu_app/三土.icns          (final, used by Info.plist)
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import subprocess
import shutil

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "santu_app"
ICONSET = OUT / "三土.iconset"
ICNS = OUT / "三土.icns"

# Earth-toned palette matching the app accent
BG_TOP = (212, 130, 80)      # warm clay
BG_BOTTOM = (168, 88, 50)    # darker earth
TEXT_COLOR = (252, 247, 235) # warm ivory

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Songti.ttc",  # 宋体 — serif, book-like
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            # Use bold/black face if a .ttc; index 5 ≈ Songti Bold
            try:
                return ImageFont.truetype(path, size, index=5)
            except Exception:
                try:
                    return ImageFont.truetype(path, size)
                except Exception:
                    continue
    return ImageFont.load_default()


def make_master(size: int = 1024) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # Rounded-square background with vertical gradient
    radius = int(size * 0.22)
    # Build gradient
    grad = Image.new("RGB", (1, size), 0)
    for y in range(size):
        t = y / (size - 1)
        r = int(BG_TOP[0] * (1 - t) + BG_BOTTOM[0] * t)
        g = int(BG_TOP[1] * (1 - t) + BG_BOTTOM[1] * t)
        b = int(BG_TOP[2] * (1 - t) + BG_BOTTOM[2] * t)
        grad.putpixel((0, y), (r, g, b))
    grad = grad.resize((size, size))
    # Mask with rounded rect
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size, size), radius=radius, fill=255)
    img.paste(grad, (0, 0), mask)

    # Subtle inner highlight at the top
    highlight = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(highlight).rounded_rectangle(
        (size * 0.05, size * 0.05, size * 0.95, size * 0.55),
        radius=int(size * 0.18),
        fill=(255, 255, 255, 22),
    )
    img.alpha_composite(highlight)

    # Text "三土" — large, centered, with slight drop shadow for depth
    text = "三土"
    font = load_font(int(size * 0.58))
    draw = ImageDraw.Draw(img)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) // 2 - bbox[0]
    y = (size - th) // 2 - bbox[1] - int(size * 0.02)
    # Soft shadow
    shadow_offset = max(2, size // 256)
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).text(
        (x + shadow_offset, y + shadow_offset * 2),
        text, font=font, fill=(60, 25, 8, 90),
    )
    img.alpha_composite(shadow)
    draw.text((x, y), text, font=font, fill=TEXT_COLOR)
    return img


def main():
    if ICONSET.exists():
        shutil.rmtree(ICONSET)
    ICONSET.mkdir(parents=True)

    master = make_master(1024)

    # Required sizes per Apple docs
    targets = [
        (16, "icon_16x16.png"),
        (32, "icon_16x16@2x.png"),
        (32, "icon_32x32.png"),
        (64, "icon_32x32@2x.png"),
        (128, "icon_128x128.png"),
        (256, "icon_128x128@2x.png"),
        (256, "icon_256x256.png"),
        (512, "icon_256x256@2x.png"),
        (512, "icon_512x512.png"),
        (1024, "icon_512x512@2x.png"),
    ]
    for size, name in targets:
        master.resize((size, size), Image.LANCZOS).save(ICONSET / name)

    # Run iconutil
    subprocess.run(
        ["iconutil", "-c", "icns", str(ICONSET), "-o", str(ICNS)],
        check=True,
    )
    print(f"✓ {ICNS}")


if __name__ == "__main__":
    main()
