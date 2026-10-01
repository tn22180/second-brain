"""Build ChatGPT (jsonl.gz) + Google Merchant (RSS XML) feeds from normalized products and grade them.

Two passes per store:
  raw   = straight field mapping, what a naive exporter would ship
  fixed = same data after the auto-fixes a feed service applies (no LLM)
Spec: feed/spec.json (OpenAI file-upload product spec + Google product data spec, fetched 2026-10-01).
"""
import gzip, html, json, re, sys
from collections import Counter
from pathlib import Path
from urllib.parse import quote
from xml.sax.saxutils import escape

ROOT = Path(__file__).parent
OUT = ROOT / 'out'
OUT.mkdir(exist_ok=True)

GPT_AVAIL = {'in_stock': 'in_stock', 'out_of_stock': 'out_of_stock', 'preorder': 'pre_order',
             'pre_order': 'pre_order', 'backorder': 'backorder'}
GOOGLE_AVAIL = {'in_stock': 'in_stock', 'out_of_stock': 'out_of_stock', 'preorder': 'preorder',
                'pre_order': 'preorder', 'backorder': 'backorder'}
GIFT_CARD = re.compile(r'gift ?card|e-?gift|voucher', re.I)
APPAREL = re.compile(r'shirt|trouser|jacket|coat|dress|shoe|sneaker|boot|knit|jumper|sweat|polo|suit|'
                     r'scarf|sock|underwear|hoodie|jean|short|skirt|blazer|cardigan|loafer|tee\b', re.I)
URL_RE = re.compile(r'^https?://[^\s]+$')


def money(v, cur):
    return f'{v:.2f} {cur}' if isinstance(v, (int, float)) and cur else None


def clean_text(s):
    if not s:
        return s
    s = html.unescape(re.sub(r'<[^>]+>', ' ', s))
    return re.sub(r'\s+', ' ', s).strip()


def fix_url(u):
    # spaces/parens in CDN paths are legal on the site but rejected by feed URL validation
    return quote(u, safe=':/?&=%#,+-_.~') if u else u


def to_gpt(p, fixed, group_sizes=None):
    title, desc = p.get('title'), p.get('description')
    if fixed:
        title, desc = clean_text(title), clean_text(desc)
        if title and len(title) > 150:
            title = title[:147].rsplit(' ', 1)[0] + '…'
        if desc and len(desc) > 5000:
            desc = desc[:4997] + '…'
        if not desc and title:
            desc = None  # never invent copy; the AI-rewrite step owns this
    avail = p.get('availability')
    rec = {
        'item_id': p.get('item_id'), 'title': title, 'description': desc, 'url': p.get('url'),
        'brand': p.get('brand'), 'seller_name': p.get('seller_name'),
        'image_url': fix_url(p.get('image_url')) if fixed else p.get('image_url'),
        'availability': (GPT_AVAIL.get(avail, 'unknown') if fixed else avail),
        'price': money(p.get('price'), p.get('currency')),
        'is_eligible_search': True,
    }
    if p.get('sale_price') and p.get('price') and p['sale_price'] < p['price']:
        rec['sale_price'] = money(p['sale_price'], p.get('currency'))
    if p.get('additional_image_urls'):
        rec['additional_image_urls'] = ','.join(p['additional_image_urls'][:10])
    for k in ('gtin', 'mpn', 'color', 'size', 'material'):
        if p.get(k):
            rec[k] = p[k]
    lone = fixed and group_sizes is not None and group_sizes.get(p.get('group_id'), 0) < 2
    if p.get('group_id') and p.get('group_id') != p.get('item_id') and not lone:
        rec['group_id'] = p['group_id']
        rec['listing_has_variations'] = True
        vd = {k: p[k] for k in ('color', 'size') if p.get(k)}
        if not vd and fixed and ' - ' in (p.get('title') or ''):
            # Shopify/Woo variant titles are "<product> - <option>"; the option is the only axis we know.
            vd = {'option': p['title'].rsplit(' - ', 1)[1]}
        if vd or not fixed:
            rec['variant_dict'] = vd
    if fixed:
        rec['condition'] = p.get('condition') or 'new'
    return rec


