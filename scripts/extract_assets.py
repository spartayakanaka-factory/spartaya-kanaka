#!/usr/bin/env python3
"""Read-only, resumable public asset extractor for Sprtaya & Kanaka."""
from __future__ import annotations

import csv
import hashlib
import html
import json
import mimetypes
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from lxml import etree, html as lhtml
from PIL import Image

BASE = "https://www.sprtaya-kanaka.net"
SITEMAP = "https://sprtaya-kanaka.net/sitemap.xml"
ROOT = Path(__file__).resolve().parents[1] / "sprtaya-kanaka-assets"
DATA, REPORTS = ROOT / "بيانات", ROOT / "تقارير"
STATE_FILE = Path(__file__).resolve().parent / ".sprtaya-kanaka-state.json"
CACHE_DIR = Path(__file__).resolve().parent / ".page-cache"
WORKERS, INTERVAL, RETRIES = 5, 0.24, 3
UA = "Mozilla/5.0 (compatible; SprtayaKanakaAssetArchive/1.0)"
TOPS = ["سبرتاية", "سبرتاية وكنكة", "أطقم قهوة", "أطقم قهوة وشاي", "منتجات الصدف",
        "أطباق قرآنية وتذكارية وفرعونية ونقش عربي", "التحف والأنتيكات", "إكسسوارات",
        "الجملة والتصدير", "تصنيفات أخرى"]
BRAND = ["الشعار", "البنرات", "صور المصنع"]
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff",
        ".svg", ".avif", ".ico"}
MIMES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
         "image/gif": ".gif", "image/bmp": ".bmp", "image/tiff": ".tif",
         "image/svg+xml": ".svg", "image/avif": ".avif", "image/x-icon": ".ico"}
LOCK = threading.RLock()
RATE_LOCK = threading.Lock()
LAST_REQUEST = 0.0
STATE = {"pages": {}, "products": {}, "images": {}, "page_failures": {},
         "download_failures": {}, "page_links": {}}
OFFLINE = False


def log(msg):
    print(msg, flush=True)


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temp, path)


def save_state():
    with LOCK:
        save_json(STATE_FILE, STATE)


def load_state():
    if STATE_FILE.exists():
        try:
            old = json.loads(STATE_FILE.read_text(encoding="utf-8"))
            for key in STATE:
                if isinstance(old.get(key), dict):
                    STATE[key] = old[key]
        except Exception as exc:
            log(f"State could not be read; starting with an empty cache: {exc}")


def request(url, binary=False):
    global LAST_REQUEST
    err = "unknown error"
    for attempt in range(RETRIES):
        with RATE_LOCK:
            pause = INTERVAL - (time.monotonic() - LAST_REQUEST)
            if pause > 0:
                time.sleep(pause)
            LAST_REQUEST = time.monotonic()
        req = urllib.request.Request(url, headers={
            "User-Agent": UA,
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
            if binary else "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"})
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read(), r.headers.get("Content-Type", ""), r.geturl()
        except urllib.error.HTTPError as exc:
            err = f"HTTP {exc.code}: {exc.reason}"
            if exc.code in (401, 403, 404, 410):
                break
            time.sleep(2 ** (attempt + (2 if exc.code == 429 else 0)))
        except Exception as exc:
            err = f"{type(exc).__name__}: {exc}"
            time.sleep(2 ** attempt)
    raise RuntimeError(err)


def norm_url(value, base=BASE):
    if not value:
        return None
    value = html.unescape(value.strip()).replace("\\/", "/")
    if value.startswith(("data:", "blob:", "javascript:", "mailto:")):
        return None
    url = urllib.parse.urljoin(base, value)
    p = urllib.parse.urlsplit(url)
    if p.scheme not in ("http", "https"):
        return None
    encoded_path = urllib.parse.quote(p.path, safe="/%:@!$&'()*+,;=-._~")
    query = [(k, v) for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=True)
             if k.lower() in {"width", "w", "height", "h", "quality", "q", "format", "fit", "key", "v"}]
    return urllib.parse.urlunsplit((p.scheme, p.netloc, encoded_path, urllib.parse.urlencode(query), ""))


def page_url(url):
    p = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit(("https", "www.sprtaya-kanaka.net", p.path.rstrip("/") or "/", p.query, ""))


def page_kind(url):
    path = urllib.parse.urlsplit(url).path.strip("/")
    if path.startswith("products/"):
        return "product"
    if path.startswith("collections/") and path != "collections":
        return "category"
    if path.startswith("pages/"):
        return "page"
    return "other"


def page_id(url):
    return hashlib.sha1(url.encode()).hexdigest()


def fetch_page(url, refresh=False):
    key = page_id(url)
    cached = CACHE_DIR / (key + ".html")
    if not refresh and cached.exists() and cached.stat().st_size > 100:
        return cached.read_text(encoding="utf-8", errors="replace"), None
    try:
        data, _, _ = request(url)
        text = data.decode("utf-8", errors="replace")
        low = text.lower()
        if "captcha" in low or "cf-chl-" in low or "access denied" in low:
            raise RuntimeError("Public page returned an anti-bot/access challenge; not bypassed.")
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        tmp = cached.with_suffix(".tmp")
        tmp.write_text(text, encoding="utf-8")
        os.replace(tmp, cached)
        return text, None
    except Exception as exc:
        return None, str(exc)


def doc_for(text, url):
    try:
        return lhtml.fromstring(text, base_url=url)
    except Exception:
        return None


def clean(value):
    return re.sub(r"\s+", " ", html.unescape(value or "")).strip()


def meta(doc, *names):
    for name in names:
        values = doc.xpath(
            f"//meta[translate(@property,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')='{name.lower()}' "
            f"or translate(@name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')='{name.lower()}']/@content")
        if values and clean(values[0]):
            return clean(values[0])
    return ""


