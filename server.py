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

# 历史记录文件：直接存在项目目录，浏览器前端通过 /history 端点读写（静默、免弹窗选位置）
HISTORY_FILE = os.path.join(DIR, 'history.json')

# 本地翻译（Ollama）：默认模型可用环境变量 OLLAMA_MODEL 覆盖
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://127.0.0.1:11434')
# 本机 GPU(1060 6GB) 在 Ollama 上默认推理会崩(0xc0000005)，改小模型强制 CPU，速度可用(约3-4秒/句)
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'qwen3:1.7b')
_IO_LOCK = threading.Lock()

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

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def end_headers(self):
        # 禁用缓存，改完文件刷新即可生效
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        return MIME.get(ext, 'application/octet-stream')

    def _send_json(self, obj, status=200):
        data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        # /history：把历史记录直接读自项目目录下的 history.json（静默，前端无需选文件）
        if self.path.split('?')[0] == '/history':
            try:
                with _IO_LOCK:
                    with open(HISTORY_FILE, encoding='utf-8') as f:
                        items = json.load(f).get('items', [])
            except (FileNotFoundError, json.JSONDecodeError):
                items = []
            self._send_json({'version': 1, 'items': items})
            return
        super().do_GET()

    def do_POST(self):
        path = self.path.split('?')[0]
        # /translate：本地 Ollama 翻译整段英文。流式返回增量译文（前端逐字显示）。
        if path == '/translate':
            try:
                ln = int(self.headers.get('Content-Length', 0))
                body = json.loads(self.rfile.read(ln) or b'{}')
            except Exception:
                body = {}
            text = (body.get('text') or '').strip()
            if not text:
                self._send_json({'ok': False, 'err': '没有要翻译的文本'}, 400)
                return
            model = body.get('model') or OLLAMA_MODEL
            think = bool(body.get('think', False))   # 难句更精准：开启 qwen3 思考
            try:
                it = iter_chat_stream(text, model, think)   # 连接/加载失败会抛异常（此时头还没发）
                self.send_response(200)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                for chunk in it:
                    self.wfile.write(chunk.encode('utf-8'))
                    self.wfile.flush()
            except urllib.error.HTTPError as e:
                try:
                    err = json.loads(e.read().decode('utf-8')).get('error', str(e))
                except Exception:
                    err = str(e)
                if 'not found' in err.lower():
                    err = '本地还没装这个模型，请先在命令行运行：ollama pull ' + model
                self._send_json({'ok': False, 'err': err}, 502)
            except Exception as e:
                # 连接失败（如 Ollama 未启动）：头还没发，可正常回 JSON
                self._send_json({'ok': False, 'err': '无法连接本地 Ollama（' + str(e) + '）。请确认它已启动。'}, 502)
            return
        # /memo：本地 Ollama 依「单词 + 词根拆解 + 释义」生成一句记忆口诀（流式，做法同 /translate）
        if path == '/memo':
            try:
                ln = int(self.headers.get('Content-Length', 0))
                body = json.loads(self.rfile.read(ln) or b'{}')
            except Exception:
                body = {}
            word = (body.get('word') or '').strip()
            morph = (body.get('morph') or '').strip()
            meaning = (body.get('meaning') or '').strip()
            if not word:
                self._send_json({'ok': False, 'err': '没有要助记的单词'}, 400)
                return
            prompt = '单词：' + word
            if morph:
                prompt += '\n词根词缀拆解：' + morph
            if meaning:
                prompt += '\n释义：' + meaning
            model = body.get('model') or OLLAMA_MODEL
            # 界面语言与助记语言相反：中文界面出英文口诀、英文界面出中文口诀
            system = MEMO_SYSTEM_EN if str(body.get('lang') or '').lower() == 'en' else MEMO_SYSTEM
            try:
                it = iter_chat_stream(prompt, model, False, system)
                self.send_response(200)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                for chunk in it:
                    self.wfile.write(chunk.encode('utf-8'))
                    self.wfile.flush()
            except urllib.error.HTTPError as e:
                try:
                    err = json.loads(e.read().decode('utf-8')).get('error', str(e))
                except Exception:
                    err = str(e)
                if 'not found' in err.lower():
                    err = '本地还没装这个模型，请先在命令行运行：ollama pull ' + model
                self._send_json({'ok': False, 'err': err}, 502)
            except Exception as e:
                self._send_json({'ok': False, 'err': '无法连接本地 Ollama（' + str(e) + '）。请确认它已启动。'}, 502)
            return
        # /history：把前端发来的历史全量写入项目目录下的 history.json
        if self.path.split('?')[0] == '/history':
            try:
                ln = int(self.headers.get('Content-Length', 0))
                body = json.loads(self.rfile.read(ln) or b'{}')
            except Exception:
                body = {}
            items = body.get('items', body) if isinstance(body, dict) else body
            if isinstance(items, list):
                try:
                    with _IO_LOCK:
                        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
                            json.dump({'version': 1, 'exportedAt': time.strftime('%Y-%m-%d %H:%M:%S'), 'items': items},
                                      f, ensure_ascii=False, indent=2)
                    self._send_json({'ok': True})
                except Exception as e:
                    self._send_json({'ok': False, 'err': str(e)}, 500)
            else:
                self._send_json({'ok': False, 'err': 'bad items'}, 400)
            return
        self.send_error(405)


def iter_chat_stream(text, model, think=False, system=None):
    """流式调本地 Ollama，逐块 yield 增量文本（默认按整段翻译任务）。
       连接/加载失败抛异常（此时 HTTP 头未发，调用方可回 JSON 错误）。"""
    payload = {
        'model': model,
        'stream': True,
        'think': think,   # 难句更精准：qwen3 开思考(更准但更慢)
        'messages': [
            {'role': 'system', 'content': system or TRANSLATE_SYSTEM},
            {'role': 'user', 'content': text},
        ],
        'options': {'num_gpu': 0},   # 本机 GPU 推理崩(0xc0000005)，强制 CPU
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


def translate_to_chinese(text, model):
    """调本地 Ollama 把英文翻成简体中文。返回 {'ok': True, 'text': ...} 或 {'ok': False, 'err': ...}"""
    payload = {
        'model': model,
        'stream': False,
        # qwen3 默认会先"思考"再答，关掉以免思考内容混进译文、还拖慢速度
        'think': False,
        # 本机 GPU 推理崩(0xc0000005)，强制 CPU；小模型很快
        'options': {'num_gpu': 0},
        'messages': [
            {'role': 'system', 'content': TRANSLATE_SYSTEM},
            {'role': 'user', 'content': text},
        ],
    }
    req = urllib.request.Request(
        OLLAMA_URL + '/api/chat',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        content = (data.get('message') or {}).get('content', '').strip()
        if not content and data.get('error'):
            return {'ok': False, 'err': data['error']}
        return {'ok': True, 'text': content}
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read().decode('utf-8')).get('error', str(e))
        except Exception:
            err = str(e)
        if 'not found' in err.lower():
            err = '本地还没装这个模型，请先在命令行运行：ollama pull ' + model
        return {'ok': False, 'err': err}
    except Exception as e:
        return {'ok': False, 'err': '无法连接本地 Ollama（' + str(e) + '）。请确认它已启动，或已运行 ollama pull ' + model}


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
