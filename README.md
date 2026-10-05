# 词根词缀分析器

一个本地英语查词工具：输入单词，拆出它的前缀 / 词根 / 后缀，解释每部分什么意思，顺带看词源演变和同根词，并围绕「背单词」做了词频分级、例句检索和间隔重复复习。

```
transport → trans-(横穿) + port-(搬运)
          → transport ← 拉丁语 transportare（运送过去）
```

![界面预览](screenshot.png)

> 查词卡片（三色词素 + 词源演变链）、左侧同源词 / 近反义词、右侧「深度讲解」抽屉。

## 怎么跑

需要 Python 3，不需要装任何第三方库。

```bash
git clone https://github.com/whiteian45-sudo/wordroot-analyzer.git
cd wordroot-analyzer

# Windows
start.bat

# 其他系统
python server.py
```

启动后浏览器会打开 `http://localhost:8756`。`start.bat` 还会顺带另开一个「Kokoro TTS」窗口（高音质发音服务，可选，没装依赖也不影响主服务）；关掉主服务那个窗口即退出，TTS 窗口单独关。

注意：不要直接双击 `index.html`，file:// 协议下浏览器会拦 fetch，跑不起来，必须走 server.py。

## 功能

**查词**

- 词根词缀拆解：前缀 / 词根 / 后缀分开拆，三色标注，每部分标含义
- 词源演变链：单词从拉丁语 / 希腊语到英语怎么演变的
- 同源词 / 同根词 / 同缀词：点一下跳到同词素的其他词
- 拼写纠错：查不到的词会提示相近候选（比如 recieve → receive）
- 段落模式：贴一段话，点词看拆解，结果在右侧抽屉里展开
- 短语卡：输入 `give up` 这类短语，给中文释义并反查库里含它的例句

**学习**

- 词根目录：浏览内置词素表，看每个词根 / 前缀 / 后缀带哪些词
- 词频目录：按 BNC-COCA 1k–9k 千词族分级浏览；也能从某一级随机抽 20 个词族自测
- 例句搜索：在库里的全部例句中检索
- 收藏 / 查词记录：自动存到项目目录，不弹窗问存哪
- 复习闪卡：按间隔重复（SRS）排期，先只看词，点「显示释义」再自评「忘了 / 记住了」

**其它**

- 发音：内置浏览器语音，可选接 Kokoro 高音质引擎（见下）
- 中文 / English 界面切换，字号 / 行距 / 主题设置
- 快捷键：`/` 聚焦搜索框，空格朗读当前词（Shift+空格 慢速），`[` `]` 上一个 / 下一个词，`Alt+←` 退回上一个词；复习中 空格 / Enter 揭晓答案、`1` 忘了、`2` 记住了

## 发音（可选）

