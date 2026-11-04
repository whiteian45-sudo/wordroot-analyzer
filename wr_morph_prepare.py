#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Prepare the intermediate JSON files consumed by wr_build_morph.py.

Inputs:
  --oewn-dir   extracted Open English WordNet JSON directory (entries-*.json)
  --enhanced   enhanced.json
  --bnc        bnc.json
  --atlas      atlas.json

Outputs (in --out-dir):
  target.json            BNC 1-9 + enhanced + Word Atlas word list
  oewn_all.json          word -> [POS...]
  oewn_target.json       target word -> {pos, fam}
  oewn_family_all.json   word -> [derivational family...]

Only stdlib is required. Run with -I when reading downloaded data:
  python -I wr_morph_prepare.py --oewn-dir raw_oewn/oewn --enhanced enhanced.json \
      --bnc bnc.json --atlas atlas.json --out-dir out
"""
import argparse, glob, json, os, re


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--oewn-dir', required=True)
    ap.add_argument('--enhanced', required=True)
    ap.add_argument('--bnc', required=True)
    ap.add_argument('--atlas', required=True)
    ap.add_argument('--out-dir', required=True)
    args = ap.parse_args()

    enh = json.load(open(args.enhanced, encoding='utf-8'))
    bnc = json.load(open(args.bnc, encoding='utf-8'))
    atlas = json.load(open(args.atlas, encoding='utf-8'))

    target = set()
    for w in enh:
        target.add(str(w).lower())
    for lv in range(1, 10):
        for hw, variants in (bnc.get(str(lv)) or {}).items():
            target.add(str(hw).lower())
            for v in variants:
                target.add(str(v).lower())
    for w in (atlas.get('words') or {}):
        target.add(str(w).lower())
    target = sorted(w for w in target if re.fullmatch(r'[a-z]+', w) and 2 <= len(w) <= 30)
    target_set = set(target)

    oewn_all = {}
    oewn_target = {}
    oewn_family = {}
    files = sorted(glob.glob(os.path.join(args.oewn_dir, 'entries-*.json')))
    if not files:
        raise SystemExit('no entries-*.json under ' + args.oewn_dir)
    for fp in files:
        d = json.load(open(fp, encoding='utf-8'))
        for w, entry in d.items():
            wl = w.lower()
            if not re.fullmatch(r'[a-z]+', wl):
                continue
            pos = sorted(k for k in entry.keys() if k in ('n', 'v', 'a', 'r'))
            if pos:
                oewn_all[wl] = pos
            fam = set()
            for pv in entry.values():
                if not isinstance(pv, dict):
                    continue
                for sense in pv.get('sense', []) or []:
                    for did in sense.get('derivation', []) or []:
                        lemma = did.split('%')[0].replace('_', ' ').strip().lower()
                        if lemma and lemma != wl and re.fullmatch(r'[a-z]+', lemma):
                            fam.add(lemma)
            fam = sorted(fam)[:20]
            if fam:
                oewn_family[wl] = fam
                if wl in target_set:
                    oewn_target[wl] = {'pos': pos, 'fam': fam}

    os.makedirs(args.out_dir, exist_ok=True)
    json.dump(target, open(os.path.join(args.out_dir, 'target.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    json.dump(oewn_all, open(os.path.join(args.out_dir, 'oewn_all.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    json.dump(oewn_target, open(os.path.join(args.out_dir, 'oewn_target.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    json.dump(oewn_family, open(os.path.join(args.out_dir, 'oewn_family_all.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    print(json.dumps({
        'target': len(target),
        'oewn_all': len(oewn_all),
        'oewn_target': len(oewn_target),
        'oewn_family_all': len(oewn_family),
        'out_dir': args.out_dir,
    }, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
