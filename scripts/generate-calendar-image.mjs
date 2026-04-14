import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, '..');
const OUTPUT_PATH = path.join(ROOT, 'public/static/assets/images/calendar.webp');

const WIDTH = 1698;
const HEIGHT = 1862;

const BG = '#FFFFFF';
const TEXT_MAIN = '#585858';
const TEXT_SUB = '#919191';
const TEXT_DARK = '#232323';
const TEXT_SUN = '#E1B2B6';
const TEXT_SAT = '#989898';
const LINE = '#D8D8D8';
const HIGHLIGHT = '#E1B2B6';

function drawCenteredText(ctx, text, y, font, fill) {
    ctx.font = font;
    ctx.fillStyle = fill;
    const metrics = ctx.measureText(text);
    const x = (WIDTH - metrics.width) / 2;
    ctx.fillText(text, x, y);
}

async function drawCalendar() {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Top text
    drawCenteredText(ctx, '2027년 11월 1일 | 오후 2시', 200, 'bold 65px "Segoe UI", Arial', TEXT_MAIN);
    drawCenteredText(ctx, 'Monday, November 1, 2027 | PM 2:00', 330, '61px "Segoe UI", Arial', TEXT_SUB);

    // Divider lines
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(24, 527);
    ctx.lineTo(WIDTH - 24, 527);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(24, HEIGHT - 24);
    ctx.lineTo(WIDTH - 24, HEIGHT - 24);
    ctx.stroke();

    // Weekday headers
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const left = 95;
    const right = WIDTH - 95;
    const colStep = (right - left) / 6;
    const headerY = 720;

    ctx.font = '63px "Segoe UI", Arial';
    for (let idx = 0; idx < weekdays.length; idx++) {
        const x = left + idx * colStep;
        ctx.fillStyle = idx === 0 ? TEXT_SUN : TEXT_DARK;
        const metrics = ctx.measureText(weekdays[idx]);
        ctx.fillText(weekdays[idx], x - metrics.width / 2, headerY);
    }

    // November 2027 calendar
    const year = 2027;
    const month = 11;
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();

    const firstRowY = 910;
    const rowStep = 170;

    let dayNum = 1;
    for (let row = 0; row < 6; row++) {
        const y = firstRowY + row * rowStep;
        for (let col = 0; col < 7; col++) {
            if (row === 0 && col < firstDay) continue;
            if (dayNum > daysInMonth) break;

            const x = left + col * colStep;
            
            // Highlight wedding day (November 1)
            if (dayNum === 1) {
                ctx.fillStyle = HIGHLIGHT;
                ctx.beginPath();
                ctx.arc(x, y, 61, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 67px "Segoe UI", Arial';
                const metrics = ctx.measureText(String(dayNum));
                ctx.fillText(String(dayNum), x - metrics.width / 2, y + 15);
            } else {
                ctx.font = '67px "Segoe UI", Arial';
                if (col === 0) {
                    ctx.fillStyle = TEXT_SUN;
                } else if (col === 6) {
                    ctx.fillStyle = TEXT_SAT;
                } else {
                    ctx.fillStyle = TEXT_DARK;
                }
                const metrics = ctx.measureText(String(dayNum));
                ctx.fillText(String(dayNum), x - metrics.width / 2, y + 15);
            }

            dayNum++;
        }
        if (dayNum > daysInMonth) break;
    }

    // Save as WebP via sharp
    const pngBuffer = canvas.toBuffer('image/png');
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    await sharp(pngBuffer).webp({ lossless: true }).toFile(OUTPUT_PATH);
    console.log(`Updated calendar image: ${OUTPUT_PATH}`);
}

drawCalendar();
