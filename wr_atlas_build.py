#!/usr/bin/env python3
"""把 Word Atlas（词光）的原始词库编译成本地用的 atlas.json。

用法（输入文件属于第三方数据，按项目惯例不要从它所在目录启动解释器）：
    python -I wr_atlas_build.py <word-atlas.json> atlas.json --index <index.json>

只读 JSON，不联网、不执行输入里的任何东西。
输出是紧凑格式：一个 words 字典 + 学习顺序 order；空字段不写，减小体积。
"""
import argparse
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

CEFR = {'A1', 'A2', 'B1', 'B2', 'C1', 'C2'}
TOPICS = {
    'education', 'work', 'technology', 'science', 'environment', 'health',
    'society', 'government', 'economy', 'media', 'arts', 'travel', 'city',
    'nature', 'daily', 'emotion', 'thinking', 'sport', 'history',
}


def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def media_map(index_path):
    """index.json 的 rows: [id, word, zh, ipa, cefrIdx, topicIdx, mediaBits]"""
    if not index_path:
        return {}
    idx = load_json(index_path)
    out = {}
    for row in idx.get('words', []):
        if isinstance(row, list) and len(row) >= 7 and row[1]:
            out[str(row[1]).strip().lower()] = row[6]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input', help='上游 data/word-atlas.json')
    ap.add_argument('output', help='输出 atlas.json')
    ap.add_argument('--index', help='上游 public/atlas/index.json（可选，用来带媒体位标记）')
    args = ap.parse_args()

    raw = load_json(args.input)
    if not isinstance(raw, list):
        sys.exit('输入不是数组：' + args.input)
    mm = media_map(args.index)

    words = {}
    order = []
    bad = []
    dup = []
    for x in raw:
        if not isinstance(x, dict):
            bad.append('<not an object>')
            continue
        w = str(x.get('w') or '').strip()
        if not w:
            bad.append('<empty word>')
            continue
        key = w.lower()
        if key in words:
            dup.append(w)
            continue
        senses = x.get('senses') or []
        ex = x.get('ex') or []
        cefr = x.get('cefr') or ''
        topic = x.get('topic') or ''
        if not senses or not ex:
            bad.append(w + ': missing senses/ex')
            continue
        if cefr not in CEFR:
            bad.append(w + ': bad cefr ' + str(cefr))
            cefr = ''
        if topic not in TOPICS:
            bad.append(w + ': bad topic ' + str(topic))
            topic = ''
        o = {
            'w': w,
            'id': x.get('id') or key,
            'uk': x.get('uk') or '',
            'us': x.get('us') or '',
            'senses': senses,
            'ex': ex,
            'col': x.get('col') or [],
            'cefr': cefr,
            'topic': topic,
            'tip': x.get('tip') or '',
        }
        for name in ('fam', 'syn', 'ant', 'note'):
            v = x.get(name)
            if v:
                o[name] = v
        if key in mm:
            o['m'] = mm[key]
        words[key] = o
        order.append(key)

    out = {
        'v': 1,
        'license': 'CC BY 4.0',
        'source': 'Word Atlas contributors',
        'attribution': 'Word Atlas contributors — CC BY 4.0; fields trimmed and merged for local use.',
        'count': len(words),
        'order': order,
        'words': words,
    }
    text = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    with open(args.output, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)

    media = {1: 'img', 2: 'uk', 4: 'us', 8: 'ex', 16: 'thumb'}
    cnt = {name: 0 for name in media.values()}
    for o in words.values():
        m = o.get('m', 0)
        for bit, name in media.items():
            if m & bit:
                cnt[name] += 1
    print('✓ 写出 %s（%.2f MB）' % (args.output, len(text.encode('utf-8')) / 1048576))
    print('  词条 %d / 学习顺序 %d' % (len(words), len(order)))
    print('  媒体覆盖：' + ' '.join('%s=%d' % (k, v) for k, v in cnt.items()))
    if dup:
        print('  ! 重复词头 %d 个（保留第一条）：%s' % (len(dup), ' '.join(dup[:10])))
    if bad:
        print('  ! 跳过/修正 %d 条：%s' % (len(bad), ' | '.join(bad[:8])))


if __name__ == '__main__':
    main()
