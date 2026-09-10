/* ============================================================
   小小世界 · 数据层 store.js
   统一数据接口：load / save / export / import
   日期计算使用 UTC 避免时区问题
   ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'xiaoxiaoshijie.v1';
  var CURRENT_KEY = 'xiaoxiaoshijie.current';
  var LAST_EXPORT_KEY = 'xiaoxiaoshijie.lastexport';

  /* ---------- 基础工具 ---------- */
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function nowStamp(d) {
    d = d || new Date();
    return todayStr(d) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function parseDate(s) {
    if (!s) return null;
    var p = String(s).split('-');
    if (p.length !== 3) return null;
    var y = +p[0], m = +p[1], d = +p[2];
    if (!y || !m || !d) return null;
    return { y: y, m: m, d: d };
  }

  /* b 比 a 晚多少天（b - a） */
  function dayDiff(aStr, bStr) {
    var a = parseDate(aStr), b = parseDate(bStr);
    if (!a || !b) return 0;
    var ua = Date.UTC(a.y, a.m - 1, a.d);
    var ub = Date.UTC(b.y, b.m - 1, b.d);
    return Math.round((ub - ua) / 86400000);
  }

  /* 在一起第几天（含开始当天） */
  function daysTogether(sinceStr, today) {
    today = today || todayStr();
    return dayDiff(sinceStr, today) + 1;
  }

  /* 每年重复的日子：返回 { date:'YYYY-MM-DD', days: 距今天 }，today 当天为 0 */
  function nextAnnual(mmdd, today) {
    today = today || todayStr();
    var seg = String(mmdd).split('-');
    if (seg.length < 2) return null;
    var m = +seg[seg.length - 2];
    var d = +seg[seg.length - 1];
    var t = parseDate(today);
    if (!t || !m || !d) return null;
    var cand = t.y + '-' + pad2(m) + '-' + pad2(d);
    var diff = dayDiff(today, cand);
    if (diff < 0) {
      cand = (t.y + 1) + '-' + pad2(m) + '-' + pad2(d);
      diff = dayDiff(today, cand);
    }
    return { date: cand, days: diff };
  }

  /* 一次性日子：已过返回 null */
  function nextOneTime(dateStr, today) {
    today = today || todayStr();
    var diff = dayDiff(today, dateStr);
    if (diff < 0) return null;
    return { date: dateStr, days: diff };
  }

  function occurrence(ann, today) {
    if (ann.repeat) return nextAnnual(ann.date, today);
    return nextOneTime(ann.date, today);
  }

  function genId() {
    return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function fmtDot(s) { /* YYYY-MM-DD -> YYYY.MM.DD */
    return s ? String(s).replace(/-/g, '.') : '';
  }

  /* ---------- 默认结构 ---------- */
  function defaultPartners() {
    return {
      bro: { key: 'bro', name: '小弟', emoji: '🐶', tag: '男生' },
      sis: { key: 'sis', name: '大哥', emoji: '🐱', tag: '女生' }
    };
  }

  function blank(couple) {
    var c = couple || { name: '小小世界', since: '2025-12-25' };
    return {
      v: 1,
      savedAt: nowStamp(),
      couple: {
        name: c.name || '小小世界',
        since: c.since || '2025-12-25',
        partners: defaultPartners(),
        bound: null
      },
      anniversaries: [],
      memories: [],
      wishes: [],
      notes: []
    };
  }

  /* ---------- 示例数据（首次打开自动预填，可一键清除） ---------- */
  function sample() {
    var d = blank();
    d.couple = { name: '小小世界', since: '2025-12-25', partners: defaultPartners(), bound: null };

    d.memories = [
      {
        id: genId(), date: '2026-09-06', at: '2026-09-06 20:12',
        text: '一起吃了超好吃的火锅，辣到眼泪汪汪但还是好开心！\n回来路上你一直笑我被辣到的样子，哼，下次换我笑你。',
        mood: '😄', photos: [], likedBy: ['sis'], by: 'bro', comments: [
          { id: genId(), by: 'sis', text: '明明是你自己说要吃特辣的～', at: '2026-09-06 21:02' }
        ]
      },
      {
        id: genId(), date: '2026-09-01', at: '2026-09-01 22:40',
        text: '秋天第一次一起散步。风凉凉的，你把手放进我口袋里。\n希望以后的每个秋天都是这样。',
        mood: '✨', photos: [], likedBy: ['bro','sis'], by: 'sis', comments: []
      },
      {
        id: genId(), date: '2026-08-16', at: '2026-08-16 05:32',
        text: '凌晨爬起来去看海边的日出。太阳出来的时候，我们都安静了好久。',
        mood: '🥹', photos: [], likedBy: ['bro','sis'], by: 'bro', comments: []
      },
      {
        id: genId(), date: '2026-07-05', at: '2026-07-05 18:30',
        text: '一起布置了家里的小角落，贴了一面照片墙。这是我们第一个「我们的」角落。',
        mood: '🎉', photos: [], likedBy: ['bro'], by: 'sis', comments: []
      }
    ];

    d.wishes = [
      { id: genId(), text: '一起去迪士尼乐园看烟花', cat: '旅行', wishDate: '2026-01-01', status: 'done', doneDate: '2026-08-20', gaveupDate: null, by: 'bro' },
      { id: genId(), text: '学会做大哥爱吃的糖醋排骨', cat: '做饭', wishDate: '2026-02-14', status: 'open', doneDate: null, gaveupDate: null, by: 'bro' },
      { id: genId(), text: '每天睡前说一句晚安', cat: '体验', wishDate: '2025-12-25', status: 'done', doneDate: '2026-09-01', gaveupDate: null, by: 'sis' },
      { id: genId(), text: '拍一套属于我们俩的写真', cat: '其他', wishDate: '2026-03-08', status: 'gaveup', doneDate: null, gaveupDate: '2026-06-01', by: 'sis' }
    ];

    d.notes = [
      { id: genId(), text: '早安，大哥。今天也要一起加油鸭！', at: '2026-09-07 08:12', by: 'bro', read: false, replies: [] },
      { id: genId(), text: '谢谢你今天陪我去吃火锅，下次换我请你。晚安～', at: '2026-09-06 23:45', by: 'sis', read: true, replies: [
        { id: genId(), by: 'bro', text: '一言为定，拉钩。', at: '2026-09-07 00:02' }
      ] },
      { id: genId(), text: '想把和你在一起的每一天都记下来，所以才有了这个小世界。', at: '2026-09-05 21:03', by: 'bro', read: false, replies: [] }
    ];

    return d;
  }

  /* ---------- 存取 ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || !d.couple || !d.couple.since) return null;
      if (!d.couple.partners) d.couple.partners = defaultPartners();
      d.memories = d.memories || [];
      d.wishes = d.wishes || [];
      d.notes = d.notes || [];
      d.anniversaries = d.anniversaries || [];
      if (!d.couple.bound) {
        var curKey = 'bro';
        try { curKey = localStorage.getItem(CURRENT_KEY) || 'bro'; } catch (e2) {}
        if (curKey !== 'bro' && curKey !== 'sis') curKey = 'bro';
        d.couple.bound = { key: curKey, at: d.savedAt || nowStamp() };
      }
      for (var mi = 0; mi < d.memories.length; mi++) {
        var mm = d.memories[mi];
        if (!Array.isArray(mm.likedBy)) {
          var lb = [];
          if (mm.liked) lb.push('bro');
          if ((mm.likes || 0) >= 2) lb.push('sis');
          mm.likedBy = lb;
        }
        mm.likedBy = mm.likedBy.filter(function (k) { return k === 'bro' || k === 'sis'; });
        delete mm.likes;
        delete mm.liked;
      }
      return d;
    } catch (e) { return null; }
  }

  function save(d) {
    d.savedAt = nowStamp();
    var json = JSON.stringify(d);
    try {
      localStorage.setItem(STORE_KEY, json);
      return true;
    } catch (e) {
      throw new Error('存储失败：可能照片太多占满了浏览器空间。请到设置里「导出备份」，然后清空部分内容。');
    }
  }

  function clear() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  function getCurrent() {
    try { return localStorage.getItem(CURRENT_KEY) || 'bro'; } catch (e) { return 'bro'; }
  }
  function setCurrent(k) {
    try { localStorage.setItem(CURRENT_KEY, k); } catch (e) {}
  }
  function setLastExport(t) {
    try { localStorage.setItem(LAST_EXPORT_KEY, t || nowStamp()); } catch (e) {}
  }
  function getLastExport() {
    try { return localStorage.getItem(LAST_EXPORT_KEY) || ''; } catch (e) { return ''; }
  }
  function addDays(dateStr, n) {
    var p = parseDate(dateStr);
    if (!p) return dateStr;
    var dt = new Date(Date.UTC(p.y, p.m - 1, p.d) + n * 86400000);
    return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
  }

  /* ---------- 导出 / 导入 ---------- */
  function exportData(d) {
    var json = JSON.stringify(d, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '小小世界-备份-' + todayStr().replace(/-/g, '') + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function importFile(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var d = JSON.parse(reader.result);
        if (!d || !d.couple || !d.couple.since) throw new Error('bad');
        if (!Array.isArray(d.memories)) d.memories = [];
        if (!Array.isArray(d.wishes)) d.wishes = [];
        if (!Array.isArray(d.notes)) d.notes = [];
        if (!Array.isArray(d.anniversaries)) d.anniversaries = [];
        if (!d.couple.partners) d.couple.partners = defaultPartners();
        cb(null, d);
      } catch (e) {
        cb(new Error('这个文件看起来不是小小世界的备份哦'));
      }
    };
    reader.onerror = function () { cb(new Error('读取文件失败')); };
    reader.readAsText(file);
  }

  var api = {
    STORE_KEY: STORE_KEY,
    pad2: pad2,
    todayStr: todayStr,
    nowStamp: nowStamp,
    parseDate: parseDate,
    dayDiff: dayDiff,
    daysTogether: daysTogether,
    nextAnnual: nextAnnual,
    nextOneTime: nextOneTime,
    occurrence: occurrence,
    genId: genId,
    fmtDot: fmtDot,
    defaultPartners: defaultPartners,
    blank: blank,
    sample: sample,
    load: load,
    save: save,
    clear: clear,
    getCurrent: getCurrent,
    setCurrent: setCurrent,
    getLastExport: getLastExport,
    setLastExport: setLastExport,
    addDays: addDays,
    exportData: exportData,
    importFile: importFile
  };

  if (typeof window !== 'undefined') window.store = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
