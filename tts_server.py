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

# 注意：kokoro（连带 torch）故意不在这里 import —— 见 _ensure_pipe()

PORT = 8757

# 与 kokoro_cli.py 一致的声线列表
VOICES = {
    'af_heart': '美音女声 Heart', 'af_bella': '美音女声 Bella',
    'af_nicole': '美音女声 Nicole', 'af_aoede': '美音女声 Aoede',
    'af_kore': '美音女声 Kore', 'am_adam': '美音男声 Adam',
    'am_michael': '美音男声 Michael', 'bf_emma': '英音女声 Emma',
    'bf_isabella': '英音女声 Isabella', 'bm_george': '英音男声 George',
}

# 模型改成懒加载（启动时先占住端口，再在后台慢慢加载）。
# 原来写在模块顶层：import 阶段就要跑 KPipeline(lang_code='a')，之后才轮到 __main__ 绑端口；
# 而 start.bat 起完 0.8 秒就打开浏览器探测 /health，冷启动几乎必然探空 —— 前端会以为「Kokoro 不可用」。
# 实测这行才是大头：from kokoro import KPipeline（连带 torch）本机热缓存 9.7 秒、冷启动 38 秒，
# 所以连 import 一起挪进 _ensure_pipe()：只把 KPipeline 挪进去是不够的，端口照样要等十几秒。
# numpy/soundfile 才 0.17 秒，留在顶层。实测挪完后端口 0.3 秒内就能应答 /health。
pipe = None
# 一把锁管两件事：保证模型只加载一次 + 合成串行化（KPipeline 非线程安全，这点保持原样）
pipe_lock = threading.Lock()


def _ensure_pipe():
    """确保模型已加载并返回它。第一次调用会阻塞几秒~几十秒（import + 读权重），之后就只是取引用。"""
    global pipe
    with pipe_lock:
        if pipe is None:
            # 延迟到这一步才 import：import 本身就占了大头，别挡着端口绑定
            from kokoro import KPipeline
            pipe = KPipeline(lang_code='a')
        return pipe


def synth(text, voice='af_heart', speed=1.0):
    """合成文本为 wav 字节。返回 bytes，失败抛异常。"""
    if not text.strip():
        raise ValueError('empty text')
    if voice not in VOICES:
        voice = 'af_heart'
    p = _ensure_pipe()
    with pipe_lock:
        gen = p(text, voice=voice, speed=max(0.5, min(2.0, speed)))
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

    def _safe_write(self, data):
        """往 socket 写数据。用户切页/关页面时前端会 abort 请求，wav 还没写完对端就没了，
        这时 write 抛 BrokenPipe/ConnectionReset 是常态不是故障；不拦住它就会一路冒到
        ThreadingHTTPServer.handle_error，每断一次往黑窗口刷一屏堆栈。"""
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            self.close_connection = True

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self._cors()
        self.end_headers()
        self._safe_write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/health'):
            # 只读 pipe 判断状态，绝不在这里调 _ensure_pipe()：否则探测请求自己会把
            # 几秒的加载扛在肩上，前端等到的就是超时而不是「正在加载」。
            self._json({'ok': pipe is not None, 'loading': pipe is None})
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
        self._safe_write(wav)


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
    # 端口已经绑好了：浏览器现在就能探到 /health（此时 loading=true），模型交给后台线程加载，
    # 加载完 /health 自动变 ok=true。顺序反过来就又变成「端口没起来 → 前端判死」了。
    def _warmup():
        # 加载失败要吭声：否则 /health 永远停在 loading=true，前端一直重试，黑窗口却什么都不说
        try:
            _ensure_pipe()
            # 报一下跑在哪：这是排查「怎么变慢了」第一眼要看的信息
            #（KokoroGPU 环境是 CUDA 版 torch = GPU；moss-tts-nano 是 CPU 版 = 纯 CPU，整段朗读会慢好几倍）
            import torch
            if torch.cuda.is_available():
                print('推理设备：GPU（' + torch.cuda.get_device_name(0) + '）')
            else:
                print('推理设备：CPU（当前环境是 CPU 版 torch，整段朗读会慢几倍）')
            print('Kokoro 模型已加载完成，可以发声了。')
        except Exception as e:
            print('!! Kokoro 模型加载失败：' + str(e))
            print('!! 请检查 kokoro/torch 是否装好（本脚本要用装了 kokoro 的那个 python 跑）。')

    threading.Thread(target=_warmup, daemon=True).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
