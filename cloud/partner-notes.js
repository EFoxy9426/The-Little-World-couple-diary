/* TA 的小本本 · 前端模块（一期 · A+C 简化版） */
(function () {
  'use strict';

  var CATS = [
    { v: '口味忌口', e: '🍽️' },
    { v: '爱好想要', e: '🎁' },
    { v: '雷区', e: '⚠️' },
    { v: '习惯作息', e: '⏰' },
    { v: '其他', e: '📦' }
  ];
  var VIS = { private: '仅自己可见', requestable: '可申请查看', shared: '已共享' };
  var VIS_DOT = { private: 'dot-private', requestable: 'dot-requestable', shared: 'dot-shared' };
  var STATUS = { pending: '待处理', approved: '已同意', denied: '未同意', cancelled: '已取消' };
  var SUBS = [
    { key: 'my', label: '📒 我的记录' },
    { key: 'about', label: '👀 关于我的' },
    { key: 'access', label: '🔐 申请与授权' }
  ];

  var data = { my_notes: [], about_me: [], requests: [], shares: [], explanations: [] };
  var sub = 'my';
  var loaded = false;
  var expanded = {};

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function toast(msg) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2400);
  }
  function sb() { return window.store && window.store.client ? window.store.client() : null; }
  function me() { return window.store && window.store.me ? window.store.me() : null; }
  function members() { return window.store && window.store.members ? window.store.members() : []; }
  function spaceId() { return window.store && window.store.spaceId ? window.store.spaceId() : null; }
  function nameOf(uid) {
    try {
      var couple = window.store && window.store.couple ? window.store.couple() : null;
      var ownerId = window.store && window.store.ownerId ? window.store.ownerId() : null;
      var key = (ownerId && String(uid) === String(ownerId)) ? 'bro' : 'sis';
      var peer = couple && couple.partners ? couple.partners[key] : null;
      if (peer && peer.name) return (peer.emoji ? peer.emoji + ' ' : '') + peer.name;
    } catch (e) {}
    return 'TA';
  }
  function partner() {
    var m = me(); if (!m) return null;
    var arr = members();
    for (var i = 0; i < arr.length; i++) if (String(arr[i].user_id) !== String(m.id)) return arr[i];
    return null;
  }
  function catOf(v) { for (var i = 0; i < CATS.length; i++) if (CATS[i].v === v) return CATS[i]; return { v: v, e: '📦' }; }
  function findNote(id) { for (var i = 0; i < data.my_notes.length; i++) if (String(data.my_notes[i].id) === String(id)) return data.my_notes[i]; return null; }
  function expsOf(id) { var out = []; for (var i = 0; i < data.explanations.length; i++) if (String(data.explanations[i].note_id) === String(id)) out.push(data.explanations[i]); return out; }
  function pill(text, cls) { return el('span', 'pn-pill ' + (cls || ''), text); }
  function btn(text, cls, fn) { var b = el('button', 'btn small ' + (cls || ''), text); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function scopeText(r) {
    if (r.scope === 'category') return '分类「' + (r.scope_value || '') + '」';
    if (r.scope === 'note') return '单条记录';
    return '整本';
  }

  function load(cb) {
    var c = sb(); if (!c) { toast('云端未连接'); return; }
    c.rpc('partner_notebook_data').then(function (r) {
      if (r.error) { toast('加载失败：' + r.error.message); return; }
      var d = r.data || {};
      data.my_notes = d.my_notes || [];
      data.about_me = d.about_me || [];
      data.requests = d.requests || [];
      data.shares = d.shares || [];
      data.explanations = d.explanations || [];
      loaded = true; render();
      if (cb) cb();
    });
  }

  function pendingForMe() {
    var m = me(), out = [];
    for (var i = 0; i < data.requests.length; i++) {
      var r = data.requests[i];
      if (m && r.status === 'pending' && String(r.owner_id) === String(m.id)) out.push(r);
    }
    return out;
  }

  function render() {
    var box = $('pnRoot'); if (!box) return;
    clear(box);
    var tabs = el('div', 'pn-tabs');
    for (var i = 0; i < SUBS.length; i++) {
      (function (s) {
        var badge = (s.key === 'access') ? pendingForMe().length : 0;
        var b = el('button', 'chip-filter' + (sub === s.key ? ' is-on' : ''), s.label + (badge ? '（' + badge + '）' : ''));
        b.type = 'button';
        b.addEventListener('click', function () { sub = s.key; render(); });
        tabs.appendChild(b);
      })(SUBS[i]);
    }
    box.appendChild(tabs);
    var body = el('div', 'pn-body');
    if (!loaded) body.appendChild(el('div', 'empty', '加载中…'));
    else if (sub === 'my') renderMy(body);
    else if (sub === 'about') renderAbout(body);
    else renderAccess(body);
    box.appendChild(body);
  }

  /* ---------- 我的记录 ---------- */
  function renderMy(body) {
    var bar = el('div', 'pn-actions');
    bar.appendChild(btn('＋ 记一条', 'btn-primary', function () { showNoteSheet(null); }));
    bar.appendChild(btn('🔄', 'btn-ghost', function () { load(); }));
    body.appendChild(bar);
    if (!data.my_notes.length) {
      var e = el('div', 'empty');
      e.appendChild(el('span', 'big', '📒'));
      e.appendChild(document.createTextNode('还没有记录，记下第一个关于 TA 的小细节吧'));
      var eb = el('div', 'pn-actions');
      eb.style.justifyContent = 'center';
      eb.appendChild(btn('＋ 记一条', 'btn-primary', function () { showNoteSheet(null); }));
      e.appendChild(eb);
      body.appendChild(e);
      return;
    }
    for (var i = 0; i < data.my_notes.length; i++) body.appendChild(myCard(data.my_notes[i]));
  }

  function myCard(n) {
    var card = el('div', 'card pn-card pn-clickable');
    var head = el('div', 'pn-head');
    head.appendChild(pill(catOf(n.category).e + ' ' + n.category, 'cat'));
    head.appendChild(pill(VIS[n.visibility] || n.visibility, VIS_DOT[n.visibility] || ''));
    if (n.visibility === 'requestable') head.appendChild(pill(n.existence_visible ? 'TA 可见存在' : 'TA 看不到', 'mini'));
    card.appendChild(head);
    card.appendChild(el('p', 'pn-clamp', n.text));

    var open = !!expanded['my_' + n.id];
    if (!open) {
      card.addEventListener('click', function () { expanded['my_' + n.id] = true; render(); });
    } else {
      if (n.why) card.appendChild(el('p', 'pn-why', '为什么记：' + n.why));
      var exps = expsOf(n.id);
      if (exps.length) {
        var eb = el('div', 'pn-exps');
        eb.appendChild(el('div', 'pn-exps-title', 'TA 的补充说明'));
        for (var i = 0; i < exps.length; i++) eb.appendChild(el('div', 'pn-exp', exps[i].text));
        card.appendChild(eb);
      }
      var acts = el('div', 'pn-actions');
      acts.appendChild(btn('✏️ 编辑', 'btn-ghost', function () { showNoteSheet(n); }));
      acts.appendChild(btn('🗑️ 删除', 'btn-ghost', function () {
        if (!window.confirm('删除这条记录？删除后 TA 也看不到了。')) return;
        sb().from('partner_notes').update({ deleted_at: new Date().toISOString() }).eq('id', n.id).then(function (r) {
          if (r.error) { toast('删除失败：' + r.error.message); return; }
          expanded['my_' + n.id] = false; toast('已删除'); load();
        });
      }));
      card.appendChild(acts);
    }
    return card;
  }

  /* ---------- 底部弹层：新建 / 编辑 ---------- */
  function showNoteSheet(note) {
    var mask = el('div', 'pn-sheet-mask');
    var sheet = el('div', 'pn-sheet');
    var title = el('div', 'pn-sheet-title', note ? '✏️ 编辑记录' : '📝 新记录');
    sheet.appendChild(title);

    var catRow = el('div', 'pn-cat-chips');
    var cat = note ? note.category : CATS[0].v;
    for (var i = 0; i < CATS.length; i++) {
      (function (c) {
        var b = el('button', 'pn-cat-chip' + (cat === c.v ? ' is-on' : ''), c.e + ' ' + c.v);
        b.type = 'button';
        b.addEventListener('click', function () {
          cat = c.v;
          var all = catRow.querySelectorAll('.pn-cat-chip');
          for (var k = 0; k < all.length; k++) all[k].classList.toggle('is-on', all[k].textContent.indexOf(c.v) > -1);
        });
        catRow.appendChild(b);
      })(CATS[i]);
    }
    sheet.appendChild(catRow);

    var ta = el('textarea', 'textarea');
    ta.rows = 3; ta.value = note ? note.text : '';
    ta.placeholder = '例如：不太喜欢吃鱼，点菜时可以避开';
    sheet.appendChild(ta);

    var more = document.createElement('details');
    more.className = 'pn-more';
    var sum = document.createElement('summary');
    sum.textContent = '更多选项（为什么记 / 可见性）';
    more.appendChild(sum);

    var whyIn = el('input', 'input');
    whyIn.value = (note && note.why) ? note.why : '';
    whyIn.placeholder = '为什么记（可选）';
    more.appendChild(whyIn);

    var visSel = el('select', 'input');
    var visOpts = [['requestable', '可申请查看'], ['shared', '直接给 TA 看']];
    var curVis = note ? note.visibility : 'requestable';
    var hasCur = false;
    for (var v = 0; v < visOpts.length; v++) {
      if (visOpts[v][0] === curVis) hasCur = true;
    }
    if (!hasCur) visOpts.push([curVis, '仅自己可见（旧设置）']);
    for (var v2 = 0; v2 < visOpts.length; v2++) {
      var o = el('option'); o.value = visOpts[v2][0]; o.textContent = visOpts[v2][1];
      if (curVis === visOpts[v2][0]) o.selected = true;
      visSel.appendChild(o);
    }
    more.appendChild(visSel);

    var existRow = el('label', 'pn-check');
    var existBox = el('input'); existBox.type = 'checkbox';
    existBox.checked = !!(note && note.existence_visible);
    existRow.appendChild(existBox);
    existRow.appendChild(el('span', '', '对 TA 显示「有关于你的记录」'));
    more.appendChild(existRow);
    function syncExist() { existRow.style.display = (visSel.value === 'requestable') ? 'flex' : 'none'; }
    visSel.addEventListener('change', syncExist); syncExist();
    sheet.appendChild(more);

    var acts = el('div', 'pn-actions');
    acts.appendChild(btn('💾 保存', 'btn-primary', function () {
      var p = partner();
      if (!p) { toast('还没有另一半加入空间'); return; }
      var txt = ta.value.trim();
      if (!txt) { toast('内容不能为空'); return; }
      var payload = {
        space_id: spaceId(), author_id: me().id, about_user_id: p.user_id,
        category: cat, text: txt, why: whyIn.value.trim() || null,
        visibility: visSel.value,
        existence_visible: (visSel.value === 'requestable') ? !!existBox.checked : false
      };
      var c = sb();
      var q = note ? c.from('partner_notes').update(payload).eq('id', note.id) : c.from('partner_notes').insert([payload]);
      q.then(function (r) {
        if (r.error) { toast('保存失败：' + r.error.message); return; }
        close(); toast('已保存'); load();
      });
    }));
    acts.appendChild(btn('取消', 'btn-ghost', function () { close(); }));
    sheet.appendChild(acts);

    function close() { if (mask.parentNode) mask.parentNode.removeChild(mask); if (sheet.parentNode) sheet.parentNode.removeChild(sheet); }
    mask.addEventListener('click', close);
    document.body.appendChild(mask);
    document.body.appendChild(sheet);
  }

  /* ---------- 关于我的 ---------- */
  function renderAbout(body) {
    body.appendChild(el('h3', 'card-sub', 'TA 记录中与你有关的'));
    if (!data.about_me.length) {
      var e = el('div', 'empty');
      e.appendChild(el('span', 'big', '👀'));
      e.appendChild(document.createTextNode('TA 还没有记录与你有关的内容'));
      body.appendChild(e);
    } else {
      var bar = el('div', 'pn-actions');
      bar.appendChild(btn('🙋 申请查看更多（整本 / 按分类）', 'btn-ghost', function () { showApplySheet(); }));
      body.appendChild(bar);
      for (var i = 0; i < data.about_me.length; i++) body.appendChild(aboutCard(data.about_me[i]));
    }
    var m = me(), mine = [];
    for (var k = 0; k < data.requests.length; k++) if (m && String(data.requests[k].requester_id) === String(m.id)) mine.push(data.requests[k]);
    if (mine.length) {
      var d = document.createElement('details');
      d.className = 'pn-more';
      var s = document.createElement('summary');
      s.textContent = '我发出的申请（' + mine.length + '）';
      d.appendChild(s);
      for (var j = 0; j < mine.length; j++) {
        var row = el('div', 'pn-request');
        row.appendChild(pill(mine[j].kind === 'deletion' ? '删除请求' : '查看申请', 'mini'));
        row.appendChild(el('span', '', scopeText(mine[j])));
        row.appendChild(pill(STATUS[mine[j].status] || mine[j].status, 'mini'));
        d.appendChild(row);
      }
      body.appendChild(d);
    }
  }

  function aboutCard(n) {
    var card = el('div', 'card pn-card');
    var head = el('div', 'pn-head');
    head.appendChild(pill(catOf(n.category).e + ' ' + n.category, 'cat'));
    if (n.can_read) head.appendChild(pill('已授权', VIS_DOT.shared));
    card.appendChild(head);
    if (!n.can_read) {
      card.appendChild(el('p', 'pn-shield', 'TA 记录了一条关于你的细节，暂未公开内容。'));
      card.appendChild(btn('🙋 申请查看这一条', 'btn-ghost', function () { askRequest('note', n.id); }));
      return card;
    }
    var open = !!expanded['about_' + n.id];
    card.appendChild(el('p', open ? 'pn-text' : 'pn-clamp', n.text || ''));
    if (!open) {
      card.classList.add('pn-clickable');
      card.addEventListener('click', function () { expanded['about_' + n.id] = true; render(); });
      return card;
    }
    if (n.why) card.appendChild(el('p', 'pn-why', 'TA 为什么记：' + n.why));
    sb().rpc('log_note_view', { p_note_id: n.id });
    var exps = expsOf(n.id);
    if (exps.length) {
      var eb = el('div', 'pn-exps');
      eb.appendChild(el('div', 'pn-exps-title', '我补充过的说明'));
      for (var i = 0; i < exps.length; i++) eb.appendChild(el('div', 'pn-exp', exps[i].text));
      card.appendChild(eb);
    }
    card.appendChild(el('p', 'hint', '这是 TA 的观察，可能不准确。你可以补充说明，但不能修改原文。'));
    card.appendChild(btn('💬 添加说明', 'btn-ghost', function () {
      var txt = window.prompt('补充一句你的说明（TA 能看到）：');
      if (!txt || !txt.trim()) return;
      sb().rpc('add_note_explanation', { p_note_id: n.id, p_text: txt.trim() }).then(function (r) {
        if (r.error) { toast('提交失败：' + r.error.message); return; }
        toast('已提交'); load();
      });
    }));
    return card;
  }

  function showApplySheet() {
    var mask = el('div', 'pn-sheet-mask');
    var sheet = el('div', 'pn-sheet');
    sheet.appendChild(el('div', 'pn-sheet-title', '🙋 申请查看 / 申请删除'));
    sheet.appendChild(el('p', 'hint', '申请什么、是否同意，都由 TA 决定；被拒绝不影响你们其他功能。'));

    var kindSel = el('select', 'input');
    var k1 = el('option'); k1.value = 'access'; k1.textContent = '申请查看';
    var k2 = el('option'); k2.value = 'deletion'; k2.textContent = '请求删除';
    kindSel.appendChild(k1); kindSel.appendChild(k2);
    sheet.appendChild(kindSel);

    var scopeSel = el('select', 'input');
    var s1 = el('option'); s1.value = 'all'; s1.textContent = '整本';
    var s2 = el('option'); s2.value = 'category'; s2.textContent = '按分类';
    var s3 = el('option'); s3.value = 'note'; s3.textContent = '单条记录';
    s3.disabled = (data.about_me.length === 0);
    scopeSel.appendChild(s1); scopeSel.appendChild(s2); scopeSel.appendChild(s3);
    sheet.appendChild(scopeSel);

    var valSel = el('select', 'input');
    valSel.style.display = 'none';
    sheet.appendChild(valSel);

    var msgIn = el('input', 'input');
    msgIn.placeholder = '想说的话（可选）';
    sheet.appendChild(msgIn);

    function fillVal() {
      clear(valSel);
      if (scopeSel.value === 'category') {
        for (var i = 0; i < CATS.length; i++) { var o = el('option'); o.value = CATS[i].v; o.textContent = CATS[i].e + ' ' + CATS[i].v; valSel.appendChild(o); }
        valSel.style.display = 'block';
      } else if (scopeSel.value === 'note') {
        for (var k = 0; k < data.about_me.length; k++) { var n = data.about_me[k]; var on = el('option'); on.value = n.id; on.textContent = n.category; valSel.appendChild(on); }
        valSel.style.display = 'block';
      } else {
        valSel.style.display = 'none';
      }
    }
    scopeSel.addEventListener('change', fillVal); fillVal();

    var acts = el('div', 'pn-actions');
    acts.appendChild(btn('提交申请', 'btn-primary', function () {
      sb().rpc('request_partner_note', {
        p_kind: kindSel.value, p_scope: scopeSel.value,
        p_scope_value: (scopeSel.value === 'all') ? null : valSel.value,
        p_message: msgIn.value.trim() || null
      }).then(function (r) {
        if (r.error) { toast('提交失败：' + r.error.message); return; }
        close(); toast('已提交，等 TA 处理'); load();
      });
    }));
    acts.appendChild(btn('取消', 'btn-ghost', function () { close(); }));
    sheet.appendChild(acts);

    function close() { if (mask.parentNode) mask.parentNode.removeChild(mask); if (sheet.parentNode) sheet.parentNode.removeChild(sheet); }
    mask.addEventListener('click', close);
    document.body.appendChild(mask);
    document.body.appendChild(sheet);
  }

  function askRequest(scope, value) {
    sb().rpc('request_partner_note', { p_kind: 'access', p_scope: scope, p_scope_value: value, p_message: null }).then(function (r) {
      if (r.error) { toast('提交失败：' + r.error.message); return; }
      toast('已提交申请'); load();
    });
  }

  /* ---------- 申请与授权（合并页） ---------- */
  function renderAccess(body) {
    var pend = pendingForMe();
    body.appendChild(el('h3', 'card-sub', '待我处理' + (pend.length ? '（' + pend.length + '）' : '')));
    if (!pend.length) {
      var e = el('div', 'empty');
      e.appendChild(el('span', 'big', '📥'));
      e.appendChild(document.createTextNode('没有待处理的申请'));
      var kb = el('div', 'pn-actions');
      kb.style.justifyContent = 'center';
      kb.appendChild(btn('🔄 刷新', 'btn-ghost', function () { load(); }));
      e.appendChild(kb);
      body.appendChild(e);
    } else {
      for (var i = 0; i < pend.length; i++) body.appendChild(approveCard(pend[i]));
    }

    var m = me(), mine = [];
    for (var k = 0; k < data.shares.length; k++) if (m && String(data.shares[k].granted_by) === String(m.id)) mine.push(data.shares[k]);
    body.appendChild(el('h3', 'card-sub', '我给出的授权'));
    if (!mine.length) {
      body.appendChild(el('p', 'hint', '还没有给出任何授权'));
      return;
    }
    for (var j = 0; j < mine.length; j++) {
      var s = mine[j];
      var note = findNote(s.note_id);
      var card = el('div', 'card pn-card');
      card.appendChild(el('p', 'pn-text', note ? note.text : '（记录已删除）'));
      card.appendChild(el('p', 'pn-why', '授权给 ' + nameOf(s.viewer_id) + ' ｜ ' + (s.expires_at ? ('到期 ' + String(s.expires_at).slice(0, 10)) : '永久')));
      if (s.revoked_at) card.appendChild(pill('已撤销', 'mini'));
      else card.appendChild(btn('🚫 撤销授权', 'btn-ghost', function () {
        if (!window.confirm('撤销后 TA 立刻看不到这条记录，确定吗？')) return;
        sb().rpc('revoke_partner_share', { p_share_id: s.id }).then(function (r) {
          if (r.error) { toast('撤销失败：' + r.error.message); return; }
          toast('已撤销'); load();
        });
      }));
      body.appendChild(card);
    }
  }

  function approveCard(r) {
    var card = el('div', 'card pn-card');
    card.appendChild(el('div', 'pn-sheet-title', (r.kind === 'deletion' ? '🗑️ 删除请求' : '🙋 查看申请') + ' · ' + nameOf(r.requester_id)));
    card.appendChild(el('p', 'pn-why', '范围：' + scopeText(r) + (r.message ? '｜留言：' + r.message : '')));
    var picked = [];
    var listBox = el('div', 'pn-picks');
    for (var i = 0; i < data.my_notes.length; i++) {
      (function (n) {
        var match = (r.scope === 'all') || (r.scope === 'category' && n.category === r.scope_value) || (r.scope === 'note' && String(n.id) === String(r.scope_value));
        var row = el('label', 'pn-check');
        var cb = el('input'); cb.type = 'checkbox'; cb.checked = match;
        if (match) picked.push(n.id);
        cb.addEventListener('change', function () {
          var ix = picked.indexOf(n.id);
          if (cb.checked && ix === -1) picked.push(n.id);
          if (!cb.checked && ix > -1) picked.splice(ix, 1);
        });
        row.appendChild(cb);
        row.appendChild(el('span', '', '【' + n.category + '】' + n.text));
        listBox.appendChild(row);
      })(data.my_notes[i]);
    }
    card.appendChild(listBox);
    var expSel = el('select', 'input');
    var e1 = el('option'); e1.value = '7'; e1.textContent = '授权 7 天';
    var e2 = el('option'); e2.value = '30'; e2.textContent = '授权 30 天';
    var e3 = el('option'); e3.value = '0'; e3.textContent = '永久（可随时撤销）';
    expSel.appendChild(e1); expSel.appendChild(e2); expSel.appendChild(e3);
    card.appendChild(expSel);
    var acts = el('div', 'pn-actions');
    acts.appendChild(btn('✅ 同意', 'btn-primary', function () { respond(r, true, picked, parseInt(expSel.value, 10)); }));
    acts.appendChild(btn('🚫 拒绝', 'btn-ghost', function () { respond(r, false, [], 0); }));
    card.appendChild(acts);
    return card;
  }

  function respond(r, approve, ids, days) {
    sb().rpc('respond_partner_request', {
      p_request_id: r.id, p_approve: approve,
      p_note_ids: (ids && ids.length) ? ids : null, p_expires_days: days
    }).then(function (res) {
      if (res.error) { toast('处理失败：' + res.error.message); return; }
      toast(approve ? '已同意' : '已拒绝'); load();
    });
  }

  /* ---------- 初始化 ---------- */
  function switchSub(next) {
    var love = $('pnLovePane'), book = $('pnRoot');
    if (!love || !book) return;
    var isBook = (next === 'book');
    love.classList.toggle('hidden', isBook);
    book.classList.toggle('hidden', !isBook);
    var btns = document.querySelectorAll('#pnSubtabs [data-pn]');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('is-on', btns[i].getAttribute('data-pn') === next);
    if (isBook && !loaded) load();
  }
  function init() {
    var tabs = $('pnSubtabs'); if (!tabs) return;
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-pn]') : null;
      if (b) switchSub(b.getAttribute('data-pn'));
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.partnerNotesRefresh = function () { if (loaded) load(); };
})();