def product_ld(value):
    if isinstance(value, dict):
        typ = value.get("@type")
        if typ == "Product" or (isinstance(typ, list) and "Product" in typ):
            yield value
        for item in value.values():
            yield from product_ld(item)
    elif isinstance(value, list):
        for item in value:
            yield from product_ld(item)


def ld_products(doc):
    rows = []
    for script in doc.xpath("//script[@type='application/ld+json']"):
        try:
            rows.extend(product_ld(json.loads(script.text or "")))
        except Exception:
            pass
    return rows


def srcset(value, base):
    out = []
    for piece in (value or "").split(","):
        bits = piece.strip().split()
        if not bits:
            continue
        url = norm_url(bits[0], base)
        width = 0
        if len(bits) > 1:
            match = re.search(r"(\d+)(?:w|x)", bits[1])
            if match:
                width = int(match.group(1))
        if url:
            out.append((url, width))
    return out


def ld_image_urls(value, base):
    if isinstance(value, str):
        url = norm_url(value, base)
        return [url] if url else []
    if isinstance(value, list):
        return [u for item in value for u in ld_image_urls(item, base)]
    if isinstance(value, dict):
        return ld_image_urls(value.get("url") or value.get("contentUrl") or "", base)
    return []


def candidates(doc, base, title="", kind="page"):
    result, seen = [], set()
    title_fold = clean(title).casefold()
    for index, node in enumerate(doc.xpath("//img")):
        alt = clean(node.get("alt") or node.get("title") or "")
        parent = node.getparent()
        classes = ((node.get("class") or "") + " " + (parent.get("class") or "" if parent is not None else "")).lower()
        attrs = " ".join(node.attrib.values()).lower()
        gallery = any(word in classes or word in attrs for word in
                      ("gallery", "slider", "slide", "product-image", "product__media", "zoom", "media"))
        matching_alt = title_fold and alt.casefold() == title_fold
        values = []
        for attr in ("data-original", "data-zoom-image", "data-large-image", "data-large", "data-src", "src"):
            if node.get(attr):
                u = norm_url(node.get(attr), base)
                if u:
                    values.append((u, 0))
        values += srcset(node.get("srcset") or node.get("data-srcset") or "", base)
        anchors = node.xpath("ancestor::a[1]/@href")
        if anchors:
            anchor_url = norm_url(anchors[0], base)
            if anchor_url and Path(urllib.parse.urlsplit(anchor_url).path).suffix.lower() in EXTS:
                values.append((anchor_url, 100000))
        if kind == "product" and not (gallery or matching_alt):
            if not any("/products/" in u or "product" in u.lower() for u, _ in values):
                continue
        if kind == "category" and not any(word in classes for word in ("banner", "hero", "category-cover", "collection-cover")):
            continue
        if not values:
            continue
        selected, width = max(values, key=lambda pair: (pair[1], -len(urllib.parse.urlsplit(pair[0]).query)))
        slot = urllib.parse.urlsplit(selected)._replace(query="").geturl()
        if slot in seen:
            continue
        seen.add(slot)
        result.append({"source_url": selected,
                       "source_urls": [u for u, _ in sorted(set(values), key=lambda x: x[1], reverse=True)],
                       "alt": alt, "classes": classes, "declared_width": width, "index": index})
    for p in ld_products(doc):
        for u in ld_image_urls(p.get("image"), base):
            slot = urllib.parse.urlsplit(u)._replace(query="").geturl()
            if slot not in seen:
                result.append({"source_url": u, "source_urls": [u], "alt": title, "classes": "structured-data",
                               "declared_width": 0, "index": len(result)})
                seen.add(slot)
    if kind != "product":
        og = norm_url(meta(doc, "og:image", "twitter:image"), base)
        if og:
            slot = urllib.parse.urlsplit(og)._replace(query="").geturl()
            if slot not in seen:
                result.insert(0, {"source_url": og, "source_urls": [og], "alt": "", "classes": "open-graph",
                                  "declared_width": 0, "index": -1})
    return result


def title_for(doc, url):
    h1 = clean(" ".join(doc.xpath("(//main//h1 | //h1)[1]//text()")))
    title = h1 or meta(doc, "og:title") or clean(" ".join(doc.xpath("//title/text()")))
    if not h1 and title:
        title = re.sub(r"\s*[-|–]\s*.*$", "", title)
    return clean(title)


def extract_product(url, text):
    doc = doc_for(text, url)
    if doc is None:
        raise RuntimeError("Could not parse product HTML.")
    ld = ld_products(doc)
    title = title_for(doc, url)
    title = re.sub(r"\s*[-|–]\s*مصنع سبرتاية.*$", "", title).strip()
    description = next((clean(p.get("description")) for p in ld if p.get("description")), "")
    description = description or meta(doc, "description", "og:description")
    if not description:
        nodes = doc.xpath("//*[contains(translate(@class,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'description')]")
        description = clean(" ".join(" ".join(n.itertext()) for n in nodes[:2]))[:5000]
    price, currency = None, None
    for p in ld:
        offers = p.get("offers") or {}
        if isinstance(offers, list):
            offers = offers[0] if offers else {}
        if isinstance(offers, dict) and offers.get("price") is not None:
            price, currency = str(offers["price"]), offers.get("priceCurrency")
            break
    if price is None:
        price = meta(doc, "product:price:amount")
        currency = meta(doc, "product:price:currency") or None
    if price is None:
        values = doc.xpath("//*[@itemprop='price']/@content | //*[@itemprop='price']/text()")
        if values:
            price = clean(values[0])
    sku = next((str(p.get("sku")) for p in ld if p.get("sku")), "")
    product_id = sku if sku else hashlib.sha256(url.encode()).hexdigest()[:12]
    variants = []
    for select in doc.xpath("//select"):
        options = [clean(" ".join(o.itertext())) for o in select.xpath("./option")]
        options = [x for x in options if x and x.lower() not in {"choose", "select"}]
        if options:
            variants.append({"name": clean(select.get("name") or select.get("aria-label") or ""), "options": options})
    return {
        "id": product_id, "sku": sku or None, "name_ar": title, "url": page_url(url),
        "category_names": [], "category_urls": [], "description": description or None,
        "price": price, "currency": currency, "variants": variants,
        "image_candidates": candidates(doc, url, title, "product"), "images": [],
        "review_required": not bool(title) or not bool(re.search(r"[\u0600-\u06ff]", title)),
    }


