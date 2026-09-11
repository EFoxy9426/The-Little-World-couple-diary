/* TA 的小本本 · 云端前端模块（一期） */
(function () {
  'use strict';

  var CATS = ['口味忌口', '爱好想要', '雷区', '习惯作息', '其他'];
  var VIS_LABEL = { private: '仅自己可见', requestable: '可申请查看', shared: '直接共享' };
  var STATUS_LABEL = { pending: '待处理', approved: '已同意', denied: '未同意', cancelled: '已取消' };
  var SUBS = [
    { key: 'my', label: '📒 我的记录' },
    { key: 'about', label: '👀 关于我的' },
    { key: 'approve', label: '📥 待我审批' },
    { key: 'shares', label: '🔑 授权管理' }
  ];

  var data = { my_notes: [], about_me: [], requests: [], shares: [], explanations: [] };
  var sub = 'my';
  var loaded = false;
  var openForm = false;
  var editingId = null;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function toast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function sb() { return window.store && window.store.client ? window.store.client() : null; }
  function me() { return window.store && window.store.me ? window.store.me() : null; }
  function members() { return window.store && window.store.members ? window.store.members() : []; }
  function spaceId() { return window.store && window.store.spaceId ? window.store.spaceId() : null; }
  function emailOf(uid) {
    var arr = members();
    for (var i = 0; i < arr.length; i++) if (String(arr[i].user_id) === String(uid)) return arr[i].email || 'TA';
    return 'TA';
  }
  function partner() {
    var m = me(); if (!m) return null;
    var arr = members();
    for (var i = 0; i < arr.length; i++) if (String(arr[i].user_id) !== String(m.id)) return arr[i];
    return null;
  }
  function findNote(id) {
    for (var i = 0; i < data.my_notes.length; i++) if (String(data.my_notes[i].id) === String(id)) return data.my_notes[i];
    return null;
  }
  function explanationsOf(noteId) {
    var out = [];
    for (var i = 0; i < data.explanations.length; i++) if (String(data.explanations[i].note_id) === String(noteId)) out.push(data.explanations[i]);
    return out;
  }
  function pill(text, cls) { return el('span', 'pn-pill ' + (cls || ''), text); }
  function btn(text, cls, fn) {
    var b = el('button', 'btn small ' + (cls || ''), text);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }

  function load(cb) {
    var c = sb();
    if (!c) { toast('云端未连接'); return; }
    c.rpc('partner_notebook_data').then(function (r) {
      if (r.error) { toast('加载失败：' + r.error.message); return; }
      var d = r.data || {};
      data.my_notes = d.my_notes || [];
      data.about_me = d.about_me || [];
      data.requests = d.requests || [];
      data.shares = d.shares || [];
      data.explanations = d.explanations || [];
      loaded = true;
      render();
      if (cb) cb();
    });
  }

  function render() {
    var box = $('pnRoot');
    if (!box) return;
    clear(box);

    var tabs = el('div', 'pn-tabs');
    for (var i = 0; i < SUBS.length; i++) {
      (function (s) {
        var pending = 0;
        var m = me();
        if (s.key === 'approve' && m) {
          for (var k = 0; k < data.requests.length; k++) {
            var r = data.requests[k];
            if (r.status === 'pending' && String(r.owner_id) === String(m.id)) pending++;
          }
        }
        var b = el('button', 'chip-filter' + (sub === s.key ? ' is-on' : ''), s.label + (pending ? '（' + pending + '）' : ''));
        b.type = 'button';
        b.addEventListener('click', function () { sub = s.key; openForm = false; editingId = null; render(); });
        tabs.appendChild(b);
      })(SUBS[i]);
    }
    box.appendChild(tabs);

    var body = el('div', 'pn-body');
    if (!loaded) body.appendChild(el('div', 'empty', '加载中…'));
    else if (sub === 'my') renderMy(body);
    else if (sub === 'about') renderAbout(body);
    else if (sub === 'approve') renderApprove(body);
    else renderShares(body);
    box.appendChild(body);
  }

  /* ---------- 我的记录 ---------- */
  function renderMy(body) {
    var bar = el('div', 'pn-actions');
    bar.appendChild(btn('＋ 记一条关于 TA 的小细节', 'btn-primary', function () { openForm = !openForm; editingId = null; render(); }));
    bar.appendChild(btn('🔄 刷新', 'btn-ghost', function () { load(); }));
    body.appendChild(bar);

    if (openForm || editingId) {
      body.appendChild(noteForm(editingId ? findNote(editingId) : null));
    }

    if (!data.my_notes.length) {
      var e1 = el('div', 'empty');
      e1.appendChild(el('span', 'big', '📒'));
      e1.appendChild(document.createTextNode('还没有记录，记下第一个关于 TA 的小细节吧'));
      body.appendChild(e1);
      return;
    }

    for (var i = 0; i < data.my_notes.length; i++) body.appendChild(myNoteCard(data.my_notes[i]));
  }

  function myNoteCard(n) {
    var card = el('div', 'card pn-card');
    var head = el('div', 'pn-head');
    head.appendChild(pill(n.category, 'cat'));
    head.appendChild(pill(VIS_LABEL[n.visibility] || n.visibility, 'vis-' + n.visibility));
    if (n.visibility === 'requestable' && n.existence_visible) head.appendChild(pill('对 TA 显示存在', 'exist'));
    card.appendChild(head);
    card.appendChild(el('p', 'pn-text', n.text));
    if (n.why) card.appendChild(el('p', 'pn-why', '为什么记：' + n.why));

    var exps = explanationsOf(n.id);
    if (exps.length) {
      var exBox = el('div', 'pn-exps');
      exBox.appendChild(el('div', 'pn-exps-title', 'TA 的补充说明'));
      for (var i = 0; i < exps.length; i++) exBox.appendChild(el('div', 'pn-exp', exps[i].text));
      card.appendChild(exBox);
    }

    var acts = el('div', 'pn-actions');
    acts.appendChild(btn('✏️ 编辑', 'btn-ghost', function () {
      editingId = n.id; openForm = false; sub = 'my'; render();
      var box = $('pnRoot'); if (box && box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    acts.appendChild(btn('🗑️ 删除', 'btn-ghost', function () {
      if (!window.confirm('删除这条记录？删除后 TA 也看不到了。')) return;
      sb().from('partner_notes').update({ deleted_at: new Date().toISOString() }).eq('id', n.id).then(function (r) {
        if (r.error) { toast('删除失败：' + r.error.message); return; }
        toast('已删除'); load();
      });
    }));
    card.appendChild(acts);
    return card;
  }

  function noteForm(note) {
    var card = el('div', 'card pn-form');
    card.appendChild(el('h3', 'card-sub', note ? '✏️ 编辑记录' : '📝 新记录'));

    var catField = el('label', 'field');
    catField.appendChild(el('span', 'label', '分类'));
    var catSel = el('select', 'input');
    for (var i = 0; i < CATS.length; i++) {
      var o = el('option'); o.value = CATS[i]; o.textContent = CATS[i];
      if (note && note.category === CATS[i]) o.selected = true;
      catSel.appendChild(o);
    }
    catField.appendChild(catSel);
    card.appendChild(catField);

    var textField = el('label', 'field');
    textField.appendChild(el('span', 'label', '记下什么（只写观察，不评判）'));
    var textArea = el('textarea', 'textarea');
    textArea.rows = 3;
    textArea.value = note ? note.text : '';
    textArea.placeholder = '例如：不太喜欢吃鱼，点菜时可以避开';
    textField.appendChild(textArea);
    card.appendChild(textField);

    var whyField = el('label', 'field');
    whyField.appendChild(el('span', 'label', '为什么记（可选）'));
    var whyInput = el('input', 'input');
    whyInput.value = (note && note.why) ? note.why : '';
    whyInput.placeholder = '例如：下次点菜别踩雷';
    whyField.appendChild(whyInput);
    card.appendChild(whyField);

    var visField = el('label', 'field');
    visField.appendChild(el('span', 'label', '可见性'));
    var visSel = el('select', 'input');
    var visOpts = [['private', '仅自己可见（默认）'], ['requestable', '可申请查看'], ['shared', '直接给 TA 看']];
    for (var v = 0; v < visOpts.length; v++) {
      var ov = el('option'); ov.value = visOpts[v][0]; ov.textContent = visOpts[v][1];
      if ((note ? note.visibility : 'private') === visOpts[v][0]) ov.selected = true;
      visSel.appendChild(ov);
    }
    visField.appendChild(visSel);
    card.appendChild(visField);

    var existWrap = el('label', 'check pn-check');
    var existBox = el('input'); existBox.type = 'checkbox';
    existBox.checked = !!(note && note.existence_visible);
    existWrap.appendChild(existBox);
    existWrap.appendChild(el('span', '', '对 TA 显示「有关于你的记录」（默认关闭）'));
    card.appendChild(existWrap);

    function syncExist() { existWrap.style.display = (visSel.value === 'requestable') ? 'inline-flex' : 'none'; }
    visSel.addEventListener('change', syncExist);
    syncExist();

    var acts = el('div', 'pn-actions');
    acts.appendChild(btn('💾 保存', 'btn-primary', function () {
      var p = partner();
      if (!p) { toast('还没有另一半加入空间'); return; }
      var txt = textArea.value.trim();
      if (!txt) { toast('内容不能为空'); return; }
      var payload = {
        space_id: spaceId(),
        author_id: me().id,
        about_user_id: p.user_id,
        category: catSel.value,
        text: txt,
        why: whyInput.value.trim() || null,
        visibility: visSel.value,
        existence_visible: (visSel.value === 'requestable') ? !!existBox.checked : false
      };
      var c = sb();
      var q = note
        ? c.from('partner_notes').update(payload).eq('id', note.id)
        : c.from('partner_notes').insert([payload]);
      q.then(function (r) {
        if (r.error) { toast('保存失败：' + r.error.message); return; }
        toast('已保存');
        openForm = false; editingId = null;
        load();
      });
    }));
    acts.appendChild(btn('取消', 'btn-ghost', function () { openForm = false; editingId = null; render(); }));
    card.appendChild(acts);
    return card;
  }

  /* ---------- 关于我的 ---------- */
  function renderAbout(body) {
    var bar = el('div', 'pn-actions');
    bar.appendChild(btn('🔄 刷新', 'btn-ghost', function () { load(); }));
    body.appendChild(bar);

    if (!data.about_me.length) {
      var e = el('div', 'empty');
      e.appendChild(el('span', 'big', '👀'));
      e.appendChild(document.createTextNode('TA 还没有记录关于你的细节'));
      body.appendChild(e);
    } else {
      for (var i = 0; i < data.about_me.length; i++) body.appendChild(aboutMeCard(data.about_me[i]));
    }

    body.appendChild(el('h3', 'card-sub', '发起申请'));
    body.appendChild(applyForm());
    body.appendChild(el('h3', 'card-sub', '我的申请'));
    var mine = [];
    var m = me();
    for (var k = 0; k < data.requests.length; k++) if (m && String(data.requests[k].requester_id) === String(m.id)) mine.push(data.requests[k]);
    if (!mine.length) body.appendChild(el('p', 'hint', '还没有发起过申请'));
    for (var j = 0; j < mine.length; j++) {
      var r = mine[j];
      var row = el('div', 'pn-request');
      row.appendChild(pill(r.kind === 'deletion' ? '删除请求' : '查看申请', 'cat'));
      row.appendChild(el('span', '', '范围：' + scopeText(r)));
      row.appendChild(pill(STATUS_LABEL[r.status] || r.status, 'st-' + r.status));
      body.appendChild(row);
    }
  }

  function scopeText(r) {
    if (r.scope === 'category') return '分类「' + (r.scope_value || '') + '」';
    if (r.scope === 'note') return '单条记录';
    return '整本';
  }

  function aboutMeCard(n) {
    var card = el('div', 'card pn-card');
    var head = el('div', 'pn-head');
    head.appendChild(pill(n.category, 'cat'));
    if (n.can_read) head.appendChild(pill('已授权', 'vis-shared'));
    card.appendChild(head);

    if (n.can_read) {
      card.appendChild(el('p', 'pn-text', n.text || ''));
      if (n.why) card.appendChild(el('p', 'pn-why', 'TA 为什么记：' + n.why));
      sb().rpc('log_note_view', { p_note_id: n.id });
      var exps = explanationsOf(n.id);
      if (exps.length) {
        var exBox = el('div', 'pn-exps');
        exBox.appendChild(el('div', 'pn-exps-title', '我补充的说明'));
        for (var i = 0; i < exps.length; i++) exBox.appendChild(el('div', 'pn-exp', exps[i].text));
        card.appendChild(exBox);
      }
      card.appendChild(btn('💬 添加说明（不修改 TA 的原文）', 'btn-ghost', function () {
        var txt = window.prompt('补充一句你的说明（TA 能看到）：');
        if (!txt || !txt.trim()) return;
        sb().rpc('add_note_explanation', { p_note_id: n.id, p_text: txt.trim() }).then(function (r) {
          if (r.error) { toast('提交失败：' + r.error.message); return; }
          toast('已提交补充说明'); load();
        });
      }));
    } else {
      card.appendChild(el('p', 'pn-shield', 'TA 记录了一条【' + n.category + '】的细节，暂未公开内容。'));
      card.appendChild(btn('🙋 申请查看这一条', 'btn-ghost', function () {
        askRequest('note', n.id);
      }));
    }
    return card;
  }

  function applyForm() {
    var card = el('div', 'card pn-form');
    var kindField = el('label', 'field');
    kindField.appendChild(el('span', 'label', '申请类型'));
    var kindSel = el('select', 'input');
    var ko = el('option'); ko.value = 'access'; ko.textContent = '查看记录';
    var ko2 = el('option'); ko2.value = 'deletion'; ko2.textContent = '请求删除';
    kindSel.appendChild(ko); kindSel.appendChild(ko2);
    kindField.appendChild(kindSel);
    card.appendChild(kindField);

    var scopeField = el('label', 'field');
    scopeField.appendChild(el('span', 'label', '范围'));
    var scopeSel = el('select', 'input');
    var so = el('option'); so.value = 'all'; so.textContent = '整本';
    var so2 = el('option'); so2.value = 'category'; so2.textContent = '按分类';
    var so3 = el('option'); so3.value = 'note'; so3.textContent = '单条记录';
    scopeSel.appendChild(so); scopeSel.appendChild(so2); scopeSel.appendChild(so3);
    scopeField.appendChild(scopeSel);
    card.appendChild(scopeField);

    var valField = el('label', 'field');
    valField.appendChild(el('span', 'label', '分类 / 记录'));
    var valSel = el('select', 'input');
    valField.appendChild(valSel);
    card.appendChild(valField);

    function fillVal() {
      clear(valSel);
      if (scopeSel.value === 'category') {
        for (var i = 0; i < CATS.length; i++) {
          var o = el('option'); o.value = CATS[i]; o.textContent = CATS[i]; valSel.appendChild(o);
        }
        valField.style.display = 'flex';
      } else if (scopeSel.value === 'note') {
        for (var k = 0; k < data.about_me.length; k++) {
          var n = data.about_me[k];
          var on = el('option'); on.value = n.id; on.textContent = n.category + '（' + (n.can_read ? '已授权' : '未公开') + '）'; valSel.appendChild(on);
        }
        valField.style.display = 'flex';
      } else {
        valField.style.display = 'none';
      }
    }
    scopeSel.addEventListener('change', fillVal);
    fillVal();

    var msgField = el('label', 'field');
    msgField.appendChild(el('span', 'label', '想说的话（可选）'));
    var msgInput = el('input', 'input');
    msgInput.placeholder = '例如：想更懂你一点';
    msgField.appendChild(msgInput);
    card.appendChild(msgField);

    card.appendChild(btn('提交申请', 'btn-accent', function () {
      sb().rpc('request_partner_note', {
        p_kind: kindSel.value,
        p_scope: scopeSel.value,
        p_scope_value: (scopeSel.value === 'all') ? null : valSel.value,
        p_message: msgInput.value.trim() || null
      }).then(function (r) {
        if (r.error) { toast('提交失败：' + r.error.message); return; }
        toast('申请已提交，等 TA 处理');
        load();
      });
    }));
    return card;
  }

  function askRequest(scope, value) {
    sb().rpc('request_partner_note', { p_kind: 'access', p_scope: scope, p_scope_value: value, p_message: null }).then(function (r) {
      if (r.error) { toast('提交失败：' + r.error.message); return; }
      toast('申请已提交'); load();
    });
  }

  /* ---------- 待我审批 ---------- */
  function renderApprove(body) {
    var m = me();
    var list = [];
    for (var i = 0; i < data.requests.length; i++) {
      var r = data.requests[i];
      if (m && String(r.owner_id) === String(m.id) && r.status === 'pending') list.push(r);
    }
    if (!list.length) {
      var e = el('div', 'empty');
      e.appendChild(el('span', 'big', '📥'));
      e.appendChild(document.createTextNode('没有待处理的申请'));
      body.appendChild(e);
      return;
    }
    for (var k = 0; k < list.length; k++) body.appendChild(approveCard(list[k]));
  }

  function approveCard(r) {
    var card = el('div', 'card pn-card');
    card.appendChild(el('h3', 'card-sub', (r.kind === 'deletion' ? '🗑️ 删除请求' : '🙋 查看申请') + ' · ' + emailOf(r.requester_id)));
    card.appendChild(el('p', 'pn-why', '范围：' + scopeText(r) + (r.message ? '｜留言：' + r.message : '')));
    if (r.kind === 'deletion') card.appendChild(el('p', 'hint', '同意后会删除相关记录（可在下方勾选具体条目）'));

    var picked = [];
    var notes = data.my_notes.slice();
    var listBox = el('div', 'pn-picks');
    for (var i = 0; i < notes.length; i++) {
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
      })(notes[i]);
    }
    card.appendChild(listBox);

    var expField = el('label', 'field');
    expField.appendChild(el('span', 'label', '授权有效期'));
    var expSel = el('select', 'input');
    var eo1 = el('option'); eo1.value = '7'; eo1.textContent = '7 天';
    var eo2 = el('option'); eo2.value = '30'; eo2.textContent = '30 天';
    var eo3 = el('option'); eo3.value = '0'; eo3.textContent = '永久（可随时撤销）';
    expSel.appendChild(eo1); expSel.appendChild(eo2); expSel.appendChild(eo3);
    expField.appendChild(expSel);
    card.appendChild(expField);

    var acts = el('div', 'pn-actions');
    acts.appendChild(btn('✅ 同意', 'btn-primary', function () {
      respond(r, true, picked, parseInt(expSel.value, 10));
    }));
    acts.appendChild(btn('🚫 拒绝', 'btn-ghost', function () { respond(r, false, [], 0); }));
    card.appendChild(acts);
    return card;
  }

  function respond(r, approve, ids, days) {
    sb().rpc('respond_partner_request', {
      p_request_id: r.id,
      p_approve: approve,
      p_note_ids: (ids && ids.length) ? ids : null,
      p_expires_days: days
    }).then(function (res) {
      if (res.error) { toast('处理失败：' + res.error.message); return; }
      toast(approve ? '已同意' : '已拒绝');
      load();
    });
  }

  /* ---------- 授权管理 ---------- */
  function renderShares(body) {
    var m = me();
    var mine = [];
    for (var i = 0; i < data.shares.length; i++) {
      var s = data.shares[i];
      if (m && String(s.granted_by) === String(m.id)) mine.push(s);
    }
    if (!mine.length) {
      var e = el('div', 'empty');
      e.appendChild(el('span', 'big', '🔑'));
      e.appendChild(document.createTextNode('还没有给出任何授权'));
      body.appendChild(e);
      return;
    }
    for (var k = 0; k < mine.length; k++) {
      var s = mine[k];
      var note = findNote(s.note_id);
      var card = el('div', 'card pn-card');
      card.appendChild(el('div', 'pn-head', ''));
      card.appendChild(el('p', 'pn-text', note ? note.text : '（记录已删除）'));
      card.appendChild(el('p', 'pn-why', '授权给：' + emailOf(s.viewer_id) + ' ｜ ' + (s.expires_at ? ('到期：' + String(s.expires_at).slice(0, 10)) : '永久')));
      if (s.revoked_at) card.appendChild(pill('已撤销', 'st-denied'));
      else card.appendChild(btn('🚫 撤销授权', 'btn-ghost', function () {
        if (!window.confirm('撤销后 TA 将立刻看不到这条记录，确定吗？')) return;
        sb().rpc('revoke_partner_share', { p_share_id: s.id }).then(function (r) {
          if (r.error) { toast('撤销失败：' + r.error.message); return; }
          toast('已撤销'); load();
        });
      }));
      body.appendChild(card);
    }
  }

  /* ---------- 初始化与子页签切换 ---------- */
  function switchSub(next) {
    var love = $('pnLovePane');
    var book = $('pnRoot');
    if (!love || !book) return;
    var isBook = (next === 'book');
    love.classList.toggle('hidden', isBook);
    book.classList.toggle('hidden', !isBook);
    var btns = document.querySelectorAll('#pnSubtabs [data-pn]');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('is-on', btns[i].getAttribute('data-pn') === next);
    if (isBook && !loaded) load();
  }

  function init() {
    var tabs = $('pnSubtabs');
    if (!tabs) return;
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-pn]') : null;
      if (b) switchSub(b.getAttribute('data-pn'));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.partnerNotesRefresh = function () { if (loaded) load(); };
})();
