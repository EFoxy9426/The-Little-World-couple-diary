/* 小小世界 · 云端版 M1：账号 + 空间 + 邀请码绑定 */
(function () {
  'use strict';

  var MODE = 'preview'; /* preview=预览(本地) / cloud=云端 */
  var sb = null;
  var user = null;   /* { id, email } */
  var space = null;  /* { id,name,owner_id,invite_code,invite_expires_at,members:[] } */
  var authMode = 'login';
  var pollTimer = null;
  var sessionActive = false;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function clearNode(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function friendlyErr(err) {
    var msg = (err && (err.message || err.error_description || err.error)) || '';
    var map = {
      'Invalid login credentials': '邮箱或密码不对，请检查后重试',
      'Email not confirmed': '邮箱还没验证：请先到邮箱点确认链接，再回来登录',
      'User already registered': '这个邮箱已经注册过了，直接登录即可',
      'Password should be at least 6 characters': '密码至少需要 6 位',
      'Email rate limit exceeded': '操作太频繁了，请等一分钟再试',
      'Unable to validate email address': '邮箱格式不对，请检查',
      'Either email or phone should be provided': '请填写邮箱'
    };
    var key = String(msg).toLowerCase();
    for (var mk in map) {
      if (key.indexOf(String(mk).toLowerCase()) !== -1) return map[mk];
    }
    var hasCJK = false;
    for (var i2 = 0; i2 < msg.length; i2++) {
      var cc = msg.charCodeAt(i2);
      if (cc >= 19968 && cc <= 40959) { hasCJK = true; break; }
    }
    if (hasCJK) return msg;
    return msg ? ('出错了：' + msg) : '操作失败，请稍后再试';
  }
  function showNone() {
    var w = $('whoAmI');
    if (w) w.textContent = '当前登录：' + (user ? user.email : '未登录');
    show('none');
  }
  function show(view) {
    var views = document.querySelectorAll('.view');
    for (var i = 0; i < views.length; i++) views[i].classList.toggle('is-active', views[i].getAttribute('data-view') === view);
    if (view !== 'dash') stopPoll();
    window.scrollTo(0, 0);
  }
  function setModeHint() {
    $('modeHint').textContent = MODE === 'cloud' ? '已连接云端 ☁️（M1 联调模式）' : '预览模式 🔎：未连接云端，数据仅存本机浏览器。配置 config.js 即切换云端。';
  }

  /* ---------- 预览模式本地存储 ---------- */
  function mockLoadUser() { try { return JSON.parse(localStorage.getItem('xxc_user') || 'null'); } catch (e) { return null; } }
  function mockSaveUser(u) { localStorage.setItem('xxc_user', JSON.stringify(u)); }
  function mockClearUser() { localStorage.removeItem('xxc_user'); }
  function mockLoadSpace() { try { return JSON.parse(localStorage.getItem('xxc_space') || 'null'); } catch (e) { return null; } }
  function mockSaveSpace(s) { localStorage.setItem('xxc_space', JSON.stringify(s)); }
  function genCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  /* ---------- 初始化 ---------- */
  function init() {
    if (window.SUPABASE_CONFIG && window.supabase && window.supabase.createClient) {
      try {
        sb = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
        MODE = 'cloud';
      } catch (e) { sb = null; }
    }
    setModeHint();
    bind();
    if (MODE === 'cloud') {
      sb.auth.onAuthStateChange(function (event, session) {
        if (event === 'SIGNED_OUT') {
          user = null; space = null; sessionActive = false;
          show('auth');
          return;
        }
        if (session && session.user) {
          user = { id: session.user.id, email: session.user.email };
          sessionActive = true;
          afterAuth();
        }
      });
      sb.auth.getSession().then(function (r) {
        var s = r && r.data && r.data.session;
        if (s) { user = { id: s.user.id, email: s.user.email }; sessionActive = true; afterAuth(); }
        else show('auth');
      });
    } else {
      user = mockLoadUser();
      if (user) afterAuth(); else show('auth');
    }
  }

  /* ---------- 认证 ---------- */
  function setAuthMsg(text, isErr) {
    var h = $('authHint');
    if (!h) return;
    h.textContent = text;
    h.style.color = isErr ? '#ff6b6b' : '';
    if (isErr) h.style.fontWeight = '700';
    else h.style.fontWeight = '';
  }
  function doAuth(ev) {
    ev.preventDefault();
    var email = $('authEmail').value.trim();
    var pwd = $('authPwd').value;
    if (!email || pwd.length < 6) { setAuthMsg('请填写邮箱和至少 6 位密码', true); return; }
    if (MODE === 'cloud') {
      var btn = $('authSubmit');
      var oldText = btn.textContent;
      btn.textContent = '正在处理…';
      btn.disabled = true;
      setAuthMsg('', false);
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        setAuthMsg('连接云端超时：网络较慢或被限制，请检查网络 / 代理后重试', true);
        btn.textContent = authMode === 'login' ? '登录' : '注册';
        btn.disabled = false;
      }, 12000);
      var req = authMode === 'register'
        ? sb.auth.signUp({ email: email, password: pwd })
        : sb.auth.signInWithPassword({ email: email, password: pwd });
      req.then(function (r) {
        if (r.error) { setAuthMsg(friendlyErr(r.error), true); toast(friendlyErr(r.error)); return; }
        var u = r.data.user;
        if (authMode === 'register' && (!u.identities || !u.identities.length)) {
          setAuthMsg('注册成功！请在邮箱点确认链接后登录（当前开了邮箱验证）', false);
          return;
        }
        user = { id: u.id, email: u.email };
        afterAuth();
      }).catch(function (err) {
        setAuthMsg('网络或服务异常：' + (err && err.message ? err.message : '未知错误') + '，请重试', true);
      }).then(function () {
        done = true;
        clearTimeout(timer);
        btn.textContent = authMode === 'login' ? '登录' : '注册';
        btn.disabled = false;
      });
    } else {
      if (authMode === 'register') {
        mockSaveUser({ id: 'u' + Date.now(), email: email });
      } else {
        mockSaveUser({ id: 'u' + Date.now(), email: email });
      }
      user = mockLoadUser();
      toast(authMode === 'register' ? '已注册（预览模式）' : '已登录（预览模式）');
      afterAuth();
    }
  }

  function logout() {
    stopPoll();
    if (MODE === 'cloud') { sb.auth.signOut(); }
    mockClearUser();
    user = null; space = null;
    show('auth');
  }

  /* ---------- 空间 ---------- */
  function afterAuth() {
    $('authEmail').value = user.email || '';
    loadSpace();
  }

  function loadSpace() {
    if (MODE === 'cloud') {
      sb.rpc('my_space').then(function (r) {
        if (r.error) { toast(friendlyErr(r.error)); showNone(); return; }
        space = r.data;
        if (space) renderDash(); else showNone();
      });
    } else {
      space = mockLoadSpace();
      if (space) renderDash(); else showNone();
    }
  }

  function doCreate(ev) {
    ev.preventDefault();
    if (MODE === 'cloud' && !sessionActive) { toast('请先登录，或登录已过期，请刷新页面重试'); show('auth'); return; }
    var name = $('spaceName').value.trim() || '小小世界';
    if (MODE === 'cloud') {
      sb.rpc('create_space', { p_name: name }).then(function (r) {
        if (r.error) { toast(friendlyErr(r.error)); return; }
        space = r.data; renderDash();
      });
    } else {
      var code = genCode();
      var sp = {
        id: 'sp' + Date.now(),
        name: name,
        owner_id: user.id,
        owner_email: user.email,
        invite_code: code,
        invite_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        members: [{ user_id: user.id, email: user.email }]
      };
      mockSaveSpace(sp);
      space = sp;
      renderDash();
    }
  }

  function doJoin(ev) {
    ev.preventDefault();
    if (MODE === 'cloud' && !sessionActive) { toast('请先登录，或登录已过期，请刷新页面重试'); show('auth'); return; }
    var code = $('joinCode').value.trim().toUpperCase();
    if (!code) { toast('请输入邀请码'); return; }
    if (MODE === 'cloud') {
      sb.rpc('join_space', { p_code: code }).then(function (r) {
        if (r.error) { toast(friendlyErr(r.error)); return; }
        space = r.data; renderDash();
      });
    } else {
      var sp = mockLoadSpace();
      if (!sp) { toast('这个邀请码不存在（预览模式无数据）'); return; }
      if (sp.invite_code.toUpperCase() !== code) { toast('邀请码不对，请检查后再试'); return; }
      if (sp.owner_id === user.id) { toast('这是你自己创建的空间哦'); return; }
      if (sp.members.length >= 2) { toast('这个空间已经有两个人了'); return; }
      if (sp.members.some(function (m) { return m.email === user.email; })) { toast('你已经在这个空间里了'); return; }
      sp.members.push({ user_id: user.id, email: user.email });
      mockSaveSpace(sp);
      space = sp;
      renderDash();
    }
  }

  function refresh() {
    if (MODE === 'cloud') {
      sb.rpc('my_space').then(function (r) {
        if (!r.error && r.data) { space = r.data; renderDash(); }
      });
    } else {
      space = mockLoadSpace();
      renderDash();
    }
  }

  /* ---------- 渲染 ---------- */
  function renderDash() {
    show('dash');
    $('dashName').textContent = space.name || '小小世界';
    var members = space.members || [];
    var isOwner = String(space.owner_id) === String(user.id) || space.owner_email === user.email;
    var mine = members.find ? members.find(function (m) { return String(m.user_id) === String(user.id) || m.email === user.email; }) : null;
    var lb = $('btnLeaveSpace');
    if (lb) lb.textContent = isOwner ? '解散空间并重新开始' : '退出这个空间';

    var ownerBlock = $('ownerBlock');
    ownerBlock.style.display = isOwner && members.length < 2 ? 'block' : 'none';
    if (isOwner && members.length < 2) {
      $('dashCode').textContent = space.invite_code;
    }

    var status = $('dashStatus');
    if (members.length >= 2) {
      status.textContent = '🎉 已完成绑定：你们俩都在这里了，点下面按钮进入你们的空间。';
    } else if (isOwner) {
      status.textContent = '⏳ 已创建「' + (space.name || '小小世界') + '」，正在等另一半用邀请码加入…（也可以先点下面按钮进去写点内容）';
    } else {
      status.textContent = '🔗 你已通过邀请码加入「' + (space.name || '小小世界') + '」，正在等创建者确认。';
    }

    var box = $('dashMembers');
    clearNode(box);
    for (var i = 0; i < members.length; i++) {
      (function (m) {
        var row = el('div', 'member-row');
        row.appendChild(el('span', 'ava', String(m.email || '?').charAt(0).toUpperCase()));
        row.appendChild(el('span', '', m.email));
        var isM = String(m.user_id) === String(user.id) || m.email === user.email;
        row.appendChild(el('span', 'member-role', isM ? '我' : (String(m.user_id) === String(space.owner_id) || m.email === space.owner_email ? '创建者' : '另一半')));
        box.appendChild(row);
      })(members[i]);
    }

    startPoll();
  }

  function startPoll() {
    stopPoll();
    pollTimer = setInterval(function () { refresh(); }, 3000);
  }
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  /* ---------- 绑定事件 ---------- */
  function bind() {
    $('tabLogin').addEventListener('click', function () { authMode = 'login'; setTab(); });
    $('tabRegister').addEventListener('click', function () { authMode = 'register'; setTab(); });
    function setTab() {
      $('tabLogin').classList.toggle('is-on', authMode === 'login');
      $('tabRegister').classList.toggle('is-on', authMode === 'register');
      $('authSubmit').textContent = authMode === 'login' ? '登录' : '注册';
      $('authHint').textContent = authMode === 'login' ? '已有账号？直接登录' : '首次注册后，下一步创建你们的小小世界';
    }
    $('authForm').addEventListener('submit', doAuth);
    $('createForm').addEventListener('submit', doCreate);
    $('joinForm').addEventListener('submit', doJoin);
    $('btnRefresh').addEventListener('click', refresh);
    $('btnLeaveSpace').addEventListener('click', function () {
      var isOwner = space && (String(space.owner_id) === String(user.id) || space.owner_email === user.email);
      var msg = isOwner ? '解散当前空间？你和另一半的数据会被清空（M1 测试用）。' : '退出当前空间？退出后需要对方新的邀请码才能再加入。';
      if (!window.confirm(msg)) return;
      if (MODE === 'cloud') {
        sb.rpc('leave_my_space').then(function (r) {
          if (r.error) { toast(friendlyErr(r.error)); return; }
          space = null; showNone(); toast('已离开，可以重新创建或加入');
        });
      } else {
        var sp = mockLoadSpace();
        if (!sp) { space = null; showNone(); return; }
        if (String(sp.owner_id) === String(user.id)) { localStorage.removeItem('xxc_space'); }
        else {
          sp.members = sp.members.filter(function (m) { return m.email !== user.email && String(m.user_id) !== String(user.id); });
          if (!sp.members.length) localStorage.removeItem('xxc_space');
          else mockSaveSpace(sp);
        }
        space = null; showNone(); toast('已离开');
      }
    });
    $('btnEnterSpace').addEventListener('click', function () {
      window.location.href = '/cloud/app.html';
    });
    $('btnLogout').addEventListener('click', logout);
    $('btnLogout2').addEventListener('click', logout);
    $('btnCopy').addEventListener('click', function () {
      var code = space && space.invite_code ? space.invite_code : '';
      if (!code) return;
      function done() { toast('邀请码已复制：' + code); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done).catch(function () { fallbackCopy(code); done(); });
      } else { fallbackCopy(code); done(); }
    });
    function fallbackCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  init();
})();
