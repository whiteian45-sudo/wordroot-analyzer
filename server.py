# -*- coding: utf-8 -*-
"""词根词缀分析器 —— 本地服务

双击 start.bat 启动本服务，然后自动打开浏览器。
仅在本机运行，不联网，不上传任何数据。
"""
import http.server
import socketserver
import os
import webbrowser
import threading
import socket
import json
import time
import urllib.request
import urllib.error
from urllib.parse import urlsplit

DIR = os.path.dirname(os.path.abspath(__file__))
PORT = 8756

# MIME 类型（保证 json 正常加载）
MIME = {
    '.html': 'text/html; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
}

# 历史记录 / 收藏：直接存在项目目录，浏览器前端通过 /history、/favs 端点读写（静默、免弹窗选位置）
HISTORY_FILE = os.path.join(DIR, 'history.json')
FAVS_FILE = os.path.join(DIR, 'favs.json')

# 本地翻译（Ollama）：默认模型可用环境变量 OLLAMA_MODEL 覆盖
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://127.0.0.1:11434')
# 2026-09-23 换用非思考版 4b：天生不产生推理文本，实测 100% GPU 下短句 0.3s / 长难句 0.8s / 整段 1.5s，
# 译文质量和"助记字数约束"的遵守度都明显优于 qwen3:1.7b。
# 注意别换成 qwen3:4b（思考版）——它 GPU 跑得动，但 think:false 失效（ollama#13154），
# 会把整段推理当译文吐出来；本模型对 think 参数无感（传 true 也不报错，直接被忽略）。
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'qwen3:4b-instruct-2507-q4_K_M')
_IO_LOCK = threading.Lock()

# 请求体上限 8MB。Content-Length 完全是客户端说了算的数字，谎报一个天文数字就能把 handler 线程吊死。
MAX_BODY = 8 * 1024 * 1024
# 读请求体最多等 30 秒（BaseHTTPRequestHandler.timeout 默认 None = 永久阻塞）。
# 只在 _read_body() 里临时生效，不挂成类属性 —— 否则局域网拉 66MB 词典的慢客户端会被掐断。
SOCK_TIMEOUT = 30


def _as_ms(v):
    """把 clearedAt 归一成毫秒整数。旧文件没这个字段、或前端手滑传了别的类型，一律按 0 处理。"""
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _quarantine(path, err):
    """坏文件改名备份，绝不静默丢弃。"""
    bak = path + '.corrupt-' + time.strftime('%Y%m%d-%H%M%S')
    try:
        os.replace(path, bak)
    except OSError:
        bak = '(改名失败，文件仍在原处)'
    print('=' * 50)
    print('[数据文件损坏] ' + path)
    print('    原因: ' + str(err))
    print('    已备份为: ' + bak)
    print('    本次按空列表处理——请先人工确认备份内容，再决定是否继续使用。')
    print('=' * 50)


def _read_doc(path):
    """读数据文件全文，兼容三种历史格式：
       · 老裸数组 [ ... ]
       · {"version":1,"items":[...]}                      ← 旧文件，没有 clearedAt
       · {"version":1,"clearedAt":<毫秒>,"items":[...]}   ← 多标签页合并用的清空水位
    一直返回 dict（至少含 items 与 clearedAt），调用方不用判空。
    """
    empty = {'items': [], 'clearedAt': 0}
    try:
        with _IO_LOCK:
            with open(path, encoding='utf-8') as f:
                data = json.load(f)
    except FileNotFoundError:
        return empty
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        # 以前这里是静默返回空列表 —— 紧接着前端一次写入就把整份记录覆盖成空，
        # 用户 100KB+ 的查词历史就没了。现在至少留一份 .corrupt-<时间戳> 能抢救。
        _quarantine(path, e)
        return empty
    if isinstance(data, list):
        return {'items': data, 'clearedAt': 0}
    if isinstance(data, dict):
        items = data.get('items')
        return {'items': items if isinstance(items, list) else [],
                'clearedAt': _as_ms(data.get('clearedAt'))}
    return empty


