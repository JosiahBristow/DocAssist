# -*- coding: utf-8 -*-
"""把 .pptx 反读并用 PIL 重绘成 PNG，用于版式自检（无 LibreOffice 时的替代方案）。
坐标/颜色/文字都来自文件本身，不是原始意图。"""
import io, os, sys
from PIL import Image, ImageDraw, ImageFont
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pptx.oxml.ns import qn

DPI = 150
FONT_B = "/home/josiah/.local/share/fonts/winfonts/msyhbd.ttf"
FONT_R = "/home/josiah/.local/share/fonts/winfonts/msyh.ttf"
_fc = {}

def font(size_px, bold):
    key = (int(size_px), bold)
    if key not in _fc:
        _fc[key] = ImageFont.truetype(FONT_B if bold else FONT_R, int(size_px))
    return _fc[key]

def emu2px(v):
    return int(round(v / 914400 * DPI))

def get_color(fmt):
    try:
        if fmt.type is None: return None
        if int(fmt.type) == 1:  # SOLID
            el = fmt.fore_color._xFill
            alpha = el.find('.//' + qn('a:alpha'))
            if alpha is not None and int(alpha.get('val')) < 5000:
                return None
            return tuple(fmt.fore_color.rgb)
    except Exception:
        return None
    return None

def line_of(shape):
    try:
        ln = shape.line
        if ln.fill.type is None: return None
        c = ln.color.rgb
        w = ln.width
        return (tuple(c), max(1, emu2px(w) if w else 2))
    except Exception:
        return None

def geometry(shape):
    """返回 ('ellipse'|'rect'|'rrect'|'poly', points)"""
    spPr = shape._element.spPr
    pg = spPr.find(qn('a:prstGeom'))
    if pg is not None:
        prst = pg.get('prst')
        return prst, None
    cg = spPr.find(qn('a:custGeom'))
    if cg is not None:
        path = cg.find(qn('a:pathLst')).find(qn('a:path'))
        pw = int(path.get('w') or 0); ph = int(path.get('h') or 0)
        pts, closed = [], False
        for node in path:
            tag = node.tag.split('}')[1]
            if tag in ('moveTo', 'lnTo'):
                pt = node.find(qn('a:pt'))
                pts.append((int(pt.get('x')), int(pt.get('y'))))
            elif tag == 'close':
                closed = True
        return ('cust', (pts, pw, ph, closed))
    return 'rect', None

def para_runs(tf):
    out = []
    for p in tf.paragraphs:
        runs = []
        for r in p.runs:
            sz = r.font.size.pt if r.font.size else 18
            col = (0, 0, 0)
            try:
                if r.font.color and r.font.color.type is not None:
                    col = tuple(r.font.color.rgb)
            except Exception:
                pass
            spc = 0.0
            try:
                spc_v = r._r.find(qn('a:rPr'))
                if spc_v is not None and spc_v.get('spc'):
                    spc = int(spc_v.get('spc')) / 100.0
            except Exception:
                pass
            runs.append((r.text, sz, bool(r.font.bold), col, spc))
        if runs:
            al = p.alignment
            ls = p.line_spacing if isinstance(p.line_spacing, float) else 1.0
            out.append((runs, al, ls))
    return out

def wrap_para(runs, max_w, scale):
    """按字符折行，返回 [[(char, font, advance, size, bold, color), ...], ...]"""
    lines, cur, cur_w = [], [], 0
    for txt, sz, bold, col, spc in runs:
        f = font(sz * scale, bold)
        extra = spc * scale
        for ch in txt:
            try:
                w = f.getlength(ch) + extra
            except Exception:
                w = sz * scale * (0.55 if ord(ch) < 128 else 1.0) + extra
            if cur_w + w > max_w and cur:
                lines.append(cur); cur, cur_w = [], 0
                if ch == ' ':
                    continue
            cur.append((ch, f, w, sz, bold, col))
            cur_w += w
    if cur: lines.append(cur)
    return lines

def draw_text(d, tf, x, y, w, h, scale, default_color=(0, 0, 0)):
    paras = para_runs(tf)
    if not paras: return
    ml = emu2px(tf.margin_left or 0); mr = emu2px(tf.margin_right or 0)
    mt = emu2px(tf.margin_top or 0); mb = emu2px(tf.margin_bottom or 0)
    inner_w = max(10, w - ml - mr)
    blocks = []  # (lines, para)
    total_h = 0
    for runs, al, ls in paras:
        lines = wrap_para(runs, inner_w, scale)
        maxsz = max(sz for _, sz, _, _, _ in runs)
        lh = maxsz * scale * 1.32 * (ls or 1.0)
        blocks.append((lines, al, lh, maxsz))
        total_h += lh * max(1, len(lines))
    anchor = str(tf.vertical_anchor) if tf.vertical_anchor is not None else 'TOP'
    ty = y + mt
    if 'MIDDLE' in anchor: ty += (h - mt - mb - total_h) / 2
    elif 'BOTTOM' in anchor: ty += (h - mt - mb - total_h)
    for lines, al, lh, maxsz in blocks:
        for ln in lines:
            lw = sum(c[2] for c in ln)
            tx = x + ml
            if al is not None and 'CENTER' in str(al): tx = x + ml + (inner_w - lw) / 2
            elif al is not None and 'RIGHT' in str(al): tx = x + ml + inner_w - lw
            base = ty + (lh - maxsz * scale * 1.05) / 2
            for ch, f, cw, sz, bold, col in ln:
                d.text((tx, base), ch, font=f, fill=col)
                tx += cw
            ty += lh

