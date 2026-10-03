# build_oxford.py — 从本地 GoldenDict 词库构建牛津9 数据层 + Etymonline 词源
#
# 输出:
#   oxford.json  词 → 牛津9 卡片数据(音标 bre/name + 词性 pos + 中英释义 + 例句)
#                重定向条目存 {"link": 最终目标原始串}
#   etym.json    词 → Etymonline 英文词源段落(thesaurus.com 词典的 Word Origin)
#
# 用法: python build_oxford.py
# 依赖: readmdict(已装 Miniconda base)。牛津9/thes 均为 zlib 压缩,注入 dummy lzo 即可。
# 数据源:
#   E:/Program Files (x86)/GoldenDict-Windows/content/牛津高阶9简体/牛津高阶英汉双解词典（第9版）.mdx
#   E:/Program Files (x86)/GoldenDict-Windows/content/thes/thes.mdx
import sys, re, json, os, time

# readmdict 的 __init__.py 顶层强制 import lzo,失败即退出;
# 但这两个词典是 zlib 压缩(version>=2.0),根本不调用 lzo,注入 dummy 即可。
class DummyLzo:
    @staticmethod
    def decompress(data):
        raise RuntimeError('NEED_REAL_LZO')
sys.modules['lzo'] = DummyLzo()
from readmdict import MDX

BASE = os.path.dirname(os.path.abspath(__file__))
OXFORD_MDX = r'E:\Program Files (x86)\GoldenDict-Windows\content\牛津高阶9简体\牛津高阶英汉双解词典（第9版）.mdx'
THES_MDX = r'E:\Program Files (x86)\GoldenDict-Windows\content\thes\thes.mdx'
LDOCE_MDX = r'E:\Program Files (x86)\GoldenDict-Windows\content\LDOCE6\LDOCE6.mdx'
COLLINS_MDX = r'E:\Program Files (x86)\GoldenDict-Windows\content\柯林斯COBUILD高阶英汉双解学习词典.mdx'
NEX = 3          # 每词例句数
ETYM_CUT = 1200  # 词源截断字符


def norm(k):
    """归一化 key,与前端 analyze 的 raw.toLowerCase().replace(/[^a-z]/g,'') 完全一致"""
    return re.sub(r'[^a-z]', '', k.lower())


