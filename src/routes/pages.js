const { Router } = require('express');
const { requireAuth, requireAdmin } = require('../auth');
const { RUHI_FAVICON_LINK, RUHI_ICON_URL, INSTANCE_NAME } = require('../utils/ruhi-assets');
const { getSpacetimeBg } = require('../utils/spacetime-bg');

const router = Router();

router.get('/login', (req, res) => {
  if (req.session && req.session.user) return res.redirect('/');
  res.send(loginPage());
});

router.get('/admin', requireAuth, requireAdmin, (req, res) => {
  res.send(adminPage(req.session.user));
});

router.get('/settings', requireAuth, (req, res) => {
  res.send(settingsPage(req.session.user));
});

const BASE_STYLES = `
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html { font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
    body { font-family: inherit; background: #0a0a0a; color: #fafafa; }
    a { color: #e5a819; text-decoration: none; }
    a:hover { text-decoration: none; }
`;

const GOOGLE_FONTS = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
`;

function loginPage() {
  const { SPACETIME_CSS, SPACETIME_HTML, METEOR_JS } = getSpacetimeBg();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${INSTANCE_NAME} | Sign In</title>
  ${RUHI_FAVICON_LINK}
  ${GOOGLE_FONTS}
  <style>
    ${BASE_STYLES}
    ${SPACETIME_CSS}
    body { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #020208; }
    .container { text-align: center; padding: 40px; width: 100%; max-width: 380px; position: relative; z-index: 1; }
    .brand-icon {
      width: 64px; height: 64px;
      margin: 0 auto 16px;
    }
    .brand-icon img {
      width: 100%; height: 100%; object-fit: contain;
    }
    h1 { font-size: 1.8rem; margin-bottom: 6px; color: #fafafa; font-weight: 600; letter-spacing: -0.02em; }
    p { color: #a1a1aa; margin-bottom: 28px; font-size: 0.95rem; }
    input { width: 100%; padding: 12px 16px; background: #18181b; border: 1px solid #27272a; border-radius: 8px; color: #fafafa; font-size: 1rem; font-family: inherit; margin-bottom: 12px; }
    input:focus { outline: none; border-color: #e5a819; box-shadow: 0 0 0 3px #e5a81920; }
    button { width: 100%; padding: 12px; background: #e5a819; color: #0a0a0a; border: none; border-radius: 8px; font-size: 1rem; font-family: inherit; cursor: pointer; font-weight: 600; }
    button:hover { background: #d19a15; }
    .error { color: #ef4444; margin-top: 12px; display: none; font-size: 0.875rem; }
  </style>
</head>
<body>
  ${SPACETIME_HTML}
  <div class="container">
    <div class="brand-icon"><img src="${RUHI_ICON_URL}" alt="${INSTANCE_NAME}"></div>
    <h1>${INSTANCE_NAME}</h1>
    <p>Sign in with your @ikawn.com account</p>
    <form onsubmit="login(event)">
      <input type="email" id="email" placeholder="you@ikawn.com" autofocus>
      <input type="password" id="password" placeholder="Password">
      <button type="submit">Sign In</button>
    </form>
    <p class="error" id="error"></p>
    <div id="reset-section" style="display:none; margin-top: 20px; text-align: left;">
      <p style="color: #a1a1aa; margin-bottom: 12px; text-align: center;">Enter your email to receive a reset code</p>
      <input type="email" id="reset-email" placeholder="you@ikawn.com">
      <button onclick="requestReset()" style="margin-bottom: 12px;">Send Reset Code</button>
      <input type="text" id="reset-code" placeholder="6-digit code" style="display:none;">
      <input type="password" id="reset-newpw" placeholder="New password (min 6 chars)" style="display:none;">
      <button id="reset-submit-btn" onclick="submitReset()" style="display:none;">Reset Password</button>
      <p style="text-align:center;"><a href="#" onclick="toggleReset(false); return false;" style="font-size:0.85rem;">Back to login</a></p>
    </div>
    <p style="margin-top: 16px;" id="forgot-link"><a href="#" onclick="toggleReset(true); return false;" style="font-size:0.85rem;">Forgot password?</a></p>
  </div>
  <script>
    function toggleReset(show) {
      document.getElementById('reset-section').style.display = show ? 'block' : 'none';
      document.querySelector('form').style.display = show ? 'none' : 'block';
      document.getElementById('forgot-link').style.display = show ? 'none' : 'block';
      document.getElementById('error').style.display = 'none';
    }
    async function requestReset() {
      const email = document.getElementById('reset-email').value;
      const errEl = document.getElementById('error');
      errEl.style.display = 'none';
      try {
        const res = await fetch('/auth/request-reset', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({email}) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        document.getElementById('reset-code').style.display = 'block';
        document.getElementById('reset-newpw').style.display = 'block';
        document.getElementById('reset-submit-btn').style.display = 'block';
        errEl.textContent = 'Code sent! Check your email.'; errEl.style.display = 'block'; errEl.style.color = '#22c55e';
      } catch(err) { errEl.textContent = err.message; errEl.style.display = 'block'; errEl.style.color = '#ef4444'; }
    }
    async function submitReset() {
      const email = document.getElementById('reset-email').value;
      const code = document.getElementById('reset-code').value;
      const new_password = document.getElementById('reset-newpw').value;
      const errEl = document.getElementById('error');
      errEl.style.display = 'none';
      try {
        const res = await fetch('/auth/reset-password', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({email, code, new_password}) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        errEl.textContent = 'Password reset! Redirecting to login...'; errEl.style.display = 'block'; errEl.style.color = '#22c55e';
        setTimeout(() => { toggleReset(false); }, 2000);
      } catch(err) { errEl.textContent = err.message; errEl.style.display = 'block'; errEl.style.color = '#ef4444'; }
    }
    async function login(e) {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const errEl = document.getElementById('error');
      errEl.style.display = 'none';
      try {
        const res = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.ok) { window.location.href = '/'; }
        else { errEl.textContent = data.error; errEl.style.display = 'block'; }
      } catch { errEl.textContent = 'Network error'; errEl.style.display = 'block'; }
    }
  </script>
  <script>${METEOR_JS}</script>
</body>
</html>`;
}

