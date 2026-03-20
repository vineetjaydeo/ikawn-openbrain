const { Router } = require('express');
const { requireAuth, requireAdmin } = require('../auth');
const { RUHI_FAVICON_LINK, RUHI_ICON_URL } = require('../utils/ruhi-assets');
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
  <title>OpenBrain | Sign In</title>
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
    <div class="brand-icon"><img src="${RUHI_ICON_URL}" alt="Ruhi"></div>
    <h1>Ruhi</h1>
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
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenBrain | Admin</title>
  ${RUHI_FAVICON_LINK}
  ${GOOGLE_FONTS}
  <style>
    ${BASE_STYLES}
    body { padding: 28px; max-width: 920px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; font-weight: 600; }
    .subtitle { color: #a1a1aa; margin-bottom: 24px; font-size: 0.875rem; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .header-right { display: flex; gap: 12px; align-items: center; }
    .btn { padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer; font-size: 0.875rem; font-family: inherit; font-weight: 500; }
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
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:12px;">
      <a href="/" class="btn btn-outline" style="padding:8px 12px;font-size:1.1rem;line-height:1;text-decoration:none;" title="Back to chat">&larr;</a>
      <div>
        <h1>Ruhi Admin</h1>
        <p class="subtitle">Manage users &mdash; ${user.email}</p>
      </div>
    </div>
    <div class="header-right">
      <a href="/admin/api-keys" class="btn btn-outline">API Keys</a>
      <a href="/admin/brain-health" class="btn btn-outline">Brain Health</a>
      <button class="btn btn-primary" onclick="showAddModal()">Add User</button>
    </div>
  </div>
  <table>
    <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
    <tbody id="users-table"></tbody>
  </table>
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
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenBrain | Settings</title>
  ${RUHI_FAVICON_LINK}
  ${GOOGLE_FONTS}
  <style>
    ${BASE_STYLES}
    body { display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .container { padding: 40px; width: 100%; max-width: 420px; }
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
  </style>
</head>
<body>
  <div class="container">
    <a href="/" class="back">&larr; Back</a>
    <h1>Settings</h1>
    <p class="subtitle">${user.email}</p>

    <p class="section-title">Custom Instructions</p>
    <p class="section-desc">Tell Ruhi about yourself — your role, preferences, or how you'd like responses. This is added to every conversation.</p>
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
  </div>
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
  </script>
</body>
</html>`;
}

module.exports = router;