def _write_doc(path, doc):
    """原子写：先写同目录临时文件，再 os.replace 顶替。

    直接 open(path,'w') 是先截断原文件再慢慢写，中途任何异常（磁盘满、进程被杀、断电）
    留下的都是半截 JSON —— 那等于用户的查词记录被毁，且下次 _read_doc 还会当它损坏去备份。
    os.replace 在同一分区上是原子替换：读 path 的人要么看到旧的完整文件、要么看到新的完整文件。
    """
    tmp = path + '.tmp-' + str(os.getpid())
    with _IO_LOCK:
        try:
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(doc, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())   # 真正落盘后再替换，避免替换完内容还在系统缓存里
            os.replace(tmp, path)
        finally:
            # 替换成功后 tmp 已经不存在；失败时把它清掉，别在项目目录里留垃圾
            if os.path.exists(tmp):
                try:
                    os.remove(tmp)
                except OSError:
                    pass


def _write_items(path, items, cleared_at=0):
    doc = {'version': 1, 'exportedAt': time.strftime('%Y-%m-%d %H:%M:%S'), 'items': items}
    if cleared_at:
        doc['clearedAt'] = cleared_at
    _write_doc(path, doc)


def _merge_items(path, new_items, cleared_at=0):
    """写回前端整份 POST 来的列表：history 走「合并 + 水位」，favs 走「原样覆盖」。

    合并为什么必要（history）：每个标签页手里攥的都是「打开时的快照 + 自己的改动」，
    提交时发整份列表。服务端若整表覆盖就是「后写者赢」——在 A 页签点了清空，
    B 页签随便改点什么再把旧快照发上来，被清掉的记录就原地复活了。所以：
      · items 按 k（没有 k 就用 w）分组，同 key 保留 t 更大的那条 —— 后发生的操作赢；
      · 两边独有的条目都保留 —— 谁也别想覆盖掉别人新加的词；
      · 最后丢掉 t < clearedAt 的条目 —— 「清空」是一个时间点，只有它之后写进来的才算数，
        B 页签那份含着旧记录的快照自然就被挡在门外。
    history 的条目只增不删（删除的唯一形式就是「清空」，而那由水位表达），所以合并在语义上成立。
    单标签页的正常路径行为不变（合并结果与整表覆盖等价，只是顺序会重排成 t 倒序）。

    收藏（2026-10-03 起）：条目改成 {w,t,on} —— on=0 是「取消收藏」的墓碑，同样按 t 取更晚的操作。
    于是单条取消不会被并集复活（墓碑更晚就赢），多标签页也不会互相抹掉对方新加的收藏。
    旧版裸字符串条目仍走下面的整份覆盖分支（兼容旧前端与旧文件；读到时即迁移成带 t 的条目）。
    """
    # 条目是字符串 = 收藏（history 的条目是带 t 的字典）。按元素类型分派而不是按路径，
    # 这样以后多一个同类文件也不会悄悄走错分支 —— 走错分支意味着把别人的数据抹掉。
    # 首元素是字符串 = 旧版收藏的整份列表（条目无时间戳，无从判断谁更新，只能覆盖）。
    # 新前端发的是对象条目，落到下面的合并分支。
    sample = new_items or _read_doc(path)['items']
    if sample and isinstance(sample[0], str):
        merged = list(new_items)
        _write_items(path, merged)
        return merged

    old = _read_doc(path)
    old_items = old['items']
    # 水位取「文件里已有的」和「本次请求带的」的较大值：清空只可能越来越新，不会被旧快照推回去
    c_at = max(old['clearedAt'], _as_ms(cleared_at))

    best = {}
    nokey = []
    for it in list(old_items) + list(new_items):
        if isinstance(it, str):
            it = {'w': it, 't': 0, 'on': 1}   # 旧文件里的收藏裸词名：读到即迁移成带时间戳的条目
        if not isinstance(it, dict):
            continue
        k = it.get('k') or it.get('w')
        if not k:
            nokey.append(it)   # 连 w 都没有的脏数据：无从归组，原样留着，不悄悄丢
            continue
        cur = best.get(k)
        if cur is None or _as_ms(it.get('t')) >= _as_ms(cur.get('t')):
            best[k] = it
    merged = [it for it in list(best.values()) + nokey if _as_ms(it.get('t')) >= c_at]
    merged.sort(key=lambda it: _as_ms(it.get('t')), reverse=True)

    _write_items(path, merged, c_at)
    return merged