def strip_tags(s):
    """剥 HTML 标签、折叠空白。实体解码顺序:先 lt/gt/quot/nbsp/#x27/apos,最后 &amp;"""
    s = re.sub(r'<xhtml:br\s*/?>', ' ', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = s.replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"') \
         .replace('&nbsp;', ' ').replace('&#x27;', "'").replace('&#39;', "'").replace('&apos;', "'") \
         .replace('&amp;', '&')           # &amp; 最后解
    return re.sub(r'\s+', ' ', s).strip()


def parse_entry(html):
    """解析牛津9 主词条 → {bre,name,pos,def_en,def_zh,examples}"""
    r = {}
    # 音标:<phon> 内可能嵌套 <ptl> 标签,必须 (.*?) 再 strip_tags,不能用 [^<]+
    m = re.search(r'brelabel.*?<phon>(.*?)</phon>', html, re.S)
    if m: r['bre'] = strip_tags(m.group(1))
    m = re.search(r'namelabel.*?<phon>(.*?)</phon>', html, re.S)
    if m: r['name'] = strip_tags(m.group(1))
    m = re.search(r'<pos[^>]*>(.*?)</pos>', html, re.S)
    if m: r['pos'] = strip_tags(m.group(1))
    # 释义:一个词条常有多个 <def>（seizure = 起获/没收 + 癫痫发作）。
    # 原来只 re.search 取第一个 → 释义残缺（用户报 seizures 显示"没收"、看不到"癫痫"义）。
    # 现在收集全部义项:def_en/def_zh 仍取第一个（前端既有字段与口径不变），
    # 多义项时另存 senses:[{en,zh}]，词卡逐个渲染。
    senses = []
    for dm in re.finditer(r'<def[^>]*>(.*?)</def>', html, re.S):
        d = dm.group(1)
        en = strip_tags(re.sub(r'<chnsep>.*?</chnsep>\s*<chn>.*?</chn>', ' ', d, flags=re.S))
        # 中文释义:取 <def> 内的 <chn>——<def> 外可能有"计算机"这类主题标签,
        # 取全局第一个 <chn> 会让 encrypt 这类词释义变成主题标签(既有 bug)
        zins = [z for z in (strip_tags(x) for x in re.findall(r'<chn>(.*?)</chn>', d, re.S)) if z]
        zh = zins[0] if zins else ''
        if en or zh:
            senses.append({'en': en, 'zh': zh})
    if senses:
        r['def_en'], r['def_zh'] = senses[0]['en'], senses[0]['zh']
        if len(senses) > 1:
            r['senses'] = senses
    if 'def_zh' not in r:   # 极少条目无 <def>,回退全局第一个 <chn>
        chns = [c for c in (strip_tags(x) for x in re.findall(r'<chn>(.*?)</chn>', html, re.S)) if c]
        r['def_zh'] = chns[0] if chns else ''
    # 交叉引用:牛津对一部分条目不给释义,只写指向别的词(如 polygraph = lie detector、
    # analyze = analyse、"past tense of become")。仅在完全没有释义时收录,不影响已有完整卡片。
    if not r.get('def_en') and not (r.get('def_zh') or '').strip():
        xg = re.search(r'<xr-gs[^>]*>(.*?)</xr-gs>', html, re.S)
        if xg:
            body = xg.group(1)
            lm = re.search(r'<xrlabel>(.*?)</xrlabel>', body, re.S)
            hits = []
            for h in re.findall(r'<a href="entry://[^"]*"[^>]*>([^<]+)</a>', body):
                h = strip_tags(h)
                if h and h not in hits:
                    hits.append(h)
            txt = strip_tags(re.sub(r'<xrlabel>.*?</xrlabel>', ' ', body, flags=re.S))
            if txt or hits:
                r['xr'] = {'lab': strip_tags(lm.group(1)) if lm else '', 'txt': txt, 'hits': hits}
    # 例句:<x> 双模式——优先 wd 属性;否则取块内 <chn> 前的文本(stucco 这类)
    exs = []
    for xm in re.finditer(r'<x\s[^>]*>(.*?)</x>', html, re.S):
        tag = xm.group(0)
        gt = tag.find('>')
        opentag = tag[:gt + 1]
        wdm = re.search(r'wd="([^"]*)"', opentag)
        body = xm.group(1)
        chn = re.search(r'<chn>(.*?)</chn>', body, re.S)
        zh = strip_tags(chn.group(1)) if chn else ''
        if wdm:
            en = strip_tags(wdm.group(1))
        else:
            pre = body.split('<chn>')[0] if '<chn>' in body else body
            en = strip_tags(pre)
        if en:
            exs.append((en, zh))
    r['examples'] = exs[:NEX]
    return r


def build_oxford():
    t = time.time()
    m = MDX(OXFORD_MDX)
    print(f'牛津9 解析: {len(m)} 词条, %.1fs' % (time.time() - t))
    main, redir = {}, {}
    # pass1:主词条 + 重定向映射
    for k, v in m.items():
        kd = k.decode('utf-8', 'ignore').strip()
        if v.startswith(b'@@@LINK='):
            nk = norm(kd)
            if nk and nk == kd.lower():          # 纯 a-z key 才收(防 18-wheeler→wheeler 污染)
                redir[nk] = v.decode('utf-8', 'ignore')[8:].strip()   # 去掉 @@@LINK= 和 \r\n,存原始串
            continue
        nk = norm(kd)
        if nk and nk == kd.lower():
            rec = parse_entry(v.decode('utf-8', 'ignore'))
            if not any(rec.get(f) for f in ('bre', 'name', 'def_en', 'def_zh', 'examples')):
                continue                        # 空条目(实测 82 条)跳过
            rec['head'] = kd                    # 原始头词(Adam 等大写词必需)
            main[nk] = rec
    print(f'pass1: 主词条 {len(main)}, 重定向映射 {len(redir)}')

    # pass2:重定向链解析到最终目标(防环),只保留能落主词条的
    def resolve(target, seen=None):
        seen = seen or set()
        while True:
            n = norm(target)
            if n in seen or n not in redir:
                break
            seen.add(n)
            target = redir[n]
        return target

    out = dict(main)
    for nk, target in redir.items():
        if nk in main:
            continue                            # 主词条优先,重定向不覆盖完整卡片
        final_target = resolve(target)
        n = norm(final_target)
        if n and n != nk and n in main:
            out[nk] = {'link': final_target}    # 存最终目标原始串
    print(f'pass2: 重定向收录 {len(out) - len(main)}')

    path = os.path.join(BASE, 'oxford.json')
    with open(path, 'w', encoding='utf-8', newline='') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    size = os.path.getsize(path) / 1024 / 1024
    print(f'oxford.json 完成: {len(out)} 词条, {size:.2f} MB, 总用时 %.1fs' % (time.time() - t))


def extract_origin(html):
    """thes 词条 → Etymonline 英文词源段落,截断 ETYM_CUT"""
    i = html.find('Word Origin')
    if i < 0:
        return ''
    seg = html[i:i + 8000]                       # 词源段落集中在 Word Origin 之后
    seg = re.sub(r'<h2[^>]*>.*?</h2>', ' ', seg, flags=re.S)
    ps = re.findall(r'<p[^>]*>(.*?)</p>', seg, re.S)
    txt = ' '.join(strip_tags(p) for p in ps)
    if not txt:
        txt = strip_tags(seg)
    return txt[:ETYM_CUT]


def extract_words(html, start, ends):
    """thes 词条 → 近/反义词列表(entry:// 链接文本)。不依赖 ul 闭合,按边界标记截断。"""
    i = html.find(start)
    if i < 0:
        return []
    seg = html[i:i + 15000]
    for em in ends:
        j = seg.find(em, 10)
        if j > 0:
            seg = seg[:j]
    words = re.findall(r'href="entry://[^"]*"[^>]*>([^<]+)</a>', seg)
    return list(dict.fromkeys(w.strip() for w in words))[:15]   # 去重 + 截 15 个


def build_thes():
    """遍历 thes.mdx 一次:输出 etym.json(Etymonline 词源)+ thes.json(近反义词)"""
    t = time.time()
    m = MDX(THES_MDX)
    print(f'thes 解析: {len(m)} 词条, %.1fs' % (time.time() - t))
    etym, thes = {}, {}
    SYN_END = ['Antonyms', 'Related Words', 'Strongest matches', 'Strong matches']
    ANT_END = ['Related Words', 'Strongest matches', 'Strong matches', 'Synonyms']
    for k, v in m.items():
        kd = k.decode('utf-8', 'ignore').strip()
        nk = norm(kd)
        if not nk or nk != kd.lower():
            continue                             # 只收纯 a-z key,与查词 key 一致
        html = v.decode('utf-8', 'ignore')
        et = extract_origin(html)
        if et:
            etym[nk] = et
        syns = extract_words(html, 'Synonyms', SYN_END)
        ants = extract_words(html, 'Antonyms', ANT_END)
        if syns or ants:
            rec = {}
            if syns: rec['s'] = syns
            if ants: rec['a'] = ants
            thes[nk] = rec
    path = os.path.join(BASE, 'etym.json')
    with open(path, 'w', encoding='utf-8', newline='') as f:
        json.dump(etym, f, ensure_ascii=False, separators=(',', ':'))
    path2 = os.path.join(BASE, 'thes.json')
    with open(path2, 'w', encoding='utf-8', newline='') as f:
        json.dump(thes, f, ensure_ascii=False, separators=(',', ':'))
    print(f'etym.json: {len(etym)} 词条, {os.path.getsize(path)/1024/1024:.2f} MB')
    print(f'thes.json: {len(thes)} 词条, {os.path.getsize(path2)/1024/1024:.2f} MB, 总用时 %.1fs' % (time.time() - t))


def build_extra_examples():
    """解析朗文 LDOCE6(@examples 独立 key,英英)+ 柯林斯(词条内,中英)例句 → ex.json
    结构: {词: [{s:'ldoce'|'collins', en, zh?}, ...]} 每词最多 3+3 条 """
    t = time.time()
    # 朗文:遍历 @examples_* key
    m = MDX(LDOCE_MDX)
    ldoce = {}
    for k, v in m.items():
        kd = k.decode('utf-8', 'ignore').strip()
        if not kd.startswith('@examples_'):
            continue
        word = kd[len('@examples_'):].rsplit('_', 1)[0]   # @examples_dog_1 -> dog
        if word in ldoce:
            continue                                        # 已收主词条
        lis = re.findall(r'<li>(.*?)</li>', v.decode('utf-8', 'ignore'), re.S)
        exs = [strip_tags(x) for x in lis if strip_tags(x)]
        if exs:
            ldoce[word] = exs[:3]
    print(f'朗文例句: {len(ldoce)} 词, %.1fs' % (time.time() - t))
    # 柯林斯:词条内 <font color=#008080>en</font><font color=gray>zh</font>
    m = MDX(COLLINS_MDX)
    collins = {}
    for k, v in m.items():
        kd = k.decode('utf-8', 'ignore').strip()
        nk = norm(kd)
        if not nk or nk != kd.lower():
            continue
        pairs = re.findall(r'<font color=#008080>(.*?)</font>\s*<font style="color:gray[^"]*"[^>]*>(.*?)</font>',
                           v.decode('utf-8', 'ignore'), re.S)
        exs = []
        for en, zh in pairs:
            en2, zh2 = strip_tags(en), strip_tags(zh)
            if en2 and zh2:
                exs.append((en2, zh2))
        if exs:
            collins[nk] = exs[:3]
    print(f'柯林斯例句: {len(collins)} 词, %.1fs' % (time.time() - t))
    # 合并输出
    out = {}
    for w, exs in ldoce.items():
        out[w] = [{'s': 'ldoce', 'en': e} for e in exs]
    for w, exs in collins.items():
        lst = out.setdefault(w, [])
        lst += [{'s': 'collins', 'en': e, 'zh': z} for e, z in exs]
    path = os.path.join(BASE, 'ex.json')
    with open(path, 'w', encoding='utf-8', newline='') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(f'ex.json 完成: {len(out)} 词, {os.path.getsize(path)/1024/1024:.2f} MB, 总用时 %.1fs' % (time.time() - t))


if __name__ == '__main__':
    build_oxford()
    build_thes()
    build_extra_examples()
    print('全部完成 ✓')
