# -*- coding: utf-8 -*-
"""Kokoro 高音质 TTS 常驻服务（端口 8757）

词根词缀分析器的高音质发音引擎。模型只加载一次常驻内存，
之后每次合成只需几百毫秒。与主服务 server.py 配合：
start.bat 同时启动两个，前端点「Kokoro」按钮时请求本服务。

用法（需要已安装 kokoro/torch/soundfile 的 python 运行）：
  python tts_server.py
  （或使用 tts_start.bat 一键启动）

接口：
  GET  /health            -> {"ok": true, "voice": "af_heart"}
  POST /tts  {"text","voice","speed"} -> audio/wav
"""
import io
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import soundfile as sf
from kokoro import KPipeline

PORT = 8757

# 与 kokoro_cli.py 一致的声线列表
VOICES = {
    'af_heart': '美音女声 Heart', 'af_bella': '美音女声 Bella',
    'af_nicole': '美音女声 Nicole', 'af_aoede': '美音女声 Aoede',
    'af_kore': '美音女声 Kore', 'am_adam': '美音男声 Adam',
    'am_michael': '美音男声 Michael', 'bf_emma': '英音女声 Emma',
    'bf_isabella': '英音女声 Isabella', 'bm_george': '英音男声 George',
}

# 加载一次，常驻内存（约 4 秒，一次性）
pipe = KPipeline(lang_code='a')
pipe_lock = threading.Lock()  # 合成非线程安全，串行化


def synth(text, voice='af_heart', speed=1.0):
    """合成文本为 wav 字节。返回 bytes，失败抛异常。"""
    if not text.strip():
        raise ValueError('empty text')
    if voice not in VOICES:
        voice = 'af_heart'
    with pipe_lock:
        gen = pipe(text, voice=voice, speed=max(0.5, min(2.0, speed)))
        all_audio = [a.numpy() for _gs, _ps, a in gen]
    if not all_audio:
        raise RuntimeError('no audio produced')
    buf = io.BytesIO()
    sf.write(buf, np.concatenate(all_audio), 24000, format='WAV')
    return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # 静默日志，不刷屏
        pass

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/health'):
            self._json({'ok': True, 'voice': 'af_heart'})
        else:
            self._json({'error': 'not found'}, 404)

    def do_POST(self):
        if not self.path.startswith('/tts'):
            self._json({'error': 'not found'}, 404)
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            req = json.loads(self.rfile.read(length).decode('utf-8'))
            wav = synth(req.get('text', ''), req.get('voice', 'af_heart'), req.get('speed', 1.0))
        except Exception as e:  # 合成失败返回 JSON 错误
            self._json({'error': str(e)}, 500)
            return
        self.send_response(200)
        self.send_header('Content-Type', 'audio/wav')
        self.send_header('Content-Length', str(len(wav)))
        self._cors()
        self.end_headers()
        self.wfile.write(wav)


if __name__ == '__main__':
    try:
        srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    except OSError as e:
        if e.errno == 10048:
            print('端口 %d 已被占用——TTS 服务可能已在运行。' % PORT)
            raise SystemExit(0)
        raise
    print('=' * 50)
    print('Kokoro TTS 服务已启动 (端口 %d)' % PORT)
    print('声线: ' + ', '.join(list(VOICES)[:5]) + ' 等共 %d 个' % len(VOICES))
    print('关闭窗口即退出')
    print('=' * 50)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
