/* 小小世界 · 云端数据层：覆盖 window.store（含照片上云） */
(function () {
  'use strict';
  var base = window.store;
  if (!base) return;

  var sb = null;
  var cfg = window.SUPABASE_CONFIG;
  var me = null;
  var space = null;
  var state = null;
  var booted = false;
  var bootCbs = [];
  var urlCache = {};
  var dataCbs = [];
  var chan = null;
  var lastSent = '';
  var BUCKET = 'couple-photos';

  function notifyBoot() { booted = true; for (var i = 0; i < bootCbs.length; i++) bootCbs[i](); bootCbs = []; }

  function uploadMapKey() { return 'xxc_upmap_' + (space ? space.id : 'x'); }
  function loadMap() { try { return JSON.parse(localStorage.getItem(uploadMapKey()) || '{}'); } catch (e) { return {}; } }
  function saveMap(m) { try { localStorage.setItem(uploadMapKey(), JSON.stringify(m)); } catch (e) {} }

  function fail(msg, backToLogin) {
    console.error('[小小世界] ' + msg);
    try {
      var box = document.getElementById('xxBootError');
      if (!box) {
        box = document.createElement('div');
        box.id = 'xxBootError';
        box.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#fffef5;color:#2c2c2c;padding:24px;font-family:sans-serif;line-height:1.8;overflow:auto';
        var t = document.createElement('h3');
        t.textContent = '进入空间失败';
        var p1 = document.createElement('p');
        p1.id = 'xxBootErrorMsg';
        p1.style.cssText = 'color:#ff6b6b;font-weight:700;word-break:break-all';
        var tip = document.createElement('p');
        tip.textContent = '把上面这行错误信息发给开发者即可定位；也可以先返回登录页重试。';
        var link = document.createElement('a');
        link.href = '/cloud/index.html';
        link.textContent = '← 返回登录页';
        link.style.cssText = 'display:inline-block;margin-top:12px;padding:8px 16px;border:2px dashed #2c2c2c;border-radius:8px;text-decoration:none;color:#2c2c2c';
        box.appendChild(t); box.appendChild(p1); box.appendChild(tip); box.appendChild(link);
        document.body.appendChild(box);
      }
      var m = document.getElementById('xxBootErrorMsg');
      if (m) m.textContent = msg;
    } catch (e2) {}
    if (backToLogin) setTimeout(function () { window.location.href = '/cloud/index.html'; }, 3000);
  }

  function boot(cb) {
    bootCbs.push(cb);
    if (booted) { notifyBoot(); return; }
    if (!cfg) { fail('缺少云端配置 /cloud/config.js（没加载到 SUPABASE_CONFIG）', false); return; }
    if (!window.supabase || !window.supabase.createClient) { fail('缺少本地 Supabase 库 /js/vendor/supabase.js（没加载到）', false); return; }
    try { sb = window.supabase.createClient(cfg.url, cfg.anonKey); } catch (e) { fail('创建 Supabase 客户端失败：' + e.message, false); return; }
    sb.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session;
      if (!s || !s.user) { fail('未检测到登录状态，3 秒后返回登录页…', true); return; }
      sb.rpc('my_space').then(function (sr) {
        if (sr.error || !sr.data) { fail('读取空间失败：' + (sr.error && sr.error.message ? sr.error.message : '没有找到你的空间'), false); return; }
        var sp = sr.data;
        var myId = String(s.user.id);
        var isOwner = String(sp.owner_id) === myId;
        me = { id: myId, email: s.user.email, role: isOwner ? 'bro' : 'sis' };
        space = { id: sp.id, name: sp.name || '小小世界', owner_id: sp.owner_id, members: sp.members || [] };
        sb.from('spaces').select('id,data').eq('id', sp.id).maybeSingle().then(function (dr) {
          if (dr.error) { fail('读取空间数据失败：' + dr.error.message, false); return; }
          var raw = (dr.data && dr.data.data) || null;
          if (raw && typeof raw === 'object' && raw.couple) state = normalize(raw);
          else { state = makeDefault(); persist(); }
          notifyBoot();
          subscribe();
        });
      });
    });
  }

  function normalize(d) {
    if (!d.couple) d.couple = makeDefault().couple;
    d.couple.bound = { key: me.role, at: (d.couple.bound && d.couple.bound.at) || base.nowStamp() };
    d.couple.partners = d.couple.partners || base.defaultPartners();
    d.memories = d.memories || [];
    d.wishes = d.wishes || [];
    d.notes = d.notes || [];
    d.anniversaries = d.anniversaries || [];
    return d;
  }

  function makeDefault() {
    var d = base.blank();
    d.couple.name = space.name || '小小世界';
    d.couple.since = '2025-12-25';
    d.couple.bound = { key: me.role, at: base.nowStamp() };
    return d;
  }

  function uploadPhoto(dataURL) {
    var map = loadMap();
    if (map[dataURL]) return Promise.resolve(map[dataURL]);
    return fetch(dataURL).then(function (resp) { return resp.blob(); }).then(function (blob) {
      var p = space.id + '/' + base.genId() + '.jpg';
      return sb.storage.from(BUCKET).upload(p, blob, { contentType: 'image/jpeg', upsert: false }).then(function (r) {
        if (r.error) throw r.error;
        map[dataURL] = p;
        saveMap(map);
        return p;
      });
    });
  }

  function persist() {
    if (!sb || !space || !state) return;
    var clone = JSON.parse(JSON.stringify(state));
    var jobs = [];
    function collect(arr) {
      if (!Array.isArray(arr)) return;
      for (var i = 0; i < arr.length; i++) {
        (function (idx) {
          var s = arr[idx];
          if (typeof s === 'string' && s.indexOf('data:') === 0) {
            jobs.push(function () { return uploadPhoto(s).then(function (p) { arr[idx] = p; }); });
          }
        })(i);
      }
    }
    if (clone.memories) for (var mi = 0; mi < clone.memories.length; mi++) collect(clone.memories[mi].photos);
    if (clone.wishes) for (var wi = 0; wi < clone.wishes.length; wi++) collect(clone.wishes[wi].photos);
    var seq = Promise.resolve();
    for (var ji = 0; ji < jobs.length; ji++) (function (j) { seq = seq.then(j); })(jobs[ji]);
    seq.then(function () {
      return sb.from('spaces').update({ data: clone }).eq('id', space.id);
    }).then(function (r) {
      if (r.error) { console.warn('云端保存失败', r.error); return; }
      lastSent = JSON.stringify(clone);
    }).catch(function (e) { console.warn('云端保存失败', e); });
  }

  function getPhotoUrl(src, cb) {
    if (!src) { cb(null); return; }
    if (src.indexOf('data:') === 0 || src.indexOf('http') === 0) { cb(src); return; }
    var c = urlCache[src];
    if (c && c.exp > Date.now()) { cb(c.url); return; }
    if (!sb) { cb(null); return; }
    sb.storage.from(BUCKET).createSignedUrl(src, 3600).then(function (r) {
      var u = (r.data && r.data.signedUrl) || null;
      if (u) urlCache[src] = { url: u, exp: Date.now() + 3500 * 1000 };
      cb(u);
    }).catch(function () { cb(null); });
  }

  function deletePhoto(src) {
    if (!sb || !space) return;
    var path = src;
    if (src && src.indexOf('data:') === 0) {
      var map = loadMap();
      path = map[src] || null;
      if (path) { delete map[src]; saveMap(map); }
    }
    if (!path) return;
    sb.storage.from(BUCKET).remove([path]).then(function (r) {
      if (r.error) console.warn('删除照片失败', r.error);
    });
  }

  var cloudStore = {};
  for (var k in base) { if (typeof base[k] === 'function') cloudStore[k] = base[k]; }
  cloudStore.cloud = true;
  cloudStore.boot = boot;
  cloudStore.load = function () { return state; };
  cloudStore.save = function (d) { state = d || state; if (state) persist(); return true; };
  cloudStore.clear = function () { state = makeDefault(); if (state) persist(); };
  cloudStore.getCurrent = function () { return me ? me.role : 'bro'; };
  cloudStore.setCurrent = function () {};
  cloudStore.blankCloud = function () { return makeDefault(); };
  cloudStore.getPhotoUrl = getPhotoUrl;
  cloudStore.deletePhoto = deletePhoto;
  function canonical(o) {
    if (Array.isArray(o)) { var ar = []; for (var ai = 0; ai < o.length; ai++) ar.push(canonical(o[ai])); return ar; }
    if (o && typeof o === 'object') {
      var keys = Object.keys(o).sort();
      var r = {};
      for (var ki = 0; ki < keys.length; ki++) r[keys[ki]] = canonical(o[keys[ki]]);
      return r;
    }
    return o;
  }
  function applyRemote(raw) {
    if (!raw || typeof raw !== 'object' || !raw.couple) return;
    try {
      var same = JSON.stringify(canonical(raw)) === JSON.stringify(canonical(state || {}));
      if (same) return;
      state = normalize(JSON.parse(JSON.stringify(raw)));
      for (var i = 0; i < dataCbs.length; i++) dataCbs[i]();
    } catch (e) { console.warn('远端数据解析失败', e); }
  }
  function subscribe() {
    if (!sb || !space || chan) return;
    chan = sb.channel('space-' + space.id);
    chan.on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'spaces',
      filter: 'id=eq.' + space.id
    }, function (payload) {
      if (payload && payload.new && payload.new.data) applyRemote(payload.new.data);
    }).subscribe();
  }
  cloudStore.onData = function (cb) { dataCbs.push(cb); };
  cloudStore.subscribe = subscribe;
  cloudStore.client = function () { return sb; };
  cloudStore.spaceId = function () { return space ? space.id : null; };
  cloudStore.me = function () { return me; };
  cloudStore.members = function () { return space && space.members ? space.members : []; };
  window.store = cloudStore;
})();