不装任何东西也能用浏览器自带的语音点 🔊 朗读。想要更自然的音质可以装 [Kokoro](https://github.com/hexgrad/kokoro)：

```bash
pip install kokoro soundfile torch --index-url https://download.pytorch.org/whl/cpu
# 首次运行自动下载模型到用户目录缓存（约 300MB，需联网）
```

装好后 Windows 下不用管：`start.bat` 会自动另开一个「Kokoro TTS」窗口跑它（端口 8757），也可以单独双击 `tts_start.bat`；其他系统手动 `python tts_server.py`。

Kokoro 没装或没启动时，页面会自动退回浏览器内置发音，不报错。有 N 卡的话换 CUDA 版 torch 能快好几倍（整段朗读实测约 6 倍）。

## 本地 AI（可选）

「深度讲解」「AI 助记」「🌐 译整段」这三个按钮走本地大模型（[Ollama](https://ollama.com)），不联网、不出本机：

```bash
# 1. 装 Ollama（官网下载安装，装完保持后台运行）
# 2. 拉模型（约 2.5GB）
ollama pull qwen3:4b-instruct-2507-q4_K_M
```

Ollama 默认监听 `127.0.0.1:11434`。server.py 默认用上面这个模型，想换别的设环境变量 `OLLAMA_MODEL` 覆盖即可。

- **深度讲解**：对当前词写一份教学性讲解（释义、搭配、语域、易混词辨析、例句）。释义和例句优先取自本地词典素材，素材不够的句子由模型补齐。
- **AI 助记**：根据「单词 + 词根拆解 + 释义」编一句好记的口诀。
- **译整段**：把段落模式里的整段英文翻成中文，流式输出。

没装 Ollama 时这三个按钮点了会提示连接失败，其余功能完全不受影响。

## 数据结构

查词按这个顺序来，命中一层就停：

| 数据 | 规模 | 内容 | 在仓库里？ |
|---|---|---|---|
| `enhanced.json` | 约 1.4 万词 | 考试常见词：音标、中英释义、词根分解、词源、例句 | ✅ 14MB |
| `bnc.json` | 约 4.3 万词形 | BNC-COCA 词频分级（1k–9k 千词族），卡片右上角的 `BNC 3k` 徽章 | ✅ 500KB |
| `stress.json` | 约 7 万词 | 主重音位置（音标重音提示） | ✅ 900KB |
| `oxford.json` | 约 14.7 万条 | 牛津高阶9：词性、中英释义、例句 | ❌ |
| `etym.json` | 约 5 万词 | Etymonline 词源 | ❌ |
| `thes.json` | 约 7.3 万词 | 近义词 / 反义词 | ❌ |
| `ex.json` | — | 朗文 / 柯林斯补充例句 | ❌ |
| `us_ipa.json` | 约 12.6 万词 | 美音音标 | ❌ |
| `ecdict.json` | 约 76 万词 | 全量英汉词典，兜底用 | ✅ 64MB |
| 内置规则引擎 | — | 词根词缀表（前缀 / 词根 / 后缀 / 基本词，共三千余条），最后兜底 | ✅ 在 `index.html` 里 |

`history.json` / `favs.json` 是查词记录与收藏，运行时由本地服务自动写在项目目录，属于个人数据，不进仓库。

全量词典支持可选的**分片加载**：项目目录下有 `dict/` 分片时就逐个在空闲时解析，没有就整文件读 `ecdict.json`，功能完全一样（分片只是让加载不卡输入）。

## 数据来源

- 词根词缀表和拆解引擎是项目自己写的
- `ecdict.json` 来自 [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT)（MIT）
- `enhanced.json` 在 ECDICT 基础上整理扩充，词源演变链是自己整理的
- `bnc.json` 来自 [The BNC-COCA Lists](https://github.com/wen-zhi/the-bnc-coca-lists) —— Paul Nation 编制的学术词频表（按词族分级），公开发布，可随仓库分发
- `stress.json` 由 CMU 发音词典（CMUdict，BSD 许可）派生，标注主重音位置，可随仓库分发
- **标 ❌ 的几个文件没有放进仓库**：`oxford.json` / `etym.json` / `thes.json` / `ex.json` 都是从商业版权词典（牛津高阶、Etymonline、朗文、柯林斯）派生的，公开分发不合适；`us_ipa.json` 的数据源本身是公开仓库，只是配套脚本没打包。

缺了它们**不影响启动和核心功能** —— 拆解（引擎 + 词根表）、释义与音标（靠 `enhanced` + `ecdict`）、同根词、拼写纠错、段落模式、发音都正常。前端对每个数据文件是单独容错的，缺了只是对应区块不显示：

| 缺的文件 | 少掉的功能 |
|---|---|
| `oxford.json` | 牛津词卡（词性 / 中英释义 / 例句） |
| `etym.json` | 「词源」区块 |
| `thes.json` | 「近义词 / 反义词」 |
| `ex.json` | 朗文 / 柯林斯补充例句 |
| `us_ipa.json` | 美音音标（只保留英音） |
| `bnc.json` | 词频目录、词频自测 |
| `stress.json` | 重音位置提示 |

想用上全部功能，可以自备这些数据，或者换成开放许可的数据源（[Wiktionary](https://kaikki.org/dictionary/English/)、WordNet 等）自己重建。

## 开发 / 回归

改拆解引擎或词素表后跑一遍回归（Windows 直接双击 `回归.bat`，等价于依次执行下面三条）：

```bash
node test_decompose.js --guard         # 守护清单：401 个已验证词的拆解结果不许回退
node test_decompose.js --audit --brief # 词源审计：以 enhanced 自带词源为基准，看总量
node test_health.js                    # 一体化体检：表完整性、原型链、渲染冒烟、覆盖率、性能
```

配套工具：

| 文件 | 用途 |
|---|---|
| `test_decompose.js` | 查单词拆解（`node test_decompose.js word`）；`--diff` 全量对比 git HEAD；`--enhanced` 查兜底误触发；`--audit` 列出低匹配词 |
| `test_health.js` | 一体化体检，退出码非 0 表示有致命问题 |
| `test_ui.js` | 真机 UI 验证（需主服务在跑 + Chrome） |
| `tune_scoring.js` | 拆解评分调参实验（结论：调参解不了误拆，靠拦截表） |
| `guard_words.json` | 守护清单数据 |
| `audit_report.md` | `--audit` 的输出存档 |

## License

本项目自己的代码以 MIT 许可发布，全文见 [LICENSE](LICENSE)。

随仓库分发的数据文件（`ecdict.json` / `bnc.json` / `stress.json` 等）各有自己的来源与许可，见上面「数据来源」一节。
