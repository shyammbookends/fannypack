"""Makes a WebP copy next to every large site image: public/img/x.jpg -> public/img/x.jpg.webp
(and uploads/ too). The server sends the .webp automatically to browsers that support it,
so pages stay the same but download far less. Originals are never changed.

Usage:  npm run images      (needs Python + Pillow: pip install pillow)
Run again after adding photos to public/img. Admin uploads are converted when this runs.
"""
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# site photos (frontend) + photos uploaded in the admin (backend)
DIRS = [os.path.join(ROOT, 'public', 'img'), os.path.join(ROOT, '..', 'backend', 'uploads')]
MAX_SIDE = {'logo.png': 900}  # the logo is never shown bigger than this
DEFAULT_MAX = 1600
MIN_BYTES = 15 * 1024          # small files are not worth it


def convert(path):
    out = path + '.webp'
    if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(path):
        return None
    im = Image.open(path)
    im.load()
    has_alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
    im = im.convert('RGBA' if has_alpha else 'RGB')
    limit = MAX_SIDE.get(os.path.basename(path), DEFAULT_MAX)
    if max(im.size) > limit:
        im.thumbnail((limit, limit), Image.LANCZOS)
    im.save(out, 'WEBP', quality=80, method=6, alpha_quality=90)
    before, after = os.path.getsize(path), os.path.getsize(out)
    if after >= before * 0.9:  # no real gain: don't keep it
        os.remove(out)
        return (path, before, before)
    return (path, before, after)


def main():
    total_before = total_after = 0
    for base in DIRS:
        if not os.path.isdir(base):
            continue
        for dirpath, _, files in os.walk(base):
            for f in files:
                if not f.lower().endswith(('.jpg', '.jpeg', '.png')):
                    continue
                p = os.path.join(dirpath, f)
                if os.path.getsize(p) < MIN_BYTES:
                    continue
                r = convert(p)
                if r:
                    _, b, a = r
                    total_before += b
                    total_after += a
                    print(f'{os.path.relpath(p, ROOT)}: {b // 1024} KB -> {a // 1024} KB')
    if total_before:
        print(f'Total: {total_before // 1024} KB -> {total_after // 1024} KB')
    else:
        print('All images already have up-to-date WebP copies.')


if __name__ == '__main__':
    sys.exit(main())
