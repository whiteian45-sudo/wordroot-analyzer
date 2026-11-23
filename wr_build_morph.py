#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Build morph.json (data-first morphology) from open data.

Sources:
  - etymology-db 2023-12 (CC BY-SA 3.0, structured Wiktionary relations)
  - Open English WordNet 2025 (CC BY 4.0 + Princeton WordNet License): POS + families

Core rule: a data relation is only a *modern surface decomposition* when its
parts reconstruct the word under English spelling rules (e-drop, y→i,
-able/-ible + -ity, double consonants). This rejects etymological-only splits
(island → ey+land, barley → bere+ly). Valid decompositions are then expanded
recursively through other data entries (nationalization = nationalize + ation
= nation + al + ize + ation).

Output schema (compact, ~5-15MB):
  {"meta": {...}, "words": {"word": [prefix|null, [roots], [suffixes], confidence]}}

Usage (run with -I):
  python -I build_morph.py --etym raw_etym/etymology.csv.gz \
      --oewn out/oewn_all.json --oewn-target out/oewn_target.json \
      --target out/target.json --enhanced ".../enhanced.json" \
      --morpholex raw_morpholex/MorphoLEX_en.xlsx \
      --unimorph raw_unimorph/eng.derivations.tsv \
      --kaikki-extract out/kaikki_extract.json \
      --out out/morph.json --report out/report.json
