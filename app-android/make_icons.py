# -*- coding: utf-8 -*-
"""生成 Android 图标与启动图（无 Android Studio 时用 Pillow 直接铺资源）"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
FONT = '/home/josiah/.local/share/fonts/winfonts/msyhbd.ttf'

BLUE_DARK = (27, 58, 140)
BLUE = (43, 108, 246)
WHITE = (255, 255, 255)


def font(size):
    return ImageFont.truetype(FONT, size)


def glyph(img, text, size_px, color=WHITE, center=None, dy=0):
    d = ImageDraw.Draw(img)
    f = font(size_px)
    bbox = d.textbbox((0, 0), text, font=f)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    cx, cy = center or (img.width // 2, img.height // 2)
    d.text((cx - w / 2 - bbox[0], cy - h / 2 - bbox[1] + dy), text, font=f, fill=color)


def rounded(size, radius_ratio=0.22):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 渐变底
    for y in range(size):
        t = y / max(1, size - 1)
        col = tuple(int(BLUE_DARK[i] + (BLUE[i] - BLUE_DARK[i]) * t) for i in range(3))
        d.line([(0, y), (size, y)], fill=col + (255,))
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255)
    img.putalpha(mask)
    return img


def circle(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(1, size - 1)
        col = tuple(int(BLUE_DARK[i] + (BLUE[i] - BLUE_DARK[i]) * t) for i in range(3))
        d.line([(0, y), (size, y)], fill=col + (255,))
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    img.putalpha(mask)
    return img


MIP = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}


def main():
    # 传统图标（api < 26）
    for bucket, base in MIP.items():
        d = os.path.join(RES, 'mipmap-' + bucket)
        os.makedirs(d, exist_ok=True)
        sq = rounded(base * 2)
        glyph(sq, '文', int(base * 1.15))
        sq.resize((base, base), Image.LANCZOS).save(os.path.join(d, 'ic_launcher.png'))

        rd = circle(base * 2)
        glyph(rd, '文', int(base * 1.1))
        rd.resize((base, base), Image.LANCZOS).save(os.path.join(d, 'ic_launcher_round.png'))

        # 自适应图标前景（108dp 画布，安全区 72dp）
        fg = Image.new('RGBA', (base * 3, base * 3), (0, 0, 0, 0))
        glyph(fg, '文', int(base * 1.35))
        fg.save(os.path.join(d, 'ic_launcher_foreground.png'))

    # 启动图
    splash = {
        'drawable-port-mdpi': (320, 480), 'drawable-port-hdpi': (480, 800),
        'drawable-port-xhdpi': (720, 1280), 'drawable-port-xxhdpi': (960, 1600),
        'drawable-port-xxxhdpi': (1280, 1920),
        'drawable-land-mdpi': (480, 320), 'drawable-land-hdpi': (800, 480),
        'drawable-land-xhdpi': (1280, 720), 'drawable-land-xxhdpi': (1600, 960),
        'drawable-land-xxxhdpi': (1920, 1280),
    }
    for bucket, (w, h) in splash.items():
        d = os.path.join(RES, bucket)
        os.makedirs(d, exist_ok=True)
        img = Image.new('RGB', (w, h), BLUE_DARK)
        glyph(img, '文献助手', int(min(w, h) * 0.11), WHITE, dy=-int(min(w, h) * 0.02))
        glyph(img, 'DocAssist', int(min(w, h) * 0.045), (200, 214, 240), dy=int(min(w, h) * 0.10))
        img.save(os.path.join(d, 'splash.png'))

    # 背景色资源
    colors = os.path.join(RES, 'values', 'ic_launcher_background.xml')
    with open(colors, 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
                '    <color name="ic_launcher_background">#1B3A8C</color>\n</resources>\n')

    print('icons + splash written to', RES)


if __name__ == '__main__':
    main()
