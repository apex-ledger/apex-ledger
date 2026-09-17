"""Title and end cards for Apex Ledger videos (1920x1080), in the website's colours."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONTS = Path("C:/Windows/Fonts")
LOGO = Path(__file__).resolve().parents[2] / "website" / "icon-512.png"
GREEN_DARK, GREEN, GOLD, WHITE, MINT = (11, 74, 46), (15, 122, 69), (229, 164, 18), (255, 255, 255), (201, 242, 218)
W, H = 1920, 1080


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def gradient() -> Image.Image:
    img = Image.new("RGB", (W, H), GREEN_DARK)
    px = img.load()
    for y in range(H):
        for x in range(0, W, 2):
            t = (x / W) * 0.6 + (y / H) * 0.4
            c = tuple(int(GREEN_DARK[i] + (GREEN[i] - GREEN_DARK[i]) * t) for i in range(3))
            px[x, y] = c
            if x + 1 < W:
                px[x + 1, y] = c
    return img


def centered(draw: ImageDraw.ImageDraw, y: int, text: str, fnt, fill) -> int:
    w = draw.textlength(text, font=fnt)
    draw.text(((W - w) / 2, y), text, font=fnt, fill=fill)
    return y + fnt.size + int(fnt.size * 0.35)


def logo_on(img: Image.Image, size: int, y: int) -> None:
    mark = Image.open(LOGO).convert("RGBA").resize((size, size))
    img.paste(mark, ((W - size) // 2, y), mark)


def title_card(title: str, subtitle: str, out: Path) -> None:
    img = gradient()
    logo_on(img, 170, 190)
    d = ImageDraw.Draw(img)
    y = centered(d, 400, "apexledger.", font("segoeuib.ttf", 64), WHITE)
    y = centered(d, y + 40, title, font("segoeuib.ttf", 96), WHITE)
    centered(d, y + 10, subtitle, font("segoeui.ttf", 50), MINT)
    img.save(out)


def end_card(out: Path) -> None:
    img = gradient()
    logo_on(img, 150, 170)
    d = ImageDraw.Draw(img)
    y = centered(d, 360, "Start your free month", font("segoeuib.ttf", 104), WHITE)
    y = centered(d, y + 10, "apexledger.ca", font("segoeuib.ttf", 88), GOLD)
    y = centered(d, y + 30, "Canadian accounting · GST/HST · Payroll · Year-end", font("segoeui.ttf", 46), MINT)
    centered(d, y + 10, "Your data stays in Canada", font("segoeui.ttf", 46), MINT)
    img.save(out)


if __name__ == "__main__":
    folder = Path(sys.argv[1])
    title_card(sys.argv[2], sys.argv[3], folder / "title.png")
    end_card(folder / "end.png")
    print("cards written to", folder)
