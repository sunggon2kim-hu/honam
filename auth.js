// Login gate for the public site. Every data file is AES-GCM encrypted with a key
// derived from "id:password", so a wrong login simply cannot decrypt anything.
(function () {
  var KEY_SLOT = 'honam_key';
  var resolveReady;
  window.__authReady = new Promise(function (r) { resolveReady = r; });
  document.documentElement.classList.add('locked');

  var b64 = function (buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); };
  var unb64 = function (s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); };
  var store = {
    get: function () { try { return localStorage.getItem(KEY_SLOT); } catch (e) { return null; } },
    set: function (v) { try { localStorage.setItem(KEY_SLOT, v); } catch (e) {} },
    clear: function () { try { localStorage.removeItem(KEY_SLOT); } catch (e) {} }
  };

  // One-tap link: "#k=<key>" logs in once and is removed from the address bar.
  // The part after # is never sent to the server. The device then stays logged in.
  function keyFromLink() {
    var m = /^#k=([A-Za-z0-9_-]+)$/.exec(location.hash);
    if (!m) return null;
    history.replaceState(null, '', location.pathname + location.search);
    return m[1].replace(/-/g, '+').replace(/_/g, '/');
  }

  function fetchBytes(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.arrayBuffer();
    });
  }
  function decrypt(key, bytes) {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(bytes, 0, 12) }, key, new Uint8Array(bytes, 12));
  }
  function deriveKey(id, pw, meta) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(id.trim() + ':' + pw), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: unb64(meta.salt), iterations: meta.iter, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']
      );
    });
  }

  var key = null;
  function openWith(k) {
    return fetchBytes('data/bundle.enc').then(function (bytes) { return decrypt(k, bytes); }).then(function (plain) {
      window.__bundle = JSON.parse(new TextDecoder().decode(plain));
      key = k;
      return crypto.subtle.exportKey('raw', k);
    }).then(function (raw) {
      store.set(b64(raw));
      document.documentElement.classList.remove('locked');
      var g = document.getElementById('login-gate');
      if (g) g.remove();
      addLogout();
      resolveReady();
    });
  }

  function addLogout() {
    var foot = document.querySelector('.site-foot');
    if (!foot || foot.querySelector('button')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = '로그아웃';
    b.className = 'login-out';
    b.addEventListener('click', function () { store.clear(); location.reload(); });
    foot.append(' ', b);
  }

  // The PPT and PDF are encrypted too; decrypt them in the browser on click.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="files/summary."]');
    if (!a) return;
    e.preventDefault();
    if (!key || a.dataset.busy) return;
    a.dataset.busy = '1';
    a.style.opacity = '.6';
    var href = a.getAttribute('href');
    var type = /\.pdf$/.test(href) ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    fetchBytes(href + '.enc').then(function (bytes) { return decrypt(key, bytes); }).then(function (plain) {
      var url = URL.createObjectURL(new Blob([plain], { type: type }));
      var tmp = document.createElement('a');
      tmp.href = url;
      tmp.download = a.getAttribute('download') || href.split('/').pop();
      document.body.append(tmp);
      tmp.click();
      tmp.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    }).catch(function () {
      alert('파일을 받지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }).finally(function () {
      delete a.dataset.busy;
      a.style.opacity = '';
    });
  });

  function showLogin() {
    var gate = document.createElement('div');
    gate.id = 'login-gate';
    gate.innerHTML =
      '<form class="login-card" autocomplete="on">' +
      '<div class="login-brand">LG전자 혼매호남팀</div>' +
      '<h1>매니저 유형 현황</h1>' +
      '<p>내부용 페이지입니다. 아이디와 비밀번호를 입력해 주세요.</p>' +
      '<label>아이디<input name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required></label>' +
      '<label>비밀번호<input name="password" type="password" autocomplete="current-password" required></label>' +
      '<div class="login-err" role="alert" hidden></div>' +
      '<button type="submit">로그인</button>' +
      '</form>';
    document.body.append(gate);
    var form = gate.querySelector('form');
    var err = gate.querySelector('.login-err');
    var btn = gate.querySelector('button');
    var fail = function (msg) { err.textContent = msg; err.hidden = false; btn.disabled = false; btn.textContent = '로그인'; };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.hidden = true;
      btn.disabled = true;
      btn.textContent = '확인 중…';
      fetch('data/auth.json', { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error('net');
        return r.json();
      }).then(function (meta) {
        return deriveKey(form.username.value, form.password.value, meta);
      }).then(openWith).catch(function (x) {
        if (x && x.name === 'OperationError') fail('아이디 또는 비밀번호가 올바르지 않습니다.');
        else fail('접속에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      });
    });
    form.username.focus();
  }

  var saved = keyFromLink() || store.get();
  if (saved) {
    crypto.subtle.importKey('raw', unb64(saved), 'AES-GCM', true, ['decrypt']).then(openWith).catch(function () {
      store.clear();
      showLogin();
    });
  } else {
    showLogin();
  }
})();