function adminPage(user) {
  const isAdmin = user.role === 'admin';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${INSTANCE_NAME} | Admin</title>
  ${RUHI_FAVICON_LINK}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Parkinsans:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #0a0a0a;
      --bg-sidebar: rgb(8,8,8);
      --bg-card: rgba(255,255,255,0.03);
      --bg-hover: rgba(255,255,255,0.06);
      --border: rgba(255,255,255,0.08);
      --border-solid: rgb(40,40,40);
      --text: #e8e8e8;
      --text-dim: rgba(255,255,255,0.45);
      --text-muted: rgb(100,100,100);
      --accent: #FFC01C;
      --accent-soft: rgba(255,192,28,0.08);
      --gold: #FFC01C;
      --green: #22c55e;
      --red: #ef4444;
      --rail-w: 48px;
    }
    body { font-family: 'Google Sans', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
    a { color: var(--gold); text-decoration: none; }

    /* Sidebar Rail */
    .sidebar-rail {
      position: fixed; left: 0; top: 0; bottom: 0; width: var(--rail-w);
      background: var(--bg-sidebar); border-right: 1px solid var(--border-solid);
      display: flex; flex-direction: column; align-items: center;
      padding: 12px 0; z-index: 100; gap: 0;
    }
    .rail-logo {
      width: 32px; height: 32px; border-radius: 10px;
      background: var(--accent); display: flex; align-items: center; justify-content: center;
      cursor: pointer; margin-bottom: 20px; flex-shrink: 0;
      font-size: 1.1rem; color: rgb(5,5,5); font-weight: 700;
    }
    .rail-nav { display: flex; flex-direction: column; gap: 4px; align-items: center; flex: 1; }
    .rail-btn {
      width: 36px; height: 36px; border-radius: 10px; border: none;
      background: transparent; color: var(--text-muted); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s; position: relative;
    }
    .rail-btn:hover { background: var(--bg-hover); color: var(--text); }
    .rail-btn.active { color: var(--accent); background: var(--accent-soft); }
    .rail-btn svg { width: 18px; height: 18px; }
    .rail-bottom { margin-top: auto; display: flex; flex-direction: column; gap: 4px; align-items: center; }
    .rail-avatar {
      width: 28px; height: 28px; border-radius: 50%;
      background: var(--border-solid); color: var(--text-dim);
      display: flex; align-items: center; justify-content: center;
      font-size: 0.7rem; font-weight: 600; cursor: pointer;
    }

    .page-wrapper {
      margin-left: var(--rail-w);
    }

    .content-area { padding: 28px; max-width: 920px; margin: 0 auto; }
    h1 { font-family: 'Parkinsans', sans-serif; font-size: 1.5rem; margin-bottom: 4px; font-weight: 600; }
    .subtitle { color: #a1a1aa; margin-bottom: 24px; font-size: 0.875rem; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding: 20px 32px; border-bottom: 1px solid var(--border); }
    .header-right { display: flex; gap: 12px; align-items: center; }
    .btn { padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer; font-size: 0.875rem; font-family: inherit; font-weight: 500; }
    .btn-primary { background: #e5a819; color: #0a0a0a; font-weight: 600; }
    .btn-primary:hover { background: #d19a15; }
    .btn-danger { background: #ef4444; color: #fff; }
    .btn-danger:hover { background: #dc2626; }
    .btn-sm { padding: 5px 10px; font-size: 0.8rem; }
    .btn-outline { background: transparent; border: 1px solid #27272a; color: #fafafa; }
    .btn-outline:hover { background: #27272a; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 11px 14px; border-bottom: 1px solid #27272a; }
    th { color: #a1a1aa; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
    td { font-size: 0.875rem; }
    .badge { padding: 3px 10px; border-radius: 10px; font-size: 0.75rem; font-weight: 500; }
    .badge-admin { background: #e5a81920; color: #e5a819; }
    .badge-user { background: #52525b20; color: #a1a1aa; }
    .badge-active { background: #22c55e20; color: #22c55e; }
    .badge-suspended { background: #ef444420; color: #ef4444; }
    .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); justify-content: center; align-items: center; z-index: 100; }
    .modal-overlay.active { display: flex; }
    .modal { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 28px; width: 100%; max-width: 420px; }
    .modal h2 { font-size: 1.15rem; margin-bottom: 18px; font-weight: 600; }
    .form-group { margin-bottom: 14px; }
    .form-group label { display: block; font-size: 0.8rem; color: #a1a1aa; margin-bottom: 4px; font-weight: 500; }
    .form-group input, .form-group select { width: 100%; padding: 9px 12px; background: #0a0a0a; border: 1px solid #27272a; border-radius: 8px; color: #fafafa; font-size: 0.875rem; font-family: inherit; }
    .form-group input:focus, .form-group select:focus { outline: none; border-color: #e5a819; }
    .form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; }
    .toast { position: fixed; bottom: 24px; right: 24px; padding: 10px 18px; border-radius: 10px; font-size: 0.875rem; font-family: inherit; display: none; z-index: 200; }
    .toast-success { background: #22c55e; color: #fff; }
    .toast-error { background: #ef4444; color: #fff; }

    @media (max-width: 768px) {
      .sidebar-rail { display: none; }
      .page-wrapper { margin-left: 0; }
      .header, .content-area { padding-left: 16px; padding-right: 16px; }
    }
  </style>
</head>
<body>
  <!-- Sidebar Rail -->
  <nav class="sidebar-rail">
    <div class="rail-logo" title="${INSTANCE_NAME}" onclick="window.location.href='/'" style="cursor:pointer">
      \u2726
    </div>
    <div class="rail-nav">
      <button class="rail-btn" onclick="window.location.href='/'" title="Chat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </button>
      <button class="rail-btn" onclick="window.location.href='/'" title="History">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </button>
      <button class="rail-btn" onclick="window.location.href='/reports'" title="Reports" style="position:relative">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      </button>
      <button class="rail-btn" onclick="window.location.href='/vault'" title="Vault">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
      ${isAdmin ? `<button class="rail-btn active" onclick="window.location.href='/mission'" title="Mission Control">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      </button>` : ''}
    </div>

    <div class="rail-bottom">
      ${isAdmin ? `<button class="rail-btn" onclick="window.location.href='/admin/brain-health'" title="Brain Health">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      </button>` : ''}
      <div class="rail-avatar" title="${user.name || user.email}">
        ${(user.name || user.email || '?')[0].toUpperCase()}
      </div>
    </div>
  </nav>

  <div class="page-wrapper">
  <div class="header">
    <div>
      <h1>${INSTANCE_NAME} Admin</h1>
      <p class="subtitle">Manage users &mdash; ${user.email}</p>
    </div>
    <div class="header-right">
      <a href="/admin/api-keys" class="btn btn-outline">API Keys</a>
      <a href="/admin/brain-health" class="btn btn-outline">Brain Health</a>
      <button class="btn btn-primary" onclick="showAddModal()">Add User</button>
    </div>
  </div>
  <div class="content-area">
  <table>
    <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
    <tbody id="users-table"></tbody>
  </table>
  </div><!-- /content-area -->
  </div><!-- /page-wrapper -->
  <div class="modal-overlay" id="modal">
    <div class="modal">
      <h2 id="modal-title">Add User</h2>
      <div class="form-group"><label>Email</label><input type="email" id="f-email" placeholder="user@ikawn.com"></div>
      <div class="form-group"><label>Name</label><input type="text" id="f-name" placeholder="Name"></div>
      <div class="form-group" id="pw-group"><label>Password</label><input type="password" id="f-pw" placeholder="Min 6 characters"></div>
      <div class="form-group"><label>Role</label><select id="f-role"><option value="user">User</option><option value="admin">Admin</option></select></div>
      <div class="form-group" id="status-group" style="display:none"><label>Status</label><select id="f-status"><option value="active">Active</option><option value="suspended">Suspended</option></select></div>
      <div class="form-actions">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitModal()">Save</button>
      </div>
    </div>
  </div>
  <div class="modal-overlay" id="pw-modal">
    <div class="modal">
      <h2>Reset Password</h2>
      <p style="color:#a1a1aa;font-size:0.85rem;margin-bottom:12px" id="pw-email"></p>
      <div class="form-group"><label>New Password</label><input type="password" id="pw-new" placeholder="Min 6 characters"></div>
      <div class="form-actions">
        <button class="btn btn-outline" onclick="closePwModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitResetPw()">Reset</button>
      </div>
    </div>
  </div>
  <div class="toast" id="toast"></div>
  <script>
    let editingId = null;
    let resetPwId = null;
    async function loadUsers() {
      const res = await fetch('/admin/api/users');
      const users = await res.json();
      document.getElementById('users-table').innerHTML = users.map(u => \`
        <tr>
          <td>\${u.email}</td><td>\${u.name || '—'}</td>
          <td><span class="badge badge-\${u.role}">\${u.role}</span></td>
          <td><span class="badge badge-\${u.status}">\${u.status}</span></td>
          <td>\${u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="showEditModal(\${u.id},'\${u.email}','\${u.name||''}','\${u.role}','\${u.status}')">Edit</button>
            <button class="btn btn-sm btn-outline" onclick="showResetPw(\${u.id},'\${u.email}')">Reset PW</button>
            \${u.status==='active'
              ? \`<button class="btn btn-sm btn-danger" onclick="toggleStatus(\${u.id},'suspended')">Suspend</button>\`
              : \`<button class="btn btn-sm btn-primary" onclick="toggleStatus(\${u.id},'active')">Activate</button>\`}
          </td>
        </tr>\`).join('');
    }
    function showAddModal() { editingId=null; document.getElementById('modal-title').textContent='Add User'; document.getElementById('f-email').value=''; document.getElementById('f-email').disabled=false; document.getElementById('f-name').value=''; document.getElementById('f-pw').value=''; document.getElementById('f-role').value='user'; document.getElementById('pw-group').style.display='block'; document.getElementById('status-group').style.display='none'; document.getElementById('modal').classList.add('active'); }
    function showEditModal(id,email,name,role,status) { editingId=id; document.getElementById('modal-title').textContent='Edit User'; document.getElementById('f-email').value=email; document.getElementById('f-email').disabled=true; document.getElementById('f-name').value=name; document.getElementById('f-role').value=role; document.getElementById('f-status').value=status; document.getElementById('pw-group').style.display='none'; document.getElementById('status-group').style.display='block'; document.getElementById('modal').classList.add('active'); }
    function closeModal() { document.getElementById('modal').classList.remove('active'); }
    async function submitModal() {
      const email=document.getElementById('f-email').value, name=document.getElementById('f-name').value, role=document.getElementById('f-role').value, status=document.getElementById('f-status').value, password=document.getElementById('f-pw').value;
      try {
        const res = editingId
          ? await fetch('/admin/api/users/'+editingId, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,role,status}) })
          : await fetch('/admin/api/users', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,name,role,password}) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast(editingId?'User updated':'User added','success'); closeModal(); loadUsers();
      } catch(err) { toast(err.message,'error'); }
    }
    async function toggleStatus(id,status) {
      try { const res=await fetch('/admin/api/users/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})}); const data=await res.json(); if(!res.ok) throw new Error(data.error); toast(status==='suspended'?'User suspended':'User activated','success'); loadUsers(); } catch(err) { toast(err.message,'error'); }
    }
    function showResetPw(id,email) { resetPwId=id; document.getElementById('pw-email').textContent=email; document.getElementById('pw-new').value=''; document.getElementById('pw-modal').classList.add('active'); }
    function closePwModal() { document.getElementById('pw-modal').classList.remove('active'); }
    async function submitResetPw() {
      const password = document.getElementById('pw-new').value;
      if (!password || password.length < 6) { toast('Password must be at least 6 characters','error'); return; }
      try {
        const res = await fetch('/admin/api/users/'+resetPwId+'/password', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password}) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast('Password reset','success'); closePwModal();
      } catch(err) { toast(err.message,'error'); }
    }
    function toast(msg,type) { const el=document.getElementById('toast'); el.textContent=msg; el.className='toast toast-'+type; el.style.display='block'; setTimeout(()=>{el.style.display='none';},3000); }
    loadUsers();
  </script>
</body>
</html>`;
}

function settingsPage(user) {
  const isAdmin = user.role === 'admin';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${INSTANCE_NAME} | Settings</title>
  ${RUHI_FAVICON_LINK}
  ${GOOGLE_FONTS}
  <style>
    ${BASE_STYLES}
    :root {
      --bg: #0a0a0a;
      --bg-sidebar: rgb(8,8,8);
      --bg-hover: rgba(255,255,255,0.06);
      --border-solid: rgb(40,40,40);
      --text-dim-rail: rgba(255,255,255,0.45);
      --text-muted-rail: rgb(100,100,100);
      --accent: #FFC01C;
      --accent-soft: rgba(255,192,28,0.08);
      --gold: #FFC01C;
      --rail-w: 48px;
    }
    body { min-height: 100vh; }

    /* Sidebar Rail */
    .sidebar-rail {
      position: fixed; left: 0; top: 0; bottom: 0; width: var(--rail-w);
      background: var(--bg-sidebar); border-right: 1px solid var(--border-solid);
      display: flex; flex-direction: column; align-items: center;
      padding: 12px 0; z-index: 100; gap: 0;
    }
    .rail-logo {
      width: 32px; height: 32px; border-radius: 10px;
      background: var(--accent); display: flex; align-items: center; justify-content: center;
      cursor: pointer; margin-bottom: 20px; flex-shrink: 0;
      font-size: 1.1rem; color: rgb(5,5,5); font-weight: 700;
    }
    .rail-nav { display: flex; flex-direction: column; gap: 4px; align-items: center; flex: 1; }
    .rail-btn {
      width: 36px; height: 36px; border-radius: 10px; border: none;
      background: transparent; color: var(--text-muted-rail); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s; position: relative;
    }
    .rail-btn:hover { background: var(--bg-hover); color: #e8e8e8; }
    .rail-btn.active { color: var(--accent); background: var(--accent-soft); }
    .rail-btn svg { width: 18px; height: 18px; }
    .rail-bottom { margin-top: auto; display: flex; flex-direction: column; gap: 4px; align-items: center; }
    .rail-avatar {
      width: 28px; height: 28px; border-radius: 50%;
      background: var(--border-solid); color: var(--text-dim-rail);
      display: flex; align-items: center; justify-content: center;
      font-size: 0.7rem; font-weight: 600; cursor: pointer;
    }

    .page-wrapper {
      margin-left: var(--rail-w);
      display: flex; justify-content: center; align-items: flex-start;
      min-height: 100vh; padding-top: 40px; padding-bottom: 40px;
    }

    .container { padding: 40px; width: 100%; max-width: 460px; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; font-weight: 600; }
    .subtitle { color: #a1a1aa; margin-bottom: 28px; font-size: 0.875rem; }
    .form-group { margin-bottom: 14px; }
    .form-group label { display: block; font-size: 0.8rem; color: #a1a1aa; margin-bottom: 4px; font-weight: 500; }
    .form-group input, .form-group textarea { width: 100%; padding: 11px 14px; background: #18181b; border: 1px solid #27272a; border-radius: 8px; color: #fafafa; font-size: 1rem; font-family: inherit; }
    .form-group input:focus, .form-group textarea:focus { outline: none; border-color: #e5a819; box-shadow: 0 0 0 3px #e5a81920; }
    .form-group textarea { resize: vertical; min-height: 80px; line-height: 1.5; }
    .char-count { font-size: 0.75rem; color: #71717a; text-align: right; margin-top: 2px; }
    .section-title { font-size: 0.95rem; font-weight: 600; margin-top: 28px; margin-bottom: 4px; }
    .section-desc { font-size: 0.8rem; color: #71717a; margin-bottom: 12px; }
    hr.divider { border: none; border-top: 1px solid #27272a; margin: 28px 0; }
    button { width: 100%; padding: 12px; background: #e5a819; color: #0a0a0a; border: none; border-radius: 8px; font-size: 1rem; font-family: inherit; cursor: pointer; margin-top: 8px; font-weight: 600; }
    button:hover { background: #d19a15; }
    .msg { margin-top: 12px; font-size: 0.875rem; display: none; text-align: center; }
    .msg-success { color: #22c55e; }
    .msg-error { color: #ef4444; }
    .back { margin-bottom: 20px; display: inline-block; }

    @media (max-width: 768px) {
      .sidebar-rail { display: none; }
      .page-wrapper { margin-left: 0; }
    }

    /* Connected Services */
    .connector-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border: 1px solid #27272a;
      border-radius: 10px;
      margin-bottom: 10px;
      background: rgba(255, 255, 255, 0.025);
    }
    .connector-info { display: flex; align-items: center; gap: 12px; }
    .connector-icon {
      width: 34px; height: 34px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 15px; color: #fff; flex-shrink: 0;
    }
    .connector-name { font-size: 0.9rem; font-weight: 600; color: #fafafa; }
    .connector-services { font-size: 0.75rem; color: #71717a; margin-top: 1px; }
    .connector-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
    .btn-connect {
      background: #e5a819; color: #0a0a0a; border: none;
      padding: 7px 18px; border-radius: 8px; font-weight: 600;
      cursor: pointer; font-size: 0.85rem; font-family: inherit;
      white-space: nowrap; width: auto; margin-top: 0;
    }
    .btn-connect:hover { background: #d19a15; }
    .btn-connected {
      background: rgba(16, 185, 129, 0.12); color: #10B981;
      border: 1px solid rgba(16, 185, 129, 0.25);
      padding: 7px 14px; border-radius: 8px; font-weight: 500;
      font-size: 0.85rem; font-family: inherit; cursor: default;
      white-space: nowrap;
    }
    .btn-disconnect {
      background: transparent; color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.25);
      padding: 5px 12px; border-radius: 8px; font-size: 0.78rem;
      cursor: pointer; font-family: inherit; white-space: nowrap;
      width: auto; margin-top: 0;
    }
    .btn-disconnect:hover { background: rgba(239, 68, 68, 0.08); }
    .btn-connect:disabled, .btn-disconnect:disabled {
      opacity: 0.5; cursor: not-allowed;
    }
    .connect-toast {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: #18181b; border: 1px solid rgba(16, 185, 129, 0.3);
      color: #10B981; padding: 10px 20px; border-radius: 10px;
      font-size: 0.85rem; font-weight: 500; z-index: 1000;
      opacity: 0; transition: opacity 0.3s ease; pointer-events: none;
    }
    .connect-toast.visible { opacity: 1; }
  </style>
</head>
<body>
  <!-- Sidebar Rail -->
  <nav class="sidebar-rail">
    <div class="rail-logo" title="${INSTANCE_NAME}" onclick="window.location.href='/'" style="cursor:pointer">
      \u2726
    </div>
    <div class="rail-nav">
      <button class="rail-btn" onclick="window.location.href='/'" title="Chat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </button>
      <button class="rail-btn" onclick="window.location.href='/'" title="History">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </button>
      <button class="rail-btn" onclick="window.location.href='/reports'" title="Reports" style="position:relative">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      </button>
      <button class="rail-btn" onclick="window.location.href='/vault'" title="Vault">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
      ${isAdmin ? `<button class="rail-btn" onclick="window.location.href='/mission'" title="Mission Control">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      </button>` : ''}
    </div>

    <div class="rail-bottom">
      ${isAdmin ? `<button class="rail-btn" onclick="window.location.href='/admin/brain-health'" title="Brain Health">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      </button>` : ''}
      <div class="rail-avatar" title="${user.name || user.email}">
        ${(user.name || user.email || '?')[0].toUpperCase()}
      </div>
    </div>
  </nav>

  <div class="page-wrapper">
  <div class="container">
    <a href="/" class="back">&larr; Back</a>
    <h1>Settings</h1>
    <p class="subtitle">${user.email}</p>

    <p class="section-title">Custom Instructions</p>
    <p class="section-desc">Tell ${INSTANCE_NAME} about yourself — your role, preferences, or how you'd like responses. This is added to every conversation.</p>
    <form onsubmit="saveInstructions(event)">
      <div class="form-group">
        <textarea id="instructions" maxlength="500" placeholder="e.g. I'm the CTO. Keep answers technical and concise. Always suggest test cases."></textarea>
        <div class="char-count"><span id="charCount">0</span>/500</div>
      </div>
      <button type="submit">Save Instructions</button>
    </form>
    <p class="msg" id="instrMsg"></p>

    <hr class="divider">

    <p class="section-title">Change Password</p>
    <form onsubmit="changePw(event)">
      <div class="form-group"><label>Current Password</label><input type="password" id="current" placeholder="Current password"></div>
      <div class="form-group"><label>New Password</label><input type="password" id="newpw" placeholder="Min 6 characters"></div>
      <div class="form-group"><label>Confirm New Password</label><input type="password" id="confirm" placeholder="Confirm new password"></div>
      <button type="submit">Change Password</button>
    </form>
    <p class="msg" id="msg"></p>

    <hr class="divider">

    <p class="section-title">Connected Services</p>
    <p class="section-desc">Connect external accounts so ${INSTANCE_NAME} can read your email, calendar, and analytics data.</p>

    <div id="connectors-loading" style="text-align:center;color:#71717a;font-size:0.85rem;padding:16px 0;">Loading services...</div>
    <div id="connectors-error" style="display:none;text-align:center;color:#ef4444;font-size:0.85rem;padding:16px 0;">
      Unable to load connectors. <a href="#" onclick="loadConnectors();return false;" style="color:#e5a819;">Retry</a>
    </div>

    <div id="connector-google" class="connector-card" style="display:none;">
      <div class="connector-info">
        <div class="connector-icon" style="background:#4285F4;">G</div>
        <div>
          <div class="connector-name">Google</div>
          <div class="connector-services">Gmail, Calendar, Analytics</div>
        </div>
      </div>
      <div class="connector-actions" id="google-actions"></div>
    </div>

    <div id="connector-microsoft" class="connector-card" style="display:none;">
      <div class="connector-info">
        <div class="connector-icon" style="background:#00A4EF;">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect width="6" height="6" fill="#fff"/><rect x="8" width="6" height="6" fill="#fff"/><rect y="8" width="6" height="6" fill="#fff"/><rect x="8" y="8" width="6" height="6" fill="#fff"/></svg>
        </div>
        <div>
          <div class="connector-name">Microsoft</div>
          <div class="connector-services">Outlook, Calendar</div>
        </div>
      </div>
      <div class="connector-actions" id="microsoft-actions"></div>
    </div>

    <div id="connector-meta" class="connector-card" style="display:none;">
      <div class="connector-info">
        <div class="connector-icon" style="background:#1877F2;">M</div>
        <div>
          <div class="connector-name">Meta</div>
          <div class="connector-services">Campaign Insights</div>
        </div>
      </div>
      <div class="connector-actions" id="meta-actions"></div>
    </div>

    <div id="connect-toast" class="connect-toast"></div>
  </div>
  </div><!-- /.page-wrapper -->
  <script>
    // Custom Instructions
    const instrEl = document.getElementById('instructions');
    const charCountEl = document.getElementById('charCount');
    instrEl.addEventListener('input', () => { charCountEl.textContent = instrEl.value.length; });

    (async () => {
      try {
        const r = await fetch('/api/custom-instructions');
        if (r.ok) {
          const d = await r.json();
          instrEl.value = d.custom_instructions || '';
          charCountEl.textContent = instrEl.value.length;
        }
      } catch(e) {}
    })();

    async function saveInstructions(e) {
      e.preventDefault();
      const msgEl = document.getElementById('instrMsg');
      msgEl.style.display = 'none';
      try {
        const res = await fetch('/api/custom-instructions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ custom_instructions: instrEl.value })
        });
        if (!res.ok) throw new Error((await res.json()).error);
        showMsgOn(msgEl, 'Saved', 'success');
      } catch(err) { showMsgOn(msgEl, err.message, 'error'); }
    }

    function showMsgOn(el, text, type) {
      el.textContent = text;
      el.className = 'msg msg-' + type;
      el.style.display = 'block';
    }

    async function changePw(e) {
      e.preventDefault();
      const msgEl = document.getElementById('msg');
      msgEl.style.display = 'none';
      const current_password = document.getElementById('current').value;
      const new_password = document.getElementById('newpw').value;
      const confirm = document.getElementById('confirm').value;
      if (new_password !== confirm) { showMsg('Passwords do not match', 'error'); return; }
      if (new_password.length < 6) { showMsg('Password must be at least 6 characters', 'error'); return; }
      try {
        const res = await fetch('/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_password, new_password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showMsg('Password changed successfully', 'success');
        document.getElementById('current').value = '';
        document.getElementById('newpw').value = '';
        document.getElementById('confirm').value = '';
      } catch(err) { showMsg(err.message, 'error'); }
    }
    function showMsg(text, type) { showMsgOn(document.getElementById('msg'), text, type); }

    // ── Connected Services ──
    var PROVIDERS = {
      google: { types: ['gmail', 'google_calendar', 'google_analytics'], oauth: 'google' },
      microsoft: { types: ['outlook', 'outlook_calendar'], oauth: 'microsoft' },
      meta: { types: ['meta_campaigns'], oauth: 'meta' },
    };

    function renderActions(provider, connectedTypes) {
      var cfg = PROVIDERS[provider];
      var el = document.getElementById(provider + '-actions');
      if (!el) return;
      // Clear existing children
      while (el.firstChild) el.removeChild(el.firstChild);
      var isConnected = cfg.types.some(function(t) { return connectedTypes.has(t); });
      if (isConnected) {
        var badge = document.createElement('span');
        badge.className = 'btn-connected';
        badge.textContent = 'Connected';
        el.appendChild(badge);
        var dcBtn = document.createElement('button');
        dcBtn.className = 'btn-disconnect';
        dcBtn.textContent = 'Disconnect';
        dcBtn.setAttribute('data-provider', provider);
        dcBtn.addEventListener('click', function() { disconnectProvider(this.getAttribute('data-provider')); });
        el.appendChild(dcBtn);
      } else {
        var cBtn = document.createElement('button');
        cBtn.className = 'btn-connect';
        cBtn.textContent = 'Connect';
        cBtn.setAttribute('data-provider', provider);
        cBtn.addEventListener('click', function() { connectProvider(this.getAttribute('data-provider')); });
        el.appendChild(cBtn);
      }
    }

    async function loadConnectors() {
      var loadingEl = document.getElementById('connectors-loading');
      var errorEl = document.getElementById('connectors-error');
      loadingEl.style.display = 'block';
      errorEl.style.display = 'none';
      try {
        var res = await fetch('/api/connectors');
        if (!res.ok) throw new Error('Failed to fetch');
        var data = await res.json();
        loadingEl.style.display = 'none';
        var connectedTypes = new Set((data.connectors || []).filter(function(c) { return c.status === 'active'; }).map(function(c) { return c.connector_type; }));
        Object.keys(PROVIDERS).forEach(function(p) {
          document.getElementById('connector-' + p).style.display = 'flex';
          renderActions(p, connectedTypes);
        });
      } catch(e) {
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
        Object.keys(PROVIDERS).forEach(function(p) {
          document.getElementById('connector-' + p).style.display = 'flex';
          renderActions(p, new Set());
        });
      }
    }

    async function connectProvider(provider) {
      var cfg = PROVIDERS[provider];
      var btn = document.querySelector('#' + provider + '-actions .btn-connect');
      if (btn) { btn.disabled = true; btn.textContent = 'Connecting...'; }
      try {
        var res = await fetch('/api/connectors/oauth/' + cfg.oauth + '/start');
        var data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          alert(data.error || data.message || 'OAuth is not configured for this provider.');
          if (btn) { btn.disabled = false; btn.textContent = 'Connect'; }
        }
      } catch(e) {
        alert('Failed to start connection. Please try again.');
        if (btn) { btn.disabled = false; btn.textContent = 'Connect'; }
      }
    }

    async function disconnectProvider(provider) {
      var cfg = PROVIDERS[provider];
      if (!confirm('Disconnect ' + provider.charAt(0).toUpperCase() + provider.slice(1) + '? This will remove all linked services.')) return;
      var btn = document.querySelector('#' + provider + '-actions .btn-disconnect');
      if (btn) { btn.disabled = true; btn.textContent = 'Removing...'; }
      try {
        await Promise.all(cfg.types.map(function(t) { return fetch('/api/connectors/' + t, { method: 'DELETE' }); }));
        loadConnectors();
      } catch(e) {
        alert('Failed to disconnect. Please try again.');
        loadConnectors();
      }
    }

    function showToast(text) {
      var toast = document.getElementById('connect-toast');
      toast.textContent = text;
      toast.classList.add('visible');
      setTimeout(function() { toast.classList.remove('visible'); }, 4000);
    }

    // Check for OAuth redirect params
    (function checkRedirect() {
      var params = new URLSearchParams(window.location.search);
      var connected = params.get('connected');
      var error = params.get('error');
      if (connected) {
        showToast('Successfully connected: ' + connected.split(',').map(function(s) { return s.trim(); }).join(', '));
        window.history.replaceState({}, '', '/settings');
      }
      if (error) {
        var friendlyErrors = {
          google_oauth_denied: 'Google authorization was denied.',
          google_oauth_failed: 'Google connection failed. Please try again.',
          microsoft_oauth_denied: 'Microsoft authorization was denied.',
          microsoft_oauth_failed: 'Microsoft connection failed. Please try again.',
          meta_oauth_denied: 'Meta authorization was denied.',
          meta_oauth_failed: 'Meta connection failed. Please try again.',
        };
        alert(friendlyErrors[error] || 'Connection failed: ' + error);
        window.history.replaceState({}, '', '/settings');
      }
    })();

    // Load connectors on page load
    loadConnectors();
  </script>
</body>
</html>`;
}

module.exports = router;
