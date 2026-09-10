/* ============================================================
   小小世界 · 页面逻辑 app.js
   ============================================================ */
(function () {
  'use strict';

  var store = window.store;
  var S = null;
  var current = store.getCurrent();
  if (current !== 'bro' && current !== 'sis') current = 'bro';

  var moods = [
    { e: '😄', t: '开心' }, { e: '💗', t: '想你' }, { e: '✨', t: '小确幸' },
    { e: '🥹', t: '感动' }, { e: '😢', t: '难过' }, { e: '😠', t: '生气' },
    { e: '🍵', t: '日常' }, { e: '🎉', t: '超棒' }
  ];
  var selectedMood = null;
  var pendingPhotos = [];
  var editingMemId = null;
  var wishFilter = 'all';
  var memMoodFilter = null;
  var memKeyword = '';
  var CATS = [
    { v: '旅行', l: '🎠 一起旅行' },
    { v: '做饭', l: '🍳 一起做饭' },
    { v: '体验', l: '🎬 一起体验' },
    { v: '布置', l: '🏠 一起布置' },
    { v: '其他', l: '🎁 其他' }
  ];
  var AVATARS = ['🐶','🐱','🐰','🐻','🐼','🦊','🐯','🦁','🐨','🐸','🐵','🐷','🐹','🐭','🐧','🐤','🦄','🐙','🦋','🐝','🌻','🍓','🍑','❤️'];
  var ANN_COLORS = ['#ffd93d', '#ff6b6b', '#4ecdc4', '#ffb27d', '#f3a9c0', '#a5d8f0', '#c6bcf0', '#b8e0a8', '#ffd0a0'];
  var ANN_ICONS = ['📌','❤️','🎂','💍','🎉','✈️','🌹','🎄','🥂','🐶','🐱','🌻','🎁','📷','🏠','☀️','🌙','⭐','💐','🏖️','⛰️','🚗','🍜','🎬','🍀','👣'];

  var toastTimer = null;
  var dlgResolve = null;

  /* ---------- 小工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function clearNode(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function bindImg(img, src) {
    if (!store.cloud || !store.getPhotoUrl) { img.src = src; return; }
    store.getPhotoUrl(src, function (url) { img.src = url || src; });
  }
  function pickImages(multiple, cb) {
    var fi = document.createElement('input');
    fi.type = 'file';
    fi.accept = 'image/*';
    if (multiple) fi.multiple = true;
    fi.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
    document.body.appendChild(fi);
    var done = false;
    function cleanup() {
      if (done) return;
      done = true;
      if (fi.parentNode) fi.parentNode.removeChild(fi);
    }
    fi.addEventListener('change', function () {
      var files = fi.files ? Array.prototype.slice.call(fi.files) : [];
      cleanup();
      cb(files);
    });
    fi.addEventListener('cancel', cleanup);
    setTimeout(cleanup, 60000);
    fi.click();
  }

  function closePhotoMenu() {
    var m = $('photoMenu');
    if (m && m.parentNode) m.parentNode.removeChild(m);
    var k = $('photoMenuMask');
    if (k && k.parentNode) k.parentNode.removeChild(k);
  }

  function showPhotoMenu(items) {
    closePhotoMenu();
    var mask = el('div', 'photo-menu-mask');
    mask.id = 'photoMenuMask';
    mask.addEventListener('click', closePhotoMenu);
    var wrap = el('div', 'photo-menu');
    wrap.id = 'photoMenu';
    for (var i = 0; i < items.length; i++) {
      (function (it) {
        var b = el('button', 'photo-menu-btn', it.label);
        b.type = 'button';
        b.addEventListener('click', function () { closePhotoMenu(); it.run(); });
        wrap.appendChild(b);
      })(items[i]);
    }
    var cancel = el('button', 'photo-menu-btn cancel', '取消');
    cancel.type = 'button';
    cancel.addEventListener('click', closePhotoMenu);
    wrap.appendChild(cancel);
    document.body.appendChild(mask);
    document.body.appendChild(wrap);
  }

  function bindLongPress(node, handler) {
    var timer = null, moved = false, sx = 0, sy = 0;
    function start(e) {
      var t = e.touches ? e.touches[0] : e;
      sx = t.clientX; sy = t.clientY; moved = false;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        if (!moved) handler();
      }, 600);
    }
    function move(e) {
      if (!timer) return;
      var t = e.touches ? e.touches[0] : e;
      if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) {
        moved = true; clearTimeout(timer); timer = null;
      }
    }
    function end() { if (timer) { clearTimeout(timer); timer = null; } }
    node.addEventListener('touchstart', start, { passive: true });
    node.addEventListener('touchmove', move, { passive: true });
    node.addEventListener('touchend', end);
    node.addEventListener('touchcancel', end);
    node.addEventListener('mousedown', start);
    node.addEventListener('mousemove', move);
    node.addEventListener('mouseup', end);
    node.addEventListener('mouseleave', end);
    node.addEventListener('contextmenu', function (e) { e.preventDefault(); handler(); });
  }
  function partner(k) { return S.couple.partners[k]; }
  function me() { return partner(current); }
  function addBtn(parent, text, cls, fn, aria) {
    var b = el('button', 'btn ' + (cls || ''), text);
    b.type = 'button';
    if (aria) b.setAttribute('aria-label', aria);
    b.addEventListener('click', function (ev) { ev.stopPropagation(); fn(); });
    parent.appendChild(b);
    return b;
  }
  function persist() {
    try { store.save(S); return true; }
    catch (e) { toast(e.message); return false; }
  }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function ask(title, text, danger) {
    return new Promise(function (resolve) {
      var dlg = $('confirmDlg');
      $('dlgTitle').textContent = title;
      $('dlgText').textContent = text;
      var yesBtn = $('dlgYes');
      yesBtn.classList.toggle('btn-danger', !!danger);
      yesBtn.classList.toggle('btn-primary', !danger);
      dlgResolve = resolve;
      if (typeof dlg.showModal === 'function') {
        if (!dlg.open) dlg.showModal();
      } else {
        var ok = window.confirm(title + '\n' + text);
        finishDlg(ok);
      }
    });
  }
  function finishDlg(v) {
    if (!dlgResolve) return;
    var r = dlgResolve;
    dlgResolve = null;
    var dlg = $('confirmDlg');
    try { if (dlg.open) dlg.close(); } catch (e) {}
    r(v);
  }
  function goTab(key) {
    var tabs = document.querySelectorAll('.tab');
    var views = document.querySelectorAll('.view');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-tab') === key;
      tabs[i].classList.toggle('is-active', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    for (var j = 0; j < views.length; j++) {
      views[j].classList.toggle('is-active', views[j].getAttribute('data-view') === key);
    }
    if (key === 'timeline') renderTimeline();
    else if (key === 'wishes') renderWishes();
    else if (key === 'notes') renderNotes();
    else if (key === 'home') renderHome();
    else if (key === 'settings') renderSettings();
    window.scrollTo(0, 0);
  }

  /* ---------- 头像 / 称呼 ---------- */
  function renderIdentity() {
    var bro = partner('bro'), sis = partner('sis');
    var brand = $('brandName');
    if (brand) brand.textContent = S.couple.name;
    document.title = S.couple.name;
    var hero = $('heroWho');
    if (hero) hero.textContent = bro.name + ' ❤ ' + sis.name + ' 的小小世界';
    var box = $('whoBox');
    if (box) {
      clearNode(box);
      var b = S.couple.bound;
      if (b && partner(b.key)) {
        box.appendChild(el('span', 'who-label', '我是'));
        var chip = el('div', 'who-chip');
        chip.appendChild(el('span', 'ava', partner(b.key).emoji));
        chip.appendChild(el('span', 'who-nick', partner(b.key).name));
        chip.appendChild(el('span', 'who-lock', '🔒'));
        box.appendChild(chip);
      }
    }
    var allAva = document.querySelectorAll('[data-ava]');
    for (var j = 0; j < allAva.length; j++) {
      var key2 = allAva[j].getAttribute('data-ava');
      if (partner(key2)) allAva[j].textContent = partner(key2).emoji;
    }
  }

  /* ---------- 首页 ---------- */
  function renderHome() {
    var since = S.couple.since;
    var today = store.todayStr();
    $('dayNum').textContent = '第 ' + store.daysTogether(since, today) + ' 天';
    $('heroSince').textContent = store.fmtDot(since) + ' 至今';
    $('statMem').textContent = S.memories.length;
    var doneCount = 0;
    for (var i = 0; i < S.wishes.length; i++) if (S.wishes[i].status === 'done') doneCount++;
    $('statWish').textContent = doneCount;
    $('statNote').textContent = S.notes.length;

    var hs = $('homeStats');
    if (hs) {
      clearNode(hs);
      var mKey = today.slice(0, 7);
      var monthCount = 0;
      var moodCount = {};
      for (var mi = 0; mi < S.memories.length; mi++) {
        var mm = S.memories[mi];
        if (mm.mood) moodCount[mm.mood] = (moodCount[mm.mood] || 0) + 1;
        if ((mm.date || '').slice(0, 7) === mKey) monthCount++;
      }
      var topMood = null, topN = 0;
      for (var mk in moodCount) if (moodCount[mk] > topN) { topN = moodCount[mk]; topMood = mk; }
      var topLabel = '';
      for (var mi2 = 0; mi2 < moods.length; mi2++) if (moods[mi2].e === topMood) topLabel = moods[mi2].t;
      hs.appendChild(buildMiniStat(monthCount + ' 条', '本月点滴'));
      hs.appendChild(buildMiniStat(topMood ? topMood + ' ' + topLabel : '—', topMood ? '最常见心情' : '还没有心情记录'));
    }

    var wrap = $('homeAnn');
    clearNode(wrap);
    var list = [{ key: 'core', emoji: '❤️', name: '在一起的纪念日', date: since, repeat: true }];
    for (var a = 0; a < S.anniversaries.length; a++) {
      var ann = S.anniversaries[a];
      list.push({ key: ann.id, emoji: (ann.emoji || '📌'), name: ann.name, date: ann.date, repeat: ann.repeat, color: ann.color });
    }
    var hero = null;
    for (var li = 0; li < list.length; li++) {
      var occ = store.occurrence(list[li], today);
      if (occ && (!hero || occ.days < hero.occ.days)) hero = { item: list[li], occ: occ };
    }
    if (hero) wrap.appendChild(buildAnnHero(hero.item, hero.occ, annColorFor(hero.item)));
    var D = store.daysTogether(since, today);
    wrap.appendChild(buildMilestoneCard(since, today, D));
    var hasOther = false;
    for (var b = 0; b < list.length; b++) {
      if (hero && list[b].key === hero.item.key) continue;
      hasOther = true;
      var item = list[b];
      var occ2 = store.occurrence(item, today);
      var card = el('div', 'ann-card');
      applyAnnBg(card, annColorFor(item), (occ2 && occ2.days === 0) ? 0.3 : 0.16);
      if (!occ2) {
        card.appendChild(el('span', 'ann-emoji', item.emoji));
        card.appendChild(el('span', 'ann-name', item.name));
        card.appendChild(el('span', 'ann-date', store.fmtDot(item.date) + '（今年已过）'));
      } else {
        if (occ2.days === 0) card.classList.add('today');
        card.appendChild(el('span', 'ann-emoji', item.emoji));
        card.appendChild(el('span', 'ann-name', item.name));
        card.appendChild(el('span', 'ann-days', occ2.days === 0 ? '今天！' : '还有 ' + occ2.days + ' 天'));
        card.appendChild(el('span', 'ann-date', store.fmtDot(occ2.date)));
        if (occ2.days === 0) card.appendChild(el('span', 'ann-today-tag', '🎉 就是今天'));
      }
      wrap.appendChild(card);
    }
    if (!hasOther) {
      var tip = el('div', 'empty');
      tip.appendChild(el('span', 'big', '📌'));
      tip.appendChild(document.createTextNode('在设置里还能添加生日、一百天等纪念日哦'));
      wrap.appendChild(tip);
    }
  }
  function renderMoodChips() {
    var box = $('memMoods');
    clearNode(box);
    for (var i = 0; i < moods.length; i++) {
      (function (m) {
        var c = el('button', 'chip', m.e + ' ' + m.t);
        c.type = 'button';
        c.setAttribute('role', 'radio');
        c.setAttribute('aria-checked', 'false');
        c.addEventListener('click', function () {
          selectedMood = (selectedMood === m.e) ? null : m.e;
          renderMoodChips();
        });
        if (selectedMood === m.e) { c.classList.add('is-on'); c.setAttribute('aria-checked', 'true'); }
        box.appendChild(c);
      })(moods[i]);
    }
  }

  function renderPhotoPreview() {
    var box = $('memPhotoPreview');
    clearNode(box);
    for (var i = 0; i < pendingPhotos.length; i++) {
      (function (idx, dataURL) {
        var wrap = el('div', 'photo-thumb');
        var img = el('img');
        img.src = dataURL;
        img.alt = '待添加照片';
        bindLongPress(wrap, function () {
          ask('移除这张照片？', '这张照片还没保存，移除后需要重新选择。', true).then(function (ok) {
            if (!ok) return;
            pendingPhotos.splice(idx, 1);
            renderPhotoPreview();
          });
        });
        wrap.appendChild(img);
        box.appendChild(wrap);
      })(i, pendingPhotos[i]);
    }
    $('memClearPhotos').classList.toggle('hidden', pendingPhotos.length === 0);
  }

  function compressImage(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var MAX = 1080;
        var scale = Math.min(1, MAX / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        cb(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = function () { cb(null); };
      img.src = reader.result;
    };
    reader.onerror = function () { cb(null); };
    reader.readAsDataURL(file);
  }

  function processMemFiles(files) {
    if (!files || files.length === 0) return;
    if (pendingPhotos.length + files.length > 6) { toast('一次最多 6 张照片哦'); return; }
    files.forEach(function (f) {
      if (!f.type || f.type.indexOf('image/') !== 0) return;
      compressImage(f, function (dataURL) {
        if (dataURL) { pendingPhotos.push(dataURL); renderPhotoPreview(); }
      });
    });
  }
  function onMemPhotoChange(ev) {
    processMemFiles(Array.prototype.slice.call(ev.target.files || []));
    ev.target.value = '';
  }

  function renderMemFilterChips() {
    var box = $('memFilterMoods');
    if (!box) return;
    clearNode(box);
    var opts = [{ e: null, t: '全部' }].concat(moods);
    for (var i = 0; i < opts.length; i++) {
      (function (o) {
        var on = memMoodFilter === o.e;
        var c = el('button', 'chip' + (on ? ' is-on' : ''), o.e ? o.e + ' ' + o.t : o.t);
        c.type = 'button';
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
        c.addEventListener('click', function () {
          memMoodFilter = (memMoodFilter === o.e) ? null : o.e;
          renderTimeline();
        });
        box.appendChild(c);
      })(opts[i]);
    }
  }

  function renderTimeline() {
    renderMoodChips();
    renderMemFilterChips();
    var total = S.memories.length;
    var kw = memKeyword ? String(memKeyword).trim().toLowerCase() : '';
    var list = S.memories.filter(function (m) {
      var hitMood = !memMoodFilter || m.mood === memMoodFilter;
      var hitKw = !kw || (m.text || '').toLowerCase().indexOf(kw) !== -1 || (m.mood || '').indexOf(kw) !== -1;
      return hitMood && hitKw;
    }).slice().sort(function (a, b) {
      return a.at < b.at ? 1 : a.at > b.at ? -1 : 0;
    });
    $('memCount').textContent = total ? (list.length + ' / ' + total + ' 条') : '共 0 条';
    var wrap = $('memList');
    clearNode(wrap);
    if (list.length === 0) {
      var empty = el('div', 'empty');
      empty.appendChild(el('span', 'big', total ? '🔍' : '📖'));
      empty.appendChild(document.createTextNode(total ? '没有符合筛选的点滴' : '还没有点滴，把今天的小事记下来吧'));
      wrap.appendChild(empty);
      return;
    }
    var groups = [];
    for (var i = 0; i < list.length; i++) {
      var key = list[i].date.slice(0, 7);
      if (!groups.length || groups[groups.length - 1].key !== key) {
        var parts = key.split('-');
        groups.push({ key: key, label: parts[0] + '年' + (+parts[1]) + '月', items: [] });
      }
      groups[groups.length - 1].items.push(list[i]);
    }
    for (var g = 0; g < groups.length; g++) {
      var group = el('div', 'mem-group');
      group.appendChild(el('h3', 'mem-group-title', groups[g].label));
      for (var m = 0; m < groups[g].items.length; m++) {
        group.appendChild(buildMemCard(groups[g].items[m]));
      }
      wrap.appendChild(group);
    }
  }
  function buildMemCard(mem) {
    var card = el('article', 'card mem-card tilt-card');
    var head = el('div', 'mem-head');
    var who = el('div', 'mem-who');
    who.appendChild(el('span', 'ava', partner(mem.by).emoji));
    who.appendChild(el('span', '', partner(mem.by).name));
    head.appendChild(who);
    head.appendChild(el('span', 'stamp', mem.date));
    if (mem.mood) head.appendChild(el('span', 'mem-mood', mem.mood));
    card.appendChild(head);
    if (mem.text) card.appendChild(el('p', 'mem-text', mem.text));
    if (mem.photos && mem.photos.length) {
      var phWrap = el('div', 'photos');
      for (var p = 0; p < mem.photos.length; p++) {
        (function (idx) {
          var ph = el('div', 'ph' + (mem.photos.length === 1 ? ' single' : ''));
          var img = el('img');
          bindImg(img, mem.photos[idx]);
          img.alt = '点滴照片';
          bindLongPress(ph, function () {
            showPhotoMenu([
              { label: '🔁 替换这张照片', run: function () {
                pickImages(false, function (files) {
                  if (files && files[0]) replaceMemPhoto(mem, idx, files[0]);
                });
              } },
              { label: '🗑️ 删除这张照片', run: function () {
                ask('删除这张照片？', '删除后无法恢复，确定吗？', true).then(function (ok) {
                  if (ok) removeMemPhoto(mem, idx);
                });
              } }
            ]);
          });
          ph.appendChild(img);
          phWrap.appendChild(ph);
        })(p);
      }
      card.appendChild(phWrap);
    }
    var actions = el('div', 'mem-actions');
    var likedByArr = mem.likedBy || [];
    var liked = likedByArr.indexOf(current) !== -1;
    var likeBtn = el('button', 'icon-btn' + (liked ? ' is-liked' : ''), (liked ? '❤ ' : '♡ ') + likedByArr.length);
    likeBtn.type = 'button';
    likeBtn.setAttribute('aria-label', '点赞');
    likeBtn.addEventListener('click', function () {
      var arr = mem.likedBy || (mem.likedBy = []);
      var ix = arr.indexOf(current);
      if (ix === -1) arr.push(current); else arr.splice(ix, 1);
      if (persist()) renderTimeline();
    });
    actions.appendChild(likeBtn);
    var editBtn = el('button', 'icon-btn', '✏️ 改');
    editBtn.type = 'button';
    editBtn.addEventListener('click', function () { startEditMem(mem); });
    actions.appendChild(editBtn);
    var delBtn = el('button', 'icon-btn', '🗑️');
    delBtn.type = 'button';
    delBtn.setAttribute('aria-label', '删除这条点滴');
    delBtn.addEventListener('click', function () {
      ask('删除这条点滴？', '删掉就找不回来啦，确定吗？', true).then(function (ok) {
        if (!ok) return;
        S.memories = S.memories.filter(function (x) { return x.id !== mem.id; });
        if (editingMemId === mem.id) cancelEditMem();
        if (persist()) renderTimeline();
      });
    });
    actions.appendChild(delBtn);
    card.appendChild(actions);

    var cmtBox = el('div', 'comments');
    if (mem.comments && mem.comments.length) {
      for (var c = 0; c < mem.comments.length; c++) {
        var cw = el('div', 'cmt-row');
        cw.appendChild(el('span', 'ava', partner(mem.comments[c].by).emoji));
        var cb = el('div', 'cmt-body');
        cb.appendChild(el('div', '', partner(mem.comments[c].by).name + '：' + mem.comments[c].text));
        cb.appendChild(el('div', 'cmt-meta', mem.comments[c].at));
        cw.appendChild(cb);
        cmtBox.appendChild(cw);
      }
    }
    var addRow = el('div', 'cmt-add');
    var input = el('input');
    input.type = 'text';
    input.placeholder = '说点什么…';
    input.setAttribute('aria-label', '评论内容');
    var send = el('button', 'btn small btn-primary', '发送');
    send.type = 'button';
    function addComment() {
      var v = input.value.trim();
      if (!v) return;
      if (!mem.comments) mem.comments = [];
      mem.comments.push({ id: store.genId(), by: current, text: v, at: store.nowStamp() });
      input.value = '';
      if (persist()) renderTimeline();
    }
    send.addEventListener('click', addComment);
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); addComment(); } });
    addRow.appendChild(input);
    addRow.appendChild(send);
    cmtBox.appendChild(addRow);
    card.appendChild(cmtBox);
    return card;
  }
  function startEditMem(mem) {
    editingMemId = mem.id;
    $('memDate').value = mem.date;
    $('memText').value = mem.text || '';
    selectedMood = mem.mood || null;
    renderMoodChips();
    $('memSubmit').textContent = '💾 保存修改';
    $('memCancelEdit').classList.remove('hidden');
    var compose = document.querySelector('[data-view="timeline"] .compose');
    compose.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('memText').focus();
  }

  function cancelEditMem() {
    editingMemId = null;
    $('memDate').value = store.todayStr();
    $('memText').value = '';
    selectedMood = null;
    pendingPhotos = [];
    renderMoodChips();
    renderPhotoPreview();
    $('memSubmit').textContent = '📌 记下来';
    $('memCancelEdit').classList.add('hidden');
  }

  function submitMem(ev) {
    ev.preventDefault();
    var date = $('memDate').value;
    var text = $('memText').value.trim();
    if (!date) { toast('请选择是哪一天'); return; }
    if (!text && pendingPhotos.length === 0) { toast('写点什么再记下来吧'); return; }
    if (editingMemId) {
      var mem = null;
      for (var i = 0; i < S.memories.length; i++) if (S.memories[i].id === editingMemId) mem = S.memories[i];
      if (mem) {
        mem.date = date;
        mem.at = date + ' ' + store.nowStamp().slice(11);
        mem.text = text;
        mem.mood = selectedMood;
        if (pendingPhotos.length) {
          mem.photos = (mem.photos || []).concat(pendingPhotos);
          pendingPhotos = [];
        }
      }
      if (persist()) { cancelEditMem(); renderTimeline(); toast('改好啦'); }
      return;
    }
    S.memories.push({
      id: store.genId(),
      date: date,
      at: store.nowStamp(),
      text: text,
      mood: selectedMood,
      photos: pendingPhotos.slice(),
      likedBy: [],
      by: current,
      comments: []
    });
    pendingPhotos = [];
    if (persist()) {
      cancelEditMem();
      renderTimeline();
      $('memText').value = '';
      toast('记下来啦 ❤');
    }
  }

  /* ---------- 愿望清单 ---------- */
  function renderWishes() {
    var openCount = 0, doneCount = 0, gaveCount = 0;
    for (var i = 0; i < S.wishes.length; i++) {
      if (S.wishes[i].status === 'done') doneCount++;
      else if (S.wishes[i].status === 'gaveup') gaveCount++;
      else openCount++;
    }
    $('wishStat').textContent = '共 ' + S.wishes.length + ' 个 · 已实现 ' + doneCount + ' 个';
    $('wishAs').textContent = '由「' + me().name + '」许愿';

    var filters = document.querySelectorAll('.chip-filter');
    for (var f = 0; f < filters.length; f++) {
      filters[f].classList.toggle('is-on', filters[f].getAttribute('data-wishfilter') === wishFilter);
    }

    var arr = S.wishes.slice();
    var rank = { open: 0, done: 1, gaveup: 2 };
    arr.sort(function (a, b) {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      var da = a.doneDate || a.gaveupDate || a.wishDate || '';
      var db = b.doneDate || b.gaveupDate || b.wishDate || '';
      return da < db ? 1 : da > db ? -1 : 0;
    });
    var wrap = $('wishList');
    clearNode(wrap);
    var shown = 0;
    for (var w = 0; w < arr.length; w++) {
      if (wishFilter !== 'all' && arr[w].status !== wishFilter) continue;
      shown++;
      wrap.appendChild(buildWishCard(arr[w]));
    }
    if (shown === 0) {
      var empty = el('div', 'empty');
      var msgs = { open: '还没有待实现的愿望，许一个吧', done: '还没有实现的愿望，加油！', gaveup: '还没有放弃过的愿望，真棒', all: '还没有愿望，许一个吧' };
      empty.appendChild(el('span', 'big', '🎯'));
      empty.appendChild(document.createTextNode(msgs[wishFilter] || msgs.all));
      wrap.appendChild(empty);
    }
  }

  function buildWishCard(w) {
    var card = el('article', 'card wish-item tilt-card');
    paintWishView(card, w);
    return card;
  }

  function paintWishView(card, w) {
    card.className = 'card wish-item tilt-card' + (w.status === 'done' ? ' done-card' : w.status === 'gaveup' ? ' gaveup-card' : '');
    clearNode(card);
    var check = el('button', 'wish-check' + (w.status === 'done' ? ' on' : ''), w.status === 'done' ? '✓' : '');
    check.type = 'button';
    check.setAttribute('aria-label', w.status === 'done' ? '恢复为待实现' : '标记为已实现');
    check.addEventListener('click', function () {
      if (w.status === 'done') {
        w.status = 'open'; w.doneDate = null;
        if (persist()) paintWishView(card, w);
      } else if (w.status === 'gaveup') {
        w.status = 'open'; w.gaveupDate = null;
        if (persist()) paintWishView(card, w);
      } else {
        showWishComplete(card, w);
      }
    });
    card.appendChild(check);

    var body = el('div', 'wish-body');
    var line = el('div', '');
    line.appendChild(el('span', 'wish-cat', w.cat));
    body.appendChild(line);
    body.appendChild(el('div', 'wish-text' + (w.status === 'done' ? ' done' : w.status === 'gaveup' ? ' gaveup' : ''), w.text));

    var dates = el('div', 'wish-dates');
    dates.appendChild(el('span', 'stamp', '📅 许愿于 ' + store.fmtDot(w.wishDate)));
    if (w.status === 'done' && w.doneDate) dates.appendChild(el('span', 'stamp', '✅ 完成于 ' + store.fmtDot(w.doneDate)));
    if (w.status === 'gaveup' && w.gaveupDate) dates.appendChild(el('span', 'stamp', '💔 放弃于 ' + store.fmtDot(w.gaveupDate)));
    body.appendChild(dates);

    if ((w.photos || []).length) {
      var phWrap = el('div', 'wish-photos');
      for (var pi = 0; pi < w.photos.length; pi++) {
        (function (idx) {
          var ph = el('div', 'ph');
          var img = el('img');
          bindImg(img, w.photos[idx]);
          img.alt = '愿望照片';
          bindLongPress(ph, function () {
            ask('删除这张照片？', '删除后无法恢复，确定吗？', true).then(function (ok) {
              if (!ok) return;
              if (store.cloud && store.deletePhoto) store.deletePhoto(w.photos[idx]);
              w.photos.splice(idx, 1);
              if (persist()) paintWishView(card, w);
            });
          });
          ph.appendChild(img);
          phWrap.appendChild(ph);
        })(pi);
      }
      body.appendChild(phWrap);
    }

    var acts = el('div', 'wish-actions');
    if (w.status === 'open') {
      addBtn(acts, '✅ 完成啦', 'btn small', function () { showWishComplete(card, w); });
      addBtn(acts, '💔 放弃', 'btn small btn-ghost', function () {
        ask('放弃这个愿望？', '想放弃「' + w.text + '」吗？会记下放弃日期。', false).then(function (ok) {
          if (!ok) return;
          w.status = 'gaveup'; w.gaveupDate = store.todayStr();
          if (persist()) paintWishView(card, w);
        });
      });
    } else if (w.status === 'done') {
      var addWrap = el('div', 'field');
      addWrap.appendChild(el('span', 'label', '加完成照（可选）'));
      var addIn = el('input', 'input file-native');
      addIn.type = 'file';
      addIn.accept = 'image/*';
      addIn.addEventListener('change', function () {
        var files = addIn.files ? Array.prototype.slice.call(addIn.files) : [];
        addIn.value = '';
        if (!files.length) return;
        var first = files[0];
        if (!first.type || first.type.indexOf('image/') !== 0) return;
        compressImage(first, function (dataURL) {
          if (!dataURL) { toast('这张图片读不了，换一张试试'); return; }
          w.photos = w.photos || [];
          w.photos.push(dataURL);
          if (persist()) renderWishes();
        });
      });
      addWrap.appendChild(addIn);
      acts.appendChild(addWrap);
    } else if (w.status === 'gaveup') {
      addBtn(acts, '↩ 重新许愿', 'btn small', function () {
        w.status = 'open'; w.gaveupDate = null;
        if (persist()) paintWishView(card, w);
      });
    }
    addBtn(acts, '✏️ 编辑', 'btn small btn-ghost', function () { showWishEditor(card, w); });
    addBtn(acts, '🗑️ 删除', 'btn small btn-ghost', function () {
      ask('删除这个愿望？', '确定把「' + w.text + '」删掉吗？', true).then(function (ok) {
        if (!ok) return;
        S.wishes = S.wishes.filter(function (x) { return x.id !== w.id; });
        if (persist()) renderWishes();
      });
    });
    body.appendChild(acts);
    card.appendChild(body);
  }

  function showWishComplete(card, w) {
    clearNode(card);
    card.className = 'card wish-edit tilt-card';
    var tmp = [];
    var title = el('h3', 'card-sub', '✅ 完成「' + w.text + '」');
    var note = el('p', 'complete-note', '完成日期默认今天，可改成实际完成的那天；照片可选。');
    var dateField = el('div', 'field');
    dateField.appendChild(el('span', 'label', '完成日期'));
    var doneInput = el('input', 'input');
    doneInput.type = 'date';
    doneInput.value = store.todayStr();
    doneInput.max = store.todayStr();
    dateField.appendChild(doneInput);
    var photoRow = el('div', 'field');
    photoRow.appendChild(el('span', 'label', '照片（可选）'));
    var camIn = el('input', 'input file-native');
    camIn.type = 'file';
    camIn.accept = 'image/*';
    camIn.addEventListener('change', function () {
      var files = camIn.files ? Array.prototype.slice.call(camIn.files) : [];
      camIn.value = '';
      if (!files.length) return;
      var first = files[0];
      if (first.type && first.type.indexOf('image/') === 0) {
        compressImage(first, function (dataURL) {
          if (dataURL) { tmp.push(dataURL); paintPhotos(); }
          else toast('这张图片读不了，换一张试试');
        });
      }
    });
    photoRow.appendChild(camIn);
    var prev = el('div', 'wish-photos');
    function paintPhotos() {
      clearNode(prev);
      for (var i = 0; i < tmp.length; i++) {
        (function (idx) {
          var ph = el('div', 'ph');
          var img = el('img');
          img.src = tmp[idx];
          img.alt = '完成照片';
          bindLongPress(ph, function () {
            ask('移除这张照片？', '移除后需要重新选择。', true).then(function (ok) {
              if (!ok) return;
              tmp.splice(idx, 1);
              paintPhotos();
            });
          });
          ph.appendChild(img);
          prev.appendChild(ph);
        })(i);
      }
    }
    paintPhotos();
    var btnRow = el('div', 'wish-actions');
    addBtn(btnRow, '✓ 确认完成', 'btn btn-primary', function () {
      w.status = 'done';
      w.doneDate = doneInput.value || store.todayStr();
      w.photos = (w.photos || []).concat(tmp);
      if (persist()) renderWishes();
    });
    addBtn(btnRow, '再想想', 'btn btn-ghost', function () { paintWishView(card, w); });
    card.appendChild(title);
    card.appendChild(note);
    card.appendChild(dateField);
    card.appendChild(photoRow);
    card.appendChild(prev);
    card.appendChild(btnRow);
  }

  function showWishEditor(card, w) {
    clearNode(card);
    card.className = 'card wish-edit tilt-card';
    var title = el('h3', 'card-sub', '✏️ 编辑愿望');
    var fText = el('input', 'input');
    fText.value = w.text;
    fText.maxLength = 80;
    var fCat = el('select', 'input');
    for (var i = 0; i < CATS.length; i++) {
      var o = el('option');
      o.value = CATS[i].v;
      o.textContent = CATS[i].l;
      if (CATS[i].v === w.cat) o.selected = true;
      fCat.appendChild(o);
    }
    var fDate = el('input', 'input');
    fDate.type = 'date';
    fDate.value = w.wishDate;
    var fDone = null;
    if (w.status === 'done') {
      fDone = el('input', 'input');
      fDone.type = 'date';
      fDone.value = w.doneDate || '';
      fDone.max = store.todayStr();
    }
    var row1 = el('div', 'field');
    row1.appendChild(el('span', 'label', '愿望内容'));
    row1.appendChild(fText);
    var row2 = el('div', 'form-row');
    var f1 = el('label', 'field');
    f1.appendChild(el('span', 'label', '分类'));
    f1.appendChild(fCat);
    var f2 = el('label', 'field');
    f2.appendChild(el('span', 'label', '许愿日期'));
    f2.appendChild(fDate);
    row2.appendChild(f1);
    row2.appendChild(f2);
    var row3 = null;
    if (fDone) {
      row3 = el('div', 'field');
      row3.appendChild(el('span', 'label', '完成日期'));
      row3.appendChild(fDone);
    }
    var btnRow = el('div', 'wish-actions');
    addBtn(btnRow, '💾 保存', 'btn btn-primary', function () {
      var t = fText.value.trim();
      if (!t) { toast('愿望内容不能为空'); return; }
      w.text = t;
      w.cat = fCat.value;
      if (fDate.value) w.wishDate = fDate.value;
      if (fDone && fDone.value) w.doneDate = fDone.value;
      if (persist()) paintWishView(card, w);
    });
    addBtn(btnRow, '取消', 'btn btn-ghost', function () { paintWishView(card, w); });
    card.appendChild(title);
    card.appendChild(row1);
    card.appendChild(row2);
    if (row3) card.appendChild(row3);
    card.appendChild(btnRow);
  }

  function addWishPhoto(card, w) {
    pickImages(false, function (files) {
      if (!files || !files.length) return;
      var first = files[0];
      if (!first.type || first.type.indexOf('image/') !== 0) return;
      compressImage(first, function (dataURL) {
        if (!dataURL) { toast('这张图片读不了，换一张试试'); return; }
        w.photos = w.photos || [];
        w.photos.push(dataURL);
        if (persist()) renderWishes();
      });
    });
  }
  /* ---------- 悄悄话 ---------- */
  function renderNotes() {
    var changed = false;
    for (var ni = 0; ni < S.notes.length; ni++) {
      var n0 = S.notes[ni];
      if (n0.by !== current && !n0.read) { n0.read = true; changed = true; }
    }
    if (changed) { try { store.save(S); } catch (e) {} }
    $('noteAs').textContent = '这封会署名：' + me().name + ' ' + me().emoji;
    $('noteStampNow').textContent = '现在 ' + store.nowStamp();
    $('noteCount').textContent = '共 ' + S.notes.length + ' 封';
    var arr = S.notes.slice().sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
    var wrap = $('noteList');
    clearNode(wrap);
    if (!arr.length) {
      var empty = el('div', 'empty');
      empty.appendChild(el('span', 'big', '💌'));
      empty.appendChild(document.createTextNode('信箱还空空的，写第一张纸条吧'));
      wrap.appendChild(empty);
      return;
    }
    for (var i = 0; i < arr.length; i++) wrap.appendChild(buildNoteCard(arr[i]));
  }
  function buildNoteCard(n) {
    var card = el('article', 'card note-card tilt-card');
    var head = el('div', 'note-head');
    var who = el('div', 'note-who');
    who.appendChild(el('span', 'ava', partner(n.by).emoji));
    who.appendChild(el('span', '', partner(n.by).name));
    head.appendChild(who);
    var atTag = el('span', 'note-at');
    atTag.appendChild(el('span', 'hl', n.at));
    head.appendChild(atTag);
    card.appendChild(head);
    card.appendChild(el('p', 'note-body', n.text));

    var readBtn = el('button', 'note-read' + (n.read ? ' on' : ''), n.read ? '对方已读 ✓' : '未读');
    readBtn.type = 'button';
    readBtn.addEventListener('click', function () {
      n.read = !n.read;
      if (persist()) renderNotes();
    });
    card.appendChild(readBtn);

    var replyArea = el('div', '');
    if (n.replies && n.replies.length) {
      var box = el('div', 'note-replies');
      for (var r = 0; r < n.replies.length; r++) {
        (function (idx) {
          var rp = n.replies[idx];
          var row = el('div', 'cmt-row');
          row.appendChild(el('span', 'ava', partner(rp.by).emoji));
          var rb = el('div', 'cmt-body');
          rb.appendChild(el('div', '', partner(rp.by).name + '：' + rp.text));
          rb.appendChild(el('div', 'cmt-meta', rp.at));
          row.appendChild(rb);
          var rdel = el('button', 'cmt-del', '✕');
          rdel.type = 'button';
          rdel.setAttribute('aria-label', '删除这条回复');
          rdel.addEventListener('click', function () {
            n.replies.splice(idx, 1);
            if (persist()) renderNotes();
          });
          row.appendChild(rdel);
          box.appendChild(row);
        })(r);
      }
      replyArea.appendChild(box);
    }
    var addRow = el('div', 'cmt-add hidden');
    var input = el('input');
    input.type = 'text';
    input.placeholder = '回复这张纸条…';
    input.setAttribute('aria-label', '回复内容');
    var send = el('button', 'btn small btn-accent', '回复');
    send.type = 'button';
    function doReply() {
      var v = input.value.trim();
      if (!v) return;
      if (!n.replies) n.replies = [];
      n.replies.push({ id: store.genId(), by: current, text: v, at: store.nowStamp() });
      input.value = '';
      if (persist()) renderNotes();
    }
    send.addEventListener('click', doReply);
    input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); doReply(); } });
    addRow.appendChild(input);
    addRow.appendChild(send);
    replyArea.appendChild(addRow);
    card.appendChild(replyArea);

    var acts = el('div', 'note-actions');
    addBtn(acts, '💬 回复', 'btn small btn-ghost', function () {
      addRow.classList.toggle('hidden');
      if (!addRow.classList.contains('hidden')) input.focus();
    });
    addBtn(acts, '🗑️ 删除', 'btn small btn-ghost', function () {
      ask('删除这张纸条？', '纸条会彻底消失，确定吗？', true).then(function (ok) {
        if (!ok) return;
        S.notes = S.notes.filter(function (x) { return x.id !== n.id; });
        if (persist()) renderNotes();
      });
    });
    card.appendChild(acts);
    return card;
  }
  /* ---------- 设置 ---------- */
  function renderSettings() {
    $('setName').value = S.couple.name;
    $('setSince').value = S.couple.since;
    $('broName').value = partner('bro').name;
    $('sisName').value = partner('sis').name;
    $('broEmoji').value = partner('bro').emoji;
    $('sisEmoji').value = partner('sis').emoji;
    renderEmojiPanel('bro');
    renderEmojiPanel('sis');
    renderAnnEmojiPanel();

    var sp = $('spaceLine');
    if (sp) {
      var bytes = 0;
      try { bytes = JSON.stringify(S).length * 2; } catch (e2) {}
      var kb = Math.round(bytes / 1024);
      var txt = kb < 1024 ? ('已用约 ' + kb + ' KB') : ('已用约 ' + (bytes / 1048576).toFixed(2) + ' MB');
      if (bytes > 3670016) {
        sp.textContent = txt + ' ⚠️ 快满了，请导出备份并清理';
        sp.classList.add('warn');
      } else {
        sp.textContent = txt + '（浏览器本地空间有限，建议定期导出）';
        sp.classList.remove('warn');
      }
    }
    var le = $('lastExportLine');
    if (le) {
      var last = store.getLastExport();
      le.textContent = last ? ('上次导出：' + last) : '还没有导出过备份，建议先导出一份更安心';
    }
    renderAnnList();
  }
  function renderAnnList() {
    var wrap = $('annList');
    clearNode(wrap);
    if (!S.anniversaries.length) {
      var empty = el('div', 'empty');
      empty.appendChild(el('span', 'big', '🗓️'));
      empty.appendChild(document.createTextNode('还没有添加其他纪念日'));
      wrap.appendChild(empty);
      return;
    }
    for (var i = 0; i < S.anniversaries.length; i++) {
      (function (ann) {
        var row = el('li', 'ann-row');
        var emoInp = el('select', 'input ann-emoji-inp');
        var curEmo = ann.emoji || '📌';
        var found = false;
        for (var ai = 0; ai < ANN_ICONS.length; ai++) {
          var opt = el('option');
          opt.value = ANN_ICONS[ai];
          opt.textContent = ANN_ICONS[ai];
          if (ANN_ICONS[ai] === curEmo) { opt.selected = true; found = true; }
          emoInp.appendChild(opt);
        }
        if (!found) {
          var opt2 = el('option');
          opt2.value = curEmo;
          opt2.textContent = curEmo;
          opt2.selected = true;
          emoInp.appendChild(opt2);
        }
        emoInp.setAttribute('aria-label', '纪念日图标');
        emoInp.title = '选择图标';
        emoInp.addEventListener('change', function () {
          ann.emoji = emoInp.value;
          if (persist()) { renderAnnList(); renderHome(); toast('图标已更新'); }
        });
        row.appendChild(emoInp);
        row.appendChild(el('span', 'ann-name', ann.name));
        row.appendChild(el('span', 'ann-info', store.fmtDot(ann.date) + (ann.repeat ? '（每年）' : '')));
        var del = el('button', 'mini-btn danger', '删除');
        del.type = 'button';
        del.addEventListener('click', function () {
          ask('删除这个纪念日？', '确定删除「' + ann.name + '」吗？', true).then(function (ok) {
            if (!ok) return;
            S.anniversaries = S.anniversaries.filter(function (x) { return x.id !== ann.id; });
            if (persist()) renderAnnList();
          });
        });
        row.appendChild(del);
        wrap.appendChild(row);
      })(S.anniversaries[i]);
    }
  }
  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    /* 导航 */
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () { goTab(this.getAttribute('data-tab')); });
    }
    document.addEventListener('click', function (ev) {
      var target = ev.target.closest ? ev.target.closest('[data-goto]') : null;
      if (target) goTab(target.getAttribute('data-goto'));
    });

    /* 身份绑定：首次进入选择，之后锁定 */
    var bindBtns = document.querySelectorAll('[data-bindkey]');
    for (var w = 0; w < bindBtns.length; w++) {
      bindBtns[w].addEventListener('click', function () {
        var k = this.getAttribute('data-bindkey');
        S.couple.bound = { key: k, at: store.nowStamp() };
        current = k;
        store.setCurrent(k);
        if (persist()) {
          $('bindOverlay').classList.add('hidden');
          renderAll();
          toast('已绑定为「' + partner(k).name + '」，之后不再自由切换');
        }
      });
    }


    /* PWA 安装到桌面 */
    (function () {
      var btn = $('btnInstallApp');
      var standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
      if (standalone && btn) btn.classList.add('hidden');
      window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        window.__xxInstall = e;
        if (btn) btn.classList.remove('hidden');
      });
      if (btn) {
        btn.addEventListener('click', function () {
          var ev = window.__xxInstall;
          if (!ev) { toast('请用浏览器菜单里的「安装应用 / 添加到主屏幕」'); return; }
          ev.prompt();
          ev.userChoice.then(function () {
            window.__xxInstall = null;
            btn.classList.add('hidden');
          });
        });
      }
    })();

    /* 首页快速记录 */
    $('btnQuickNote').addEventListener('click', function () {
      goTab('timeline');
      var t = $('memText');
      if (t) t.focus();
    });

    /* 点滴 */
    $('memForm').addEventListener('submit', submitMem);
    $('memPhotoInput').addEventListener('change', onMemPhotoChange);
    var memPhotoBtn = $('memPhotoBtn');
    if (memPhotoBtn) memPhotoBtn.addEventListener('click', function () { pickImages(true, processMemFiles); });
    $('memClearPhotos').addEventListener('click', function () { pendingPhotos = []; renderPhotoPreview(); });
    $('memCancelEdit').addEventListener('click', cancelEditMem);
    $('memDate').addEventListener('change', function () {});
    $('memDate').value = store.todayStr();
    $('memDate').max = store.todayStr();
    $('memDate').min = S.couple.since;
    $('wishDate').value = store.todayStr();

    /* 愿望 */
    $('wishForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var text = $('wishText').value.trim();
      var date = $('wishDate').value;
      if (!text) { toast('写一下想一起做的事吧'); return; }
      S.wishes.push({
        id: store.genId(), text: text, cat: $('wishCat').value,
        wishDate: date || store.todayStr(), status: 'open',
        photos: [], doneDate: null, gaveupDate: null, by: current
      });
      $('wishText').value = '';
      if (persist()) { renderWishes(); toast('愿望许下啦 🎯'); }
    });
    var filters = document.querySelectorAll('.chip-filter');
    for (var f = 0; f < filters.length; f++) {
      filters[f].addEventListener('click', function () {
        wishFilter = this.getAttribute('data-wishfilter');
        renderWishes();
      });
    }

    /* 悄悄话 */
    $('noteForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var text = $('noteText').value.trim();
      if (!text) { toast('写点什么再寄出去吧'); return; }
      S.notes.push({ id: store.genId(), text: text, at: store.nowStamp(), by: current, read: false, replies: [] });
      $('noteText').value = '';
      if (persist()) { renderNotes(); toast('纸条寄出去啦 💌'); }
    });

    /* 设置：名字与日子 */
    $('btnSaveCouple').addEventListener('click', function () {
      var name = $('setName').value.trim();
      var since = $('setSince').value;
      if (!name) { toast('网站名字不能空'); return; }
      if (!since) { toast('请选择在一起的日子'); return; }
      if (since > store.todayStr()) { toast('在一起的日子不能在未来哦'); return; }
      S.couple.name = name;
      S.couple.since = since;
      $('memDate').min = since;
      if (persist()) { renderIdentity(); renderHome(); toast('保存好啦'); }
    });

    /* 设置：我们俩 */
    $('btnSavePartners').addEventListener('click', function () {
      var pairs = [
        { k: 'bro', name: $('broName').value.trim(), emoji: $('broEmoji').value.trim() },
        { k: 'sis', name: $('sisName').value.trim(), emoji: $('sisEmoji').value.trim() }
      ];
      for (var i = 0; i < pairs.length; i++) {
        var p = pairs[i];
        if (!p.name) { toast('称呼不能为空'); return; }
        S.couple.partners[p.k].name = p.name;
        if (p.emoji) S.couple.partners[p.k].emoji = p.emoji;
      }
      if (persist()) { renderIdentity(); toast('保存好啦'); }
    });

    /* 设置：纪念日 */
    $('annForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var name = $('annName').value.trim();
      var date = $('annDate').value;
      if (!name) { toast('给纪念日起个名字'); return; }
      if (!date) { toast('选择纪念日日期'); return; }
      var emo = ($('annEmoji').value || '').trim() || '📌';
      S.anniversaries.push({ id: store.genId(), name: name, date: date, repeat: $('annRepeat').checked, emoji: emo, color: randAnnColor() });
      $('annName').value = '';
      $('annDate').value = '';
      $('annEmoji').value = '📌';
      renderAnnEmojiPanel();
      $('annRepeat').checked = true;
      if (persist()) { renderAnnList(); renderHome(); toast('添加好啦'); }
    });

    /* 设置：数据 */
    $('btnExport').addEventListener('click', function () {
      var json = JSON.stringify(S, null, 2);
      var fname = '小小世界-备份-' + store.todayStr().replace(/-/g, '') + '.json';
      if (window.showSaveFilePicker) {
        window.showSaveFilePicker({
          suggestedName: fname,
          types: [{ description: 'JSON 备份', accept: { 'application/json': ['.json'] } }]
        }).then(function (handle) {
          return handle.createWritable().then(function (w) {
            return w.write(json).then(function () { return w.close(); });
          });
        }).then(function () {
          store.setLastExport(store.nowStamp());
          renderSettings();
          toast('备份已保存，记得再放一份到网盘更安心 ✔');
        }).catch(function (err) {
          if (err && err.name === 'AbortError') return;
          toast('保存失败：' + (err && err.message ? err.message : '未知错误'));
        });
      } else {
        try {
          store.exportData(S);
          store.setLastExport(store.nowStamp());
          renderSettings();
          toast('已开始下载：文件在浏览器的「下载」文件夹 ⬇️');
        } catch (e) { toast('导出失败：' + e.message); }
      }
    });
    $('btnImport').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (!file) return;
      store.importFile(file, function (err, data) {
        if (err) { toast(err.message); return; }
        S = data;
        persist();
        renderAll();
        toast('导入成功，回忆回来啦 🎉');
      });
      ev.target.value = '';
    });
    $('btnSample').addEventListener('click', function () {
      ask('恢复示例数据？', '当前所有记录会被示例数据覆盖，建议先导出备份。确定继续吗？', true).then(function (ok) {
        if (!ok) return;
        S = store.sample();
        persist();
        renderAll();
        toast('已恢复示例数据');
      });
    });
    $('btnWipe').addEventListener('click', function () {
      ask('清空所有记录？', '点滴、愿望、悄悄话都会被清空（保留我们的名字和日子）。此操作无法撤销！', true).then(function (ok) {
        if (!ok) return;
        S = store.blank(S.couple);
        persist();
        renderAll();
        toast('已清空记录');
      });
    });

    /* 弹窗按钮 */
    $('dlgNo').addEventListener('click', function () { finishDlg(false); });
    $('dlgYes').addEventListener('click', function () { finishDlg(true); });
    var dlg = $('confirmDlg');
    if (dlg.addEventListener) dlg.addEventListener('close', function () { finishDlg(false); });
  }

  function renderAll() {
    renderIdentity();
    renderHome();
    renderTimeline();
    renderWishes();
    renderNotes();
    renderSettings();
  }

  /* ---------- 启动 ---------- */
  if (store.cloud) {
    store.boot(function () {
      S = store.load();
      if (!S) { S = store.blankCloud(); store.save(S); }
      if (S.couple && S.couple.bound) current = S.couple.bound.key;
      renderAll();
      bindEvents();
      if (store.onData) {
        store.onData(function () {
          S = store.load();
          if (S && S.couple && S.couple.bound) current = S.couple.bound.key;
          renderAll();
          toast('收到新更新，已同步');
        });
      }
    });
  } else {
    S = store.load();
    if (!S) { S = store.sample(); store.save(S); }
    if (!S.couple.bound) {
      var qWho = /[?&]who=(bro|sis)/.exec(window.location.search);
      if (qWho) {
        S.couple.bound = { key: qWho[1], at: store.nowStamp() };
        current = qWho[1];
        try { store.save(S); } catch (e3) {}
      }
    }
    if (S.couple.bound) current = S.couple.bound.key;
    renderAll();
    bindEvents();
    if (!S.couple.bound) {
      var ov = $('bindOverlay');
      if (ov) ov.classList.remove('hidden');
    }
  }

  /* ---------- A 组：照片删/换、emoji 面板、搜索监听 ---------- */
  function removeMemPhoto(mem, idx) {
    if (!mem.photos) return;
    var old = mem.photos[idx];
    if (old && store.cloud && store.deletePhoto) store.deletePhoto(old);
    mem.photos.splice(idx, 1);
    if (persist()) renderTimeline();
  }
  function replaceMemPhoto(mem, idx, file) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) { toast('请选择图片文件'); return; }
    compressImage(file, function (dataURL) {
      if (!dataURL) { toast('这张图片读不了，换一张试试'); return; }
      if (store.cloud && store.deletePhoto && mem.photos[idx]) store.deletePhoto(mem.photos[idx]);
      mem.photos[idx] = dataURL;
      if (persist()) renderTimeline();
    });
  }
  function renderEmojiPanel(key) {
    var box = $('emojiPanel-' + key);
    if (!box) return;
    clearNode(box);
    for (var i = 0; i < AVATARS.length; i++) {
      (function (e) {
        var on = partner(key).emoji === e;
        var b = el('button', 'emoji-opt' + (on ? ' is-on' : ''), e);
        b.type = 'button';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.setAttribute('aria-label', '选择头像 ' + e);
        b.addEventListener('click', function () {
          S.couple.partners[key].emoji = e;
          $('broEmoji').value = S.couple.partners.bro.emoji;
          $('sisEmoji').value = S.couple.partners.sis.emoji;
          if (persist()) {
            renderIdentity();
            renderEmojiPanel('bro');
            renderEmojiPanel('sis');
            toast('头像已换成 ' + e);
          }
        });
        box.appendChild(b);
      })(AVATARS[i]);
    }
  }
  function bindEmojiInputs() {
    function bindOne(key) {
      var inp = $(key === 'bro' ? 'broEmoji' : 'sisEmoji');
      if (!inp) return;
      inp.addEventListener('input', function () {
        var v = inp.value.trim();
        if (v) {
          var ava = document.querySelector('[data-ava="' + key + '"]');
          if (ava) ava.textContent = v;
        }
      });
    }
    bindOne('bro');
    bindOne('sis');
  }
  var memSearchBox = $('memSearch');
  if (memSearchBox) {
    memSearchBox.addEventListener('input', function () {
      memKeyword = memSearchBox.value;
      renderTimeline();
    });
  }
  bindEmojiInputs();
  setTimeout(maybeRemindExport, 1200);

  /* ---------- B 组：里程碑 / 小结 / 纪念日配色 / 导出提醒 ---------- */
  function hexToRgba(hex, alpha) {
    var m = /^#([0-9a-fA-F]{6})$/.exec(hex);
    if (!m) return 'rgba(255,217,61,' + alpha + ')';
    var n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }
  function hashColor(seed) {
    var s = String(seed || '');
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return ANN_COLORS[h % ANN_COLORS.length];
  }
  function randAnnColor() {
    return ANN_COLORS[Math.floor(Math.random() * ANN_COLORS.length)];
  }
  function applyAnnBg(card, hex, alpha) {
    card.style.backgroundColor = hexToRgba(hex, alpha || 0.16);
  }
  function annColorFor(item) {
    if (item && item.color) return item.color;
    if (item && item.key === 'core') return hashColor('core|' + item.date);
    if (item && item.id) return hashColor('ann|' + item.id);
    return '#ffd93d';
  }
  function buildMiniStat(num, label) {
    var card = el('div', 'stat-card');
    card.appendChild(el('span', 'stat-num', String(num)));
    card.appendChild(el('span', 'stat-label', label));
    return card;
  }
  function buildAnnHero(item, occ, col) {
    var card = el('div', 'ann-card ann-hero' + (occ.days === 0 ? ' today' : ''));
    applyAnnBg(card, col, occ.days === 0 ? 0.3 : 0.18);
    card.appendChild(el('span', 'ann-emoji', item.emoji));
    card.appendChild(el('span', 'ann-name', item.name));
    if (occ.days === 0) {
      card.appendChild(el('span', 'ann-days', '就是今天！'));
      card.appendChild(el('span', 'ann-date', store.fmtDot(occ.date)));
      card.appendChild(el('span', 'ann-today-tag', '🎉 就是今天'));
    } else {
      card.appendChild(el('span', 'ann-days', '还有 ' + occ.days + ' 天'));
      card.appendChild(el('span', 'ann-date', store.fmtDot(occ.date)));
    }
    return card;
  }
  function buildMilestoneCard(since, today, D) {
    var card = el('div', 'ann-card milestone-card');
    applyAnnBg(card, hashColor('ms|' + since), 0.16);
    var next = (D % 100 === 0) ? D + 100 : Math.ceil(D / 100) * 100;
    var date = store.addDays(since, next - 1);
    var left = store.dayDiff(today, date);
    card.appendChild(el('span', 'ann-emoji', '🏁'));
    card.appendChild(el('span', 'ann-name', '里程碑：在一起 ' + next + ' 天'));
    card.appendChild(el('span', 'ann-days', left === 0 ? '就是今天！' : '还有 ' + left + ' 天'));
    card.appendChild(el('span', 'ann-date', store.fmtDot(date)));
    var done = [];
    for (var k = 100; k < D; k += 100) done.push(k + '天');
    if (done.length) card.appendChild(el('span', 'ann-past', '已走过：' + done.join('、')));
    return card;
  }
  function maybeRemindExport() {
    var last = store.getLastExport();
    if (!last) return;
    var dd = store.dayDiff(String(last).slice(0, 10), store.todayStr());
    if (dd >= 7) toast('距上次导出已 ' + dd + ' 天，去「设置 → 导出备份」更安心');
  }

  function renderAnnEmojiPanel() {
    var box = $('annEmojiPanel');
    if (!box) return;
    clearNode(box);
    var current = ($('annEmoji').value || '📌').trim();
    for (var i = 0; i < ANN_ICONS.length; i++) {
      (function (ic) {
        var on = current === ic;
        var b = el('button', 'emoji-opt' + (on ? ' is-on' : ''), ic);
        b.type = 'button';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.addEventListener('click', function () {
          $('annEmoji').value = ic;
          renderAnnEmojiPanel();
        });
        box.appendChild(b);
      })(ANN_ICONS[i]);
    }
  }

  /* 支持 ?tab=xxx 直达某个页面 */
  var qs = window.location.search;
  var tabMatch = /[?&]tab=([a-z]+)/.exec(qs);
  if (tabMatch) {
    var keys = { home: 1, timeline: 1, wishes: 1, notes: 1, settings: 1 };
    if (keys[tabMatch[1]]) goTab(tabMatch[1]);
  }

})();
