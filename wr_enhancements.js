/* ============================================================
   wr_enhancements.js — Pure logic helpers & crisp SVG icon kit
   Dual-mode (Browser window.WREnhance + Node CommonJS) so core
   logic stays decoupled from index.html and 100% unit-testable.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WREnhance = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DAY_MS = 86400000;

  /* ---------- 1. Crisp 15px Editorial SVG Icon Set ---------- */
  const _svg = (body, size) => {
    const s = size || 15;
    return '<svg class="wr-ico" width="' + s + '" height="' + s +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  };

  const SVG = {
    speaker: _svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>'),
    book: _svg('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>'),
    spark: _svg('<path d="M12 3l1.9 5.8L20 10.5l-5.2 3.4 1.8 6.1L12 16.6 7.4 20l1.8-6.1L4 10.5l6.1-1.7z"/>'),
    shuffle: _svg('<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>'),
    eye: _svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
    calendar: _svg('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
    target: _svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>'),
    edit: _svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>', 14),
    hint: _svg('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1v.2h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>'),
    graph: _svg('<circle cx="12" cy="12" r="3"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><line x1="9.8" y1="10" x2="6.6" y2="7.4"/><line x1="14.2" y1="10" x2="17.4" y2="7.4"/><line x1="9.8" y1="14" x2="6.6" y2="16.6"/><line x1="14.2" y1="14" x2="17.4" y2="16.6"/>'),
    star: _svg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', 14),
    starFill: _svg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor"/>', 14),
    check: _svg('<polyline points="20 6 9 17 4 12"/>', 14),
    settings: _svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>', 14),
    exportIco: _svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', 14),
    importIco: _svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 14),
    trash: _svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>', 14),
    globe: _svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3.5 3 14.5 0 18c-3-3.5-3-14.5 0-18z"/>', 14)
  };

  /* ---------- 2. Natural Morpheme Gloss & Synthesis ---------- */
  function cleanGloss(raw, enMode) {
    let s = String(raw || '').trim();
    if (!s) return '';
    // Strip parenthetical variant/meta notes like (spec的变体), （in的变体）
    s = s.replace(/[（(][^（）()]*变体[^（）()]*[）)]/g, '');
    s = s.replace(/[（(]variant of [^）)]+[）)]/gi, '');
    if (!enMode) {
      // Strip noisy grammatical boilerplate prefixes from suffix glosses
      s = s.replace(/^(名词|动词|形容词|副词|数词)后缀[，,、：:\s]*/g, '');
      s = s.replace(/^表(示)?/g, '');
      s = s.replace(/\s*;\s*/g, ' / ');
    } else {
      s = s.replace(/^(noun|verb|adj\.?|adjective|adv\.?|adverb)\s+suffix[,:\s]*/i, '');
      s = s.replace(/\s*;\s*/g, ' / ');
    }
    s = s.replace(/\s+/g, ' ').trim();
    // Keep concise first 2 senses if very long
    const parts = s.split(/[，,；;]/).map(function (p) { return p.trim(); }).filter(Boolean);
    if (parts.length > 2) s = parts.slice(0, 2).join('、');
    return s;
  }

  function composeNatural(bd, prefFn, glFn, enMode) {
    if (!bd) return { equation: '', summary: '' };
    const eqParts = [];
    const semParts = [];
    const gl = typeof glFn === 'function' ? glFn : function (_, z) { return z || ''; };

    if (bd.prefix) {
      const rawP = typeof prefFn === 'function'
        ? prefFn(bd.prefix, bd.roots && bd.roots[0] && bd.roots[0].m)
        : (bd.prefix.meaning || '');
      const cleanP = cleanGloss(gl(bd.prefix.m, rawP), enMode) || rawP;
      const mLabel = String(bd.prefix.m || '').replace(/-$/, '') + '-';
      eqParts.push(mLabel + ' (' + cleanP + ')');
      if (cleanP) semParts.push(cleanP);
    }
    (bd.roots || []).forEach(function (r) {
      const cleanR = cleanGloss(gl(r.m, r.meaning), enMode) || r.meaning || '';
      eqParts.push(r.m + (cleanR ? ' (' + cleanR + ')' : ''));
      if (cleanR) semParts.push(cleanR);
    });
    (bd.suffixes || []).forEach(function (s) {
      const cleanS = cleanGloss(gl(s.m, s.meaning), enMode) || s.meaning || '';
      const mLabel = '-' + String(s.m || '').replace(/^-/, '');
      eqParts.push(mLabel + (cleanS ? ' (' + cleanS + ')' : ''));
      if (cleanS) semParts.push(cleanS);
    });
    if (bd.unknown) {
      eqParts.push(bd.unknown + (enMode ? ' (unparsed)' : ' (未识别)'));
    }

    const equation = eqParts.join(' + ');
    const joined = semParts.join(enMode ? ' + ' : ' → ');
    const summary = !joined ? '' : (enMode
      ? 'Literal sense: "' + joined + '" — connect this structural core with the word\'s modern meaning.'
      : '字面脉络：「' + joined + '」，可顺着构词逻辑联想它的引申词义。');
    return { equation: equation, summary: summary };
  }

  /* ---------- 3. Clean Stress Readout ---------- */
  function formatStressHint(ordCn, n, ruleSuf, neutral, enMode) {
    if (!n || n < 1) return '';
    if (enMode) {
      const ordEn = n === 1 ? 'last' : (n === 2 ? '2nd-to-last' : (n === 3 ? '3rd-to-last' : n + 'th-to-last'));
      let note = '';
      if (ruleSuf) note = 'fixed before -' + ruleSuf;
      else if (neutral) note = 'neutral suffix keeps stem stress';
      return {
        label: 'Primary stress · ' + ordEn + ' syllable',
        note: note
      };
    }
    let noteZh = '';
    if (ruleSuf) noteZh = '-' + ruleSuf + ' 类后缀固定将重音落于此音节';
    else if (neutral) noteZh = '中性后缀，重音随原词保持不变';
    return {
      label: '主重音 · 倒数第 ' + n + ' 音节',
      note: noteZh
    };
  }

  /* ---------- 4. Learning Insights, Streak & Mastery Distribution ---------- */
  function dayKeyOf(ts) {
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  function computeLearningStats(history, study, nowTs) {
    const now = typeof nowTs === 'number' ? nowTs : Date.now();
    const list = Array.isArray(history) ? history : [];
    const days = (study && study.days && typeof study.days === 'object') ? study.days : {};

    let newCount = 0;
    let learningCount = 0;
    let masteredCount = 0;
    let dueCount = 0;

    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (!it) continue;
      if (typeof it.d === 'number' && it.d <= now) dueCount++;
      const f = it.f;
      const stab = f && typeof f.s === 'number' ? f.s : 0;
      const reps = f && typeof f.reps === 'number' ? f.reps : 0;
      if (!f || reps === 0 || stab <= 0) {
        newCount++;
      } else if (stab >= 14) {
        masteredCount++;
      } else {
        learningCount++;
      }
    }

    // 7-day activity window ending today
    const days7 = [];
    const todayStart = new Date(now);
    todayStart.setHours(12, 0, 0, 0);
    for (let offset = 6; offset >= 0; offset--) {
      const k = dayKeyOf(todayStart.getTime() - offset * DAY_MS);
      const row = days[k] || {};
      const count = (row.new || 0) + (row.review || 0);
      days7.push({
        key: k,
        label: k.slice(5),
        newN: row.new || 0,
        reviewN: row.review || 0,
        total: count
      });
    }

    // Consecutive active study streak (counting today if active, or yesterday if today not yet started)
    let streakDays = 0;
    const activeAt = function (offset) {
      const k = dayKeyOf(todayStart.getTime() - offset * DAY_MS);
      const row = days[k];
      return !!(row && ((row.new || 0) + (row.review || 0) > 0));
    };
    let cursor = activeAt(0) ? 0 : (activeAt(1) ? 1 : -1);
    if (cursor >= 0) {
      while (activeAt(cursor) && streakDays < 3650) {
        streakDays++;
        cursor++;
      }
    }

    const todayKey = dayKeyOf(todayStart.getTime());
    const todayRow = days[todayKey] || { new: 0, review: 0, correct: 0, wrong: 0 };
    const graded = (todayRow.correct || 0) + (todayRow.wrong || 0);
    const todayAcc = graded > 0 ? Math.round((todayRow.correct || 0) * 100 / graded) : null;

    return {
      totalWords: list.length,
      newCount: newCount,
      learningCount: learningCount,
      masteredCount: masteredCount,
      dueCount: dueCount,
      streakDays: streakDays,
      days7: days7,
      todayNew: todayRow.new || 0,
      todayReview: todayRow.review || 0,
      todayAcc: todayAcc
    };
  }

  /* ---------- 5. Daily Root Spotlight (Deterministic Curated Selection) ---------- */
  const FEATURED_ROOTS = [
    'spect', 'port', 'duc', 'tract', 'scrib', 'rupt', 'vert', 'ject',
    'press', 'form', 'graph', 'chron', 'phon', 'struct', 'cred', 'vis',
    'dict', 'fer', 'grad', 'log', 'mit', 'ped', 'pos', 'sens', 'spir', 'tend', 'voc'
  ];

  function pickDailyRoot(rootsObj, morphIndex, atlasWords, dateKey) {
    if (!rootsObj) return null;
    const key = String(dateKey || dayKeyOf(Date.now()));
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash * 31) + key.charCodeAt(i)) >>> 0;
    }
    const candidates = FEATURED_ROOTS.filter(function (k) {
      return Object.prototype.hasOwnProperty.call(rootsObj, k) && Array.isArray(rootsObj[k]);
    });
    if (!candidates.length) return null;

    const chosenKey = candidates[hash % candidates.length];
    const entry = rootsObj[chosenKey];
    const seen = new Set();
    const words = [];

    const addWord = function (w) {
      if (!w || w === chosenKey || seen.has(w)) return;
      seen.add(w);
      words.push(w);
    };

    const indexed = morphIndex && typeof morphIndex.get === 'function' ? morphIndex.get(chosenKey) : null;
    if (indexed) {
      indexed.forEach(function (w) {
        if (!atlasWords || Object.prototype.hasOwnProperty.call(atlasWords, w)) addWord(w);
      });
    }
    (entry[1] || []).forEach(addWord);
    if (indexed && words.length < 8) {
      indexed.forEach(addWord);
    }

    return {
      root: chosenKey,
      meaning: entry[0] || '',
      src: entry[2] || null,
      words: words.slice(0, 8),
      totalWords: indexed ? Math.max(indexed.size, words.length) : words.length
    };
  }

  /* ---------- 6. Review Mode Spoiler-Free Morpheme Hint ---------- */
  function buildMorphemeHint(bd, prefFn, glFn) {
    if (!bd) return [];
    const gl = typeof glFn === 'function' ? glFn : function (_, z) { return z || ''; };
    const chips = [];
    if (bd.prefix) {
      const rawP = typeof prefFn === 'function'
        ? prefFn(bd.prefix, bd.roots && bd.roots[0] && bd.roots[0].m)
        : (bd.prefix.meaning || '');
      chips.push({
        m: String(bd.prefix.m || '').replace(/-$/, '') + '-',
        cls: 'pf',
        meaning: cleanGloss(gl(bd.prefix.m, rawP), false) || rawP
      });
    }
    (bd.roots || []).forEach(function (r) {
      chips.push({
        m: r.m,
        cls: 'rt',
        meaning: cleanGloss(gl(r.m, r.meaning), false) || r.meaning || ''
      });
    });
    (bd.suffixes || []).forEach(function (s) {
      chips.push({
        m: '-' + String(s.m || '').replace(/^-/, ''),
        cls: 'sf',
        meaning: cleanGloss(gl(s.m, s.meaning), false) || s.meaning || ''
      });
    });
    return chips;
  }

  /* ---------- 7. Atlas POS Normalization & Reverse-Root Indexing ---------- */
  function extractAtlasPos(atlasEntry) {
    if (!atlasEntry || !Array.isArray(atlasEntry.senses)) return '';
    const out = [];
    for (let i = 0; i < atlasEntry.senses.length; i++) {
      const raw = String((atlasEntry.senses[i] && atlasEntry.senses[i].pos) || '').toLowerCase();
      const tokens = raw.split(/[^a-z]+/).filter(Boolean);
      for (let j = 0; j < tokens.length; j++) {
        let p = tokens[j];
        if (p === 'adj' || p === 'adjective') p = 'a';
        else if (p === 'ad' || p === 'adv' || p === 'adverb') p = 'adv';
        else if (p === 'vt' || p === 'vi' || p === 'verb') p = 'v';
        else if (p === 'noun') p = 'n';
        if (/^(n|v|a|adv)$/.test(p) && out.indexOf(p) < 0) out.push(p);
      }
    }
    return out.join('/');
  }

  function indexAtlasWordsBatch(words, startIdx, batchSize, decomposeFn, morphIndex, srcIndex, rootsObj, baseSrcFn) {
    const end = Math.min(words.length, startIdx + batchSize);
    let indexedCount = 0;
    for (let i = startIdx; i < end; i++) {
      const w = words[i];
      if (!w || !/^[a-z]{4,28}$/.test(w)) continue;
      let bd = null;
      try { bd = decomposeFn(w, 0); } catch (e) { continue; }
      if (!bd || !Array.isArray(bd.roots) || !bd.roots.length) continue;
      indexedCount++;
      for (let r = 0; r < bd.roots.length; r++) {
        const rm = bd.roots[r] && bd.roots[r].m;
        if (!rm || rm.length < 2) continue;
        if (!morphIndex.has(rm)) morphIndex.set(rm, new Set());
        morphIndex.get(rm).add(w);
        if (srcIndex && rootsObj && Object.prototype.hasOwnProperty.call(rootsObj, rm)) {
          const src = typeof baseSrcFn === 'function' ? baseSrcFn(rm) : (rootsObj[rm] && rootsObj[rm][2]);
          if (src && src.lang && src.word) {
            const sk = src.lang + '\u0001' + src.word;
            if (!srcIndex.has(sk)) srcIndex.set(sk, new Set());
            srcIndex.get(sk).add(w);
          }
        }
      }
      if (bd.prefix && bd.prefix.m) {
        const pm = String(bd.prefix.m).replace(/-.*$/, '');
        if (pm.length >= 2) {
          if (!morphIndex.has(pm)) morphIndex.set(pm, new Set());
          morphIndex.get(pm).add(w);
        }
      }
      if (Array.isArray(bd.suffixes)) {
        for (let s = 0; s < bd.suffixes.length; s++) {
          const sm = bd.suffixes[s] && bd.suffixes[s].m;
          if (sm && sm.length >= 3) {
            if (!morphIndex.has(sm)) morphIndex.set(sm, new Set());
            morphIndex.get(sm).add(w);
          }
        }
      }
    }
    return { nextIdx: end, done: end >= words.length, indexedCount: indexedCount };
  }

  return {
    SVG: SVG,
    cleanGloss: cleanGloss,
    composeNatural: composeNatural,
    formatStressHint: formatStressHint,
    computeLearningStats: computeLearningStats,
    pickDailyRoot: pickDailyRoot,
    buildMorphemeHint: buildMorphemeHint,
    extractAtlasPos: extractAtlasPos,
    indexAtlasWordsBatch: indexAtlasWordsBatch
  };
});