# 翻译任务的系统提示（整段翻译、逐句对照共用同一套口径）
TRANSLATE_SYSTEM = ('你是一位专业中英翻译。把用户提供的英文翻译成简体中文。严格遵循：忠实原文、语言自然通顺；'
                    '只输出译文本身，不要任何解释、注释或额外文字；若原文有多段，逐段对应翻译。')
# 助记口诀：给的是「单词 + 词根拆解 + 释义」，只要一句话
MEMO_SYSTEM = ('你是一位幽默的英语词汇老师。用户会给你一个单词、它的词根词缀拆解和中文释义。'
               '请用一句极短、生动、有画面感的中文（25 字以内）说明这个词为什么是这个意思，'
               '可以用比喻、联想或玩梗帮助记忆。只输出这一句话，不要引号、编号或任何多余文字。')
# 英文版助记：界面是中文时用（中文界面给英文钩子、英文界面给中文钩子，换一种语言加深印象）
MEMO_SYSTEM_EN = ('You are a witty English vocabulary teacher. The user gives you a word, its morpheme breakdown '
                  'and a Chinese definition. Reply with ONE very short, vivid, memorable English sentence '
                  '(at most 15 words) explaining why the word means what it means — use a metaphor, image or pun. '
                  'Output only that sentence: no quotes, no numbering, no extra text.')
# 无词根可拆的词（lawn、desk 这类单语素词）：素材换成词源，模型不许自己造词根
MEMO_SYSTEM_ETYM = ('你是一位幽默的英语词汇老师。用户会给你一个单词、它的词源或来历和中文释义。'
                    '这个词没有词根词缀可拆，请用一句极短、生动、有画面感的中文（25 字以内）帮人记住它——'
                    '可以用词源故事、谐音、联想或玩梗，但**不要编造词根、不要把单词切成假词根**。'
                    '只输出这一句话，不要引号、编号或任何多余文字。')
MEMO_SYSTEM_ETYM_EN = ('You are a witty English vocabulary teacher. The user gives you a word, its etymology or '
                       'origin and a Chinese definition. This word has NO analyzable roots or affixes: reply with '
                       'ONE very short, vivid, memorable English sentence (at most 15 words) built on the '
                       'etymology, a rhyme or an image. Never invent morphemes or split the word into fake roots. '
                       'Output only that sentence: no quotes, no numbering, no extra text.')
