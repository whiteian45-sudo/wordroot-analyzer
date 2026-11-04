# 数据地图与许可

这张表回答三件事：**这个文件是什么、能不能入库、缺了会怎样**。新增/替换数据前先看这里。

## 入库数据（随仓库分发）

| 文件 / 目录 | 内容 | 来源与许可 | 缺失影响 |
|---|---|---|---|
| `enhanced.json` | 考试词词卡、音标、释义、词源链、例句 | 基于 ECDICT（MIT）整理扩充，词源链为项目自整理 | 考试词卡大幅变薄，规则引擎仍可用 |
| `ecdict.json` | 76 万词全量词典（音标 / 中英释义 / 词性） | [ECDICT](https://github.com/skywind3000/ECDICT)（MIT） | 全量词典查词失效，只剩 enhanced + 引擎 |
| `bnc.json` | BNC-COCA 1k–9k 词族分级 | [The BNC-COCA Lists](https://github.com/wen-zhi/the-bnc-coca-lists)，Paul Nation，公开词表 | 词频目录、词频自测失效 |
| `stress.json` | 主重音位置 | CMUdict（BSD 许可）派生 | 重音提示消失 |
| `atlas.json` | 词光：CEFR / 话题 / 义项 / 搭配 / 词族 / 例句 | [Word Atlas](https://github.com/designfuchen/word-atlas)，CC BY 4.0，署名 “Word Atlas contributors” | 词光区块与词光目录失效 |
| `bg.jpg`、`favicon.png`、`logo_tree.png`、`screenshot.png` | 界面背景 / 图标 / README 截图 | 项目资产 | 对应界面元素缺失 |
| `check-history.json` | 回归体检趋势（不是用户查词历史） | 项目生成 | 趋势图少一段，不影响功能 |

## 本地数据（不入库，按需自备）

| 文件 / 目录 | 内容 | 来源 | 缺失影响 |
|---|---|---|---|
| `oxford.json` | 牛津9 词卡 | 商业词典派生，**不可公开分发** | 牛津词卡不显示 |
| `etym.json` | Etymonline 英文词源 | 商业版权数据 | 「词源」段落不显示 |
| `thes.json` | 近反义词 | 商业词典派生 | 近反义词区块消失 |
| `ex.json` | 朗文 / 柯林斯补充例句 | 商业词典派生 | 补充例句消失 |
| `us_ipa.json` | 美音音标 | 公开数据派生，配套脚本未打包 | 只保留英音 |
| `morph.json` | 数据优先形态库（约 22.8 万词） | 见下方「morph.json」 | 拆解全部回落到规则引擎 |
| `dict.db` | 按需词典 SQLite | 由 `ecdict.json` 生成 | 回落整包 ecdict（慢、占内存） |
| `history.json` / `favs.json` / `study.json` | 查词历史 / 收藏 / 学习统计 | 用户本地生成 | 对应功能从零开始 |
| `atlas_media/` | 词光插画 / 英美音 / 例句朗读 | 按需下载 | 插画和音频不显示 |
| `_archive/` | 一次性过程稿、旧报告、候选词表 | 项目归档 | 无 |

## morph.json

本地生成、**不入库**（`.gitignore`），因为体积约 11MB，且 MorphoLex 是 **CC BY-NC-SA 4.0（非商业）**。

数据源：

| 源 | 许可 | 用途 |
|---|---|---|
| [etymology-db](https://github.com/droher/etymology-db) 2023-12 | CC BY-SA 3.0 | 结构化 Wiktionary 词源关系 |
| [Open English WordNet 2025](https://en-word.net/) | CC BY 4.0 + Princeton WordNet License | 词性 / 派生词族 |
| [MorphoLex-en](https://github.com/hugomailhot/MorphoLex-en) | CC BY-NC-SA 4.0（非商业，本地） | 常见派生词 |
| [UniMorph English](https://github.com/unimorph/eng) | CC BY-SA 3.0 | 派生对 / 词族 |
| [kaikki.org](https://kaikki.org/dictionary/English/index.html) 英文提取 | CC BY-SA 3.0 + GFDL | 严格子集：补少量高置信拆解 |

生成链路：

```bash
# 1. 生成 target / OEWN 中间表
python -I wr_morph_prepare.py --oewn-dir <OEWN entries 解压目录> \
    --enhanced enhanced.json --bnc bnc.json --atlas atlas.json --out-dir morph_out

# 2. 从 kaikki 大文件流式提取目标词（3.4GB，可选）
python -I wr_extract_kaikki.py --kaikki <kaikki English.jsonl> \
    --morph morph.json --target morph_out/target.json \
    --out morph_out/kaikki_extract.json --report morph_out/kaikki_report.json

# 3. 合并五套数据，做表面重建 / 置信度校准 / 词族过滤
python -I wr_build_morph.py --etym <etymology.csv.gz> \
    --oewn morph_out/oewn_all.json --oewn-target morph_out/oewn_target.json \
    --oewn-family morph_out/oewn_family_all.json --target morph_out/target.json \
    --enhanced enhanced.json --morpholex <MorphoLEX_en.xlsx> \
    --unimorph <eng.derivations.tsv> --kaikki-extract morph_out/kaikki_extract.json \
    --out morph.json --report morph_out/report.json
```

依赖：`requirements-morph.txt`（`openpyxl`，只有读 MorphoLex 时需要）。
`morph.json` 缺失时 App 自动回落规则引擎，不报错。

## 提交前审计

```bash
node wr_license_audit.js
```

它会扫描 `git ls-files`，发现 oxford/etym/thes/ex/us_ipa/morph.json、用户历史、`dict.db`、备份文件等被跟踪就退出码 1。CI 也会跑这一步。
