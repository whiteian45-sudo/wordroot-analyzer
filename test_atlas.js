/* 词光词库体检：atlas.json 结构 + 媒体覆盖 + 与 enhanced 的重合度。
   用法：node test_atlas.js
   不检查媒体内容是否正确，只检查文件在不在、结构是否完整。 */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
let fatal = 0;
const fail = (m) => { fatal++; console.log('✗ ' + m); };
const say = (m) => console.log('✓ ' + m);

const A = JSON.parse(fs.readFileSync(path.join(DIR, 'atlas.json'), 'utf8'));
const WORDS = A.words || {};
const ORDER = A.order || [];
const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const TOPICS = new Set(['education', 'work', 'technology', 'science', 'environment', 'health',
  'society', 'government', 'economy', 'media', 'arts', 'travel', 'city', 'nature', 'daily',
  'emotion', 'thinking', 'sport', 'history']);

if (A.count !== Object.keys(WORDS).length) fail('count 与 words 数量不一致');
else say('词条数 ' + A.count);
if (ORDER.length !== A.count) fail('order 长度 ' + ORDER.length + ' ≠ count ' + A.count);
else say('学习顺序 ' + ORDER.length + ' 条');
const seen = new Set();
for (const k of ORDER) {
  if (!WORDS[k]) fail('order 里的键不在 words 中：' + k);
  if (seen.has(k)) fail('order 重复键：' + k);
  seen.add(k);
}

const bad = [];
const media = { img: 0, uk: 0, us: 0, ex: 0, thumb: 0 };
let noFam = 0, noCol = 0;
for (const [k, a] of Object.entries(WORDS)) {
  if (!a.w || !a.id) { bad.push(k + ': 缺 w/id'); continue; }
  if (!Array.isArray(a.senses) || !a.senses.length) bad.push(k + ': 缺 senses');
  if (!Array.isArray(a.ex) || !a.ex.length) bad.push(k + ': 缺 ex');
  if (!Array.isArray(a.col)) bad.push(k + ': col 不是数组');
  if (!CEFR.includes(a.cefr)) bad.push(k + ': cefr=' + a.cefr);
  if (!TOPICS.has(a.topic)) bad.push(k + ': topic=' + a.topic);
  if (!a.fam || !a.fam.length) noFam++;
  if (!a.col || !a.col.length) noCol++;
  if (a.m & 1) media.img++;
  if (a.m & 2) media.uk++;
  if (a.m & 4) media.us++;
  if (a.m & 8) media.ex++;
  if (a.m & 16) media.thumb++;
}
if (bad.length) fail('字段问题 ' + bad.length + ' 条：' + bad.slice(0, 8).join(' | '));
else say('字段完整（w/id/senses/ex/col/cefr/topic）');
say('媒体位：img ' + media.img + ' · uk ' + media.uk + ' · us ' + media.us +
  ' · ex ' + media.ex + ' · thumb ' + media.thumb + '（无 fam ' + noFam + ' / 无搭配 ' + noCol + '）');

const t = WORDS.transport;
if (!t) fail('缺少样例词 transport');
else {
  if (t.cefr !== 'A2' || t.topic !== 'travel') fail('transport 的 cefr/topic 不对');
  if (!t.col.some(x => x.indexOf('public transport') === 0)) fail('transport 缺搭配 public transport');
  else say('样例词 transport：' + t.cefr + ' / ' + t.topic + ' / ' + t.col.length + ' 个搭配');
}

const mediaDir = path.join(DIR, 'atlas_media');
if (fs.existsSync(mediaDir)) {
  const sample = ['library', 'transport', 'abandon'].filter(w => WORDS[w]);
  let miss = [];
  for (const w of sample) {
    const a = WORDS[w];
    const id = a.id;
    for (const [kind, ext, bit] of [['img', '.webp', 1], ['audio/uk', '.mp3', 2], ['audio/us', '.mp3', 4], ['audio/ex', '.mp3', 8]]) {
      if (!(a.m & bit)) continue;
      const f = path.join(mediaDir, kind, id + ext);
      if (!fs.existsSync(f) || fs.statSync(f).size === 0) miss.push(kind + '/' + id);
    }
  }
  if (miss.length) console.log('· 媒体抽样缺 ' + miss.length + ' 个（下载未完成时可忽略）：' + miss.slice(0, 8).join(' '));
  else say('媒体抽样：3 个词的插画/发音文件都在');
  let n = 0;
  for (const sub of ['img', 'thumb', 'audio/uk', 'audio/us', 'audio/ex']) {
    try { n += fs.readdirSync(path.join(mediaDir, sub)).length; } catch (e) {}
  }
  say('atlas_media 现有文件 ' + n + ' 个');
} else {
  console.log('· 未发现 atlas_media/：卡片会自动隐藏插画，发音回退到 TTS');
}

const enhPath = path.join(DIR, 'enhanced.json');
if (fs.existsSync(enhPath)) {
  const enh = JSON.parse(fs.readFileSync(enhPath, 'utf8'));
  const ek = new Set(Object.keys(enh).map(x => x.toLowerCase()));
  let inter = 0;
  for (const k of Object.keys(WORDS)) if (ek.has(k)) inter++;
  say('与 enhanced 重合 ' + inter + ' / ' + A.count + '（词光独有 ' + (A.count - inter) + '）');
}

console.log(fatal ? '\n✗ 词光词库体检失败' : '\n✓ 词光词库体检通过');
process.exit(fatal ? 1 : 0);
