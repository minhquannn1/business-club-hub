import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, FolderKanban, NotebookPen, Search, Table2, UserRound, Plus } from 'lucide-react';
import { useStore } from '../lib/store';

interface Item {
  id: string;
  label: string;
  sub?: string;
  kind: string;
  icon: JSX.Element;
  go: string;
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { projects, tasks, members, meetings, sheets, isExec } = useStore();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const nav = useNavigate();
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const match = (...xs: (string | undefined)[]) => !s || xs.some((x) => x?.toLowerCase().includes(s));
    const out: Item[] = [];
    const actions: Item[] = [
      { id: 'a-task', label: 'New task', kind: 'Action', icon: <Plus />, go: '/app/tasks?new=1' },
      { id: 'a-meet', label: 'New meeting notes', kind: 'Action', icon: <Plus />, go: '/app/meetings/new' },
      ...(isExec ? [{ id: 'a-proj', label: 'New project or event', kind: 'Action', icon: <Plus />, go: '/app/projects?new=1' }] : []),
    ];
    out.push(...actions.filter((a) => match(a.label)));
    out.push(
      ...projects.filter((p) => match(p.title, p.summary)).map((p) => ({ id: p.id, label: p.title, sub: p.summary, kind: 'Project', icon: <FolderKanban />, go: `/app/projects/${p.id}` })),
    );
    out.push(
      ...tasks
        .filter((t) => s && match(t.title))
        .slice(0, 12)
        .map((t) => ({ id: t.id, label: t.title, kind: 'Task', icon: <CheckSquare />, go: `/app/tasks?open=${t.id}` })),
    );
    out.push(...meetings.filter((m) => s && match(m.title)).map((m) => ({ id: m.id, label: m.title, sub: m.date, kind: 'Meeting', icon: <NotebookPen />, go: `/app/meetings/${m.id}` })));
    out.push(...sheets.filter((x) => match(x.name)).map((x) => ({ id: x.id, label: x.name, kind: 'Sheet', icon: <Table2 />, go: `/app/finance/${x.id}` })));
    out.push(
      ...members
        .filter((m) => s && match(m.name, m.email, m.title))
        .map((m) => ({ id: m.id, label: m.name || m.email, sub: m.title, kind: 'Member', icon: <UserRound />, go: `/app/members?open=${encodeURIComponent(m.id)}` })),
    );
    return out.slice(0, 40);
  }, [q, projects, tasks, members, meetings, sheets, isExec]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const choose = (it: Item | undefined) => {
    if (!it) return;
    onClose();
    nav(it.go);
  };

  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search the workspace">
        <div className="palette-input">
          <Search size={18} className="faint" />
          <input
            autoFocus
            value={q}
            placeholder="Search projects, tasks, people, sheets..."
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((x) => Math.min(x + 1, items.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((x) => Math.max(x - 1, 0));
              }
              if (e.key === 'Enter') choose(items[sel]);
            }}
            aria-controls="palette-list"
          />
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {items.length === 0 && <div className="palette-group">Nothing matches "{q}"</div>}
          {items.map((it, i) => (
            <button key={it.kind + it.id} role="option" aria-selected={i === sel} className="palette-item" onMouseEnter={() => setSel(i)} onClick={() => choose(it)}>
              {it.icon}
              <span className="ellipsis">{it.label}</span>
              {it.sub && <span className="faint small ellipsis">{it.sub}</span>}
              <span className="kind">{it.kind}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
