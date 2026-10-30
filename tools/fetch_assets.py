#!/usr/bin/env python3
"""Find freely-licensed photos on Wikimedia Commons, cut out the background
with rembg, and write candidates + license metadata for review.

Usage: python tools/fetch_assets.py tools/asset_queries.json out_dir
"""
import io, json, re, sys, time, html
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont
from rembg import new_session, remove

API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "ScreenDestroyerAssetBot/1.0 (https://github.com/miladtavakoli/screen-destroyer)"}
FREE = re.compile(r"^(cc0|public domain|pd|cc[- ]by(-sa)?( \d\.\d)?( [a-z]+)?|cc-by(-sa)?-\d\.\d.*)$", re.I)


def clean(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def search(term, limit):
    params = {
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": f"{term} filetype:bitmap", "gsrnamespace": 6, "gsrlimit": limit,
        "prop": "imageinfo", "iiprop": "url|extmetadata|size|mime", "iiurlwidth": 1100,
    }
    r = requests.get(API, params=params, headers=UA, timeout=60)
    r.raise_for_status()
    pages = r.json().get("query", {}).get("pages", {})
    out = []
    for p in sorted(pages.values(), key=lambda p: p.get("index", 0)):
        ii = (p.get("imageinfo") or [{}])[0]
        md = ii.get("extmetadata", {})
        lic = clean(md.get("LicenseShortName", {}).get("value"))
        if not FREE.match(lic):
            continue
        if ii.get("mime") not in ("image/jpeg", "image/png", "image/webp"):
            continue
        out.append({
            "title": p["title"], "thumb": ii.get("thumburl") or ii.get("url"), "page": ii.get("descriptionurl"),
            "license": lic, "license_url": clean(md.get("LicenseUrl", {}).get("value")),
            "artist": clean(md.get("Artist", {}).get("value"))[:200],
        })
    return out


def by_titles(titles):
    params = {"action": "query", "format": "json", "titles": "|".join(titles), "prop": "imageinfo",
              "iiprop": "url|extmetadata|size|mime", "iiurlwidth": 1400}
    r = requests.get(API, params=params, headers=UA, timeout=60); r.raise_for_status()
    out = []
    for p in r.json().get("query", {}).get("pages", {}).values():
        ii = (p.get("imageinfo") or [{}])[0]
        if not ii: print("missing", p.get("title")); continue
        md = ii.get("extmetadata", {})
        out.append({"title": p["title"], "thumb": ii.get("thumburl") or ii.get("url"), "page": ii.get("descriptionurl"),
                    "license": clean(md.get("LicenseShortName", {}).get("value")),
                    "license_url": clean(md.get("LicenseUrl", {}).get("value")),
                    "artist": clean(md.get("Artist", {}).get("value"))[:200]})
    return out


def category_titles(cat, limit):
    params = {"action": "query", "format": "json", "list": "categorymembers", "cmtitle": cat,
              "cmtype": "file", "cmlimit": limit}
    r = requests.get(API, params=params, headers=UA, timeout=60); r.raise_for_status()
    return [m["title"] for m in r.json()["query"]["categorymembers"]]


def largest_component(img):
    """Keep only the biggest opaque blob (drops scale bars, labels, stray bits)."""
    import numpy as np
    from scipy import ndimage
    a = np.array(img)
    mask = a[:, :, 3] > 40
    lab, n = ndimage.label(ndimage.binary_dilation(mask, iterations=3))
    if n <= 1: return img
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    keep = lab == (int(np.argmax(sizes)) + 1)
    a[:, :, 3] = np.where(keep, a[:, :, 3], 0)
    return Image.fromarray(a)


def main():
    queries = json.load(open(sys.argv[1]))
    out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
    session = new_session("isnet-general-use")
    for key, spec in queries.items():
        d = out / key; d.mkdir(exist_ok=True)
        cands, seen = [], set()
        titles = list(spec.get("titles", []))
        if spec.get("category"):
            titles += category_titles(spec["category"], spec.get("max", 40))
        for k in range(0, len(titles), 40):
            try:
                for c in by_titles(titles[k:k + 40]):
                    seen.add(c["title"]); cands.append(c)
            except Exception as e:
                print("titles failed", key, e)
        cands = [c for c in cands if FREE.match(c["license"])]
        for term in spec.get("terms", []):
            try:
                for c in search(term, spec.get("per_term", 10)):
                    if c["title"] not in seen:
                        seen.add(c["title"]); cands.append(c)
            except Exception as e:
                print("search failed", key, term, e)
            time.sleep(0.5)
        cands = cands[: spec.get("max", 12)]
        meta, tiles = [], []
        for i, c in enumerate(cands):
            try:
                raw = requests.get(c["thumb"], headers=UA, timeout=60).content
                img = Image.open(io.BytesIO(raw)).convert("RGBA")
                cut = remove(img, session=session, post_process_mask=True)
                bbox = cut.getbbox()
                if not bbox:
                    continue
                cut = largest_component(cut.crop(bbox))
                cut = cut.crop(cut.getbbox())
                cut.thumbnail((spec.get("size", 700),) * 2)
                name = f"{i:02d}.png"
                cut.save(d / name, optimize=True)
                c["file"] = f"{key}/{name}"
                meta.append(c)
                tiles.append((name, cut))
                print("ok", key, name, c["title"], c["license"])
            except Exception as e:
                print("failed", key, c["title"], e)
            time.sleep(0.3)
        json.dump(meta, open(d / "meta.json", "w"), indent=1, ensure_ascii=False)
        # contact sheet on a checkerboard so cut-out quality is visible
        if tiles:
            T = 260; cols = 4; rows = (len(tiles) + cols - 1) // cols
            sheet = Image.new("RGB", (cols * T, rows * (T + 18)), "white")
            dr = ImageDraw.Draw(sheet)
            for j, (name, im) in enumerate(tiles):
                x, y = (j % cols) * T, (j // cols) * (T + 18)
                for cx in range(0, T, 20):
                    for cy in range(0, T, 20):
                        if (cx // 20 + cy // 20) % 2: dr.rectangle([x + cx, y + cy, x + cx + 19, y + cy + 19], fill=(225, 225, 225))
                t = im.copy(); t.thumbnail((T - 10, T - 10))
                sheet.paste(t, (x + (T - t.width) // 2, y + (T - t.height) // 2), t)
                dr.text((x + 4, y + T + 2), name, fill="black")
            sheet.save(out / f"_sheet_{key}.jpg", quality=80)


if __name__ == "__main__":
    main()