def links(doc, url):
    products, categories, pages = [], [], []
    hrefs = list(doc.xpath("//a[@href]/@href"))
    # YouCan product cards commonly navigate through onclick handlers instead of anchors.
    for handler in doc.xpath("//*[@onclick]/@onclick"):
        hrefs.extend(re.findall(r"""['"]((?:https?://[^'"]+)?/(?:products|collections|pages)/[^'"]+)['"]""", handler))
    for href in hrefs:
        u = norm_url(href, url)
        if not u:
            continue
        host = urllib.parse.urlsplit(u).netloc.lower()
        if host not in {"www.sprtaya-kanaka.net", "sprtaya-kanaka.net"}:
            continue
        u = page_url(u)
        kind = page_kind(u)
        if kind == "product":
            products.append(u.split("?", 1)[0])
        elif kind == "category":
            categories.append(u)
        elif kind == "page":
            pages.append(u)
    return tuple(list(dict.fromkeys(x)) for x in (products, categories, pages))


def pagination(doc, url):
    out, path = [], urllib.parse.urlsplit(url).path
    for href in doc.xpath("//a[@href]/@href"):
        u = norm_url(href, url)
        if not u:
            continue
        p = urllib.parse.urlsplit(u)
        params = urllib.parse.parse_qs(p.query)
        if p.path == path and any(k.lower() in {"page", "p", "page_num", "page-number"} for k in params):
            out.append(page_url(u))
    return list(dict.fromkeys(out))


def extract_category(url, text):
    doc = doc_for(text, url)
    if doc is None:
        raise RuntimeError("Could not parse collection HTML.")
    name = title_for(doc, url)
    products, categories, pages = links(doc, url)
    return {
        "id": urllib.parse.urlsplit(url).path.rstrip("/").split("/")[-1],
        "name_ar": name or "اسم غير متاح في المصدر", "url": page_url(url),
        "product_urls": products, "pagination_urls": pagination(doc, url),
        "collection_urls": categories, "page_urls": pages,
        "cover_candidates": candidates(doc, url, kind="category")[:8],
        "review_required": not bool(name) or not bool(products) or name == "اتصل بنا",
    }


def extract_page(url, text):
    doc = doc_for(text, url)
    if doc is None:
        raise RuntimeError("Could not parse public page.")
    name = title_for(doc, url)
    items = candidates(doc, url, kind="page")
    out = []
    for ix, item in enumerate(items):
        label = (item.get("alt", "") + " " + urllib.parse.urlsplit(item["source_url"]).path).lower()
        if "social link" in label or "social icon" in label:
            continue
        if "logo" in label or "شعار" in label:
            role, folder = "logo", "الشعار"
        elif "about-us" in url or "عن المتجر" in name:
            role, folder = "factory_or_workshop", "صور المصنع"
        else:
            classes = item.get("classes", "").lower()
            if urllib.parse.urlsplit(url).path in ("", "/"):
                if clean(item.get("alt")) or not any(x in classes for x in ("banner", "hero", "slider", "slide")):
                    continue
                if "product" in classes and "product-image" not in classes:
                    continue
            role, folder = "promotion_or_banner", "البنرات"
        out.append({**item, "role": role, "folder": folder, "asset_index": ix})
    products, collections, pages = links(doc, url)
    return {"url": page_url(url), "name_ar": name, "assets": out,
            "product_urls": products, "collection_urls": collections, "page_urls": pages}


def sitemap(url, visited=None):
    visited = visited or set()
    if url in visited:
        return [], []
    visited.add(url)
    data, _, _ = request(url)
    root = ET.fromstring(data)
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    child_maps = [x.text.strip() for x in root.findall(".//s:sitemap/s:loc", ns) if x.text]
    urls = [page_url(x.text.strip()) for x in root.findall(".//s:url/s:loc", ns) if x.text]
    all_urls, all_maps = list(urls), []
    for child in child_maps:
        all_maps.append(child)
        child_urls, nested = sitemap(child, visited)
        all_urls.extend(child_urls)
        all_maps.extend(nested)
    return list(dict.fromkeys(all_urls)), list(dict.fromkeys(all_maps))


def get_page(url, kind, refresh, known_categories, reparse=False):
    cached = None if (refresh or reparse) else STATE["pages"].get(url, {}).get("parsed")
    if cached:
        return url, cached, None
    text, error = fetch_page(url, refresh)
    if error:
        return url, None, error
    doc = doc_for(text, url)
    if doc is None:
        return url, None, "Could not parse HTML."
    try:
        parsed = extract_product(url, text) if kind == "product" else (
            extract_category(url, text) if kind == "category" else extract_page(url, text))
        with LOCK:
            STATE["pages"][url] = {"kind": kind, "parsed": parsed}
            STATE["page_failures"].pop(url, None)
        save_state()
        return url, parsed, None
    except Exception as exc:
        return url, None, str(exc)


def safe_name(value, fallback):
    value = re.sub(r'[<>:"/\\\\|?*\x00-\x1f]', " ", clean(value))
    value = re.sub(r"\s+", " ", value).strip(" .-")[:100].strip(" .-")
    return value or fallback


