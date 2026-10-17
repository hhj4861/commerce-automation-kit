"""Bounded discovery through official GitHub APIs and publisher RSS; never installs tools."""
import base64
import datetime as dt
import html
import re
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

import feedparser
import requests

PLUGINS = ('obra/superpowers', 'upstash/context7', 'wshobson/agents')
GUIDE_FEED = 'https://github.blog/ai-and-ml/feed/'
KINDS = ('PLUGIN', 'AGENT HOWTO', 'NEW OSS')


def clean(text):
    return re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]*>', ' ', text or ''))).strip()


def reason(exc):
    return str(exc) if isinstance(exc, RuntimeError) and re.fullmatch(r'HTTP \d{3}', str(exc)) else type(exc).__name__


def get(api, path):
    response = api('GET', path)
    if response.status_code != 200:
        raise RuntimeError(f'HTTP {response.status_code}')
    return response.json()


def repo_name(name):
    if not isinstance(name, str) or not re.fullmatch(r'[\w.-]+/[\w.-]+', name, re.ASCII):
        raise ValueError('Invalid repository identity')
    return name


def readme(api, name):
    data = get(api, f'repos/{repo_name(name)}/readme')
    if data.get('encoding') != 'base64' or data.get('size', 0) > 250_000:
        raise ValueError('README encoding or size unsupported')
    return clean(base64.b64decode(data['content']).decode('utf-8'))[:6500]


def metadata(api, name, now):
    data = get(api, f'repos/{repo_name(name)}')
    if data.get('full_name', '').lower() != name.lower() or data.get('private') or data.get('archived') or data.get('disabled'):
        raise ValueError('Repository unavailable for discovery')
    expected = 'https://github.com/' + name
    if data.get('html_url', '').lower() != expected.lower():
        raise ValueError('Repository source URL mismatch')
    return data, dict(source=name, url=data['html_url'], observed_at=now.isoformat(),
        body=readme(api, name), title=clean(data.get('description') or name),
        stars_total=data['stargazers_count'], license=(data.get('license') or {}).get('spdx_id'))


def plugin(api, name, now):
    try:
        data, item = metadata(api, name, now)
        history = get(api, f'repos/{name}/stargazers/history?per_page=1')
        if not isinstance(history, list) or not history:
            raise ValueError('Star history missing')
        week = history[0]
        if (type(week.get('week')) is not int or type(week.get('total')) is not int
                or week['total'] < 0 or len(week.get('days', [])) != 7
                or any(type(v) is not int or v < 0 for v in week['days'])
                or sum(week['days']) != week['total']):
            raise ValueError('Invalid star history')
        age = now.timestamp() - week['week']
        if not -86400 <= age <= 8*86400:
            raise ValueError('Stale star history')
        item.update(category='PLUGIN', content_kind='PLUGIN', published=now.isoformat(), age_hours=0,
            score=week['total'], popularity={'metric': 'github_stars_created', 'week': week['week'],
                'count': week['total'], 'observed_at': now.isoformat(), 'scope': list(PLUGINS),
                'boundary': 'GitHub API calendar week; timezone unspecified; in progress; not installs'},
            evidence_label=f"관찰 {len(PLUGINS)}개 후보 · GitHub API 주간 신규 별 {week['total']:,} · 진행 중",
            date_basis='조회 시각; 출시일 아님')
        return [item], None
    except Exception as exc:
        return [], {'source': name, 'reason': reason(exc)}