# 深度讲解（2026-10-05）：素材打底 + 事实类信息锁死。
# 为什么必须锁：实测裸提示词会让 4B 模型自己造例句（编得很像真的）、编搭配与语域判断；
# 而项目本地已有真实素材（牛津释义+中英例句、LDOCE/柯林斯例句、thesaurus 同义词、Etymonline 词源）。
# 分工：事实（释义/例句/同义词/词源/拆解）一律用素材，模型只写归纳（结论/直觉/语域/辨析）。
EXPLAIN_SYSTEM = (
    '你是一位面向中文母语学习者的英语词汇老师，正在写一份「深度讲解」。用户会给你一个单词和一份【素材】。\n'
    '事实与归纳分开对待（这是本任务的核心规则）：\n'
    'A. 事实类——【释义】【真实例句】：只能来自素材。【真实例句】必须逐字原样照抄英文，一个字都不许改，'
    '有几条用几条，**绝对不许自己造例句**；素材里没提到的词义不要写。\n'
    'B. 归纳类——【搭配】【语域】【易混词】：素材通常只有同义词表、没有这些，'
    '**允许你用自己可靠的英语词汇知识来写**（这才是这份讲解的价值所在）。要求：'
    '搭配要写真正常见、自然的（宁可 3 个准的，不要 6 个生僻的）；'
    '语域要区分场景（影视/新闻/文学/口语各自然度如何）；'
    '易混词要给出"核心差异"而不是同义反复，**并且必须至少包含两个学习者最容易混的常见近义词**'
    '（不要只照抄【同义词】表里的生僻词——那张表经常有 sanginary 这类书卷词；'
    '比如讲 gory 就该对比 bloody / gruesome / grisly / macabre），差异里点明气势或强度的不同。\n'
    'C. 拿不准就不写。宁可少一段，不要编。\n'
    '只输出讲解正文：不要开场白、不要"好的"、不要说明你在做什么。\n'
    '输出格式（纯文本；**小标题必须原样照用下面这几个，不要改写、不要自创**；不要 markdown 的 # 和 *）：\n'
    '【一句话结论】一句话说清核心意思与语气。\n'
    '【核心义】一两句母语者直觉，再给 2~4 行"脑中画面"（每行以 - 开头）。\n'
    '【语域】先一句结论，再给三四行场景判断，每行格式：场景 ｜ 自然度 ｜ 说明。\n'
    '【真实例句】素材里的例句，逐字照抄，每条一行：英文 —— 中文（素材没给中文就只写英文）。\n'
    '【常见搭配】3~6 行，每行：英文搭配 中文（优先用素材里真实出现过的）。\n'
    '【易混词】3~5 行，每行：词 ｜ 核心差异。\n'
    '【总结】一两句可以直接记住的话。\n'
    '整体 400~600 字。')
