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
  var lastJson = '';
  var pollTimer = null;

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
      var roles = couple && couple.roles ? couple.roles : null;
      var key = 'sis';
      if (roles && String(roles.bro) === String(uid)) key = 'bro';
      else if (roles && String(roles.sis) === String(uid)) key = 'sis';
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
  function myRoleKey() {
    try {
      var c = window.store && window.store.couple ? window.store.couple() : null;
      var m = me();
      var roles = c && c.roles ? c.roles : {};
      if (roles && String(roles.bro) === String(m.id)) return 'bro';
      return 'sis';
    } catch (e) { return 'sis'; }
  }
  function pushKeyOf(role) {
    try {
      var c = window.store && window.store.couple ? window.store.couple() : null;
      var keys = c && c.pushKeys ? c.pushKeys : {};
      return keys[role] || '';
    } catch (e) { return ''; }
  }
  function sendNotify(key, title, desp, cb) {
    var c = sb(); if (!c) { if (cb) cb({ ok: false, error: '云端未连接' }); return; }
    c.auth.getSession().then(function (r) {
      var token = (r && r.data && r.data.session) ? r.data.session.access_token : '';
      if (!token) { if (cb) cb({ ok: false, error: '登录已过期' }); return; }
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ key: key || '', title: title, desp: desp })
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (j) {
          var out = { ok: res.ok && j.ok !== false, status: res.status, body: j };
          if (!out.ok) console.warn('[推送失败]', out);
          if (cb) cb(out);
        });
      }).catch(function (e) {
        console.warn('[推送请求失败]', e);
        if (cb) cb({ ok: false, error: e.message });
      });
    });
  }
  function notify(title, desp, target, cb) {
    target = target || 'other';
    var myRole = myRoleKey();
    var otherRole = (myRole === 'bro') ? 'sis' : 'bro';
    var recipients = [];
    if (target === 'me') recipients = [myRole];
    else if (target === 'both') recipients = [myRole, otherRole];
    else recipients = [otherRole];
    var keys = [];
    for (var i = 0; i < recipients.length; i++) {
      var k = pushKeyOf(recipients[i]);
      if (k) keys.push(k);
    }
    if (!keys.length) {
      // 没有配置各自 Key → 回退到服务端环境变量里的 Key（原来那套）
      sendNotify('', title, desp, cb);
      return;
    }
    for (var j = 0; j < keys.length; j++) sendNotify(keys[j], title, desp, j === 0 ? cb : null);
  }
  window.xxNotify = function (title, desp, target) { notify(title, desp, target || 'other'); };
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
      var j = JSON.stringify(d);
      if (loaded && j === lastJson) { if (cb) cb(); return; }
      lastJson = j;
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
        existence_visible: (visSel.value === 'requestable')
      };
      var c = sb();
      var q = note ? c.from('partner_notes').update(payload).eq('id', note.id) : c.from('partner_notes').insert([payload]);
      q.then(function (r) {
        if (r.error) { toast('保存失败：' + r.error.message); return; }
        close(); toast('已保存'); if (visSel.value === 'requestable') notify('TA 记录了一条关于你的细节', 'TA 在小本本里记了一条和你有关的内容，去「关于我的」看看'); load();
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
      var myReq = null;
      var mm = me();
      for (var ri = 0; ri < data.requests.length; ri++) {
        var rq = data.requests[ri];
        if (mm && String(rq.requester_id) === String(mm.id) && rq.kind === 'access' && rq.scope === 'note' && String(rq.scope_value) === String(n.id)) {
          if (!myReq || String(rq.created_at) > String(myReq.created_at)) myReq = rq;
        }
      }
      if (myReq && myReq.status === 'pending') {
        card.appendChild(pill('已申请，等待 TA 处理', 'mini'));
      } else {
        if (myReq && myReq.status === 'denied') card.appendChild(pill('TA 暂未同意（可再次申请）', 'mini'));
        card.appendChild(btn('🙋 申请查看这一条', 'btn-ghost', function () { askRequest('note', n.id); }));
      }
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
        toast('已提交'); notify('TA 补充了一条说明', 'TA 对你记录里的一条内容做了补充说明'); load();
      });
    }));
    return card;
  }

  function askRequest(scope, value) {
    sb().rpc('request_partner_note', { p_kind: 'access', p_scope: scope, p_scope_value: value, p_message: null }).then(function (r) {
      if (r.error) { toast('提交失败：' + r.error.message); return; }
      toast('已提交申请'); notify('TA 申请查看你的小本本', '有人申请查看你的记录，去「TA 的小本本 → 申请与授权」处理吧'); load();
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
          toast('已撤销'); notify('一条授权已被撤销', 'TA 撤销了你对小本本某条记录的查看授权'); load();
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
      toast(approve ? '已同意' : '已拒绝'); notify('小本本申请已处理', approve ? 'TA 同意了你的申请，去看看吧' : 'TA 暂时没有同意这次申请'); load();
    });
  }

  /* ---------- 初始化 ---------- */
  function startPoll() {
    stopPoll();
    pollTimer = setInterval(function () { if (!document.hidden && loaded) load(); }, 5000);
  }
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  function switchSub(next) {
    var love = $('pnLovePane'), book = $('pnRoot');
    if (!love || !book) return;
    var isBook = (next === 'book');
    love.classList.toggle('hidden', isBook);
    book.classList.toggle('hidden', !isBook);
    var btns = document.querySelectorAll('#pnSubtabs [data-pn]');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('is-on', btns[i].getAttribute('data-pn') === next);
    if (isBook) { load(); startPoll(); } else { stopPoll(); }
  }
  function ensureBanner() {
    var bar = $('pnBanner');
    if (bar) return bar;
    bar = el('div', 'pn-banner hidden');
    bar.id = 'pnBanner';
    var txt = el('span', 'pn-banner-text', '');
    txt.id = 'pnBannerText';
    bar.appendChild(txt);
    var go = el('button', 'pn-banner-btn', '查看');
    go.type = 'button';
    go.addEventListener('click', function () {
      var tab = document.querySelector('.tab[data-tab="notes"]');
      if (tab) tab.click();
      sub = 'access';
      render();
    });
    bar.appendChild(go);
    var close = el('button', 'pn-banner-close', '✕');
    close.type = 'button';
    close.addEventListener('click', function () { bar.classList.add('hidden'); });
    bar.appendChild(close);
    var tb = document.querySelector('.tabbar');
    if (tb && tb.parentNode) tb.parentNode.insertBefore(bar, tb.nextSibling);
    else document.body.appendChild(bar);
    return bar;
  }

  function refreshBadge() {
    var c = sb(); if (!c) return;
    c.rpc('partner_notebook_data').then(function (r) {
      if (r.error || !r.data) return;
      var d = r.data;
      var m = me();
      var pending = 0, shielded = 0;
      var reqs = d.requests || [];
      for (var i = 0; i < reqs.length; i++) {
        if (m && reqs[i].status === 'pending' && String(reqs[i].owner_id) === String(m.id)) pending++;
      }
      var abouts = d.about_me || [];
      for (var k = 0; k < abouts.length; k++) {
        if (abouts[k].can_read === false) {
          var has = false;
          for (var j = 0; j < reqs.length; j++) {
            if (String(reqs[j].scope_value) === String(abouts[k].id) && reqs[j].status === 'pending') has = true;
          }
          if (!has) shielded++;
        }
      }
      var total = pending + shielded;
      var tab = document.querySelector('.tab[data-tab="notes"]');
      if (tab) {
        var badge = tab.querySelector('.tab-badge');
        if (!badge) { badge = el('span', 'tab-badge'); tab.appendChild(badge); }
        badge.textContent = String(total);
        badge.style.display = total > 0 ? '' : 'none';
      }
      var bar = ensureBanner();
      var txt = $('pnBannerText');
      if (total > 0) {
        if (txt) txt.textContent = pending > 0 ? ('有 ' + pending + ' 条申请待你处理' + (shielded ? '，另有 ' + shielded + ' 条关于你' : '')) : ('TA 记录了 ' + shielded + ' 条关于你的细节');
        bar.classList.remove('hidden');
      } else {
        bar.classList.add('hidden');
      }
    });
  }

  function checkAnniversaries() {
    try {
      var st = window.store && window.store.load ? window.store.load() : null;
      if (!st || !st.couple) return;
      var today = window.store.todayStr();
      var list = [{ key: 'core', name: '在一起的纪念日', date: st.couple.since, repeat: true }];
      var arr = st.anniversaries || [];
      for (var i = 0; i < arr.length; i++) {
        list.push({ key: arr[i].id, name: arr[i].name, date: arr[i].date, repeat: arr[i].repeat });
      }
      var marks = [30, 7, 3, 1, 0];
      for (var k = 0; k < list.length; k++) {
        var occ = window.store.occurrence(list[k], today);
        if (!occ) continue;
        for (var m = 0; m < marks.length; m++) {
          if (occ.days !== marks[m]) continue;
          var dk = 'xx_ann_' + list[k].key + '_' + marks[m] + '_' + today;
          if (localStorage.getItem(dk)) continue;
          localStorage.setItem(dk, '1');
          var when = (marks[m] === 0) ? '就是今天' : ('还有 ' + marks[m] + ' 天');
          notify('📌 ' + list[k].name + ' ' + when, '日期：' + window.store.fmtDot(occ.date), 'both');
        }
      }
    } catch (e) {}
  }

  function init() {
    var tabs = $('pnSubtabs'); if (!tabs) return;
    refreshBadge();
    setInterval(refreshBadge, 20000);
    var tn = document.getElementById('btnTestNotify');
    if (tn) tn.addEventListener('click', function () {
      toast('正在发送测试推送…');
      notify('小小世界 · 测试推送', '如果你在微信收到这条消息，说明推送配置成功 ✅', 'me', function (res) {
        if (res && res.ok) toast('测试推送已发送，请查看微信 ✔');
        else toast('推送失败：' + ((res && (res.error || (res.body && res.body.error))) || ('HTTP ' + ((res && res.status) || '?'))));
      });
    });
    setTimeout(checkAnniversaries, 4000);
    setInterval(checkAnniversaries, 6 * 3600 * 1000);
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-pn]') : null;
      if (b) switchSub(b.getAttribute('data-pn'));
    });
  }
  window.addEventListener('focus', function () { if (loaded && !$('pnRoot').classList.contains('hidden')) load(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.partnerNotesRefresh = function () { if (loaded) load(); };
})();
