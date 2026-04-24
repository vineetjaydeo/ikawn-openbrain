import {
  Check,
  CheckCircle2,
  Eye,
  FileEdit,
  FilePlus,
  FolderTree,
  Globe,
  ListChecks,
  type LucideIcon,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { useMemo } from 'react';
import type { ToolCallPayload } from '../../store';
import type { TodoItem } from '../../types';

export interface WorkingCardProps {
  calls: ToolCallPayload[];
}

/**
 * Renders a tight vertical cluster of tool rows.
 * Visual grouping is intentional only when consecutive tool calls arrived
 * between two prose flushes.
 */
export function WorkingCard({ calls }: WorkingCardProps) {
  const rows = useMemo(() => buildRows(calls).filter((r) => !r.todos), [calls]);
  if (rows.length === 0) return null;
  return (
    <div className="space-y-[var(--space-1)]">
      {rows.map((row) => (
        <ToolRowView key={row.key} row={row} />
      ))}
    </div>
  );
}

/**
 * Inline todo list -- driven by a `set_todos` payload at this
 * chronological position. Rendered where the agent actually called the tool.
 */
export function InlineTodoList({ call }: { call: ToolCallPayload }) {
  const todos = useMemo(() => extractTodos(call), [call]);
  if (todos.length === 0) return null;
  return <TodoListView todos={todos} />;
}

/**
 * Standalone todo list for the legacy store-driven `todos` array.
 */
export function TodoChecklist({ todos }: { todos: TodoItem[] }) {
  if (todos.length === 0) return null;
  const mapped = todos.map((t) => ({
    text: t.label,
    status: t.done ? ('completed' as const) : ('pending' as const),
  }));
  return <TodoListView todos={mapped} />;
}

interface TodoViewItem {
  text: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface ToolRow {
  key: string;
  Icon: LucideIcon;
  label: string;
  detail: string | null;
  status: 'running' | 'done' | 'error';
  todos?: TodoViewItem[];
  editCount?: number;
}

function extractTodos(call: ToolCallPayload): TodoViewItem[] {
  const raw = (call.args?.['todos'] as unknown) ?? (call.args?.['items'] as unknown) ?? null;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it): TodoViewItem | null => {
      if (typeof it !== 'object' || it === null) return null;
      const o = it as Record<string, unknown>;
      const text =
        typeof o['content'] === 'string'
          ? (o['content'] as string)
          : typeof o['text'] === 'string'
            ? (o['text'] as string)
            : typeof o['label'] === 'string'
              ? (o['label'] as string)
              : null;
      if (text === null) return null;
      const rawStatus = o['status'];
      const status: TodoViewItem['status'] =
        rawStatus === 'completed' || rawStatus === 'in_progress' || rawStatus === 'pending'
          ? rawStatus
          : o['checked'] === true || o['done'] === true
            ? 'completed'
            : 'pending';
      return { text, status };
    })
    .filter((x): x is TodoViewItem => x !== null);
}

function isEditCommand(call: ToolCallPayload): boolean {
  const cmd = call.args?.['command'] as string | undefined;
  return cmd === 'str_replace' || cmd === 'insert';
}

function isCreateCommand(call: ToolCallPayload): boolean {
  const cmd = call.args?.['command'] as string | undefined;
  return cmd === 'create';
}

function isTextEditorTool(call: ToolCallPayload): boolean {
  return call.toolName === 'str_replace_based_edit_tool' || call.toolName === 'text_editor';
}

function pathOf(call: ToolCallPayload): string | null {
  const p = call.args?.['path'];
  return typeof p === 'string' ? p : null;
}

function commandOf(call: ToolCallPayload): string | undefined {
  const c = call.args?.['command'];
  return typeof c === 'string' ? c : undefined;
}

function iconAndLabel(call: ToolCallPayload): { Icon: LucideIcon; label: string } {
  if (call.toolName === 'set_todos') return { Icon: ListChecks, label: 'set_todos' };
  if (call.toolName === 'load_skill') return { Icon: Sparkles, label: 'load_skill' };
  if (call.toolName === 'verify_html') return { Icon: CheckCircle2, label: 'verify_html' };
  if (call.toolName === 'read_url') return { Icon: Globe, label: 'read_url' };
  if (call.toolName === 'list_files') return { Icon: FolderTree, label: 'list_files' };
  if (isTextEditorTool(call)) {
    const cmd = commandOf(call);
    if (cmd === 'view') return { Icon: Eye, label: 'view' };
    if (isCreateCommand(call)) return { Icon: FilePlus, label: 'create' };
    if (isEditCommand(call)) return { Icon: FileEdit, label: 'edit' };
    return { Icon: FileEdit, label: cmd ?? 'edit' };
  }
  return { Icon: Wrench, label: call.toolName };
}

function detailOf(call: ToolCallPayload): string | null {
  const path = pathOf(call);
  if (path) return path;
  const name = call.args?.['name'];
  if (typeof name === 'string') return name;
  const url = call.args?.['url'];
  if (typeof url === 'string') return url;
  return null;
}

