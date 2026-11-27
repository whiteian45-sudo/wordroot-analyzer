const test = require('node:test');
const assert = require('node:assert/strict');
const WR = require('../wr_enhancements.js');

test('cleanGloss strips variant annotations and noisy suffix prefixes', () => {
  assert.equal(WR.cleanGloss('看(spec的变体)', false), '看');
  assert.equal(WR.cleanGloss('形容词后缀，…性的', false), '…性的');
  assert.equal(WR.cleanGloss('名词后缀，表行为、结果', false), '行为、结果');
  assert.equal(WR.cleanGloss('noun suffix, action or result', true), 'action or result');
});

test('composeNatural creates concise Chinese and English composition logic', () => {
  const bd = {
    prefix: { m: 'per', meaning: '贯穿、完全' },
    roots: [{ m: 'spect', meaning: '看(spec的变体)' }],
    suffixes: [{ m: 'ive', meaning: '形容词后缀，…性的' }]
  };
  const zh = WR.composeNatural(bd, p => p.meaning, (_, z) => z, false);
  assert.equal(zh.equation, 'per- (贯穿、完全) + spect (看) + -ive (…性的)');
  assert.match(zh.summary, /贯穿、完全 → 看 → …性的/);
  assert.doesNotMatch(zh.summary, /变体/);

  const en = WR.composeNatural(bd, () => 'through', (m) => ({ per: 'through', spect: 'look', ive: 'adj suffix, tending to' }[m]), true);
  assert.equal(en.equation, 'per- (through) + spect (look) + -ive (tending to)');
  assert.match(en.summary, /through \+ look \+ tending to/);
});

test('formatStressHint returns structured stress readout without weird spacing', () => {
  const zh = WR.formatStressHint({ 2: '二' }, 2, 'tion', false, false);
  assert.equal(zh.label, '主重音 · 倒数第 2 音节');
  assert.match(zh.note, /-tion/);

  const en = WR.formatStressHint({}, 2, '', true, true);
  assert.equal(en.label, 'Primary stress · 2nd-to-last syllable');
  assert.match(en.note, /neutral suffix/);
});

test('computeLearningStats accurately calculates FSRS mastery tiers, due count, and streak', () => {
  const now = new Date('2026-11-27T12:00:00Z').getTime();
  const history = [
    { w: 'apple', d: now - 1000, f: { s: 0, reps: 0 } },       // new + due
    { w: 'transport', d: now - 500, f: { s: 5, reps: 2 } },    // learning + due
    { w: 'perspective', d: now + 86400000 * 20, f: { s: 25, reps: 6 } } // mastered
  ];
  const study = {
    days: {
      '2026-11-25': { new: 5, review: 3, correct: 7, wrong: 1 },
      '2026-11-26': { new: 2, review: 4, correct: 5, wrong: 1 },
      '2026-11-27': { new: 3, review: 2, correct: 4, wrong: 1 }
    }
  };
  const stats = WR.computeLearningStats(history, study, now);
  assert.equal(stats.totalWords, 3);
  assert.equal(stats.newCount, 1);
  assert.equal(stats.learningCount, 1);
  assert.equal(stats.masteredCount, 1);
  assert.equal(stats.dueCount, 2);
  assert.equal(stats.streakDays, 3);
  assert.equal(stats.todayNew, 3);
  assert.equal(stats.todayReview, 2);
  assert.equal(stats.todayAcc, 80);
  assert.equal(stats.days7.length, 7);
});

test('pickDailyRoot is deterministic per date and prioritizes atlas words', () => {
  const roots = {
    spect: ['看', ['inspect', 'respect'], { lang: '拉丁语', word: 'specere' }],
    port: ['搬运', ['import', 'export'], { lang: '拉丁语', word: 'portare' }]
  };
  const morphIndex = new Map([
    ['spect', new Set(['perspective', 'spectator', 'inspect', 'unlistedword'])],
    ['port', new Set(['transport', 'portable', 'import'])]
  ]);
  const atlasWords = { perspective: {}, spectator: {}, inspect: {}, transport: {}, portable: {} };
  const a = WR.pickDailyRoot(roots, morphIndex, atlasWords, '2026-11-27');
  const b = WR.pickDailyRoot(roots, morphIndex, atlasWords, '2026-11-27');
  assert.deepEqual(a, b);
  assert.ok(a && (a.root === 'spect' || a.root === 'port'));
  assert.ok(a.words.length >= 2);
});

test('extractAtlasPos normalizes pos strings and indexAtlasWordsBatch populates indices', () => {
  assert.equal(WR.extractAtlasPos({ senses: [{ pos: 'n.' }, { pos: 'vt.' }, { pos: 'adj.' }] }), 'n/v/a');
  const morphIndex = new Map();
  const srcIndex = new Map();
  const roots = { spect: ['看', [], { lang: '拉丁语', word: 'specere' }] };
  const fakeDecompose = (w) => w === 'perspective'
    ? { prefix: { m: 'per' }, roots: [{ m: 'spect' }], suffixes: [{ m: 'ive' }] }
    : null;
  const res = WR.indexAtlasWordsBatch(
    ['perspective', 'cat', 'hello'],
    0, 10, fakeDecompose, morphIndex, srcIndex, roots, (r) => roots[r][2]
  );
  assert.equal(res.done, true);
  assert.equal(res.indexedCount, 1);
  assert.equal(morphIndex.get('spect').has('perspective'), true);
  assert.equal(morphIndex.get('per').has('perspective'), true);
  assert.equal(morphIndex.get('ive').has('perspective'), true);
  assert.equal(srcIndex.get('拉丁语\u0001specere').has('perspective'), true);
});

test('buildMorphemeHint produces clean spoiler-free hints for active recall', () => {
  const hints = WR.buildMorphemeHint({
    prefix: { m: 'trans', meaning: '横穿' },
    roots: [{ m: 'port', meaning: '搬运' }],
    suffixes: [{ m: 'ation', meaning: '名词后缀，表行为' }]
  }, p => p.meaning, (_, z) => z);
  assert.equal(hints.length, 3);
  assert.equal(hints[0].m, 'trans-');
  assert.equal(hints[1].m, 'port');
  assert.equal(hints[2].m, '-ation');
  assert.equal(hints[2].meaning, '行为');
});