EXPLAIN_SYSTEM_EN = (
    'You are an English vocabulary teacher writing a "deep dive" for a Chinese-speaking learner. '
    'The user gives you a word and a set of SOURCE MATERIALS.\n'
    'Facts vs inference (the core rule of this task):\n'
    'A. FACTS — definitions and real examples: materials only. Copy the REAL EXAMPLES verbatim, character for '
    'character; never invent or rewrite an example; do not add senses the materials do not mention.\n'
    'B. INFERENCE — collocations, register and near-synonyms: the materials usually only give a synonym list, so '
    'you MAY use your own reliable lexical knowledge here (that is the point of this explanation). Keep it '
    'accurate and common: three true collocations beat six obscure ones; register should say how natural the '
    'word is in film reviews / news / literature / speech; near-synonyms need a one-line "core difference" each, '
    'covering the synonym list first and at most two extra common confusables.\n'
    'C. If unsure, leave it out. Fewer sections is better than invented content.\n'
    'Output the explanation only: no preamble, no sign-off. Plain text, headings in 【】, no markdown # or *. '
    'Sections: 【One-line takeaway】/【Core meaning】(plus 2-4 "- " image lines)/【Register】(scene ｜ naturalness ｜ note)'
    '/【Real examples】(verbatim) /【Collocations】/【Near-synonyms】(word ｜ core difference)/【Summary】. '
    'Aim for 350-500 words.')

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    # 注意：这里**故意不设** timeout 类属性。socket 超时只在 _read_body() 里临时收紧，
    # 因为挂成类属性会波及所有请求：用户从局域网拉 ecdict.json(66MB) 时读得慢一点，
    # 就会被 30 秒掐断（而静态文件路径的 copyfile 没包异常 → 刷一屏堆栈）。
    # 响应头是否已经发出去过。头只能发一次，第二次发就会变成响应体里的协议垃圾。
    _headers_sent = False

    # 允许缓存、但每次使用前都要回服务器校验的文件类型（词典数据、图片）。
    REVALIDATE_EXT = {'.json', '.png', '.jpg', '.jpeg', '.ico', '.webp', '.svg', '.woff2'}

    def _safe_write(self, data):
        """往 socket 写数据。客户端断开（关页面、切标签、请求 abort）抛的这三种异常是常态，
        不是故障；不拦住就会二次写响应失败，异常一路逃到 socketserver.handle_error 刷一屏堆栈。"""
        try:
            self.wfile.write(data)
            return True
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            self.close_connection = True
            return False

    def _read_body(self):
        """读并解析 JSON 请求体，返回 (能否继续, 解析结果)。

        返回 False 表示响应已经发好或连接已经断了（413 超限 / 读超时 / 客户端半路跑掉），
        调用方直接 return 即可。Content-Length 是客户端给的，超过 MAX_BODY 直接拒，
        免得服务端老老实实按它说的字节数一直在那儿等。
        """
        try:
            ln = int(self.headers.get('Content-Length') or 0)
        except (TypeError, ValueError):
            ln = 0
        if ln > MAX_BODY:
            self.close_connection = True   # 剩下的字节不读了，直接断开，别让客户端继续灌
            self._send_json({'ok': False, 'err': '请求体过大（上限 8MB）'}, 413)
            return False, None
        if ln <= 0:
            return True, {}
        try:
            # 只在这段读 body 的时间里收紧超时：声明的字节数收不齐就会卡在这儿，
            # 正是需要防的地方。读完立刻恢复成 None，别让静态大文件的慢客户端被连累。
            self.connection.settimeout(SOCK_TIMEOUT)
            try:
                raw = self.rfile.read(ln)
            finally:
                self.connection.settimeout(None)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, socket.timeout):
            self.close_connection = True
            return False, None
        try:
            return True, json.loads(raw or b'{}')
        except Exception:
            return True, {}

    def end_headers(self):
        # 这里给的是 no-cache，不是 no-store，两者差别很大：
        #   no-store = 碰都不许存，每次刷新都得把 140MB 重下一遍；
        #   no-cache = 可以存，但用之前必须回服务器问一句「变了没」。
        # 配 http.server 自带的 Last-Modified 机制：文件没改只回一个几十字节的 304，
        # 浏览器直接用本地副本；改过了 mtime 就变，自动回新内容。
        # 所以「改完刷新即生效」这个习惯保住了，重复刷新却不再重下词典。
        # html/js/css（还有 /history 这类无扩展名的接口）仍是 no-store：它们小，重拉无感。
        ext = os.path.splitext(self.path.split('?')[0])[1].lower()
        self.send_header('Cache-Control', 'no-cache' if ext in self.REVALIDATE_EXT else 'no-store')
        # 所有响应出口都必经这里，用它当「头已发出」的唯一标记最保险
        self._headers_sent = True
        super().end_headers()

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        return MIME.get(ext, 'application/octet-stream')

    def _send_json(self, obj, status=200):
        # 头只允许发一次。流式分支里如果 200 已经发出去了，后面再想回错误 JSON 时，
        # 第二次 send_response 会把状态行和响应头当正文写进已经开着的响应体，
        # 客户端拿到的就是 200 + 正文里混着「HTTP/1.0 502 Bad Gateway...」的协议垃圾。
        if self._headers_sent:
            return
        data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self._safe_write(data)

    def _stream_ollama(self, it, model):
        """把 Ollama 的流式增量转给客户端。

        **先取第一块，再发响应头** —— 这是关键顺序。
        iter_chat_stream 是生成器，函数体（含 urlopen）要等第一次 next() 才执行；
        如果先 send_response(200) 再进循环，Ollama 没启动/模型没装时异常是在头已经发出去之后才抛的，
        这时再 _send_json(502) 只能把整段 502 响应当正文塞进已经开始的 200 响应里，
        前端就会把协议垃圾当成译文渲染出来。
        next(it, None) 会让生成器前进到第一次 yield，正好覆盖「建连接 + 首次响应」这两步的失败窗口。
        """
        try:
            first = next(it, None)
        except urllib.error.HTTPError as e:
            self._send_json({'ok': False, 'err': _http_error_text(e, model)}, 502)
            return
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            self.close_connection = True
            return
        except Exception as e:
            # 此时头还没发，回一个干净的 502 JSON 是有效的
            self._send_json({'ok': False, 'err': '无法连接本地 Ollama（' + str(e) + '）。请确认它已启动。'}, 502)
            return

        self.send_response(200)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.end_headers()   # 缓存头由 end_headers 统一给（无扩展名 → no-store）
        try:
            if first:   # 第一块已经取出来了，先补写出去再继续迭代，别漏了它
                self.wfile.write(first.encode('utf-8'))
                self.wfile.flush()
            for chunk in it:
                self.wfile.write(chunk.encode('utf-8'))
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            # 用户切页/关页面导致客户端断开：头已经发了，回不了错误响应，安静收摊
            self.close_connection = True
            return
        except Exception as e:
            # 迭代中途才炸：同样不能再发第二个响应（否则又是协议垃圾），记一行日志直接断
            print('[流式传输中断] ' + str(e))
            self.close_connection = True
            return

    def do_GET(self):
        # /history、/favs：数据直接读自项目目录下的同名 json（静默，前端无需选文件）
        p = self.path.split('?')[0]
        if p in ('/history', '/favs'):
            doc = _read_doc(HISTORY_FILE if p == '/history' else FAVS_FILE)
            # 连 clearedAt 一起给前端：多标签页要靠这个水位知道「别人清空过没有」
            self._send_json({'version': 1, 'clearedAt': doc['clearedAt'], 'items': doc['items']})
            return
        super().do_GET()

    def do_POST(self):
        # 写接口先验来源：跨站页面能靠「简单请求」绕过预检把 POST 真的打进来（详见 _origin_allowed）
        if not _origin_allowed(self.headers.get('Origin'), self.headers.get('Host')):
            self.close_connection = True
            self._send_json({'ok': False, 'err': '拒绝跨站写入'}, 403)
            return
        path = self.path.split('?')[0]
        # /translate：本地 Ollama 翻译整段英文。流式返回增量译文（前端逐字显示）。
        if path == '/translate':
            ok, body = self._read_body()
            if not ok:
                return
            if not isinstance(body, dict):
                body = {}
            text = (body.get('text') or '').strip()
            if not text:
                self._send_json({'ok': False, 'err': '没有要翻译的文本'}, 400)
                return
            model = body.get('model') or OLLAMA_MODEL
            # 注意 iter_chat_stream 是生成器，这一行本身不会抛；真正的连接失败在 _stream_ollama 取第一块时爆
            self._stream_ollama(iter_chat_stream(text, model), model)
            return
        # /memo：本地 Ollama 依「单词 + 词根拆解 + 释义」生成一句记忆口诀（流式，做法同 /translate）
        if path == '/memo':
            ok, body = self._read_body()
            if not ok:
                return
            if not isinstance(body, dict):
                body = {}
            word = (body.get('word') or '').strip()
            morph = (body.get('morph') or '').strip()
            meaning = (body.get('meaning') or '').strip()
            # kind：morph=有词根拆解、etym=只有词源、plain=只有释义。标签随素材变，
            # 免得模型看见「词根词缀拆解：<一段词源故事>」就顺着编假词根。
            kind = (body.get('kind') or 'morph').strip().lower()
            if not word:
                self._send_json({'ok': False, 'err': '没有要助记的单词'}, 400)
                return
            prompt = '单词：' + word
            if morph:
                prompt += ('\n词源或来历：' if kind == 'etym' else '\n词根词缀拆解：') + morph
            if meaning:
                prompt += '\n释义：' + meaning
            model = body.get('model') or OLLAMA_MODEL
            # 界面语言与助记语言相反：中文界面出英文口诀、英文界面出中文口诀
            want_en = str(body.get('lang') or '').lower() == 'en'
            if kind == 'morph':
                system = MEMO_SYSTEM_EN if want_en else MEMO_SYSTEM
            else:
                system = MEMO_SYSTEM_ETYM_EN if want_en else MEMO_SYSTEM_ETYM
            self._stream_ollama(iter_chat_stream(prompt, model, system), model)
            return
        # /explain：本地 Ollama 依「本地真实素材」写一份深度讲解（流式，做法同 /memo）
        # 素材由前端组装（它手里有 oxford/ecdict/thes/etym/ex 全部数据），这里只负责拼提示词。
        if path == '/explain':
            ok, body = self._read_body()
            if not ok:
                return
            if not isinstance(body, dict):
                body = {}
            word = (body.get('word') or '').strip()
            if not word:
                self._send_json({'ok': False, 'err': '没有要讲解的单词'}, 400)
                return
            blocks = []

            def add(label, val):
                if isinstance(val, (list, tuple)):
                    val = '\n'.join('' if x is None else str(x) for x in val if x)
                val = str(val or '').strip()
                if val:
                    blocks.append('【' + label + '】\n' + val)

            add('释义', body.get('meaning'))
            add('英文释义', body.get('meaning_en'))
            add('词性', body.get('pos'))
            add('词根词缀拆解', body.get('morph'))
            add('词源', body.get('etym'))
            exs = []
            for e in (body.get('examples') or []):
                if not isinstance(e, (list, tuple)) or not e:
                    continue
                en = str(e[0] or '').strip()
                zh = str(e[1] or '').strip() if len(e) > 1 else ''
                if en:
                    exs.append(en + (' —— ' + zh if zh else ''))
            add('真实例句', exs)
            add('同义词', body.get('syn'))
            add('反义词', body.get('ant'))
            if not blocks:
                self._send_json({'ok': False, 'err': '没有可用素材（这个词本地查不到释义/例句/词源）'}, 400)
                return
            want_en = str(body.get('lang') or '').lower() == 'en'
            prompt = ('单词：' + word + '\n\n【素材】\n' + '\n'.join(blocks)
                      + '\n\n请按系统提示的格式，只依据上面这份素材写讲解。')
            model = body.get('model') or OLLAMA_MODEL
            self._stream_ollama(iter_chat_stream(prompt, model, EXPLAIN_SYSTEM_EN if want_en else EXPLAIN_SYSTEM), model)
            return
        # /history、/favs：与磁盘旧数据合并后写入（不是整表覆盖，见 _merge_items 的说明）
        if path in ('/history', '/favs'):
            ok, body = self._read_body()
            if not ok:
                return
            if isinstance(body, dict):
                items = body.get('items', body)
                cleared_at = _as_ms(body.get('clearedAt'))   # 前端「清空」时带上，作为跨标签页的水位
            else:
                items = body          # 老前端直接发裸数组，兼容
                cleared_at = 0
            if isinstance(items, list):
                try:
                    merged = _merge_items(HISTORY_FILE if path == '/history' else FAVS_FILE, items, cleared_at)
                    # 把合并结果回给前端，方便它把本地快照对齐成合并后的状态
                    self._send_json({'ok': True, 'items': merged})
                except Exception as e:
                    self._send_json({'ok': False, 'err': str(e)}, 500)
            else:
                self._send_json({'ok': False, 'err': 'bad items'}, 400)
            return
        self.send_error(405)


