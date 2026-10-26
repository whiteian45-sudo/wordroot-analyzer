#!/usr/bin/env python3
"""下载 Word Atlas（词光）的插画与发音到本地 atlas_media/。

只下载 atlas.json 里媒体位标记为可用的文件：
    bit 1 = img   bit 2 = uk 音   bit 4 = us 音   bit 8 = 例句朗读   bit 16 = 缩略图

用法（在项目目录下）：
    python -I wr_atlas_media.py                 # 全量，默认 16 线程
    python -I wr_atlas_media.py --limit 20      # 先试 20 个词
    python -I wr_atlas_media.py --kinds img,uk  # 只下某几类
    python -I wr_atlas_media.py --base raw      # 换回 GitHub raw（CDN 被挡时）

会跳过已存在且非空的文件，可反复断点续跑。需要代理时先设 HTTPS_PROXY。
"""
import argparse
import concurrent.futures as cf
import json
import os
import shutil
import sys
import threading
import urllib.parse
import urllib.request

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

CDN = 'https://cdn.jsdelivr.net/gh/designfuchen/word-atlas@main/public/atlas'
RAW = 'https://raw.githubusercontent.com/designfuchen/word-atlas/main/public/atlas'
KINDS = {
    'img':   ('img',      '.webp', 1),
    'thumb': ('thumb',    '.webp', 16),
    'uk':    ('audio/uk', '.mp3',  2),
    'us':    ('audio/us', '.mp3',  4),
    'ex':    ('audio/ex', '.mp3',  8),
}

lock = threading.Lock()
done = [0]
failed = []


def get(url, dest, retries=3):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return 'skip'
    tmp = dest + '.part'
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'wordroot-atlas-media/1.0',
                'Accept': '*/*',
            })
            with urllib.request.urlopen(req, timeout=90) as r, open(tmp, 'wb') as f:
                shutil.copyfileobj(r, f, 1024 * 128)
            if os.path.getsize(tmp) <= 0:
                raise IOError('empty file')
            os.replace(tmp, dest)
            return 'ok'
        except Exception as e:
            last = e
            try:
                if os.path.exists(tmp):
                    os.remove(tmp)
            except Exception:
                pass
    raise last


def task(args, job):
    kind, word_id, url, dest = job
    try:
        status = get(url, dest)
        with lock:
            done[0] += 1
            if done[0] % 100 == 0:
                print('  已处理 %d 个文件…' % done[0], flush=True)
        return status
    except Exception as e:
        with lock:
            done[0] += 1
            failed.append((kind, word_id, str(e)))
        return 'fail'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--atlas', default='atlas.json')
    ap.add_argument('--out', default='atlas_media')
    ap.add_argument('--base', choices=['cdn', 'raw'], default='cdn')
    ap.add_argument('--kinds', default='img,thumb,uk,us,ex',
                    help='逗号分隔：' + ','.join(KINDS))
    ap.add_argument('--limit', type=int, default=0, help='只处理前 N 个词（调试用）')
    ap.add_argument('--workers', type=int, default=16)
    args = ap.parse_args()

    kinds = [k.strip() for k in args.kinds.split(',') if k.strip()]
    for k in kinds:
        if k not in KINDS:
            sys.exit('未知类型：' + k)
    with open(args.atlas, 'r', encoding='utf-8') as f:
        atlas = json.load(f)
    words = atlas.get('words') or {}
    base = CDN if args.base == 'cdn' else RAW

    jobs = []
    nwords = 0
    for key, entry in words.items():
        if args.limit and nwords >= args.limit:
            break
        nwords += 1
        m = entry.get('m', 0)
        wid = entry.get('id') or key
        safe = urllib.parse.quote(str(wid), safe='')
        for kind in kinds:
            sub, ext, bit = KINDS[kind]
            if not (m & bit):
                continue
            url = base + '/' + sub + '/' + safe + ext
            dest = os.path.join(args.out, sub, str(wid) + ext)
            jobs.append((kind, str(wid), url, dest))

    for kind in kinds:
        os.makedirs(os.path.join(args.out, KINDS[kind][0]), exist_ok=True)
    total = len(jobs)
    print('准备下载 %d 个文件（%s，%d 线程）' % (total, 'CDN' if args.base == 'cdn' else 'raw', args.workers))
    if not total:
        return

    with cf.ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
        list(ex.map(lambda j: task(args, j), jobs))

    ok = total - len(failed)
    print('完成：成功/已存在 %d，失败 %d' % (ok, len(failed)))
    if failed:
        print('失败样例：')
        for kind, wid, err in failed[:10]:
            print('  %s %s: %s' % (kind, wid, err))
        if len(failed) > 10:
            print('  …还有 %d 个' % (len(failed) - 10))
        print('可以重跑同一条命令断点续传。')


if __name__ == '__main__':
    main()
