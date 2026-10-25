#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把大词典 JSON 构建成 SQLite（dict.db），并在构建后做抽样对拍。
用法：
    python build_dict_db.py            # 构建 + 抽样对拍（20 词）
    python build_dict_db.py --check 50 # 只对拍 50 词（不重建）
思路：不改前端、不改现有查词路径 —— 先把"服务端能按词秒查"这件事做出来并验证一致，
      下一步再让前端在 /lookup 上取词（那时才动前端）。"""
import json, os, sqlite3, sys, random, time

DIR = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(DIR, 'dict.db')
SRC = [('ecdict', 'ecdict.json'), ('oxford', 'oxford.json'), ('thes', 'thes.json')]


def build():
    db = sqlite3.connect(DB)
    db.execute('DROP TABLE IF EXISTS dict')
    db.execute('CREATE TABLE dict (word TEXT NOT NULL, src TEXT NOT NULL, doc TEXT NOT NULL, PRIMARY KEY (word, src))')
    total = 0
    for src, fn in SRC:
        p = os.path.join(DIR, fn)
        if not os.path.exists(p):
            print(f'  跳过 {fn}（不存在）')
            continue
        t0 = time.time()
        with open(p, encoding='utf-8') as f:
            data = json.load(f)
        rows = [(str(w).strip().lower(), src, json.dumps(v, ensure_ascii=False)) for w, v in data.items() if str(w).strip()]
        db.executemany('INSERT OR REPLACE INTO dict (word, src, doc) VALUES (?,?,?)', rows)
        db.commit()
        total += len(rows)
        print(f'  {src}: {len(rows)} 条（{time.time()-t0:.1f}s）')
    db.execute('CREATE INDEX IF NOT EXISTS idx_word ON dict(word)')
    db.commit()
    print(f'  合计 {total} 条，dict.db = {os.path.getsize(DB)/1048576:.1f} MB')
    db.close()


def check(n=20):
    if not os.path.exists(DB):
        print('✗ dict.db 不存在，先跑构建'); return 1
    db = sqlite3.connect(DB)
    bad = miss = ok = 0
    sample = []
    for src, fn in SRC:
        p = os.path.join(DIR, fn)
        if not os.path.exists(p):
            continue
        with open(p, encoding='utf-8') as f:
            data = json.load(f)
        keys = [k for k in data.keys() if str(k).strip()]
        random.seed(42)
        sample += [(src, k, data[k]) for k in random.sample(keys, min(n, len(keys)))]
    for src, w, val in sample:
        row = db.execute('SELECT doc FROM dict WHERE word=? AND src=?', (str(w).strip().lower(), src)).fetchone()
        if not row:
            miss += 1; print(f'  ✗ 缺失 {src}:{w}')
            continue
        if json.loads(row[0]) == val:
            ok += 1
        else:
            bad += 1; print(f'  ✗ 不一致 {src}:{w}')
    db.close()
    print(f'  对拍结果：一致 {ok} ✓  不一致 {bad} ✗  缺失 {miss} ✗（共 {len(sample)}）')
    return 0 if (bad == 0 and miss == 0 and ok > 0) else 1


if __name__ == '__main__':
    if '--check' in sys.argv:
        i = sys.argv.index('--check')
        n = int(sys.argv[i + 1]) if i + 1 < len(sys.argv) else 20
        sys.exit(check(n))
    print('=== 构建 dict.db ===')
    build()
    print('=== 抽样对拍 ===')
    sys.exit(check(20))