def _host_port(value, default_port):
    """把 Origin / Host 归一成可比较的 (主机名, 端口)。畸形或解析不出主机时返回 None。

    Host 头是 "主机[:端口]" 没有 scheme，补个 // 当 URL 解析才能正确处理 IPv6 的 []。
    """
    try:
        u = urlsplit(value)
        host = (u.hostname or '').lower()
        if not host:
            return None
        return host, (default_port if u.port is None else u.port)
    except ValueError:      # 端口写成非数字等畸形情况
        return None


def _origin_allowed(origin, host_header):
    """只拦「带了 Origin 头、且来源不是本服务自己」的写请求。

    为什么需要：服务绑在 0.0.0.0 上，浏览器里一个恶意页面用 Content-Type: text/plain
    发跨域 POST 属于「简单请求」，不触发预检，但请求会**真的打到服务端**（CORS 只挡响应读取，
    挡不住副作用）—— 足够把用户的查词记录清空或覆盖。所以有副作用的接口必须自己看一眼来源。
    为什么这么松：
      · 没带 Origin 一律放行 —— curl、某些同源场景本来就不带，强制要求会把正常调用挡在门外；
      · 本机回环（localhost / 127.0.0.1 / [::1]）放行 —— 页面可能是这三种写法里的任意一种；
      · Origin 的主机:端口 == 本次请求 Host 的主机:端口 也放行 —— 用户拿局域网 IP
        （http://192.168.x.x:8756）或手机访问时，同源 POST 的 Origin 就是那个 IP，
        不放行的话历史和收藏都存不进去；
      · 不动绑定地址 —— 改成只听 127.0.0.1 就等于砍掉局域网访问这个用法。
    这一条为什么安全：Origin 由浏览器按「页面来源」写、Host 由浏览器按「请求目标」写，
    页面脚本两个都伪造不了；想让两者相等，页面就必须是本服务自己发出去的 —— 那就是同源。
    端口也要一起比：同 IP 不同端口是**不同的源**（http://x:9999 上的页面发来的请求该拒），
    而正常的同源请求两边端口永远一致（浏览器要么都带、要么都省），不会误伤。
    注意这里比的是「主机:端口」而不是完整 URL —— 页面 http:// 而请求 https:// 之类的
    scheme 差异本服务不会出现（它只跑 http）。
    """
    if not origin:
        return True
    o = _host_port(origin, 443 if origin.lower().startswith('https:') else 80)
    if o is None:
        return False         # Origin 是 null / 畸形 → 当外站处理
    if o[0] in ('127.0.0.1', 'localhost', '::1'):
        return True
    return o == _host_port('//' + (host_header or ''), 80)