def top_folder(name):
    key = re.sub(r"[\u064b-\u065f\u0670]", "", clean(name))
    mapping = {
        "سبرتاية": "سبرتاية", "سبرتاية وكنكة": "سبرتاية وكنكة",
        "أطقم قهوة": "أطقم قهوة", "أطقم قهوة وشاي": "أطقم قهوة وشاي",
        "منتجات الصدف لوكس و طبيعى": "منتجات الصدف", "منتجات الصدف": "منتجات الصدف",
        "اطباق قرآنية وتذكارية وفرعونية ونقش عربي": "أطباق قرآنية وتذكارية وفرعونية ونقش عربي",
        "أطباق قرآنية وتذكارية وفرعونية ونقش عربي": "أطباق قرآنية وتذكارية وفرعونية ونقش عربي",
        "التحف و الانتيكات": "التحف والأنتيكات", "التحف والأنتيكات": "التحف والأنتيكات",
        "اكسسوارات": "إكسسوارات", "إكسسوارات": "إكسسوارات",
        "قسم الجمله والتصدير": "الجملة والتصدير", "قسم الجملة والتصدير": "الجملة والتصدير",
    }
    return mapping.get(key, "تصنيفات أخرى")


def verify_bytes(data, mime):
    if not data:
        return False, None, None, "empty file"
    if b"<svg" in data[:2048].lower():
        try:
            root = etree.fromstring(data)
            if etree.QName(root).localname.lower() != "svg":
                return False, None, None, "invalid SVG"
            vb = root.get("viewBox")
            if vb:
                parts = re.split(r"[ ,]+", vb.strip())
                if len(parts) == 4:
                    return True, int(float(parts[2])), int(float(parts[3])), None
            return True, None, None, None
        except Exception as exc:
            return False, None, None, f"invalid SVG: {exc}"
    try:
        from io import BytesIO
        with Image.open(BytesIO(data)) as im:
            width, height = im.size
            im.verify()
        return width > 0 and height > 0, width, height, None
    except Exception as exc:
        if mime.split(";", 1)[0].lower() in {"image/avif", "image/heic", "image/jxl"}:
            return True, None, None, "dimensions unavailable"
        return False, None, None, f"image validation failed: {exc}"


def ext_for(url, mime):
    ext = Path(urllib.parse.urlsplit(url).path).suffix.lower()
    return (".jpg" if ext == ".jpeg" else ext) if ext in EXTS else MIMES.get(mime.split(";", 1)[0].lower(), ".img")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def valid_file(path, digest=None):
    if not path.is_file() or path.stat().st_size == 0:
        return False, None, None, "missing or empty"
    data = path.read_bytes()
    if digest and sha(data) != digest:
        return False, None, None, "hash mismatch"
    return verify_bytes(data, mimetypes.guess_type(path.name)[0] or "")


def existing_hashes():
    out = {}
    for record in STATE["images"].values():
        rel = record.get("local_path")
        if record.get("sha256") and rel and record.get("status") in {"downloaded", "duplicate"}:
            if valid_file(ROOT / rel, record["sha256"])[0]:
                out[record["sha256"]] = record
    return out


def download_image(candidate, context, hashes):
    url = candidate["source_url"]
    key = hashlib.sha256(url.encode()).hexdigest()
    old = STATE["images"].get(key)
    if old and old.get("local_path") and old.get("sha256") and old.get("status") in {"downloaded", "duplicate"}:
        ok, w, h, _ = valid_file(ROOT / old["local_path"], old["sha256"])
        if ok:
            reused = dict(old)
            reused["width"], reused["height"] = w or old.get("width"), h or old.get("height")
            reused.update(context)
            reused["source_url"] = url
            reused["source_urls"] = candidate.get("source_urls", [url])
            return reused
        canonical = hashes.get(old.get("sha256"))
        if canonical and canonical.get("local_path") and valid_file(ROOT / canonical["local_path"], old["sha256"])[0]:
            reused = dict(old)
            reused.update(context)
            reused["source_url"] = url
            reused["source_urls"] = candidate.get("source_urls", [url])
            reused["local_path"] = canonical["local_path"]
            return reused
    if OFFLINE:
        reason = "Not retried during offline repair after a public request returned HTTP 429; source URL has been normalized."
        with LOCK:
            for failed_url in list(STATE["download_failures"]):
                if norm_url(failed_url) == norm_url(url):
                    STATE["download_failures"].pop(failed_url, None)
            STATE["download_failures"][url] = reason
        save_state()
        return {"source_url": url, "source_urls": candidate.get("source_urls", [url]),
                "local_path": None, "sha256": None, "status": "failed",
                "error": reason,
                **context}
    variants = [url]
    p = urllib.parse.urlsplit(url)
    if any(k.lower() in {"width", "w", "height", "h", "quality", "q"} for k, _ in urllib.parse.parse_qsl(p.query)):
        stripped = urllib.parse.urlunsplit((p.scheme, p.netloc, p.path, "", ""))
        if stripped not in variants:
            variants.append(stripped)
    error = "No valid image response."
    for candidate_url in variants:
        try:
            data, mime, final_url = request(candidate_url, True)
            ok, width, height, issue = verify_bytes(data, mime)
            if not ok:
                error = issue or "invalid image"
                continue
            digest, ext = sha(data), ext_for(final_url, mime)
            if ext == ".img":
                raise RuntimeError(f"Unsupported image format: {mime}")
            if digest in hashes:
                canonical = hashes[digest]
                record = {"source_url": url, "source_urls": candidate.get("source_urls", [url]),
                          "final_url": final_url, "local_path": canonical["local_path"],
                          "sha256": digest, "width": canonical.get("width") or width,
                          "height": canonical.get("height") or height, "bytes": canonical.get("bytes", len(data)),
                          "mime_type": mime.split(";", 1)[0], "status": "duplicate",
                          "duplicate_of": canonical["source_url"], **context}
            else:
                if context["kind"] == "product":
                    category = next(iter(context.get("category_names") or []), "")
                    folder = ROOT / "المنتجات" / top_folder(category)
                    if folder.name == "تصنيفات أخرى" and category and category != "تصنيفات أخرى":
                        folder /= safe_name(category, "تصنيف")
                else:
                    folder = ROOT / "الهوية البصرية" / context.get("folder", "البنرات")
                folder.mkdir(parents=True, exist_ok=True)
                if context["kind"] == "product":
                    stem = safe_name(context.get("product_name_ar"), f"منتج {context['product_id']}")
                    collision = any(p.get("name_ar") == context.get("product_name_ar") and
                                    p.get("id") != context["product_id"] for p in STATE["products"].values())
                    if collision:
                        stem += "-" + re.sub(r"[^A-Za-z0-9]", "", str(context["product_id"]))[:8]
                    stem += f"-{context.get('image_index', 0) + 1:02d}"
                else:
                    stem = safe_name(context.get("alt") or context.get("page_name"), "صورة من الموقع")
                    stem += f"-{context.get('asset_index', 0) + 1:02d}"
                target = folder / f"{stem}{ext}"
                suffix = 2
                while target.exists():
                    target = folder / f"{stem}-{suffix}{ext}"
                    suffix += 1
                tmp = target.with_name(target.name + ".part")
                tmp.write_bytes(data)
                os.replace(tmp, target)
                record = {"source_url": url, "source_urls": candidate.get("source_urls", [url]),
                          "final_url": final_url, "local_path": target.relative_to(ROOT).as_posix(),
                          "sha256": digest, "width": width, "height": height, "bytes": len(data),
                          "mime_type": mime.split(";", 1)[0], "status": "downloaded", **context}
                hashes[digest] = record
            with LOCK:
                STATE["images"][key] = record
                for failed_url in list(STATE["download_failures"]):
                    if failed_url == url or norm_url(failed_url) == norm_url(url):
                        STATE["download_failures"].pop(failed_url, None)
            save_state()
            return record
        except Exception as exc:
            error = str(exc)
    with LOCK:
        STATE["download_failures"][url] = error
    save_state()
    return {"source_url": url, "source_urls": candidate.get("source_urls", [url]),
            "local_path": None, "sha256": None, "status": "failed", "error": error, **context}


