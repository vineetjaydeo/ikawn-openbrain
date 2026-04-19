import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useAuth } from '@/hooks/useAuth';
import { useThemeMode } from '@/pages/AppShell';
import {
  useCustomInstructions,
  useSaveCustomInstructions,
  useChangePassword,
} from '@/hooks/useSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const MAX_INSTRUCTIONS = 500;

function FeedbackMessage({
  type,
  message,
}: {
  type: 'success' | 'error';
  message: string;
}) {
  return (
    <p
      className={cn(
        'text-sm mt-2',
        type === 'success' ? 'text-emerald-400' : 'text-red-400',
      )}
    >
      {message}
    </p>
  );
}

// --- Profile Section ---

function ProfileSection() {
  const user = useAuthStore((s) => s.user);

  if (!user) return null;

  return (
    <Card className="bg-[#111] border-white/[0.08]">
      <CardHeader>
        <CardTitle className="text-white text-lg">Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/50">Name</span>
          <span className="text-sm text-white">{user.name}</span>
        </div>
        <Separator className="bg-white/[0.08]" />
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/50">Email</span>
          <span className="text-sm text-white">{user.email}</span>
        </div>
        <Separator className="bg-white/[0.08]" />
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/50">Role</span>
          <Badge
            variant="outline"
            className="border-[#FFC01C]/30 text-[#FFC01C] text-xs"
          >
            {user.role}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Custom Instructions Section ---

function CustomInstructionsSection() {
  const { data, isLoading } = useCustomInstructions();
  const saveMutation = useSaveCustomInstructions();
  const [instructions, setInstructions] = useState('');
  const [savedValue, setSavedValue] = useState('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (data) {
      const val = data.instructions ?? '';
      setInstructions(val);
      setSavedValue(val);
    }
  }, [data]);

  const charCount = instructions.length;
  const isOverLimit = charCount > MAX_INSTRUCTIONS;
  const isUnchanged = instructions === savedValue;
  const canSave = !isOverLimit && !isUnchanged && !saveMutation.isPending;

  const handleSave = async () => {
    setFeedback(null);
    try {
      await saveMutation.mutateAsync(instructions);
      setSavedValue(instructions);
      setFeedback({ type: 'success', message: 'Instructions saved.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to save instructions.',
      });
    }
  };

  return (
    <Card className="bg-[#111] border-white/[0.08]">
      <CardHeader>
        <CardTitle className="text-white text-lg">
          Custom Instructions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-white/50">
          Tell Lucy how to respond. These instructions apply to every
          conversation.
        </p>
        <Textarea
          value={instructions}
          onChange={(e) => {
            setInstructions(e.target.value);
            setFeedback(null);
          }}
          placeholder={isLoading ? 'Loading...' : 'e.g. Always respond in Hindi.'}
          disabled={isLoading}
          rows={4}
          className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/30 resize-none focus-visible:ring-[#FFC01C]/40"
        />
        <div className="flex items-center justify-between">
          <span
            className={cn(
              'text-xs',
              isOverLimit ? 'text-red-400' : 'text-white/40',
            )}
          >
            {charCount}/{MAX_INSTRUCTIONS}
          </span>
          <Button
            onClick={handleSave}
            disabled={!canSave}
            size="sm"
            className="bg-[#FFC01C] text-black hover:bg-[#F59E0B] disabled:opacity-40"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
        {feedback && (
          <FeedbackMessage type={feedback.type} message={feedback.message} />
        )}
      </CardContent>
    </Card>
  );
}

// --- Change Password Section ---

function ChangePasswordSection() {
  const changePasswordMutation = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const passwordsMatch = newPassword === confirmPassword;
  const meetsMinLength = newPassword.length >= 6;
  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    passwordsMatch &&
    meetsMinLength &&
    !changePasswordMutation.isPending;

  const handleSubmit = async () => {
    setFeedback(null);
    try {
      await changePasswordMutation.mutateAsync({
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFeedback({ type: 'success', message: 'Password changed successfully.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to change password.',
      });
    }
  };

  return (
    <Card className="bg-[#111] border-white/[0.08]">
      <CardHeader>
        <CardTitle className="text-white text-lg">Change Password</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => {
            setCurrentPassword(e.target.value);
            setFeedback(null);
          }}
          className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/30 focus-visible:ring-[#FFC01C]/40"
        />
        <Input
          type="password"
          placeholder="New password"
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            setFeedback(null);
          }}
          className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/30 focus-visible:ring-[#FFC01C]/40"
        />
        <Input
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setFeedback(null);
          }}
          className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/30 focus-visible:ring-[#FFC01C]/40"
        />
        {newPassword.length > 0 && !meetsMinLength && (
          <p className="text-xs text-white/40">Minimum 6 characters.</p>
        )}
        {confirmPassword.length > 0 && !passwordsMatch && (
          <p className="text-xs text-red-400">Passwords do not match.</p>
        )}
        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            size="sm"
            className="bg-[#FFC01C] text-black hover:bg-[#F59E0B] disabled:opacity-40"
          >
            {changePasswordMutation.isPending ? 'Changing...' : 'Change Password'}
          </Button>
        </div>
        {feedback && (
          <FeedbackMessage type={feedback.type} message={feedback.message} />
        )}
      </CardContent>
    </Card>
  );
}

// --- Appearance Section ---

function AppearanceSection() {
  const { mode, toggle } = useThemeMode();

  return (
    <Card className="bg-[#111] border-white/[0.08]">
      <CardHeader>
        <CardTitle className="text-white text-lg">Appearance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white">Theme</p>
            <p className="text-xs text-white/40 mt-0.5">
              {mode === 'dark' ? 'Dark mode is active.' : 'Light mode is active.'}
            </p>
          </div>
          <Button
            onClick={toggle}
            variant="outline"
            size="sm"
            className="border-white/[0.12] text-white/70 hover:bg-white/[0.06]"
          >
            {mode === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Sign Out Section ---

function SignOutSection() {
  const { logout } = useAuth();

  return (
    <Card className="bg-[#111] border-white/[0.08]">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white">Sign out</p>
            <p className="text-xs text-white/40 mt-0.5">
              End your current session.
            </p>
          </div>
          <Button
            onClick={() => logout()}
            variant="outline"
            size="sm"
            className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            Sign Out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Main Page ---

export default function Settings() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <h1 className="text-2xl font-semibold text-white tracking-tight">
          Settings
        </h1>
        <ProfileSection />
        <CustomInstructionsSection />
        <ChangePasswordSection />
        <AppearanceSection />
        <SignOutSection />
      </div>
    </div>
  );
}