def check_gpt(r):
    errs = []
    for f in ('item_id', 'title', 'description', 'url', 'brand', 'seller_name', 'image_url', 'availability', 'price'):
        if not r.get(f):
            errs.append(f'missing:{f}')
    if r.get('title') and len(r['title']) > 150: errs.append('title>150')
    if r.get('description') and len(r['description']) > 5000: errs.append('description>5000')
    if r.get('description') and re.search(r'<[a-z/]', r['description']): errs.append('description_has_html')
    for f in ('url', 'image_url'):
        if r.get(f) and not URL_RE.match(r[f]): errs.append(f'bad_url:{f}')
    if r.get('availability') and r['availability'] not in GPT_AVAIL.values() and r['availability'] != 'unknown':
        errs.append('availability_enum')
    if r.get('price') and not re.match(r'^\d+\.\d{2} [A-Z]{3}$', r['price']): errs.append('price_format')
    if r.get('price', '').startswith('0.00'): errs.append('price_zero')
    if r.get('listing_has_variations') and not r.get('variant_dict'): errs.append('variant_dict_empty')
    return errs


def to_google(p, fixed):
    g = {
        'id': (p.get('item_id') or '')[:50] if fixed else p.get('item_id'),
        'title': clean_text(p.get('title')) if fixed else p.get('title'),
        'description': clean_text(p.get('description')) if fixed else p.get('description'),
        'link': p.get('url'), 'image_link': fix_url(p.get('image_url')) if fixed else p.get('image_url'),
        'availability': GOOGLE_AVAIL.get(p.get('availability')) if fixed else p.get('availability'),
        'price': money(p.get('price'), p.get('currency')), 'brand': p.get('brand'),
        'gtin': p.get('gtin'), 'mpn': p.get('mpn'),
        'condition': (p.get('condition') or 'new') if fixed else p.get('condition'),
        'item_group_id': p.get('group_id') if p.get('group_id') != p.get('item_id') else None,
        'color': p.get('color'), 'size': p.get('size'), 'product_type': p.get('category_path'),
    }
    if p.get('sale_price') and p.get('price') and p['sale_price'] < p['price']:
        g['sale_price'] = money(p['sale_price'], p.get('currency'))
    if fixed:
        if g['title'] and len(g['title']) > 150:
            g['title'] = g['title'][:147].rsplit(' ', 1)[0] + '…'
        if not g['gtin'] and not g['mpn']:
            g['identifier_exists'] = 'no'
        if APPAREL.search(f"{g['title']} {g['product_type'] or ''}"):
            # Google US apparel needs these; we only set what the store data proves.
            g['age_group'] = 'adult' if p.get('size') else None
            # gender only when the store's own URL/category says it; never from the product name
            path = f"{p.get('url') or ''} {p.get('category_path') or ''}".lower()
            g['gender'] = 'female' if re.search(r'women|womens|ladies', path) else (
                'male' if re.search(r'\bmen\b|mens|/men/|men-', path) else None)
    return g


def check_google(g, store_is_apparel):
    errs = []
    for f in ('id', 'title', 'description', 'link', 'image_link', 'availability', 'price', 'brand'):
        if not g.get(f):
            errs.append(f'missing:{f}')
    if g.get('id') and len(g['id']) > 50: errs.append('id>50')
    if g.get('title') and len(g['title']) > 150: errs.append('title>150')
    if g.get('description') and re.search(r'<[a-z/]', g['description']): errs.append('description_has_html')
    if g.get('availability') and g['availability'] not in GOOGLE_AVAIL.values(): errs.append('availability_enum')
    if g.get('price', '') and g['price'].startswith('0.00'): errs.append('price_zero')
    if not g.get('gtin') and not g.get('mpn') and g.get('identifier_exists') != 'no':
        errs.append('identifier_missing')
    if GIFT_CARD.search(g.get('title') or ''): errs.append('policy:gift_card')
    if store_is_apparel and APPAREL.search(g.get('title') or ''):
        for f in ('color', 'size', 'item_group_id', 'gender', 'age_group'):
            if not g.get(f): errs.append(f'apparel_missing:{f}')
    return errs