def newcomers(api, now):
    failures, skipped, items = [], [], []
    since = (now - dt.timedelta(days=7)).date().isoformat()
    query = f'created:>={since} archived:false stars:>30 agent in:name,description'
    from urllib.parse import urlencode
    try:
        result = get(api, 'search/repositories?' + urlencode({'q': query, 'sort': 'stars', 'order': 'desc', 'per_page': 6}))
        if result.get('incomplete_results'):
            failures.append({'source': 'new-oss-search', 'reason': 'incomplete_results'})
        for entry in result.get('items', [])[:6]:
            name = repo_name(entry['full_name'])
            if re.search(r'\besp32\b|\biphone\b|\bhardware\b', entry.get('description') or '', re.I):
                skipped.append({'source': name, 'reason': 'hardware_setup_outside_software_brief'})
                continue
            license_id = (entry.get('license') or {}).get('spdx_id')
            if license_id not in ('MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'MPL-2.0', 'GPL-3.0', 'AGPL-3.0'):
                skipped.append({'source': name, 'reason': 'license_not_verified'})
                continue
            try:
                data, item = metadata(api, name, now)
                created = dt.datetime.fromisoformat(data['created_at'].replace('Z', '+00:00'))
                age = (now-created).total_seconds()/3600
                if not 0 <= age <= 168:
                    skipped.append({'source': name, 'reason': 'outside_new_repository_window'})
                    continue
                item.update(category='NEW OSS', content_kind='NEW OSS', published=created.isoformat(),
                    date_basis='GitHub 저장소 생성일; 최초 공개·정식 출시일 미확인', age_hours=age,
                    score=item['stars_total'], evidence_label=f"최근 7일 생성 저장소 · {item['license']} · 문서 확인")
                items.append(item)
            except Exception as exc:
                failures.append({'source': name, 'reason': reason(exc)})
            if len(items) == 3:
                break
        return items, failures, skipped
    except Exception as exc:
        return [], [{'source': 'new-oss-search', 'reason': reason(exc)}], skipped


def guides(now, fetcher=requests.get):
    try:
        response = fetcher(GUIDE_FEED, timeout=30)
        response.raise_for_status()
        parsed = feedparser.parse(response.content)
        if parsed.bozo and not parsed.entries:
            raise ValueError('Invalid official feed')
        items = []
        for entry in parsed.entries:
            stamp = entry.get('published_parsed')
            if not stamp:
                continue
            published = dt.datetime(*stamp[:6], tzinfo=dt.timezone.utc)
            age = (now-published).total_seconds()/3600
            url, title = entry.get('link', ''), clean(entry.get('title'))
            if not (0 <= age <= 168 and urlsplit(url).scheme == 'https' and urlsplit(url).hostname == 'github.blog'
                    and re.search(r'agent|copilot|mcp|skills?', title, re.I)
                    and re.search(r'how to|beginners|using|build|workflow', title, re.I)):
                continue
            body = clean(' '.join(x.get('value', '') for x in entry.get('content', [])) or entry.get('summary'))
            if not body:
                continue
            items.append(dict(title=title, body=body[:6500], url=url, source='GitHub official guide',
                category='AGENT HOWTO', content_kind='AGENT HOWTO', published=published.isoformat(),
                date_basis='공식 활용 가이드 발행일; 기능 출시일 아님', age_hours=age, score=168-age,
                observed_at=now.isoformat(), evidence_label=f"공식 활용 가이드 {published:%Y-%m-%d} · 문서 기반 예시"))
        return items, None
    except Exception as exc:
        return [], {'source': 'GitHub official guides', 'reason': reason(exc)}


def select(items):
    # One useful story in each lane, at most three; a quiet lane is not filled with patch notes.
    result, used = [], set()
    for kind in KINDS:
        for item in sorted((i for i in items if i['content_kind'] == kind), key=lambda i: (-i['score'], i['url'])):
            if item['url'] not in used:
                result.append(item); used.add(item['url']); break
    return result


def collect(api, now):
    with ThreadPoolExecutor(max_workers=5) as pool:
        jobs = [pool.submit(plugin, api, repo, now) for repo in PLUGINS]
        fresh, howto = pool.submit(newcomers, api, now), pool.submit(guides, now)
        results = [job.result() for job in jobs] + [howto.result()]
        new_items, new_failures, skipped = fresh.result()
    failures = [f for _, f in results if f] + new_failures
    plugin_items = [item for group, _ in results for item in group if item.get('content_kind') == 'PLUGIN']
    if len({item['popularity']['week'] for item in plugin_items}) > 1:
        failures.append({'source': 'plugin-interest', 'reason': 'inconsistent_week_buckets'})
        results = [([i for i in group if i.get('content_kind') != 'PLUGIN'], failure) for group, failure in results]
    else:
        scope = [item['source'] for item in plugin_items]
        for item in plugin_items:
            item['popularity']['configured_scope'] = list(PLUGINS)
            item['popularity']['scope'] = scope
            item['evidence_label'] = f"관찰 {len(scope)}개 후보 · GitHub API 주간 신규 별 {item['popularity']['count']:,} · 진행 중"
    search_failed = any(f['source'] == 'new-oss-search' and f['reason'] != 'incomplete_results' for f in new_failures)
    if all(failure for _, failure in results) and search_failed:
        raise RuntimeError('All discovery sources failed; nothing verified')
    pool_items = [item for group, _ in results for item in group] + new_items
    return {'items': select(pool_items), 'failures': failures, 'skipped': skipped,
            'checked': len(PLUGINS)+2, 'content_mode': 'discovery',
            'observed_at': now.isoformat(), 'candidate_count': len(pool_items)}
