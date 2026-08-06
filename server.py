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
        httpd = socketserver.TCPServer(('0.0.0.0', PORT), Handler)
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
