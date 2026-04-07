import { useState } from 'react'
import { useAdminUsers, useCreateUser, useUpdateUser, useResetPassword, type AdminUser } from '@/hooks/useAdmin'
import { ArrowLeft, Plus, Loader2, Shield, User as UserIcon, X, KeyRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { User } from '@/hooks/useAuth'

interface Props {
  user: User | null
}

export function AdminPage({ user }: Props) {
  const navigate = useNavigate()
  const { data: users, isLoading, error } = useAdminUsers()
  const createMutation = useCreateUser()
  const updateMutation = useUpdateUser()
  const resetPwMutation = useResetPassword()

  const [showAddModal, setShowAddModal] = useState(false)
  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [resetPwUser, setResetPwUser] = useState<AdminUser | null>(null)

  // Add user form state
  const [formEmail, setFormEmail] = useState('')
  const [formName, setFormName] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRole, setFormRole] = useState('user')

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editStatus, setEditStatus] = useState('')

  // Reset pw state
  const [newPassword, setNewPassword] = useState('')

  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--text-secondary)]">
        Access denied. Admin only.
      </div>
    )
  }

  function openAdd() {
    setFormEmail('')
    setFormName('')
    setFormPassword('')
    setFormRole('user')
    setShowAddModal(true)
  }

  function openEdit(u: AdminUser) {
    setEditUser(u)
    setEditName(u.name || '')
    setEditRole(u.role)
    setEditStatus(u.status)
  }

  function handleCreate() {
    createMutation.mutate(
      { email: formEmail, name: formName, password: formPassword, role: formRole },
      {
        onSuccess: () => { toast.success('User created'); setShowAddModal(false) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleUpdate() {
    if (!editUser) return
    updateMutation.mutate(
      { id: editUser.id, name: editName, role: editRole, status: editStatus },
      {
        onSuccess: () => { toast.success('User updated'); setEditUser(null) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleToggleStatus(u: AdminUser) {
    const newStatus = u.status === 'active' ? 'suspended' : 'active'
    updateMutation.mutate(
      { id: u.id, status: newStatus },
      {
        onSuccess: () => toast.success(newStatus === 'suspended' ? 'User suspended' : 'User activated'),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleResetPw() {
    if (!resetPwUser || newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    resetPwMutation.mutate(
      { id: resetPwUser.id, password: newPassword },
      {
        onSuccess: () => { toast.success('Password reset'); setResetPwUser(null); setNewPassword('') },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-4xl px-6 py-10">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/chat')}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[hsl(var(--border))] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="font-[Parkinsans] text-xl font-semibold text-[var(--text)]">Admin</h1>
              <p className="text-sm text-[var(--text-secondary)]">Manage users</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/admin/brain-health')}
              className="rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            >
              Brain Health
            </button>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 rounded-lg bg-[var(--gold)] px-3 py-2 text-sm font-semibold text-[hsl(var(--background))] transition-colors hover:bg-[var(--gold-hover)]"
            >
              <Plus size={16} /> Add User
            </button>
          </div>
        </div>

        {/* Users Table */}
        {isLoading ? (
          <TableSkeleton />
        ) : error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-400">
            Failed to load users.{' '}
            <button onClick={() => window.location.reload()} className="underline">
              Retry
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[hsl(var(--border))]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Last Login</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users?.map((u, i) => (
                  <tr
                    key={u.id}
                    className={`border-b border-[hsl(var(--border))] last:border-0 ${i % 2 === 1 ? 'bg-[var(--surface-2)]' : ''}`}
                  >
                    <td className="px-4 py-3 text-sm text-[var(--text)]">{u.email}</td>
                    <td className="px-4 py-3 text-sm text-[var(--text)]">{u.name || '--'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${u.role === 'admin' ? 'bg-[var(--gold)]/15 text-[var(--gold)]' : 'bg-white/5 text-[var(--text-secondary)]'}`}>
                        {u.role === 'admin' ? <Shield size={12} /> : <UserIcon size={12} />}
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.status === 'active' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                      {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(u)}
                          className="rounded px-2 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => { setResetPwUser(u); setNewPassword('') }}
                          className="rounded px-2 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
                        >
                          Reset PW
                        </button>
                        <button
                          onClick={() => handleToggleStatus(u)}
                          className={`rounded px-2 py-1 text-xs transition-colors ${u.status === 'active' ? 'text-red-400 hover:bg-red-500/10' : 'text-green-400 hover:bg-green-500/10'}`}
                        >
                          {u.status === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add User Modal */}
        {showAddModal && (
          <Modal title="Add User" onClose={() => setShowAddModal(false)}>
            <Field label="Email">
              <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="user@ikawn.com" className="modal-input" />
            </Field>
            <Field label="Name">
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Full name" className="modal-input" />
            </Field>
            <Field label="Password">
              <input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="Min 6 characters" className="modal-input" />
            </Field>
            <Field label="Role">
              <select value={formRole} onChange={(e) => setFormRole(e.target.value)} className="modal-input">
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowAddModal(false)} className="rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-2)]">Cancel</button>
              <button onClick={handleCreate} disabled={createMutation.isPending} className="flex items-center gap-2 rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-semibold text-[hsl(var(--background))] hover:bg-[var(--gold-hover)] disabled:opacity-50">
                {createMutation.isPending && <Loader2 size={14} className="animate-spin" />} Save
              </button>
            </div>
          </Modal>
        )}

        {/* Edit User Modal */}
        {editUser && (
          <Modal title="Edit User" onClose={() => setEditUser(null)}>
            <Field label="Email">
              <input type="email" value={editUser.email} disabled className="modal-input opacity-50" />
            </Field>
            <Field label="Name">
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="modal-input" />
            </Field>
            <Field label="Role">
              <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="modal-input">
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <Field label="Status">
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="modal-input">
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </Field>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditUser(null)} className="rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-2)]">Cancel</button>
              <button onClick={handleUpdate} disabled={updateMutation.isPending} className="flex items-center gap-2 rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-semibold text-[hsl(var(--background))] hover:bg-[var(--gold-hover)] disabled:opacity-50">
                {updateMutation.isPending && <Loader2 size={14} className="animate-spin" />} Save
              </button>
            </div>
          </Modal>
        )}

        {/* Reset Password Modal */}
        {resetPwUser && (
          <Modal title="Reset Password" onClose={() => setResetPwUser(null)}>
            <p className="mb-3 text-sm text-[var(--text-secondary)]">{resetPwUser.email}</p>
            <Field label="New Password">
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 6 characters" className="modal-input" />
            </Field>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setResetPwUser(null)} className="rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-2)]">Cancel</button>
              <button onClick={handleResetPw} disabled={resetPwMutation.isPending} className="flex items-center gap-2 rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-semibold text-[hsl(var(--background))] hover:bg-[var(--gold-hover)] disabled:opacity-50">
                {resetPwMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                <KeyRound size={14} /> Reset
              </button>
            </div>
          </Modal>
        )}
      </div>
    </div>
  )
}

// ── Shared sub-components ──

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text)]"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{label}</label>
      {children}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[var(--surface-1)]">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-[hsl(var(--border))] px-4 py-4 last:border-0">
          <div className="h-4 w-40 animate-pulse rounded bg-[var(--surface-3)]" />
          <div className="h-4 w-24 animate-pulse rounded bg-[var(--surface-3)]" />
          <div className="h-4 w-16 animate-pulse rounded bg-[var(--surface-3)]" />
          <div className="h-4 w-16 animate-pulse rounded bg-[var(--surface-3)]" />
          <div className="ml-auto h-4 w-20 animate-pulse rounded bg-[var(--surface-3)]" />
        </div>
      ))}
    </div>
  )
}
