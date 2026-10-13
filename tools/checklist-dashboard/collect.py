"""Collects the SEO checklist adoption numbers into JSON row files for the dashboard.

Sources: BigQuery falcon-ecb55.product_analytics.events (read-only), Crisp (app_seo segment,
merchant messages only), Shopify App Store reviews of avada-seo-suite (public pages).

    python3 -I collect.py <out_dir>

Crisp credentials are read from the seo checkout's packages/functions/.env.local and never printed.
"""
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from base64 import b64encode
from datetime import datetime, timedelta, timezone

EVENTS = '`falcon-ecb55.product_analytics.events`'
# Old checklist rows are card 'checklist'; the FAL-837 redesign tracks as 'checklist-v2'.
CARDS = "('checklist', 'checklist-v2')"
SEO_ENV = os.path.expanduser(
    '~/Documents/second-brain/projects/Falcon/seo/packages/functions/.env.local')
REVIEWS_URL = 'https://apps.shopify.com/avada-seo-suite/reviews'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36'
WEEKS = 12
CS_DAYS = 90
REVIEW_DAYS = 120
# Crisp's search is full-text over every message; operators mention the checklist far more than
# merchants do (CS upsell), so only merchant-written lines that match are counted.
CS_TERMS = ['checklist', 'seo score', 'seo audit']
CS_MATCH = re.compile(r'checklist|seo score|seo audit', re.I)
# The same text sent by many merchants is a chat quick-reply button, not their own words.
CANNED_MIN = 5
REVIEW_MATCH = re.compile(r'checklist|seo score|audit|scan', re.I)
NOW = datetime.now(timezone.utc)


def bq(sql):
    out = subprocess.run(
        ['bq', '--project_id=falcon-ecb55', 'query', '--use_legacy_sql=false', '--format=json',
         '--max_rows=10000', sql],
        capture_output=True, text=True, check=True).stdout
    return json.loads(out or '[]')


def num(rows, *cols):
    for r in rows:
        for c in cols:
            if r.get(c) is not None:
                r[c] = float(r[c]) if '.' in str(r[c]) else int(r[c])
    return rows


def usage_weekly():
    return num(bq(f'''
WITH e AS (
  SELECT DATE_TRUNC(DATE(occurred_at), WEEK(MONDAY)) week, shop_id, card, event_type,
    JSON_VALUE(payload, '$.element') element
  FROM {EVENTS}
  WHERE app_id = 'seoSuite'
    AND occurred_at >= TIMESTAMP(DATE_SUB(DATE_TRUNC(CURRENT_DATE(), WEEK(MONDAY)), INTERVAL {WEEKS} WEEK)))
SELECT CAST(week AS STRING) week,
  COUNT(DISTINCT shop_id) active_shops,
  COUNT(DISTINCT IF(card IN {CARDS} AND event_type = 'feature_opened', shop_id, NULL)) checklist_shops,
  COUNT(DISTINCT IF(card IN {CARDS} AND event_type = 'feature_applied', shop_id, NULL)) fixing_shops,
  COUNT(DISTINCT IF(card IN {CARDS} AND event_type = 'feature_started', shop_id, NULL)) rescan_shops,
  COUNTIF(card IN {CARDS} AND event_type = 'feature_applied') fix_clicks
FROM e GROUP BY week ORDER BY week'''),
        'active_shops', 'checklist_shops', 'fixing_shops', 'rescan_shops', 'fix_clicks')


def fixes_by_item():
    return num(bq(f'''
SELECT JSON_VALUE(payload, '$.issue_type') item,
  COUNTIF(occurred_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)) clicks_30d,
  COUNT(DISTINCT IF(occurred_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY), shop_id, NULL)) shops_30d,
  COUNTIF(occurred_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)) clicks_prev_30d
FROM {EVENTS}
WHERE app_id = 'seoSuite' AND card IN {CARDS} AND event_type = 'feature_applied'
  AND occurred_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 DAY)
  AND JSON_VALUE(payload, '$.issue_type') IS NOT NULL
GROUP BY item ORDER BY clicks_30d DESC'''), 'clicks_30d', 'shops_30d', 'clicks_prev_30d')