def _http_error_text(e, model):
    """从 Ollama 的 HTTPError 里挖出人话错误信息（原来 /translate 和 /memo 各抄了一遍，抽出来）。"""
    try:
        err = json.loads(e.read().decode('utf-8')).get('error', str(e))
    except Exception:
        err = str(e)
    if 'not found' in err.lower():
        err = '本地还没装这个模型，请先在命令行运行：ollama pull ' + model
    return err


def iter_chat_stream(text, model, system=None):
    """流式调本地 Ollama，逐块 yield 增量文本（默认按整段翻译任务）。
       连接/加载失败抛异常（此时 HTTP 头未发，调用方可回 JSON 错误）。"""
    payload = {
        'model': model,
        'stream': True,
        # 不传 think 参数：默认模型是非思考版，传了也被忽略；不传还能天然避开
        # 思考版 qwen3:4b 上 think:false 失效（推理混进译文）那个坑，见 ollama#13154。
        'messages': [
            {'role': 'system', 'content': system or TRANSLATE_SYSTEM},
            {'role': 'user', 'content': text},
        ],
        # 交给 Ollama 自动分配。旧版(0.32.x)+旧驱动下 1060 的 GPU 推理会崩(0xc0000005)，
        # 故曾写死 num_gpu:0 强制 CPU；2026-09-23 在 Ollama 0.34.3 + 驱动 582.66 下实测 GPU 正常
        # (100% GPU，12 token 0.29s)。若日后又崩，这里加回 'options': {'num_gpu': 0} 即可。
    }
    req = urllib.request.Request(
        OLLAMA_URL + '/api/chat',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    resp = urllib.request.urlopen(req, timeout=300)
    for raw in resp:
        line = raw.decode('utf-8').strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except Exception:
            continue
        if obj.get('error'):
            raise RuntimeError(obj['error'])
        c = (obj.get('message') or {}).get('content', '') or ''
        if c:
            yield c
        if obj.get('done'):
            break


class _Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def get_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip


def main():
    os.chdir(DIR)
    ip = get_ip()
    url = f'http://localhost:{PORT}/index.html'
    try:
        httpd = _Server(('0.0.0.0', PORT), Handler)
    except OSError as e:
        # 端口已被占用：多半是之前启动的服务还开着
        if e.errno == 10048:
            print('=' * 50)
            print('端口 ' + str(PORT) + ' 已被占用——分析器可能已在运行。')
            print('直接访问: ' + url)
            print('如需重启，请先关闭之前的黑色窗口。')
            print('=' * 50)
            webbrowser.open(url)
            return
        raise
    with httpd:
        print('=' * 50)
        print('词根词缀分析器 已启动')
        print('  本机访问: ' + url)
        print('  局域网访问: http://' + ip + f':{PORT}/index.html')
        print('  关闭窗口即退出服务')
        print('=' * 50)
        # 延迟打开浏览器，等服务就绪
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
