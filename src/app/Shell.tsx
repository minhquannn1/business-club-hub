import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity as ActivityIcon,
  CheckSquare,
  FolderKanban,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Moon,
  NotebookPen,
  Search,
  Sun,
  UserRound,
  Users,
  Wallet,
  X,
  ExternalLink,
  Megaphone,
  Plus,
  ReceiptText,
  Trophy,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { setActor } from '../lib/actions';
import { Avatar, useMenu } from '../components/ui';
import { LogoMark } from '../components/Art';
import { CommandPalette } from './CommandPalette';
import { ProfileModal } from './Members';
import { TaskForm } from './tasks';
import { LedgerEntryForm } from './ledgerEntry';
import { AnnouncementModal } from './announcements';
import '../styles/app.css';

function getTheme(): 'light' | 'dark' | 'system' {
  try {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'system';
  } catch {
    return 'system';
  }
}
function applyTheme(t: 'light' | 'dark' | 'system') {
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  try {
    if (t === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', t);
  } catch {
    /* storage unavailable */
  }
}

export function Shell() {
  const store = useStore();
  const { me, myEmail, site, isExec, isGuest, canFinance, canWebsite, tasks, signOut } = store;
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [profile, setProfile] = useState(false);
  const [adding, setAdding] = useState(false);
  const [quick, setQuick] = useState<'task' | 'expense' | 'announce' | null>(null);
  const loc = useLocation();
  const nav = useNavigate();
  const menu = useMenu();
  const userBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => setActor(myEmail), [myEmail]);
  // other pages can ask for the profile window (the welcome card does)
  useEffect(() => {
    const h = () => setProfile(true);
    window.addEventListener('open-profile', h);
    return () => window.removeEventListener('open-profile', h);
  }, []);
  useEffect(() => setDrawer(false), [loc.pathname]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const myOpen = useMemo(() => tasks.filter((t) => t.assigneeEmail === myEmail && t.status !== 'done').length, [tasks, myEmail]);

  const links: { to: string; label: string; icon: ReactNode; badge?: number; end?: boolean; website?: boolean; club?: boolean }[] = [
    { to: '/app', label: 'Overview', icon: <LayoutDashboard />, end: true },
    { to: '/app/projects', label: 'Projects', icon: <FolderKanban /> },
    { to: '/app/competitions', label: 'Competitions', icon: <Trophy /> },
    { to: '/app/tasks', label: 'Tasks', icon: <CheckSquare />, badge: myOpen },
    { to: '/app/meetings', label: 'Meetings', icon: <NotebookPen /> },
    { to: '/app/finance', label: 'Finance', icon: <Wallet />, club: true },
    { to: '/app/members', label: 'Members', icon: <Users />, club: true },
    { to: '/app/activity', label: 'Activity', icon: <ActivityIcon />, club: true },
    { to: '/app/website', label: 'Website', icon: <Globe />, website: true },
  ];

  const theme = getTheme();
  const openUserMenu = () =>
    menu.open(userBtn.current!, [
      { label: 'Edit my profile', icon: <UserRound />, onSelect: () => setProfile(true) },
      {
        label: theme === 'dark' ? 'Use light theme' : 'Use dark theme',
        icon: theme === 'dark' ? <Sun /> : <Moon />,
        onSelect: () => applyTheme(theme === 'dark' ? 'light' : 'dark'),
      },
      ...(theme !== 'system' ? [{ label: 'Match my device theme', icon: <Moon />, onSelect: () => applyTheme('system') }] : []),
      { label: 'View public website', icon: <ExternalLink />, onSelect: () => nav('/') },
      { label: 'Sign out', icon: <LogOut />, onSelect: () => signOut().then(() => nav('/')), divider: true },
    ]);

  const sidebar = (
    <>
      <div className="side-top">
        <Link to="/app" className="side-brand">
          <LogoMark size={32} />
          <span className="ellipsis">{site.shortName || site.clubName}</span>
        </Link>
        <button className="btn btn-ghost btn-icon side-close" onClick={() => setDrawer(false)} aria-label="Close menu">
          <X />
        </button>
      </div>
      <button className="side-search" onClick={() => setPalette(true)}>
        <Search size={16} />
        <span>Search</span>
        <kbd>Ctrl K</kbd>
      </button>
      <nav className="side-nav" aria-label="Workspace">
        {links
          .filter((l) => (!l.website || canWebsite) && (!l.club || !isGuest))
          .map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className="side-link">
              {l.icon}
              <span>{l.label}</span>
              {!!l.badge && <span className="side-badge">{l.badge}</span>}
            </NavLink>
          ))}
      </nav>
      <button ref={userBtn} className="side-user" onClick={openUserMenu} aria-haspopup="menu">
        <Avatar member={me} email={myEmail} size={32} />
        <span className="side-user-text">
          <strong className="ellipsis">{me?.name || myEmail}</strong>
          <span className="ellipsis">{isGuest ? 'Guest' : isExec ? me?.title || 'Exec team' : me?.title || 'Member'}</span>
        </span>
      </button>
    </>
  );

  return (
    <div className="shell">
      <aside className={`side ${drawer ? 'open' : ''}`}>{sidebar}</aside>
      {drawer && <div className="side-scrim" onClick={() => setDrawer(false)} />}
      <div className="main">
        <div className="mobile-bar">
          <button className="btn btn-ghost btn-icon" onClick={() => setDrawer(true)} aria-label="Open menu">
            <MenuIcon />
          </button>
          <Link to="/app" className="side-brand">
            <LogoMark size={30} title={site.shortName || site.clubName} />
          </Link>
          <button className="btn btn-ghost btn-icon" onClick={() => setPalette(true)} aria-label="Search">
            <Search />
          </button>
        </div>
        {isGuest && /^\/app\/(finance|members|activity|website|import)/.test(loc.pathname) ? <Navigate to="/app" replace /> : <Outlet />}
      </div>
      <nav className="tabbar" aria-label="Quick navigation">
        <NavLink to="/app" end className="tab">
          <LayoutDashboard />
          <span>Home</span>
        </NavLink>
        <NavLink to="/app/tasks" className="tab">
          <CheckSquare />
          <span>Tasks</span>
          {!!myOpen && <span className="tab-badge">{myOpen}</span>}
        </NavLink>
        <button className="tab tab-add" onClick={() => setAdding(true)} aria-label="Add something">
          <Plus />
        </button>
        <NavLink to="/app/projects" className="tab">
          <FolderKanban />
          <span>Projects</span>
        </NavLink>
        <button className="tab" onClick={() => setDrawer(true)}>
          <MenuIcon />
          <span>More</span>
        </button>
      </nav>
      {adding && (
        <div className="sheet-overlay" onMouseDown={(e) => e.target === e.currentTarget && setAdding(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Add something">
            <span className="sheet-grip" aria-hidden="true" />
            {[
              { key: 'task', icon: <CheckSquare />, label: 'Task', hint: 'Something someone needs to do', show: true },
              { key: 'notes', icon: <NotebookPen />, label: 'Meeting notes', hint: 'What was decided and who does what', show: !isGuest },
              { key: 'expense', icon: <ReceiptText />, label: 'Money spent or received', hint: 'Goes into the club ledger', show: canFinance },
              { key: 'announce', icon: <Megaphone />, label: 'Announcement', hint: 'Shows on everyone\'s Overview, can be emailed', show: isExec },
            ]
              .filter((o) => o.show)
              .map((o) => (
                <button
                  key={o.key}
                  className="sheet-item"
                  onClick={() => {
                    setAdding(false);
                    if (o.key === 'notes') nav('/app/meetings/new');
                    else setQuick(o.key as 'task' | 'expense' | 'announce');
                  }}
                >
                  <span className="sheet-icon">{o.icon}</span>
                  <span className="sheet-text">
                    <strong>{o.label}</strong>
                    <span>{o.hint}</span>
                  </span>
                </button>
              ))}
            <button className="btn sheet-cancel" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {quick === 'task' && <TaskForm onClose={() => setQuick(null)} />}
      {quick === 'expense' && <LedgerEntryForm onClose={() => setQuick(null)} />}
      {quick === 'announce' && <AnnouncementModal onClose={() => setQuick(null)} />}
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      {profile && me && <ProfileModal member={me} self onClose={() => setProfile(false)} />}
      {menu.node}
    </div>
  );
}

export function PageHead({ title, sub, actions, back }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  useEffect(() => {
    if (typeof title === 'string') document.title = `${title} | Workspace`;
  }, [title]);
  return (
    <header className="page-head">
      <div className="page-head-text">
        {back}
        <h1 className="h1">{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
