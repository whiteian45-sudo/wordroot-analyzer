#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Stream kaikki.org English JSONL and extract surface-valid decompositions + family edges
for words in the project's target set (BNC 1-9 / enhanced / Word Atlas) and low-confidence
morph entries.

Kaikki is huge (~3.4GB JSONL); this never loads the whole file. Only matched words are kept.
Output: out/kaikki_extract.json  { words: { w: {decomp: [[prefix, roots, suffixes], ...], family: [...]} }, stats }
"""
import argparse, json, re, sys, os
from collections import defaultdict

AFFIX_MAX = 15


def suffix_forms(stem, suf):
    out = {stem + suf}
    if stem.endswith('e') and suf and suf[0] in 'aeiouy':
        out.add(stem[:-1] + suf)
    if stem.endswith('y') and suf and suf[0] not in 'aeiou':
        out.add(stem[:-1] + 'i' + suf)
    if stem.endswith('able') and suf in ('ity', 'ability'):
        out.add(stem[:-4] + 'ability')
    if stem.endswith('ible') and suf in ('ity', 'ibility'):
        out.add(stem[:-4] + 'ibility')
    if len(stem) >= 3 and stem[-1] == stem[-2]:
        out.add(stem[:-1] + suf)
    return out


def clean_part(x):
    x = re.sub(r'<[^>]*>', '', x or '').strip().lower()
    x = x.replace('’', "'")
    return x


def parts_of(t):
    """Return candidate surface part lists from one etymology template."""
    nm = t.get('name') or ''
    a = t.get('args') or {}
    if nm in ('af', 'affix', 'com', 'compound', 'surf'):
        parts = [a.get(str(k)) for k in range(2, 7) if a.get(str(k))]
        return [parts] if parts else []
    if nm == 'suffix':
        stem, suf = a.get('2'), a.get('3')
        if stem and suf:
            return [[stem, '-' + suf.lstrip('-')]]
    if nm == 'prefix':
        pre, stem = a.get('2'), a.get('3')
        if pre and stem:
            return [[pre.rstrip('-') + '-', stem]]
    if nm == 'confix':
        p1, p2 = a.get('2'), a.get('3')
        if p1 and p2:
            return [[p1, p2]]
    return []


def classify(parts):
    pres, roots, sufs = [], [], []
    for p in parts:
        p = clean_part(p)
        if not p or not re.fullmatch(r'[-a-z]+', p):
            continue
        # linking vowel/infix like -s- or -o-
        if p.startswith('-') and p.endswith('-') and len(p) > 2:
            continue
        if p.startswith('-'):
            a = p.lstrip('-')
            if 1 <= len(a) <= AFFIX_MAX:
                sufs.append(a)
        elif p.endswith('-'):
            a = p.rstrip('-')
            if 1 <= len(a) <= AFFIX_MAX:
                pres.append(a)
        else:
            if len(p) >= 2 and len(p) <= 30:
                roots.append(p)
    return pres, roots, sufs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--kaikki', required=True)
    ap.add_argument('--morph', required=True)
    ap.add_argument('--target', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--report', default=None)
    ap.add_argument('--progress', type=int, default=100000)
    args = ap.parse_args()

    target = set(json.load(open(args.target, encoding='utf-8')))
    morph = json.load(open(args.morph, encoding='utf-8'))['words']
    low = {w for w, v in morph.items() if isinstance(v, list) and len(v) > 3 and v[3] < 0.85}
    keep = target | low
    print('keep words:', len(keep), 'target', len(target), 'low_conf', len(low), file=sys.stderr)

    found = {}
    stats = defaultdict(int)
    n = 0
    with open(args.kaikki, encoding='utf-8') as f:
        for line in f:
            n += 1
            if n % args.progress == 0:
                print('lines', n, 'found', len(found), file=sys.stderr, flush=True)
            try:
                d = json.loads(line)
            except Exception:
                stats['bad_json'] += 1
                continue
            w = (d.get('word') or '').lower()
            if w not in keep or not re.fullmatch(r'[a-z]+', w) or not (2 <= len(w) <= 30):
                continue
            ent = found.setdefault(w, {'decomp': [], 'family': []})
            for t in (d.get('etymology_templates') or []):
                for parts in parts_of(t):
                    pres, roots, sufs = classify(parts)
                    if not roots:
                        continue
                    forms = {''.join(pres) + ''.join(roots)}
                    for suf in sufs:
                        nxt = set()
                        for x in forms:
                            nxt |= suffix_forms(x, suf)
                        forms = nxt
                    if w not in forms:
                        continue
                    cand = [''.join(pres) or None, roots, sufs]
                    key = json.dumps(cand, ensure_ascii=False)
                    if key not in ent['decomp']:
                        ent['decomp'].append(key)
                        stats['decomp_raw'] += 1
            fam = ent['family']
            for key in ('derived', 'related'):
                for item in (d.get(key) or []):
                    x = (item.get('word') if isinstance(item, dict) else str(item))
                    x = (x or '').lower()
                    if x and x != w and re.fullmatch(r'[a-z]+', x) and x not in fam:
                        fam.append(x)
            stats['entries'] += 1

    words = {}
    for w, ent in found.items():
        decs = [json.loads(x) for x in ent['decomp']]
        fam = ent['family'][:30]
        if not decs and not fam:
            continue
        words[w] = {'decomp': decs[:8], 'family': fam}
        stats['words'] += 1
        if decs:
            stats['words_decomp'] += 1
        if fam:
            stats['words_family'] += 1

    out = {'meta': {'source': 'kaikki.org English Wiktionary extract (CC BY-SA 3.0 + GFDL)',
                    'words': len(words)},
           'words': words}
    os.makedirs(os.path.dirname(args.out) or '.', exist_ok=True)
    json.dump(out, open(args.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    report = {'lines': n, 'keep': len(keep), 'output_words': len(words), 'stats': dict(stats)}
    if args.report:
        json.dump(report, open(args.report, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps(report, ensure_ascii=False, indent=1))
    print('samples', {w: words.get(w) for w in ['nonsense', 'connotation', 'dictionary', 'antonym', 'affability']}, file=sys.stderr)


if __name__ == '__main__':
    main()