export function buildRows(calls: ToolCallPayload[]): ToolRow[] {
  const rows: ToolRow[] = [];
  let lastEditIdx = -1;
  for (let i = 0; i < calls.length; i += 1) {
    const call = calls[i];
    if (!call) continue;

    // Internal signal tools -- hide from UI
    if (call.toolName === 'done') continue;

    if (call.toolName === 'set_todos') {
      const items = extractTodos(call);
      const existingIdx = rows.findIndex((r) => r.todos !== undefined);
      const existing = existingIdx >= 0 ? rows[existingIdx] : undefined;
      const row: ToolRow = {
        key: `todos-${i}`,
        Icon: ListChecks,
        label: 'set_todos',
        detail: null,
        status: call.status,
        todos: items.length > 0 ? items : (existing?.todos ?? items),
      };
      if (existingIdx >= 0) {
        rows[existingIdx] = row;
      } else {
        rows.push(row);
      }
      continue;
    }

    const { Icon, label } = iconAndLabel(call);
    const detail = detailOf(call);
    const isFileEdit = isTextEditorTool(call) && Boolean(detail);

    if (isFileEdit && detail) {
      const candidateIdx =
        lastEditIdx >= 0 && rows[lastEditIdx]?.detail === detail ? lastEditIdx : -1;
      const last = candidateIdx >= 0 ? rows[candidateIdx] : undefined;
      if (last) {
        last.editCount = (last.editCount ?? 1) + 1;
        last.label = 'edit';
        last.Icon = FileEdit;
        if (call.status === 'running') last.status = 'running';
        else if (call.status === 'error') last.status = 'error';
        else if (last.status !== 'running' && last.status !== 'error') last.status = 'done';
        continue;
      }
    }

    rows.push({
      key: `c-${i}`,
      Icon,
      label,
      detail,
      status: call.status,
    });
    if (isFileEdit) lastEditIdx = rows.length - 1;
  }
  return rows;
}

/* -- Todo checklist card -------------------------------------------------- */

function TodoListView({ todos }: { todos: TodoViewItem[] }) {
  const done = todos.filter((it) => it.status === 'completed').length;
  const total = todos.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-muted)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-2_5)] space-y-[var(--space-2)]">
      {/* Progress header */}
      <div className="flex items-center gap-[var(--space-2)]">
        <ListChecks
          className="w-[13px] h-[13px] shrink-0 text-[var(--color-text-muted)]"
          aria-hidden
        />
        <div className="flex-1 h-[3px] rounded-full bg-[var(--color-background-secondary)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[11px] tabular-nums text-[var(--color-text-muted)] shrink-0">
          {done}/{total}
        </span>
      </div>
      {/* Items */}
      <div className="space-y-[3px]">
        {todos.map((todo, i) => (
          <div
            key={`${i}-${todo.text.slice(0, 12)}`}
            className="flex items-start gap-[var(--space-2)] text-[12.5px] leading-[1.4]"
          >
            {todo.status === 'completed' ? (
              <span className="mt-[2px] inline-flex items-center justify-center w-[14px] h-[14px] rounded-[3px] bg-[var(--color-accent)] shrink-0">
                <Check className="w-[10px] h-[10px] text-white" strokeWidth={3} />
              </span>
            ) : todo.status === 'in_progress' ? (
              <span className="mt-[2px] inline-block w-[14px] h-[14px] rounded-[3px] border-2 border-[var(--color-accent)] bg-[var(--color-accent)]/10 shrink-0 animate-pulse" />
            ) : (
              <span className="mt-[2px] inline-block w-[14px] h-[14px] rounded-[3px] border border-[var(--color-border)] shrink-0" />
            )}
            <span
              className={
                todo.status === 'completed'
                  ? 'line-through text-[var(--color-text-muted)]'
                  : todo.status === 'in_progress'
                    ? 'text-[var(--color-text-primary)] font-medium'
                    : 'text-[var(--color-text-primary)]'
              }
            >
              {todo.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -- Individual tool row -------------------------------------------------- */

function ToolRowView({ row }: { row: ToolRow }) {
  const { Icon } = row;
  const detailText =
    row.detail && row.editCount && row.editCount > 1
      ? `${row.detail} (${row.editCount} edits)`
      : row.detail;

  return (
    <div
      className="flex items-center gap-[6px] text-[12.5px] py-[1px]"
      title={detailText ?? row.label}
    >
      {row.status === 'running' ? (
        <span className="relative inline-flex w-[14px] h-[14px] items-center justify-center shrink-0">
          <span className="absolute inline-block w-[7px] h-[7px] rounded-full bg-[var(--color-accent)] animate-pulse" />
          <span className="absolute inline-block w-[12px] h-[12px] rounded-full border border-[var(--color-accent)]/30 animate-ping" />
        </span>
      ) : row.status === 'error' ? (
        <Icon className="w-[14px] h-[14px] shrink-0 text-[var(--color-error)]" aria-hidden />
      ) : (
        <Icon className="w-[14px] h-[14px] shrink-0 text-[var(--color-text-muted)]" aria-hidden />
      )}
      <span className="font-[var(--font-mono),ui-monospace,Menlo,monospace] text-[var(--color-text-secondary)]">
        {row.label}
      </span>
      {detailText ? (
        <span className="font-[var(--font-mono),ui-monospace,Menlo,monospace] text-[var(--color-text-primary)] truncate">
          {detailText}
        </span>
      ) : null}
    </div>
  );
}