def new_actions():
    return num(bq(f'''
SELECT CAST(DATE_TRUNC(DATE(occurred_at), WEEK(MONDAY)) AS STRING) week,
  COALESCE(JSON_VALUE(payload, '$.action'), JSON_VALUE(payload, '$.element')) action,
  COUNT(*) events, COUNT(DISTINCT shop_id) shops
FROM {EVENTS}
WHERE app_id = 'seoSuite' AND card IN {CARDS}
  AND COALESCE(JSON_VALUE(payload, '$.action'), JSON_VALUE(payload, '$.element')) IN
    ('banner_rescan_now', 'banner_dismiss', 'banner_contact_us', 'checklist_item_rescan',
     'sync_store_data', 'enableFeature')
  AND occurred_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {WEEKS * 7} DAY)
GROUP BY week, action ORDER BY week, action'''), 'events', 'shops')


def score_daily():
    return num(bq(f'''
SELECT CAST(DATE(occurred_at) AS STRING) day, COUNT(DISTINCT shop_id) shops,
  ROUND(AVG(CAST(JSON_VALUE(payload, '$.score') AS FLOAT64)), 1) avg_score,
  ROUND(AVG(CAST(JSON_VALUE(payload, '$.failing_count') AS FLOAT64)), 2) avg_failing
FROM {EVENTS}
WHERE app_id = 'seoSuite' AND card IN {CARDS}
  AND JSON_VALUE(payload, '$.element') = 'checklist_scan_result'
GROUP BY day ORDER BY day'''), 'shops', 'avg_score', 'avg_failing')


def score_change():
    """Per item: shops failing it at their first recorded scan, and how many pass it at their latest."""
    return num(bq(f'''
WITH s AS (
  SELECT shop_id, occurred_at, CAST(JSON_VALUE(payload, '$.score') AS FLOAT64) score,
    JSON_VALUE_ARRAY(payload, '$.failing_types') failing
  FROM {EVENTS}
  WHERE app_id = 'seoSuite' AND card IN {CARDS}
    AND JSON_VALUE(payload, '$.element') = 'checklist_scan_result'),
ends AS (
  SELECT shop_id,
    ARRAY_AGG(STRUCT(score, failing) ORDER BY occurred_at ASC LIMIT 1)[OFFSET(0)] first_scan,
    ARRAY_AGG(STRUCT(score, failing) ORDER BY occurred_at DESC LIMIT 1)[OFFSET(0)] last_scan,
    COUNT(*) scans
  FROM s GROUP BY shop_id HAVING scans > 1)
SELECT item, COUNT(*) shops_failing_first,
  COUNTIF(item NOT IN UNNEST(last_scan.failing)) shops_fixed
FROM ends, UNNEST(first_scan.failing) item
GROUP BY item ORDER BY shops_failing_first DESC'''), 'shops_failing_first', 'shops_fixed')


def crisp_auth():
    env = {}
    with open(SEO_ENV) as f:
        for line in f:
            if '=' in line and line.startswith('CRISP_'):
                k, v = line.rstrip('\n').split('=', 1)
                env[k] = v.strip().strip('"')
    token = b64encode(f"{env['CRISP_IDENTIFIER']}:{env['CRISP_KEY']}".encode()).decode()
    return env['CRISP_WEBSITE_ID'], {'Authorization': f'Basic {token}', 'X-Crisp-Tier': 'plugin'}


def get_json(url, headers):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
                return json.load(r)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))


def scrub(text):
    text = re.sub(r'\S+@\S+', '[email]', text)
    text = re.sub(r'https?://\S+|\b[\w-]+\.myshopify\.com\b', '[link]', text)
    text = re.sub(r'\+?\d[\d\s().-]{7,}\d', '[number]', text)
    return re.sub(r'\s+', ' ', text).strip()[:280]


def crisp():
    website, headers = crisp_auth()
    since = (NOW - timedelta(days=CS_DAYS)).strftime('%Y-%m-%dT00:00:00Z')
    sessions = {}
    for term in CS_TERMS:
        for page in range(1, 11):
            q = urllib.parse.urlencode({'search_query': term, 'search_type': 'text',
                                        'filter_date_start': since, 'per_page': 50})
            data = get_json(f'https://api.crisp.chat/v1/website/{website}/conversations/{page}?{q}',
                            headers).get('data') or []
            for c in data:
                if 'app_seo' in (c.get('meta', {}).get('segments') or []):
                    sessions[c['session_id']] = c
            if len(data) < 50:
                break
    quotes = []
    for sid in sessions:
        msgs = get_json(f'https://api.crisp.chat/v1/website/{website}/conversation/{sid}/messages',
                        headers).get('data') or []
        hits = [m for m in msgs if m.get('from') == 'user' and m.get('type') == 'text'
                and isinstance(m.get('content'), str) and CS_MATCH.search(m['content'])
                and m.get('timestamp', 0) / 1000 >= (NOW - timedelta(days=CS_DAYS)).timestamp()]
        if hits:
            m = hits[0]
            when = datetime.fromtimestamp(m['timestamp'] / 1000, timezone.utc)
            quotes.append({'id': sid[-10:], 'day': when.strftime('%Y-%m-%d'),
                           'term': CS_MATCH.search(m['content']).group(0).lower(),
                           'quote': scrub(m['content'])})
        time.sleep(0.2)
    quotes.sort(key=lambda q: q['day'], reverse=True)
    seen = {}
    for q in quotes:
        seen[q['quote']] = seen.get(q['quote'], 0) + 1
    weekly = {}
    for q in quotes:
        q['kind'] = 'quick_reply' if seen[q['quote']] >= CANNED_MIN else 'own_words'
        d = datetime.strptime(q['day'], '%Y-%m-%d')
        wk = (d - timedelta(days=d.weekday())).strftime('%Y-%m-%d')
        w = weekly.setdefault(wk, {'week': wk, 'own_words': 0, 'quick_reply': 0})
        w[q['kind']] += 1
    return ([weekly[k] for k in sorted(weekly)], quotes, len(sessions))