def warnings(p):
    w = []
    d = clean_text(p.get('description')) or ''
    if len(d) < 100: w.append('desc<100c')
    if p.get('title') and p.get('brand') and p['brand'].lower() not in p['title'].lower(): w.append('title_no_brand')
    if p.get('title') and p['title'].isupper(): w.append('title_all_caps')
    if not p.get('additional_image_urls'): w.append('single_image')
    if not p.get('category_path'): w.append('no_category')
    if re.search(r'test', p.get('url') or '', re.I): w.append('test_like_url')
    return w


def write_google_xml(path, items, store):
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>',
             f'<title>{escape(store)}</title><link>https://{escape(store)}</link><description>feed</description>']
    for g in items:
        lines.append('<item>' + ''.join(f'<g:{k}>{escape(str(v))}</g:{k}>' for k, v in g.items() if v) + '</item>')
    lines.append('</channel></rss>')
    path.write_text('\n'.join(lines))


def grade(store):
    prods = json.loads((ROOT / 'products' / f'{store}.json').read_text())
    apparel = sum(1 for p in prods if APPAREL.search(p.get('title') or '')) > len(prods) * 0.3
    res = {'store': store, 'items': len(prods), 'apparel_store': apparel}
    for mode in ('raw', 'fixed'):
        src = prods
        if mode == 'fixed':
            # gift cards and $0 display items are policy/quality rejects, excluded from the ad feeds
            src = [p for p in prods if not GIFT_CARD.search(p.get('title') or '') and (p.get('price') or 0) > 0]
        sizes = Counter(p.get('group_id') for p in src)
        gpt = [to_gpt(p, mode == 'fixed', sizes) for p in src]
        ggl = [to_google(p, mode == 'fixed') for p in src]
        ge = [check_gpt(r) for r in gpt]
        gg = [check_google(g, apparel) for g in ggl]
        res[mode] = {
            'items': len(src),
            'chatgpt_pass_pct': round(100 * sum(1 for e in ge if not e) / max(len(src), 1), 1),
            'google_pass_pct': round(100 * sum(1 for e in gg if not e) / max(len(src), 1), 1),
            'chatgpt_errors': Counter(x for e in ge for x in e).most_common(6),
            'google_errors': Counter(x for e in gg for x in e).most_common(6),
        }
        if mode == 'fixed':
            with gzip.open(OUT / f'{store}.chatgpt.jsonl.gz', 'wt') as fh:
                for r in gpt:
                    fh.write(json.dumps(r, ensure_ascii=False) + '\n')
            write_google_xml(OUT / f'{store}.google.xml', ggl, store)
    res['quality_warnings'] = Counter(x for p in prods for x in warnings(p)).most_common(6)
    return res


if __name__ == '__main__':
    stores = sys.argv[1:] or sorted(p.stem for p in (ROOT / 'products').glob('*.json') if not p.stem.endswith('.meta'))
    results = [grade(s) for s in stores]
    (OUT / 'grades.json').write_text(json.dumps(results, indent=1, ensure_ascii=False))
    for r in results:
        print(f"{r['store']}: items={r['items']} apparel={r['apparel_store']}")
        for m in ('raw', 'fixed'):
            x = r[m]
            print(f"  {m:5} n={x['items']} chatgpt={x['chatgpt_pass_pct']}% google={x['google_pass_pct']}%")
            print(f"        gpt_err={x['chatgpt_errors']}")
            print(f"        ggl_err={x['google_errors']}")
        print(f"  warn={r['quality_warnings']}")
