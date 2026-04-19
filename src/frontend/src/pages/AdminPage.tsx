import { useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth';
import {
  useAdminUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useResetPassword,
  type AdminUser,
} from '@/hooks/useAdmin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// ---------- Add User Form ----------

function AddUserForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');

  const createUser = useCreateUser();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createUser.mutateAsync({ name, email, password, role });
    onClose();
  };

  return (
    <Card className="border-zinc-800 bg-zinc-900/80 mb-6">
      <CardHeader className="pb-4">
        <CardTitle className="text-base text-zinc-100">New User</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
          <Input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
          <Input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'user' | 'admin')}
            className="h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-[#FFC01C]/50"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <div className="sm:col-span-2 flex gap-3 justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createUser.isPending}
              className="bg-[#FFC01C] text-black hover:bg-[#F59E0B]"
            >
              {createUser.isPending ? 'Creating...' : 'Create User'}
            </Button>
          </div>
          {createUser.isError && (
            <p className="sm:col-span-2 text-sm text-red-400">
              {createUser.error?.message || 'Failed to create user'}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

// ---------- Reset Password Inline ----------

function ResetPasswordInline({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const resetPassword = useResetPassword();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await resetPassword.mutateAsync({ id: userId, password });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-2">
      <Input
        placeholder="New password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={6}
        className="h-8 w-48 bg-zinc-800 border-zinc-700 text-zinc-100 text-sm placeholder:text-zinc-500"
      />
      <Button
        type="submit"
        size="sm"
        disabled={resetPassword.isPending}
        className="h-8 bg-[#FFC01C] text-black hover:bg-[#F59E0B] text-xs"
      >
        {resetPassword.isPending ? '...' : 'Set'}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onClose}
        className="h-8 text-zinc-500 hover:text-zinc-300 text-xs"
      >
        Cancel
      </Button>
      {resetPassword.isError && (
        <span className="text-xs text-red-400">Failed</span>
      )}
    </form>
  );
}

// ---------- User Row ----------

function UserRow({ user }: { user: AdminUser }) {
  const [showResetPw, setShowResetPw] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const toggleActive = useCallback(() => {
    updateUser.mutate({
      id: user.id,
      is_active: !user.is_active,
    });
  }, [user.id, user.is_active, updateUser]);

  const handleDelete = useCallback(() => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteUser.mutate(user.id);
  }, [confirmDelete, user.id, deleteUser]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="group">
      <div className="grid grid-cols-[1fr_1fr_auto_auto_auto_auto] items-center gap-4 px-4 py-3 hover:bg-zinc-800/50 transition-colors">
        {/* Name */}
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-100 truncate">{user.name}</p>
          <p className="text-xs text-zinc-500 truncate">{user.email}</p>
        </div>

        {/* Last Login */}
        <p className="text-sm text-zinc-400">{formatDate(user.last_login)}</p>

        {/* Role Badge */}
        <Badge
          variant="outline"
          className={cn(
            'text-xs capitalize',
            user.role === 'admin'
              ? 'border-[#FFC01C]/50 text-[#FFC01C]'
              : 'border-zinc-600 text-zinc-400',
          )}
        >
          {user.role}
        </Badge>

        {/* Status Badge */}
        <Badge
          variant="outline"
          className={cn(
            'text-xs',
            user.is_active
              ? 'border-emerald-600/50 text-emerald-400'
              : 'border-red-600/50 text-red-400',
          )}
        >
          {user.is_active ? 'Active' : 'Suspended'}
        </Badge>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={toggleActive}
            disabled={updateUser.isPending}
            className="h-7 text-xs text-zinc-400 hover:text-zinc-200"
          >
            {user.is_active ? 'Suspend' : 'Activate'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowResetPw(!showResetPw)}
            className="h-7 text-xs text-zinc-400 hover:text-zinc-200"
          >
            Reset PW
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDelete}
            disabled={deleteUser.isPending}
            className={cn(
              'h-7 text-xs',
              confirmDelete
                ? 'text-red-400 hover:text-red-300'
                : 'text-zinc-400 hover:text-zinc-200',
            )}
          >
            {confirmDelete ? 'Confirm?' : 'Delete'}
          </Button>
        </div>
      </div>

      {showResetPw && (
        <div className="px-4 pb-3">
          <ResetPasswordInline
            userId={user.id}
            onClose={() => setShowResetPw(false)}
          />
        </div>
      )}

      <Separator className="bg-zinc-800/60" />
    </div>
  );
}

// ---------- Main Page ----------

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: users, isLoading, error } = useAdminUsers();

  // Access guard
  if (!user || user.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-zinc-100 mb-2">Access Denied</h2>
          <p className="text-sm text-zinc-500">
            You do not have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">User Management</h1>
        <Button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-[#FFC01C] text-black hover:bg-[#F59E0B]"
        >
          {showAddForm ? 'Cancel' : 'Add User'}
        </Button>
      </div>

      {/* Add User Form */}
      {showAddForm && (
        <AddUserForm onClose={() => setShowAddForm(false)} />
      )}

      {/* User Table */}
      <Card className="border-zinc-800 bg-zinc-900/60 overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[1fr_1fr_auto_auto_auto_auto] items-center gap-4 px-4 py-2.5 bg-zinc-800/40 border-b border-zinc-800">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            User
          </span>
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            Last Login
          </span>
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            Role
          </span>
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            Status
          </span>
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            Actions
          </span>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="px-4 py-12 text-center text-sm text-zinc-500">
            Loading users...
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-4 py-12 text-center text-sm text-red-400">
            Failed to load users: {error.message}
          </div>
        )}

        {/* Empty */}
        {users && users.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-zinc-500">
            No users found.
          </div>
        )}

        {/* Rows */}
        {users?.map((u) => <UserRow key={u.id} user={u} />)}
      </Card>
    </div>
  );
}
