# 词根词缀分析器 · Word Root Analyzer

一个**完全离线**的英语查词 + 词源工具：输入一个单词，自动拆出它的前缀 / 词根 / 后缀，解释每一部分的含义，并展示词源演变链、同源词、同根词。

> 输入单词 → `transport` → `trans-(横穿) + port-(搬运)`，并看到 `transport ← 拉丁语 transportare（运送过去）` 的完整演变链。

## ✨ 功能特性

- **词根词缀拆解**：内置词根词缀规则引擎，自动拆解前缀 / 词根 / 后缀，并解释每部分含义
- **词源演变链**：展示单词从拉丁语/希腊语到英语的演变路径
- **同源词 / 同根词**：点击跳转查看共享同一词源或词根的其他单词
- **智能拼写纠错**：查不到的单词自动提示相近的候选（Damerau-Levenshtein 距离）
- **段落阅读模式**：粘贴一段话，点击单词在侧边面板查看拆解
- **中英双语例句**：发音按钮（内置 Web Speech API + 可选 Kokoro 高音质引擎）
- **收藏 & 历史记录**：本地保存，可导出

## 🚀 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/<你的用户名>/wordroot-analyzer.git
cd wordroot-analyzer

# 2. 安装 Python 3（只需标准库，无需第三方依赖）

# 3. 启动
# Windows: 双击 start.bat
# 其他系统: python server.py
```

启动后浏览器自动打开 `http://localhost:8756`，输入单词按回车即可。

> **注意**：必须通过 `start.bat` / `server.py` 启动，不能直接双击 `index.html`（file:// 协议下 fetch 被浏览器禁用）。

## 🔈 发音（Kokoro，可选）

**不安装也能用**：发音默认走浏览器内置的 Web Speech API，点 🔊 即可朗读单词、例句、整段文字。零配置、零依赖。

**想获得更高音质**，可选用 [Kokoro](https://github.com/hexgrad/kokoro) 神经网络语音合成（美音/英音共 10 个声线），需要额外安装：

```bash
# 1. 安装依赖（Python 3.9+，建议用 conda 建独立环境）
pip install kokoro soundfile torch --index-url https://download.pytorch.org/whl/cpu
#      ↑ torch 用 CPU 版即可，无需 GPU（体积 ~200MB）

# 2. 设置模型缓存目录（默认缓存到用户目录）
# Windows:  set HF_HOME=D:\hf      （或任意你想存放模型的位置）
# Linux:    export HF_HOME=~/hf

# 3. 启动 TTS 服务（独立窗口，端口 8757）
# Windows: 双击 tts_start.bat
# 其他系统: python tts_server.py
```

- 首次启动会自动下载模型到 `HF_HOME`（约 100MB，需联网）
- `tts_start.bat` 会自动检测：如果找不到独立的 Conda 环境，就用系统 python 运行
- 主程序启动时自动探测 8757 端口，**Kokoro 不可用会自动回退内置发音**，不会报错
- 词条卡片的 🔊 按钮和工具条下拉里可以切换发音引擎、选择声线

## 📊 数据分层

查词优先级（由高到低）：

| 数据 | 规模 | 内容 |
|---|---|---|
| `enhanced.json` | 13,904 词 | 常用考试词，含音标/释义/词根分解/词源演变链/例句 |
| `ecdict.json` | ~76 万词 | 全量英汉词典（ECDICT），音标 + 中英释义，兜底 |
| 规则引擎 | 内置 | 词根词缀表，最后兜底，仍可展示部分拆解 |

## 🗂 目录结构

```
wordroot-analyzer/
├── index.html        # 主程序界面（单文件，含全部前端逻辑）
├── server.py         # 本地 HTTP 服务（端口 8756）
├── start.bat         # Windows 一键启动脚本
├── enhanced.json     # 考试词数据
├── ecdict.json       # 全量词典数据
├── tts_server.py     # 可选：Kokoro 高音质 TTS 服务（端口 8757）
└── tts_start.bat     # 可选：Kokoro TTS 启动脚本
```

## ⚙️ 技术栈

- 纯前端：原生 HTML / CSS / JavaScript（零框架、零构建、零依赖）
- 后端：Python 标准库 `http.server`（零第三方依赖）
- 界面：iOS Liquid Glass 玻璃拟态设计

## 📜 数据来源与许可证

- **词根词缀表 / 拆解引擎**：项目原创，MIT 协议
- **`ecdict.json`**：来自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT 协议），在此致谢
- **`enhanced.json`**：在 ECDICT 词表基础上整理扩充的考试词数据，含自制的词源演变链

本项目本身采用 **MIT 许可证**。请保留数据来源署名。

## 🙏 致谢

- [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT) — 全量英汉词典数据
- 词源数据参考开源词源学资料整理

## 📄 License

[MIT](LICENSE)
