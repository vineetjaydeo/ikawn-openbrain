const { Router } = require('express');
const { requireAuth, requireAdmin } = require('../auth');

const router = Router();

router.get('/login', (req, res) => {
  if (req.session && req.session.user) return res.redirect('/');
  res.send(loginPage());
});

router.get('/admin', requireAuth, requireAdmin, (req, res) => {
  res.send(adminPage(req.session.user));
});

function loginPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenBrain - Login</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e0e0e0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .container { text-align: center; padding: 40px; width: 100%; max-width: 360px; }
    h1 { font-size: 2rem; margin-bottom: 8px; color: #fff; }
    p { color: #888; margin-bottom: 24px; }
    input { width: 100%; padding: 12px 14px; background: #141414; border: 1px solid #333; border-radius: 8px; color: #e0e0e0; font-size: 1rem; margin-bottom: 12px; }
    input:focus { outline: none; border-color: #3b82f6; }
    button { width: 100%; padding: 12px; background: #3b82f6; color: #fff; border: none; border-radius: 8px; font-size: 1rem; cursor: pointer; }
    button:hover { background: #2563eb; }
    .error { color: #ef4444; margin-top: 12px; display: none; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>OpenBrain</h1>
    <p>Enter your @ikawn.com email</p>
    <form onsubmit="login(event)">
      <input type="email" id="email" placeholder="you@ikawn.com" autofocus>
      <button type="submit">Sign In</button>
    </form>
    <p class="error" id="error"></p>
  </div>
  <script>
    async function login(e) {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const errEl = document.getElementById('error');
      errEl.style.display = 'none';
      try {
        const res = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.ok) { window.location.href = '/'; }
        else { errEl.textContent = data.error; errEl.style.display = 'block'; }
      } catch { errEl.textContent = 'Network error'; errEl.style.display = 'block'; }
    }
  </script>
</body>
</html>`;
}

function adminPage(user) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenBrain - Admin</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 24px; max-width: 900px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; }
    .subtitle { color: #888; margin-bottom: 24px; font-size: 0.875rem; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .header-right { display: flex; gap: 12px; align-items: center; }
    .btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 0.875rem; }
    .btn-primary { background: #3b82f6; color: #fff; }
    .btn-primary:hover { background: #2563eb; }
    .btn-danger { background: #ef4444; color: #fff; }
    .btn-danger:hover { background: #dc2626; }
    .btn-sm { padding: 4px 10px; font-size: 0.8rem; }
    .btn-outline { background: transparent; border: 1px solid #333; color: #e0e0e0; }
    .btn-outline:hover { background: #1a1a1a; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #1a1a1a; }
    th { color: #888; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
    td { font-size: 0.875rem; }
    .badge { padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; }
    .badge-admin { background: #3b82f620; color: #60a5fa; }
    .badge-user { background: #6b728020; color: #9ca3af; }
    .badge-active { background: #22c55e20; color: #4ade80; }
    .badge-suspended { background: #ef444420; color: #f87171; }
    .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); justify-content: center; align-items: center; z-index: 100; }
    .modal-overlay.active { display: flex; }
    .modal { background: #141414; border: 1px solid #222; border-radius: 12px; padding: 24px; width: 100%; max-width: 400px; }
    .modal h2 { font-size: 1.1rem; margin-bottom: 16px; }
    .form-group { margin-bottom: 14px; }
    .form-group label { display: block; font-size: 0.8rem; color: #888; margin-bottom: 4px; }
    .form-group input, .form-group select { width: 100%; padding: 8px 10px; background: #0a0a0a; border: 1px solid #333; border-radius: 6px; color: #e0e0e0; font-size: 0.875rem; }
    .form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
    .toast { position: fixed; bottom: 24px; right: 24px; padding: 10px 16px; border-radius: 8px; font-size: 0.875rem; display: none; z-index: 200; }
    .toast-success { background: #22c55e; color: #fff; }
    .toast-error { background: #ef4444; color: #fff; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>OpenBrain Admin</h1>
      <p class="subtitle">Manage users &mdash; ${user.email}</p>
    </div>
    <div class="header-right">
      <a href="/">&larr; Back</a>
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
      <div class="form-group"><label>Role</label><select id="f-role"><option value="user">User</option><option value="admin">Admin</option></select></div>
      <div class="form-group" id="status-group" style="display:none"><label>Status</label><select id="f-status"><option value="active">Active</option><option value="suspended">Suspended</option></select></div>
      <div class="form-actions">
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitModal()">Save</button>
      </div>
    </div>
  </div>
  <div class="toast" id="toast"></div>
  <script>
    let editingId = null;
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
            \${u.status==='active'
              ? \`<button class="btn btn-sm btn-danger" onclick="toggleStatus(\${u.id},'suspended')">Suspend</button>\`
              : \`<button class="btn btn-sm btn-primary" onclick="toggleStatus(\${u.id},'active')">Activate</button>\`}
          </td>
        </tr>\`).join('');
    }
    function showAddModal() { editingId=null; document.getElementById('modal-title').textContent='Add User'; document.getElementById('f-email').value=''; document.getElementById('f-email').disabled=false; document.getElementById('f-name').value=''; document.getElementById('f-role').value='user'; document.getElementById('status-group').style.display='none'; document.getElementById('modal').classList.add('active'); }
    function showEditModal(id,email,name,role,status) { editingId=id; document.getElementById('modal-title').textContent='Edit User'; document.getElementById('f-email').value=email; document.getElementById('f-email').disabled=true; document.getElementById('f-name').value=name; document.getElementById('f-role').value=role; document.getElementById('f-status').value=status; document.getElementById('status-group').style.display='block'; document.getElementById('modal').classList.add('active'); }
    function closeModal() { document.getElementById('modal').classList.remove('active'); }
    async function submitModal() {
      const email=document.getElementById('f-email').value, name=document.getElementById('f-name').value, role=document.getElementById('f-role').value, status=document.getElementById('f-status').value;
      try {
        const res = editingId
          ? await fetch('/admin/api/users/'+editingId, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,role,status}) })
          : await fetch('/admin/api/users', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,name,role}) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast(editingId?'User updated':'User added','success'); closeModal(); loadUsers();
      } catch(err) { toast(err.message,'error'); }
    }
    async function toggleStatus(id,status) {
      try { const res=await fetch('/admin/api/users/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})}); const data=await res.json(); if(!res.ok) throw new Error(data.error); toast(status==='suspended'?'User suspended':'User activated','success'); loadUsers(); } catch(err) { toast(err.message,'error'); }
    }
    function toast(msg,type) { const el=document.getElementById('toast'); el.textContent=msg; el.className='toast toast-'+type; el.style.display='block'; setTimeout(()=>{el.style.display='none';},3000); }
    loadUsers();
  </script>
</body>
</html>`;
}

module.exports = router;
