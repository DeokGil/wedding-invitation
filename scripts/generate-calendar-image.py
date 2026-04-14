from pathlib import Path
import calendar
from PIL import Image, ImageDraw, ImageFont


ROOT = Path("c:\\Users\\user\\Desktop\\wedding-invitation-main")
OUTPUT_PATH = ROOT / "public/static/assets/images/calendar_nov_2027.webp"

WIDTH = 1698
HEIGHT = 1862

BG = (255, 255, 255)
TEXT_MAIN = (88, 88, 88)
TEXT_SUB = (145, 145, 145)
TEXT_DARK = (35, 35, 35)
TEXT_SUN = (225, 178, 182)
TEXT_SAT = (152, 152, 152)
LINE = (216, 216, 216)
HIGHLIGHT = (225, 178, 182)


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size)


def draw_centered_text(draw: ImageDraw.ImageDraw, text: str, y: int, font: ImageFont.FreeTypeFont, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    x = (WIDTH - text_width) // 2
    draw.text((x, y), text, font=font, fill=fill)


def draw_calendar():
    image = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(image)

    # Fonts
    ko_title_font = load_font("/System/Library/Fonts/AppleSDGothicNeo.ttc", 65)
    en_title_font = load_font("/System/Library/Fonts/Helvetica.ttc", 61)
    weekday_font = load_font("/System/Library/Fonts/AppleSDGothicNeo.ttc", 63)
    day_font = load_font("/System/Library/Fonts/Helvetica.ttc", 67)

    # Top text
    draw_centered_text(draw, "2027년 11월 1일 | 오후 2시", 130, ko_title_font, TEXT_MAIN)
    draw_centered_text(draw, "Monday, November 1, 2027 | PM 2:00", 275, en_title_font, TEXT_SUB)

    # Divider lines
    draw.line([(24, 527), (WIDTH - 24, 527)], fill=LINE, width=4)
    draw.line([(24, HEIGHT - 24), (WIDTH - 24, HEIGHT - 24)], fill=LINE, width=4)

    # Weekday headers
    weekdays = ["일", "월", "화", "수", "목", "금", "토"]
    left = 95
    right = WIDTH - 95
    col_step = (right - left) / 6
    header_y = 660

    for idx, label in enumerate(weekdays):
        x = int(left + idx * col_step)
        color = TEXT_SUN if idx == 0 else TEXT_DARK
        draw.text((x, header_y), label, font=weekday_font, fill=color, anchor="mm")

    # November 2027 (Sunday-first)
    cal = calendar.Calendar(firstweekday=6)
    weeks = cal.monthdayscalendar(2027, 11)

    first_row_y = 910
    row_step = 170

    for row_idx, week in enumerate(weeks):
        y = first_row_y + row_idx * row_step
        for col_idx, day in enumerate(week):
            if day == 0:
                continue

            x = int(left + col_idx * col_step)

            # Highlight wedding day
            if day == 1:
                draw.ellipse((x - 61, y - 61, x + 61, y + 61), fill=HIGHLIGHT)
                draw.text((x, y + 2), str(day), font=day_font, fill=(255, 255, 255), anchor="mm")
                continue

            if col_idx == 0:  # Sunday
                color = TEXT_SUN
            elif col_idx == 6:  # Saturday
                color = TEXT_SAT
            else:
                color = TEXT_DARK

            draw.text((x, y + 2), str(day), font=day_font, fill=color, anchor="mm")

    image.save(OUTPUT_PATH, "WEBP", lossless=True, method=6)


if __name__ == "__main__":
    draw_calendar()
    print(f"Updated calendar image: {OUTPUT_PATH}")