def render(pptx_path, outdir):
    prs = Presentation(pptx_path)
    SW, SH = emu2px(prs.slide_width), emu2px(prs.slide_height)
    scale = DPI / 72.0
    os.makedirs(outdir, exist_ok=True)
    paths = []
    for idx, slide in enumerate(prs.slides, 1):
        bgl = get_color(slide.background.fill) or (255, 255, 255)
        canvas = Image.new("RGB", (SW, SH), bgl)
        for sh in slide.shapes:
            if sh.left is None: continue
            x, y = emu2px(sh.left), emu2px(sh.top)
            w, h = emu2px(sh.width), emu2px(sh.height)
            rot = float(sh.rotation or 0)
            pad = 30
            if rot:
                layer = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
                dl = ImageDraw.Draw(layer)
                bx, by = pad, pad
            else:
                layer, dl, bx, by = canvas, ImageDraw.Draw(canvas), x, y
            col = get_color(sh.fill) if sh.shape_type != MSO_SHAPE_TYPE.PICTURE else None
            ln = line_of(sh) if sh.shape_type != MSO_SHAPE_TYPE.PICTURE else None
            try:
                ln = line_of(sh)
            except Exception:
                ln = None
            lcol, lw = (ln if ln else (None, 0))
            g, extra = geometry(sh)
            if g in ('line', 'straightConnector1'):
                continue
            if sh.shape_type == MSO_SHAPE_TYPE.PICTURE:
                im = Image.open(io.BytesIO(sh.image.blob)).convert("RGB").resize((max(1, w), max(1, h)), Image.LANCZOS)
                mask = None
                if g == 'ellipse':
                    mask = Image.new("L", (w, h), 0)
                    ImageDraw.Draw(mask).ellipse([0, 0, w - 1, h - 1], fill=255)
                if mask: layer.paste(im, (bx, by), mask)
                else: layer.paste(im, (bx, by))
                if ln:
                    dl.ellipse([bx, by, bx + w - 1, by + h - 1], outline=lcol, width=lw)
            elif g in ('ellipse', 'oval'):
                dl.ellipse([bx, by, bx + w - 1, by + h - 1], fill=col, outline=lcol, width=lw)
            elif g in ('roundRect', 'roundRect2'):
                dl.rounded_rectangle([bx, by, bx + w - 1, by + h - 1], radius=min(w, h) * 0.45, fill=col, outline=lcol, width=lw)
            elif g in ('triangle', 'rtTriangle'):
                pts = [(bx + w // 2, by), (bx + w, by + h), (bx, by + h)]
                dl.polygon(pts, fill=col)
                if lcol: dl.line(pts + [pts[0]], fill=lcol, width=lw, joint="curve")
            elif g == 'diamond':
                pts = [(bx + w // 2, by), (bx + w, by + h // 2), (bx + w // 2, by + h), (bx, by + h // 2)]
                dl.polygon(pts, fill=col)
                if lcol: dl.line(pts + [pts[0]], fill=lcol, width=lw, joint="curve")
            elif g == 'cross':
                a = min(w, h) * 0.33; cx, cy = bx + w / 2, by + h / 2
                pts = [(cx - a, by), (cx + a, by), (cx + a, cy - a), (bx + w, cy - a), (bx + w, cy + a),
                       (cx + a, cy + a), (cx + a, by + h), (cx - a, by + h), (cx - a, cy + a),
                       (bx, cy + a), (bx, cy - a), (cx - a, cy - a)]
                dl.polygon(pts, fill=col)
                if lcol: dl.line(pts + [pts[0]], fill=lcol, width=lw, joint="curve")
            elif g == 'cust':
                pts, pw, ph, closed = extra
                sx = w / pw if pw else 1; sy = h / ph if ph else 1
                P = [(bx + p[0] * sx, by + p[1] * sy) for p in pts]
                if len(P) > 2:
                    if closed or col: dl.polygon(P, fill=col)
                    seq = P + [P[0]] if closed else P
                    if lcol: dl.line(seq, fill=lcol, width=lw, joint="curve")
            else:
                dl.rectangle([bx, by, bx + w - 1, by + h - 1], fill=col, outline=lcol, width=lw)
            # 文字
            if sh.has_text_frame and sh.text_frame.text.strip():
                tf = sh.text_frame
                if rot:
                    draw_text(dl, tf, bx, by, w, h, scale)
                    layer = layer.rotate(-rot, center=(bx + w / 2, by + h / 2), resample=Image.BICUBIC)
                    canvas.paste(layer, (x - pad, y - pad), layer)
                else:
                    draw_text(dl, tf, x, y, w, h, scale)
            elif rot:
                layer = layer.rotate(-rot, center=(bx + w / 2, by + h / 2), resample=Image.BICUBIC)
                canvas.paste(layer, (x - pad, y - pad), layer)
        p = os.path.join(outdir, "slide-%02d.png" % idx)
        canvas.save(p); paths.append(p)
    return paths

if __name__ == "__main__":
    ps = render(sys.argv[1], sys.argv[2])
    for p in ps: print(p)