def reviews():
    cutoff = NOW - timedelta(days=REVIEW_DAYS)
    rows = []
    for page in range(1, 41):
        url = f'{REVIEWS_URL}?sort_by=newest&page={page}'
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}),
                                    timeout=30) as r:
            body = r.read().decode('utf-8', 'replace')
        blocks = body.split('data-merchant-review=""')[1:]
        if not blocks:
            break
        older = False
        for b in blocks:
            rid = re.search(r'data-review-content-id="(\d+)"', b)
            stars = re.search(r'aria-label="([1-5]) out of 5 stars"', b)
            b = b.split('data-merchant-review-reply')[0]
            b = re.sub(r'<svg.*?</svg>', '', b, flags=re.S)
            lines = [html.unescape(x).strip() for x in re.sub(r'<[^>]+>', '\n', b.split('>', 1)[1]).split('\n')]
            lines = [x for x in lines if x and x != 'Show more' and not x.startswith('<')]
            if not (rid and stars and lines):
                continue
            try:
                day = datetime.strptime(lines[0], '%B %d, %Y').replace(tzinfo=timezone.utc)
            except ValueError:
                continue
            if day < cutoff:
                older = True
                break
            meta_at = next((i for i, x in enumerate(lines) if re.search(r'using the app$', x)), None)
            text = ' '.join(lines[1:meta_at - 2] if meta_at and meta_at >= 3 else lines[1:2])
            rows.append({'id': rid.group(1), 'day': day.strftime('%Y-%m-%d'),
                         'rating': int(stars.group(1)),
                         'store': lines[meta_at - 2] if meta_at and meta_at >= 2 else '',
                         'mentions_checklist': bool(REVIEW_MATCH.search(text)),
                         'text': re.sub(r'\s+', ' ', text)[:400]})
        if older:
            break
        time.sleep(1)
    weekly = {}
    for r in rows:
        d = datetime.strptime(r['day'], '%Y-%m-%d')
        wk = (d - timedelta(days=d.weekday())).strftime('%Y-%m-%d')
        w = weekly.setdefault(wk, {'week': wk, 'reviews': 0, 'stars': 0, 'low': 0, 'checklist': 0})
        w['reviews'] += 1
        w['stars'] += r['rating']
        w['low'] += r['rating'] <= 2
        w['checklist'] += r['mentions_checklist']
    for w in weekly.values():
        w['avg_rating'] = round(w.pop('stars') / w['reviews'], 2)
    return [weekly[k] for k in sorted(weekly)], rows


def main(out):
    os.makedirs(out, exist_ok=True)
    report = {}

    def save(name, rows):
        with open(os.path.join(out, f'{name}.json'), 'w') as f:
            json.dump(rows, f, ensure_ascii=False)
        report[name] = len(rows)

    save('usage_weekly', usage_weekly())
    save('fixes_by_item', fixes_by_item())
    save('new_actions', new_actions())
    save('score_daily', score_daily())
    save('score_change', score_change())
    cs_weekly, cs_quotes, cs_scanned = crisp()
    save('cs_weekly', cs_weekly)
    save('cs_quotes', cs_quotes)
    report['cs_conversations_scanned'] = cs_scanned
    rv_weekly, rv_rows = reviews()
    save('reviews_weekly', rv_weekly)
    save('reviews', rv_rows)
    report['at'] = NOW.isoformat(timespec='seconds')
    print(json.dumps(report))


if __name__ == '__main__':
    main(sys.argv[1])