def write_csv(path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({k: json.dumps(row.get(k), ensure_ascii=False) if isinstance(row.get(k), (list, dict))
                             else row.get(k) for k in fields})
    os.replace(tmp, path)


def manifests(categories, products, assets, maps, inaccessible):
    # Keep one canonical image record per content hash; image-manifest retains each source association.
    unique = {}
    for item in assets:
        if item.get("sha256"):
            unique.setdefault(item["sha256"], item)
    products = sorted({p["id"]: p for p in products}.values(), key=lambda p: p["id"])
    save_json(DATA / "products.json", products)
    save_json(DATA / "images.json", list(unique.values()))
    save_json(DATA / "categories.json", {"source": BASE, "sitemaps": maps, "categories": categories})
    product_rows = []
    for p in products:
        product_rows.append({**p, "image_count": len(p.get("images", [])),
                             "downloaded_image_count": sum(bool(i.get("local_path")) for i in p.get("images", [])),
                             "download_status": "downloaded" if any(i.get("local_path") for i in p.get("images", []))
                             else "missing"})
    write_csv(DATA / "products.csv", product_rows, [
        "id", "sku", "name_ar", "url", "category_names", "category_urls", "category_review_required", "description",
        "price", "currency", "variants", "image_count", "downloaded_image_count",
        "download_status", "review_required"])
    image_rows = [{**a, "product_name_ar": a.get("product_name_ar")} for a in assets]
    write_csv(DATA / "image-manifest.csv", image_rows, [
        "kind", "product_id", "product_name_ar", "source_url", "source_urls", "local_path",
        "primary", "image_index", "width", "height", "bytes", "sha256", "mime_type",
        "status", "duplicate_of", "error", "category_names", "role", "page_url"])
    missing = []
    for p in products:
        if not any(i.get("local_path") for i in p.get("images", [])):
            missing.append({"product_id": p.get("id"), "product_name_ar": p.get("name_ar"),
                            "product_url": p.get("url"), "category_names": p.get("category_names"),
                            "image_urls": [i.get("source_url") for i in p.get("image_candidates", [])],
                            "reason": p.get("error") or "No usable product gallery image was found or downloaded.",
                            "review_required": p.get("review_required")})
    write_csv(REPORTS / "missing-images.csv", missing, [
        "product_id", "product_name_ar", "product_url", "category_names", "image_urls", "reason", "review_required"])
    canonical_by_hash = {}
    duplicates = []
    duplicate_keys = set()
    for asset in assets:
        digest = asset.get("sha256")
        if not digest:
            continue
        canonical = canonical_by_hash.setdefault(digest, asset)
        same_content_reference = (
            asset.get("kind") == "product" and canonical.get("kind") == "product"
            and asset.get("product_id") != canonical.get("product_id")
        )
        if asset.get("status") == "duplicate" or same_content_reference:
            key = (digest, asset.get("product_id"), asset.get("source_url"))
            if key in duplicate_keys:
                continue
            duplicate_keys.add(key)
            duplicates.append({
                "sha256": digest, "duplicate_source_url": asset.get("source_url"),
                "canonical_source_url": asset.get("duplicate_of") or canonical.get("source_url"),
                "canonical_local_path": canonical.get("local_path") or asset.get("local_path"),
                "product_id": asset.get("product_id"), "product_name_ar": asset.get("product_name_ar"),
                "canonical_product_id": canonical.get("product_id"),
            })
    write_csv(REPORTS / "duplicate-images.csv", duplicates, [
        "sha256", "duplicate_source_url", "canonical_source_url", "canonical_local_path",
        "product_id", "product_name_ar", "canonical_product_id"])
    write_csv(REPORTS / "inaccessible-pages.csv", inaccessible, ["url", "type", "reason"])
    active_paths = {x.get("local_path") for x in assets if x.get("local_path")}
    for folder in (ROOT / "المنتجات", ROOT / "الهوية البصرية"):
        for path in folder.rglob("*"):
            if path.is_file() and path.relative_to(ROOT).as_posix() not in active_paths and path.name != ".DS_Store":
                path.unlink()
    for ds_store in ROOT.rglob(".DS_Store"):
        try:
            ds_store.unlink()
        except OSError:
            pass
    file_count, disk, invalid = 0, 0, []
    for folder in (ROOT / "المنتجات", ROOT / "الهوية البصرية"):
        for path in folder.rglob("*"):
            if path.is_file():
                file_count += 1
                disk += path.stat().st_size
                ok, _, _, issue = valid_file(path)
                if not ok:
                    invalid.append({"path": path.relative_to(ROOT).as_posix(), "reason": issue})
    metrics = {
        "categories": len(categories), "products": len(products),
        "accessible_categories": sum(x.get("status") != "inaccessible" for x in categories),
        "categories_for_review": sum(bool(x.get("review_required")) for x in categories),
        "products_with_images": sum(any(i.get("local_path") for i in p.get("images", [])) for p in products),
        "products_with_categories": sum(bool(p.get("category_urls")) for p in products),
        "products_without_categories": sum(not bool(p.get("category_urls")) for p in products),
        "pagination_pages": sum(len(c.get("pagination_urls", [])) for c in categories),
        "unique_images": len(unique), "gallery_images": sum(len(p.get("images", [])) for p in products),
        "files": file_count, "bytes": disk, "mib": round(disk / 1048576, 2),
        "duplicates": len(duplicates),
        "duplicate_files_avoided": sum(a.get("status") == "duplicate" for a in assets),
        "failed_images": len(STATE["download_failures"]),
        "missing_products": len(missing), "inaccessible": len(inaccessible), "invalid": invalid,
    }
    report(categories, products, metrics, inaccessible)
    return metrics


def relocate_product_images(products):
    """Move canonical files from the fallback folder into verified live categories."""
    by_hash = {}
    for product in products:
        for image in product.get("images", []):
            digest = image.get("sha256")
            path = image.get("local_path")
            if not digest or not path or image.get("status") == "failed":
                continue
            if digest in by_hash:
                image["local_path"] = by_hash[digest]
                for saved in STATE["images"].values():
                    if saved.get("sha256") == digest:
                        saved["local_path"] = by_hash[digest]
                continue
            old = ROOT / path
            fallback_prefix = "المنتجات/تصنيفات أخرى/"
            if path.startswith(fallback_prefix) and old.exists():
                category = next(iter(product.get("category_names") or []), "تصنيفات أخرى")
                top = top_folder(category)
                folder = ROOT / "المنتجات" / top
                if top == "تصنيفات أخرى" and category and category != "تصنيفات أخرى":
                    folder /= safe_name(category, "تصنيف")
                folder.mkdir(parents=True, exist_ok=True)
                suffix = old.suffix
                stem = safe_name(product.get("name_ar"), f"منتج {product.get('id')}")
                collision = any(p.get("name_ar") == product.get("name_ar") and
                                p.get("id") != product.get("id") for p in STATE["products"].values())
                if collision:
                    stem += "-" + re.sub(r"[^A-Za-z0-9]", "", str(product.get("id")))[:8]
                stem += f"-{image.get('image_index', 0) + 1:02d}"
                target = folder / f"{stem}{suffix}"
                n = 2
                while target.exists():
                    if valid_file(target, digest)[0]:
                        break
                    target = folder / f"{stem}-{n}{suffix}"
                    n += 1
                if old.resolve() != target.resolve():
                    if target.exists() and valid_file(target, digest)[0]:
                        old.unlink()
                    else:
                        os.replace(old, target)
                path = target.relative_to(ROOT).as_posix()
                image["local_path"] = path
                for saved in STATE["images"].values():
                    if saved.get("sha256") == digest:
                        saved["local_path"] = path
            by_hash[digest] = image["local_path"]
    save_state()


def report(categories, products, m, inaccessible):
    cat_list = "\n".join(f"- {c.get('name_ar')} — {c.get('url')} "
                         f"(status: {c.get('status', 'accessible')}; "
                         f"{'review required; ' if c.get('review_required') else ''}"
                         f"{len(c.get('product_urls', []))} listed)"
                         for c in categories) or "- None"
    failed = "\n".join(f"- {url}: {reason}" for url, reason in STATE["download_failures"].items()) or "- None"
    inac = "\n".join(f"- {x.get('url')}: {x.get('reason')}" for x in inaccessible) or "- None"
    invalid = "\n".join(f"- {x['path']}: {x['reason']}" for x in m["invalid"]) or "- None"
    review = sum(bool(p.get("review_required")) for p in products)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    text = f"""# Sprtaya & Kanaka — extraction report

Run: {now}
Source: {BASE}

## Summary

- Categories discovered: {m['categories']}
- Accessible category pages: {m['accessible_categories']}
- Categories flagged for manual review: {m['categories_for_review']}
- Public product pages discovered: {m['products']}
- Products with successfully downloaded images: {m['products_with_images']}
- Products associated with a discovered collection: {m['products_with_categories']}
- Products without a verified collection association: {m['products_without_categories']}
- Collection pagination URLs exposed in saved public HTML: {m['pagination_pages']}
- Unique images downloaded: {m['unique_images']}
- Product gallery image records: {m['gallery_images']}
- Files in asset library: {m['files']}
- Disk space: {m['mib']} MiB ({m['bytes']} bytes)
- Duplicate content references identified: {m['duplicates']}
- Duplicate image files avoided during download: {m['duplicate_files_avoided']}
- Failed image downloads: {m['failed_images']}
- Products with missing image sets: {m['missing_products']}
- Inaccessible pages or categories: {m['inaccessible']}

## Coverage and limitations

Discovery used the public sitemap index and its child sitemaps, then followed collection links and any pagination controls exposed in returned HTML. No pagination URLs were present in the saved collection HTML. The product sitemap was used as the baseline product inventory. Site content that is not exposed by public pages or sitemaps may be absent. Authentication, CAPTCHA, access restrictions, and anti-bot controls were not bypassed. This report does not claim coverage beyond the inspected public inventory.

The inspected collection HTML exposed product destinations through JavaScript click handlers. {m['products_with_categories']} products were matched to collection pages; {m['products_without_categories']} catalog products had no public collection association in the saved HTML and remain under the fallback category with review flags. No pagination URLs were exposed in that HTML. A later site request returned HTTP 429 and a browser visit displayed a CAPTCHA, so further live-page discovery was stopped.

Products without local images are listed in missing-images.csv. {review} records are flagged for title review because the title was missing or not clearly Arabic. Products without verified category assignments are separately marked by category_review_required in products.json and products.csv.

## Categories

{cat_list}

## Failed image downloads

{failed}

## Inaccessible pages or categories

{inac}

## Integrity validation

The stored library was checked for nonzero length, decodable image content, and dimensions where supported. Invalid files: {len(m['invalid'])}.

{invalid}

Duplicate content is recorded in duplicate-images.csv. The manifests preserve original source URLs, local relative paths, dimensions, file sizes, SHA-256 hashes, download status, and product/category associations.
"""
    out = REPORTS / "extraction-report.md"
    tmp = out.with_suffix(".md.tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, out)


def main():
    global STATE, OFFLINE
    ROOT.joinpath("المنتجات").mkdir(parents=True, exist_ok=True)
    for name in TOPS:
        (ROOT / "المنتجات" / name).mkdir(parents=True, exist_ok=True)
    for name in BRAND:
        (ROOT / "الهوية البصرية" / name).mkdir(parents=True, exist_ok=True)
    DATA.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)
    load_state()
    refresh = "--refresh" in sys.argv
    reparse = "--reparse" in sys.argv
    OFFLINE = "--offline" in sys.argv
    log(f"Output: {ROOT}")
    log("Reading the public sitemap index..." if not OFFLINE else "Using the saved public-page inventory (offline repair).")
    if OFFLINE:
        saved_manifest = {}
        try:
            saved_manifest = json.loads((DATA / "categories.json").read_text(encoding="utf-8"))
        except Exception:
            pass
        maps = saved_manifest.get("sitemaps", [])
        cats = [u for u, item in STATE["pages"].items() if item.get("kind") == "category"]
        cats += [u for u in STATE["page_failures"] if page_kind(u) == "category" and u not in cats]
        sitemap_products = [u for u, item in STATE["pages"].items() if item.get("kind") == "product"]
        static = [u for u, item in STATE["pages"].items() if item.get("kind") == "page"]
    else:
        urls, maps = sitemap(SITEMAP)
        cats = [u for u in urls if page_kind(u) == "category"]
        sitemap_products = [u for u in urls if page_kind(u) == "product"]
        static = [u for u in urls if page_kind(u) == "page"]
    home = page_url(BASE)
    if home not in static:
        static.insert(0, home)
    log(f"Sitemaps: {len(cats)} collections, {len(sitemap_products)} products, {len(static)} site pages.")

    # Explore every collection page and any exposed pagination/subcollection links.
    all_cat_urls = list(dict.fromkeys(cats))
    known = set(u.split("?", 1)[0] for u in all_cat_urls)
    category_data, product_urls, page_urls = {}, set(sitemap_products), set(static)
    queue = [u for u in all_cat_urls if not (OFFLINE and u not in STATE["pages"])]
    visited = {u for u in all_cat_urls if OFFLINE and u not in STATE["pages"]}
    while queue:
        batch = [u for u in queue if u not in visited]
        queue = []
        if not batch:
            break
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            futures = [pool.submit(get_page, u, "category", refresh, known, reparse) for u in batch]
            for future in as_completed(futures):
                url, parsed, error = future.result()
                visited.add(url)
                if error or not parsed:
                    STATE["page_failures"][url] = error or "Category page unavailable."
                    continue
                parsed["review_required"] = (
                    not bool(parsed.get("name_ar"))
                    or not bool(parsed.get("product_urls"))
                    or parsed.get("name_ar") == "اتصل بنا"
                )
                category_data[url] = parsed
                product_urls.update(parsed.get("product_urls", []))
                page_urls.update(parsed.get("page_urls", []))
                discovered = parsed.get("collection_urls", []) + parsed.get("pagination_urls", [])
                for link in discovered:
                    if page_kind(link) == "category" and link not in visited and link not in queue:
                        queue.append(link)
            save_state()
        if len(visited) % 10 == 0 or not queue:
            log(f"Collection pages inspected: {len(visited)}")

    category_groups = {}
    all_cat_urls = list(dict.fromkeys(all_cat_urls + list(category_data)))
    for url in all_cat_urls:
        parsed = category_data.get(url) or STATE["pages"].get(url, {}).get("parsed")
        if parsed:
            key = urllib.parse.urlsplit(url).path.rstrip("/")
            if key not in category_groups:
                category_groups[key] = dict(parsed)
                category_groups[key]["url"] = page_url(urllib.parse.urlunsplit(
                    ("https", "www.sprtaya-kanaka.net", key, "", "")))
                category_groups[key]["product_urls"] = list(parsed.get("product_urls", []))
                category_groups[key]["cover_candidates"] = list(parsed.get("cover_candidates", []))
                category_groups[key]["pagination_urls"] = list(parsed.get("pagination_urls", []))
            else:
                group = category_groups[key]
                group["product_urls"] = list(dict.fromkeys(group["product_urls"] + parsed.get("product_urls", [])))
                group["pagination_urls"] = list(dict.fromkeys(group["pagination_urls"] + parsed.get("pagination_urls", [])))
                group["collection_urls"] = list(dict.fromkeys(group.get("collection_urls", []) + parsed.get("collection_urls", [])))
                group["page_urls"] = list(dict.fromkeys(group.get("page_urls", []) + parsed.get("page_urls", [])))
                existing = {x.get("source_url") for x in group["cover_candidates"]}
                group["cover_candidates"].extend(x for x in parsed.get("cover_candidates", [])
                                                 if x.get("source_url") not in existing)
    categories = list(category_groups.values())
    present_paths = {urllib.parse.urlsplit(c.get("url", "")).path for c in categories}
    for missing_url in cats:
        path = urllib.parse.urlsplit(missing_url).path
        if path not in present_paths:
            categories.append({
                "id": path.rstrip("/").split("/")[-1], "name_ar": "اسم غير متاح في المصدر",
                "url": page_url(missing_url), "product_urls": [], "pagination_urls": [],
                "collection_urls": [], "page_urls": [], "cover_candidates": [],
                "status": "inaccessible", "error": STATE["page_failures"].get(missing_url, "Page unavailable."),
                "review_required": True,
            })

    # Read public home/about/static pages for logos, promotions, and factory visuals.
    if OFFLINE:
        page_urls = {u for u in page_urls if u in STATE["pages"]}
    static_results = []
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(get_page, u, "page", refresh, known, reparse) for u in sorted(page_urls)]
        for future in as_completed(futures):
            url, parsed, error = future.result()
            if error or not parsed:
                STATE["page_failures"][url] = error or "Page unavailable."
                continue
            static_results.append(parsed)
            product_urls.update(parsed.get("product_urls", []))
            for c in parsed.get("collection_urls", []):
                if c not in all_cat_urls:
                    all_cat_urls.append(c)
        save_state()

    # Product URL inventory = sitemap plus links on every inspected collection/static page.
    if OFFLINE:
        product_urls = {u for u in product_urls if u in STATE["pages"]}
    product_urls = sorted(product_urls)
    log(f"Inspecting {len(product_urls)} public product pages...")
    product_data = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(get_page, u, "product", refresh, known, reparse) for u in product_urls]
        for index, future in enumerate(as_completed(futures), 1):
            url, parsed, error = future.result()
            if error or not parsed:
                STATE["page_failures"][url] = error or "Product page unavailable."
                continue
            product_data[url] = parsed
            if index % 25 == 0 or index == len(product_urls):
                log(f"Product pages inspected: {index}/{len(product_urls)}")
        save_state()

    # Category membership is taken from actual product links on category pages.
    membership = {}
    for category in categories:
        for product_url in category.get("product_urls", []):
            membership.setdefault(product_url.split("?", 1)[0], []).append(category)
    for url, p in product_data.items():
        matched = membership.get(url.split("?", 1)[0], [])
        p["category_names"] = list(dict.fromkeys(c.get("name_ar") for c in matched if c.get("name_ar"))) or ["تصنيفات أخرى"]
        p["category_urls"] = list(dict.fromkeys(c.get("url") for c in matched if c.get("url")))
        p["category_review_required"] = not bool(p["category_urls"])
        p["images"] = []
        STATE["products"][p["id"]] = p
    save_state()

    hashes, image_records = existing_hashes(), []
    products = list(product_data.values())
    for p in products:
        for idx, candidate in enumerate(p.get("image_candidates", [])):
            context = {"kind": "product", "product_id": p["id"], "product_name_ar": p.get("name_ar"),
                       "category_names": p.get("category_names"), "primary": idx == 0, "image_index": idx}
            record = download_image(candidate, context, hashes)
            p["images"].append(record)
            image_records.append(record)
        STATE["products"][p["id"]] = p
        save_state()
    relocate_product_images(products)

    for category in categories:
        for idx, candidate in enumerate(category.get("cover_candidates", [])):
            context = {"kind": "category", "product_id": None, "product_name_ar": None,
                       "category_names": [category.get("name_ar")], "primary": idx == 0,
                       "image_index": idx, "folder": "البنرات", "role": "category_cover",
                       "page_url": category.get("url"), "page_name": category.get("name_ar"),
                       "alt": candidate.get("alt", ""), "asset_index": idx}
            image_records.append(download_image(candidate, context, hashes))
    for page in static_results:
        social_hashes = {
            record.get("sha256") for record in STATE["images"].values()
            if record.get("sha256") and "social link" in str(record.get("alt", "")).casefold()
        }
        for candidate in page.get("assets", []):
            previous = STATE["images"].get(hashlib.sha256(candidate["source_url"].encode()).hexdigest(), {})
            if previous.get("sha256") in social_hashes:
                continue
            context = {"kind": "brand", "product_id": None, "product_name_ar": None,
                       "category_names": [], "primary": False, "image_index": candidate.get("index"),
                       "asset_index": candidate.get("asset_index", 0), "role": candidate.get("role"),
                       "folder": candidate.get("folder", "البنرات"), "page_url": page.get("url"),
                       "page_name": page.get("name_ar"), "alt": candidate.get("alt", "")}
            image_records.append(download_image(candidate, context, hashes))
    tracked_sources = {x.get("source_url") for x in image_records}
    for failed_url, reason in STATE["download_failures"].items():
        if failed_url not in tracked_sources:
            image_records.append({
                "kind": "brand", "product_id": None, "product_name_ar": None,
                "source_url": failed_url, "source_urls": [failed_url], "local_path": None,
                "sha256": None, "width": None, "height": None, "bytes": 0,
                "mime_type": None, "status": "failed", "error": reason,
                "category_names": [], "role": "unclassified_public_site_asset",
                "page_url": BASE, "page_name": None,
            })
    inaccessible = [{"url": u, "type": "page", "reason": e} for u, e in STATE["page_failures"].items()]
    metrics = manifests(categories, products, image_records, maps, inaccessible)
    log("Extraction complete.")
    log(f"Categories: {metrics['categories']}; products: {metrics['products']}; "
        f"images: {metrics['unique_images']}; failures: {metrics['failed_images']}; "
        f"library size: {metrics['mib']} MiB.")
    log(f"Report: {REPORTS / 'extraction-report.md'}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        save_state()
        log("Stopped safely. Re-run the script to resume.")
        raise SystemExit(130)