MorphoLex is optional (needs openpyxl) and is CC BY-NC-SA 4.0: it fills common
derived words and is intended for local, non-commercial use only.
"""
import argparse, csv, gzip, json, re, os
from collections import defaultdict

AFFIX_MAX = 15
STEM_REL = {'has_prefix_with_root', 'has_suffix_with_root'}
AFFIX_PREFIX = {'has_prefix'}
AFFIX_SUFFIX = {'has_suffix'}
COMPOUND = {'compound_of'}
ETYMON = {'derived_from', 'inherited_from', 'borrowed_from', 'learned_borrowing_from',
          'semi_learned_borrowing_from', 'orthographic_borrowing_from',
          'unadapted_borrowing_from', 'back-formation_from'}


def clean(s):
    return (s or '').strip().lower()


def strip_hyphens(s):
    return re.sub(r'^[-]+|[-]+$', '', clean(s))


def is_word(w):
    return bool(w) and bool(re.fullmatch(r'[a-z]+', w))


def suffix_forms(stem, suf):
    out = {stem + suf}
    if not stem or not suf:
        return out
    starts_vowel = suf[0] in 'aeiouy'
    if stem.endswith('e') and starts_vowel:
        out.add(stem[:-1] + suf)
    if stem.endswith('ie') and suf.startswith('ing'):
        out.add(stem[:-2] + 'y' + suf)
    if stem.endswith('y') and suf[0] not in 'aeiou':
        out.add(stem[:-1] + 'i' + suf)
    if stem.endswith('ic') and suf[0] in 'eiy':
        out.add(stem + 'k' + suf)
    if stem.endswith('able') and suf in ('ity', 'ability'):
        out.add(stem[:-4] + 'ability')
    if stem.endswith('ible') and suf in ('ity', 'ibility'):
        out.add(stem[:-4] + 'ibility')
    # Forward CVC consonant doubling: run+ing->running, plan+ed->planned, commit+ed->committed
    if (starts_vowel and len(stem) >= 3
            and stem[-1] in 'bcdfghjklmnpqrstvz'
            and stem[-2] in 'aeiou'
            and stem[-3] not in 'aeiou'):
        out.add(stem + stem[-1] + suf)
    # Reverse dedup when stem already carries doubled final consonant
    if len(stem) >= 3 and stem[-1] == stem[-2]:
        out.add(stem[:-1] + suf)
    return out


def ordered(vals):
    seen, out = set(), []
    for pos, x in sorted(vals, key=lambda z: (str(z[0]), z[1])):
        if x not in seen:
            seen.add(x); out.append(x)
    return out


def try_derivation(word, prefixes, stems, suffixes):
    pre = ''.join(prefixes)
    for stem in stems:
        if not is_word(stem):
            continue
        forms = {pre + stem}
        for suf in suffixes:
            nxt = set()
            for f in forms:
                nxt |= suffix_forms(f, suf)
            forms = nxt
        if word in forms:
            return stem, prefixes, suffixes
    return None


def try_compound(word, comps):
    comps = [c for c in comps if is_word(c)]
    if len(comps) < 2:
        return None
    forms = {comps[0]}
    for c in comps[1:]:
        forms = {f + c for f in forms}
    return comps if word in forms else None


def load_morpholex(path):
    """Parse MorphoLex-en.xlsx (CC BY-NC-SA 4.0) into word -> [prefix, roots, suffixes].
    MorphoLexSegm uses canonical morphemes: (root), <prefix, >suffix.
    Only keep entries whose parts reconstruct the surface word with English spelling rules,
    and only multi-morpheme entries (a single root == the word adds nothing)."""
    try:
        import openpyxl
    except Exception as e:
        print('MorphoLex skipped: openpyxl not available:', e)
        return {}
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    skip = {'Presentation', 'All prefixes', 'All suffixes', 'All roots'}
    res = {}
    for sh in wb.sheetnames:
        if sh in skip:
            continue
        ws = wb[sh]
        hdr = None
        for row in ws.iter_rows(values_only=True):
            if hdr is None:
                hdr = list(row)
                continue
            try:
                wi = hdr.index('Word'); si = hdr.index('MorphoLexSegm')
            except ValueError:
                continue
            w = str(row[wi] or '').lower()
            if not re.fullmatch(r'[a-z]+', w):
                continue
            seg = str(row[si] or '')
            pres = [x.lower() for x in re.findall(r'<([A-Za-z]+)(?=<|\(|>|\}|$)', seg)]
            roots = [x.lower() for x in re.findall(r'\(([^()]+)\)', seg)]
            sufs = [x.lower() for x in re.findall(r'>([A-Za-z]+)(?=<|\(|>|\}|$)', seg)]
            if len(pres) + len(roots) + len(sufs) < 2 or not roots:
                continue
            forms = {''.join(pres) + ''.join(roots)}
            for suf in sufs:
                nxt = set()
                for f in forms:
                    nxt |= suffix_forms(f, suf)
                forms = nxt
            if w in forms and w not in res:
                res[w] = [''.join(pres) or None, roots, sufs]
    return res


def load_unimorph(path):
    """UniMorph eng.derivations.tsv: lemma, derived, POS:POS, affix (-suffix / prefix-).
    Returns (new decompositions, family edges). Only surface-reconstructing derivations are
    kept as decompositions; all pairs are kept as family edges (used for mutual validation)."""
    res = {}
    fam = defaultdict(set)
    try:
        f = open(path, encoding='utf-8')
    except Exception as e:
        print('UniMorph skipped:', e)
        return res, fam
    for line in f:
        parts = line.rstrip('\n').split('\t')
        if len(parts) < 4:
            continue
        lemma, derived, _pos, aff = [x.strip().lower() for x in parts[:4]]
        if not is_word(lemma) or not is_word(derived):
            continue
        fam[lemma].add(derived)
        fam[derived].add(lemma)
        if aff.startswith('-') and len(aff) > 2:
            suf = aff[1:]
            if 1 <= len(suf) <= AFFIX_MAX and derived in suffix_forms(lemma, suf):
                res.setdefault(derived, [None, [lemma], [suf]])
        elif aff.endswith('-') and len(aff) > 1:
            pre = aff[:-1]
            if 1 <= len(pre) <= AFFIX_MAX and derived == pre + lemma:
                res.setdefault(derived, [pre, [lemma], []])
    f.close()
    return res, fam


def canon_morphs(arr):
    out = []
    for x in arr:
        if x == 'ability':
            out += ['able', 'ity']
        elif x == 'ibility':
            out += ['ible', 'ity']
        else:
            out.append(x)
    return out


def chain_rate(parts, cms):
    a = canon_morphs([x for x in parts if x])
    b = canon_morphs([x for x in cms if x])
    if not b:
        return 0.0
    hits = 0
    for cm in b:
        if any(x == cm or (len(x) >= 2 and len(cm) >= 2 and (x.startswith(cm) or cm.startswith(x))) for x in a):
            hits += 1
    return hits / len(b)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--etym', required=True)
    ap.add_argument('--oewn', required=True)
    ap.add_argument('--oewn-target', required=True)
    ap.add_argument('--oewn-family', default=None, help='full OEWN word -> derivational family')
    ap.add_argument('--target', required=True)
    ap.add_argument('--enhanced', required=True)
    ap.add_argument('--morpholex', default=None, help='MorphoLex-en.xlsx (CC BY-NC-SA 4.0)')
    ap.add_argument('--unimorph', default=None, help='eng.derivations.tsv (CC BY-SA 3.0)')
    ap.add_argument('--kaikki-extract', default=None, help='kaikki extract JSON from extract_kaikki.py')
    ap.add_argument('--out', required=True)
    ap.add_argument('--report', default=None)
    args = ap.parse_args()

    target = set(json.load(open(args.target, encoding='utf-8')))
    oewn_all = json.load(open(args.oewn, encoding='utf-8'))
    oewn_target = json.load(open(args.oewn_target, encoding='utf-8'))
    oewn_family = json.load(open(args.oewn_family, encoding='utf-8')) if args.oewn_family else {}
    kaikki = json.load(open(args.kaikki_extract, encoding='utf-8'))['words'] if args.kaikki_extract else {}
    enhanced = json.load(open(args.enhanced, encoding='utf-8'))
    chain = {}
    for w, e in enhanced.items():
        if e and e.get('chain'):
            chain[w.lower()] = [c.get('m', '') for c in e['chain'] if c.get('m')]

    # 同族词只保留常用词集合（BNC 1–9 / enhanced / 词光）里的直接派生，
    # 过滤掉 nonnonsense、footer 这类冷僻/间接噪音。
    def fam_list(w):
        f = oewn_family.get(w) or (oewn_target.get(w, {}).get('fam') if w in oewn_target else None)
        if not f:
            return []
        return [x for x in f if x in target and x != w]

    rels = defaultdict(lambda: defaultdict(list))
    rows = 0
    with gzip.open(args.etym, 'rt', encoding='utf-8', newline='') as f:
        r = csv.DictReader(f)
        for row in r:
            rows += 1
            if clean(row.get('lang')) != 'english':
                continue
            term = clean(row.get('term'))
            if not is_word(term) or not (2 <= len(term) <= 30):
                continue
            rels[term][clean(row.get('reltype'))].append((clean(row.get('related_term')), row.get('position')))

    raw = {}
    stats = defaultdict(int)
    for term, rmap in rels.items():
        prefixes, suffixes, stems, comps, etymons, roots = [], [], [], [], [], []
        affix_rows = []
        for rel, vals in rmap.items():
            for related, pos in vals:
                if rel in AFFIX_PREFIX:
                    a = strip_hyphens(related)
                    if 2 <= len(a) <= AFFIX_MAX and term.startswith(a): prefixes.append((pos, a))
                elif rel in AFFIX_SUFFIX:
                    a = strip_hyphens(related)
                    if 2 <= len(a) <= AFFIX_MAX and term.endswith(a): suffixes.append((pos, a))
                elif rel in STEM_REL:
                    s = strip_hyphens(related)
                    if is_word(s): stems.append(s)
                elif rel == 'has_affix':
                    affix_rows.append((related, pos))
                elif rel in COMPOUND:
                    c = strip_hyphens(related)
                    if is_word(c): comps.append((pos, c))
                elif rel in ETYMON:
                    c = clean(related)
                    if c and len(c) <= 30 and c not in etymons: etymons.append(c)
                elif rel == 'root':
                    c = clean(related)
                    if c and c not in roots: roots.append(c)

        for related, pos in affix_rows:
            raw_rel = clean(related)
            if raw_rel.startswith('-'):
                a = strip_hyphens(raw_rel)
                if 2 <= len(a) <= AFFIX_MAX and term.endswith(a): suffixes.append((pos, a))
            elif raw_rel.endswith('-'):
                a = strip_hyphens(raw_rel)
                if 2 <= len(a) <= AFFIX_MAX and term.startswith(a): prefixes.append((pos, a))
            else:
                s = strip_hyphens(raw_rel)
                if is_word(s) and s in oewn_all: stems.append(s)

        prefixes = ordered(prefixes)
        suffixes = ordered(suffixes)
        comps = [x for _, x in sorted(comps, key=lambda z: str(z[0]))]
        stems = list(dict.fromkeys(stems))

        decomp = None
        if comps:
            cc = try_compound(term, comps)
            if cc:
                decomp = {'kind': 'compound', 'prefix': None, 'roots': cc, 'suffixes': []}
        if not decomp and stems and suffixes:
            got = try_derivation(term, prefixes, stems, suffixes)
            if got:
                stem, pres, sufs = got
                disp = []
                for s in sufs:
                    if s in ('ability', 'ibility') and (stem.endswith('able') or stem.endswith('ible')):
                        disp.append('ity')
                    else:
                        disp.append(s)
                decomp = {'kind': 'derivation', 'prefix': ''.join(pres) or None,
                          'roots': [stem], 'suffixes': disp}
        if not decomp and stems and not suffixes and prefixes:
            got = try_derivation(term, prefixes, stems, [])
            if got:
                stem, pres, _ = got
                decomp = {'kind': 'derivation', 'prefix': ''.join(pres) or None,
                          'roots': [stem], 'suffixes': []}
        if decomp:
            raw[term] = decomp
            stats['decomp'] += 1
            if decomp['kind'] == 'compound': stats['compound'] += 1
            if not decomp['suffixes'] and not decomp['prefix'] and decomp['kind'] == 'derivation':
                stats['prefix_only'] += 1

    # Recursive expansion through other data entries.
    def expand(term, stack):
        if term in stack or term not in raw:
            return None
        d = raw[term]
        stack = stack | {term}
        roots, pres, sufs = [], [], []
        if d['kind'] == 'compound':
            for c in d['roots']:
                sub = expand(c, stack)
                if sub:
                    roots += sub['roots']; sufs += sub['suffixes']
                    if sub['prefix']: pres.append(sub['prefix'])
                else:
                    roots.append(c)
            return {'prefix': '-'.join(pres) or None, 'roots': roots, 'suffixes': sufs}
        for r in d['roots']:
            sub = expand(r, stack)
            if sub:
                roots += sub['roots']; sufs += sub['suffixes']
                if sub['prefix']: pres.append(sub['prefix'])
            else:
                roots.append(r)
        if d['prefix']: pres.append(d['prefix'])
        sufs += d['suffixes']
        if not roots:
            return None
        return {'prefix': '-'.join(pres) or None, 'roots': roots, 'suffixes': sufs}

    words = {}
    for term in raw:
        ex = expand(term, frozenset())
        if not ex:
            continue
        # Confidence: data-validated reconstruction; high when all roots are common/known.
        conf = 0.9
        if all((r in oewn_all or r in raw or r in target) for r in ex['roots']):
            conf = 0.95
        words[term] = [ex['prefix'], ex['roots'], ex['suffixes'], conf]
        stats['words'] += 1

    # MorphoLex (CC BY-NC-SA 4.0) fills common derived words that Wiktionary lacks.
    # Added only where etymology-db/OEWN has no decomposition; local/non-commercial use.
    if args.morpholex:
        mlx = load_morpholex(args.morpholex)
        added = 0
        for w, parts in mlx.items():
            if w in words:
                continue
            words[w] = [parts[0], parts[1], parts[2], 0.85]
            added += 1
        stats['morpholex_words'] = len(mlx)
        stats['morpholex_added'] = added

    # UniMorph (CC BY-SA 3.0)：补派生词拆解和词族边；只补空缺，不覆盖已有数据。
    if args.unimorph:
        uni, uni_fam = load_unimorph(args.unimorph)
        added = 0
        for w, parts in uni.items():
            if w not in words:
                words[w] = [parts[0], parts[1], parts[2], 0.88]
                added += 1
        for w, fs in uni_fam.items():
            cur = set(oewn_family.get(w, [])) | fs
            oewn_family[w] = sorted(cur)[:20]
        stats['unimorph_added'] = added
        stats['unimorph_pairs'] = sum(len(v) for v in uni_fam.values()) // 2

    # kaikki（CC BY-SA 3.0 + GFDL）：3.4GB 原始 Wiktionary 提取，只保留严格子集。
    # 374 个“新”表面拆解里大量是 number→numb+er、party→part+y 这类词源/功能词误拆；
    # 只收：词根都是 OEWN 实词、后缀不是弱/屈折后缀、且词根在同词 OEWN 词族里。
    if kaikki:
        added = 0
        fam_merged = 0
        weak = {'s', 'es', 'ed', 'ing', 'en', 'n', 't', 'y', 'ly', 'er', 'est'}
        for w, ent in kaikki.items():
            if w in words:
                cur = set(oewn_family.get(w, [])) | set(ent.get('family') or [])
                oewn_family[w] = sorted(cur)[:20]
                fam_merged += 1
                continue
            decs = ent.get('decomp') or []
            if not decs:
                continue
            p, roots, sufs = decs[0]
            if not roots:
                continue
            if not all(any(po in ('n', 'v', 'a', 'r') for po in oewn_all.get(r, [])) for r in roots):
                continue
            if any(len(s) < 2 or s in weak for s in (sufs or [])) or (p and len(p) < 2):
                continue
            if len(sufs or []) > 1:
                continue
            f = set(oewn_family.get(w, []))
            if not any(r in f for r in roots):
                continue
            words[w] = [p, roots, sufs, 0.92]
            added += 1
        stats['kaikki_added'] = added
        stats['kaikki_family_merged'] = fam_merged

    # 置信度校准：enhanced 精修链、BNC/atlas/enhanced 常用词、OEWN 词根。
    # 低于 0.85 的冷僻数据在 App 里回落到规则引擎（morphDataToBd 的闸门）。
    stats['low_conf'] = 0
    for w, val in words.items():
        conf = val[3]
        if w in chain:
            rate = chain_rate(([val[0]] if val[0] else []) + val[1] + val[2], chain[w])
            if rate >= 1.0:
                conf += 0.03
            elif rate >= 0.5:
                conf += 0.01
            else:
                conf -= 0.08
        # 不在常用词集合里只轻罚：词根都已知的组合词（bookmaker/pipedream）仍然可用；
        # 词根也不认识的冷僻项会继续低于 0.85，被 App 闸门挡住。
        conf += 0.03 if w in target else -0.02
        if val[1] and all(r in oewn_all for r in val[1]):
            conf += 0.02
        # 词族互验：同族词如果有拆解，且与当前词共享词根，提升置信度；反之略降。
        fam_all = fam_list(w)
        if fam_all:
            fws = [f for f in fam_all if f in words]
            if fws:
                roots = set(val[1])
                if any(set(words[f][1]) & roots for f in fws):
                    conf += 0.02
                    stats['family_overlap'] += 1
                else:
                    conf -= 0.02
                    stats['family_no_overlap'] += 1
        conf = max(0.6, min(0.99, round(conf, 2)))
        val[3] = conf
        if conf < 0.85:
            stats['low_conf'] += 1

    # OEWN 派生词族：全部 OEWN 词都附成第 5 个元素，卡片用来做「同族词」。
    stats['family_added'] = 0
    for w, val in words.items():
        fam = fam_list(w)
        if fam:
            fw = [x for x in fam if x and x != w and x not in val[1]][:12]
            if fw:
                val.append(fw)
                stats['family_added'] += 1

    out = {
        'meta': {
            'version': 1,
            'built': '2026-11-04',
            'sources': [
                'etymology-db 2023-12 (CC BY-SA 3.0, from Wiktionary)',
                'Open English WordNet 2025 (CC BY 4.0 + Princeton WordNet License)',
                'MorphoLex-en (CC BY-NC-SA 4.0; local/non-commercial use)',
                'UniMorph English derivations (CC BY-SA 3.0)',
                'kaikki.org English Wiktionary extract (CC BY-SA 3.0 + GFDL; strict subset)',
            ],
            'words': len(words),
            'schema': '[prefix|null, roots[], suffixes[], confidence, family[]?]',
        },
        'words': words,
    }
    os.makedirs(os.path.dirname(args.out) or '.', exist_ok=True)
    json.dump(out, open(args.out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

    samples = {}
    for w in ['barley', 'island', 'affability', 'nationalization', 'nationalize', 'national',
              'footballer', 'football', 'oxygenous', 'oxygen', 'unbelievability',
              'perishableness', 'compatibility', 'believability', 'perishable', 'believable',
              'architecture', 'biology', 'basketball', 'although', 'alive']:
        samples[w] = words.get(w)
    report = {'etym_rows': rows, 'english_terms': len(rels), 'raw_decomp': len(raw),
              'output_words': len(words), 'stats': dict(stats), 'samples': samples}
    if args.report:
        json.dump(report, open(args.report, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps({k: report[k] for k in ['etym_rows', 'english_terms', 'raw_decomp', 'output_words', 'stats']},
                     ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
