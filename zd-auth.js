/* ZIPDRIVE team login (Supabase Auth) — shared by MoveTrack Live and the VCR tool.
   Usage:  const me = await ZDAuth.require();   // shows the sign-in screen if needed
           me.profile.role  → 'admin' | 'driver'
   While signed in, every request to the Supabase REST API automatically carries
   the user's access token, so the database's security rules apply to that user. */
(function () {
  const URL_ = 'https://gmpzlpgxjwboezvubaka.supabase.co';
  const KEY = 'sb_publishable_AouNjb7B75WhEQD21HwQig_CfwTWJoQ';
  const STORE = 'zd_session_v1';
  const nativeFetch = window.fetch.bind(window);
  let session = null;
  try { session = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) {}

  const save = s => { session = s; try { s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE); } catch (e) {} };
  const stamp = s => { if (s && !s.expires_at) s.expires_at = Math.floor(Date.now() / 1000) + (s.expires_in || 3600); return s; };

  async function authCall(path, body) {
    const r = await nativeFetch(`${URL_}/auth/v1/${path}`, {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || j.message || 'Sign-in failed');
    return stamp(j);
  }
  let refreshing = null;
  async function freshToken() {
    if (!session) return null;
    if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
    if (!refreshing) refreshing = authCall('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
      .then(s => { save(s); return s.access_token; })
      .catch(() => { save(null); return null; })
      .finally(() => { refreshing = null; });
    return refreshing;
  }

  // Add the signed-in user's token to Supabase database calls
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith(URL_ + '/rest/') && session) {
      const tok = await freshToken();
      if (tok) {
        init = Object.assign({}, init);
        const h = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
        h.set('apikey', KEY); h.set('Authorization', 'Bearer ' + tok);
        init.headers = h;
      }
    }
    return nativeFetch(input, init);
  };

  async function loadProfile() {
    const uid = session && session.user && session.user.id;
    if (!uid) return null;
    const r = await window.fetch(`${URL_}/rest/v1/profiles?select=*&id=eq.${uid}`, { headers: { apikey: KEY } });
    const rows = r.ok ? await r.json() : [];
    return rows[0] || null;
  }

  function loginScreen(msg) {
    return new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.id = 'zd-login';
      wrap.innerHTML = `
        <style>
          #zd-login{position:fixed;inset:0;z-index:9999;background:#0B0A0E;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,system-ui,-apple-system,sans-serif;color:#F4F2F7}
          #zd-login .bx{width:100%;max-width:360px;text-align:center}
          #zd-login img{width:120px;height:120px;border-radius:18px;margin-bottom:14px}
          #zd-login h1{font-size:22px;margin:0 0 4px} #zd-login p{color:#A49DB0;font-size:13px;margin:0 0 18px}
          #zd-login input{width:100%;box-sizing:border-box;margin-bottom:10px;padding:13px 14px;border-radius:10px;border:1px solid #2E2739;background:#16131C;color:#fff;font-size:16px;outline:none}
          #zd-login input:focus{border-color:#C9A84C}
          #zd-login button{width:100%;padding:14px;border:0;border-radius:10px;background:#C9A84C;color:#1a1206;font-weight:800;font-size:16px;cursor:pointer}
          #zd-login button[disabled]{opacity:.6}
          #zd-login .err{color:#ff8a7a;font-size:13px;min-height:18px;margin:4px 0 8px}
          #zd-login .ft{margin-top:16px;font-size:12px;color:#6b6480}
        </style>
        <form class="bx" novalidate>
          <img src="zipdrive-logo.png" alt="ZIPDRIVE">
          <h1>ZIPDRIVE Team</h1>
          <p>Sign in to continue</p>
          <input type="email" id="zd-em" placeholder="Email" autocomplete="username" autocapitalize="none" required>
          <input type="password" id="zd-pw" placeholder="Password" autocomplete="current-password" required>
          <div class="err" id="zd-err">${msg || ''}</div>
          <button type="submit" id="zd-go">Sign in</button>
          <div class="ft">Forgot your password? Call Curt at 855-ZIP-OHIO.</div>
        </form>`;
      document.body.appendChild(wrap);
      const f = wrap.querySelector('form');
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const em = wrap.querySelector('#zd-em').value.trim(), pw = wrap.querySelector('#zd-pw').value;
        const err = wrap.querySelector('#zd-err'), go = wrap.querySelector('#zd-go');
        if (!em || !pw) { err.textContent = 'Enter your email and password.'; return; }
        go.disabled = true; go.textContent = 'Signing in…'; err.textContent = '';
        try {
          save(await authCall('token?grant_type=password', { email: em, password: pw }));
          const profile = await loadProfile();
          if (!profile) { save(null); throw new Error('This login isn’t set up for the ZIPDRIVE team yet. Ask Curt.'); }
          wrap.remove(); resolve({ user: session.user, profile });
        } catch (x) {
          err.textContent = /invalid/i.test(x.message) ? 'Wrong email or password.' : x.message;
          go.disabled = false; go.textContent = 'Sign in';
        }
      });
      setTimeout(() => wrap.querySelector('#zd-em').focus(), 50);
    });
  }

  async function require_() {
    if (session && await freshToken()) {
      const profile = await loadProfile();
      if (profile) return { user: session.user, profile };
      save(null);
      return loginScreen('This login isn’t set up for the ZIPDRIVE team yet. Ask Curt.');
    }
    return loginScreen();
  }

  async function signOut() {
    try { if (session) await nativeFetch(`${URL_}/auth/v1/logout`, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + session.access_token } }); } catch (e) {}
    save(null); location.reload();
  }

  async function listTeam() {
    const r = await window.fetch(`${URL_}/rest/v1/profiles?select=id,full_name,role&order=full_name.asc`, { headers: { apikey: KEY } });
    return r.ok ? r.json() : [];
  }

  window.ZDAuth = { require: require_, signOut, listTeam, url: URL_, key: KEY, get session() { return session; } };
})();
