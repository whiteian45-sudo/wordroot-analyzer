# 词根词缀分析器

一个本地英语查词工具：输入单词，拆出它的前缀 / 词根 / 后缀，解释每部分什么意思，顺带看词源演变和同根词。

```
transport → trans-(横穿) + port-(搬运)
          → transport ← 拉丁语 transportare（运送过去）
```

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

启动后浏览器会打开 `http://localhost:8756`。

注意：不要直接双击 `index.html`，file:// 协议下浏览器会拦 fetch，跑不起来，必须走 server.py。

## 功能

- 词根词缀拆解：前缀 / 词根 / 后缀分开拆，每部分标含义
- 词源演变链：单词从拉丁语 / 希腊语到英语怎么演变的
- 同源词 / 同根词：点一下跳到同根的其他词
- 拼写纠错：查不到的词会提示相近候选（比如 recieve → receive）
- 段落模式：贴一段话，点词看拆解
- 发音：内置浏览器语音（免费），也可以接 Kokoro 高音质引擎（可选，见下）
- 收藏 / 历史记录：存在本地浏览器

## 发音（可选）

不装任何东西就能用浏览器自带的语音点 🔊 朗读。想要更好听的音质可以装 [Kokoro](https://github.com/hexgrad/kokoro)：

```bash
pip install kokoro soundfile torch --index-url https://download.pytorch.org/whl/cpu
# 首次运行会自动下载模型到 HF_HOME（默认用户目录，约 100MB，需联网）
# Windows 直接双击 tts_start.bat，其他系统 python tts_server.py
```

Kokoro 没装或启动失败时，页面会自动退回浏览器内置发音，不会报错。

## 数据结构

查词按这个顺序来，命中一层就停：

| 数据 | 规模 | 内容 | 在仓库里？ |
|---|---|---|---|
| `enhanced.json` | 约 1.4 万词 | 考试常见词：音标、中英释义、词根分解、词源、例句 | ✅ 14MB |
| `oxford.json` | 约 14.7 万条 | 牛津高阶9：词性、中英释义、例句 | ❌ |
| `etym.json` | 约 5 万词 | Etymonline 词源 | ❌ |
| `thes.json` | 约 7.3 万词 | 近义词 / 反义词 | ❌ |
| `ex.json` | — | 朗文 / 柯林斯补充例句 | ❌ |
| `us_ipa.json` | 约 12.6 万词 | 美音音标 | ❌ |
| `ecdict.json` | 约 76 万词 | 全量英汉词典，兜底用 | ✅ 64MB |
| 内置规则引擎 | — | 词根词缀表（1600+ 条），最后兜底 | ✅ 在 `index.html` 里 |

## 数据来源

- 词根词缀表和拆解引擎是项目自己写的
- `ecdict.json` 来自 [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT)（MIT）
- `enhanced.json` 在 ECDICT 基础上整理扩充，词源演变链是自己整理的
- **标 ❌ 的几个文件没有放进仓库**：`oxford.json` / `etym.json` / `thes.json` / `ex.json` 都是从商业版权词典（牛津高阶、Etymonline、朗文、柯林斯）派生的，公开分发不合适；`us_ipa.json` 的数据源本身是公开仓库，只是配套脚本没打包。

缺了它们**不影响启动和核心功能** —— 拆解（引擎 + 词根表）、释义与音标（靠 `enhanced` + `ecdict`）、同根词、拼写纠错、段落模式、发音都正常。前端对每个数据文件是单独容错的，缺了只是对应区块不显示：

| 缺的文件 | 少掉的功能 |
|---|---|
| `oxford.json` | 牛津词卡（词性 / 中英释义 / 例句） |
| `etym.json` | 「词源」区块 |
| `thes.json` | 「近义词 / 反义词」 |
| `ex.json` | 朗文 / 柯林斯补充例句 |
| `us_ipa.json` | 美音音标（只保留英音） |

想用上全部功能，可以自备这些数据，或者换成开放许可的数据源（[Wiktionary](https://kaikki.org/dictionary/English/)、WordNet 等）自己重建。

## License

MIT
