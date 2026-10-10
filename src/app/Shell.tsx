import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { useStore } from '../lib/store';
import { setActor } from '../lib/actions';
import { Avatar, useMenu } from '../components/ui';
import { initials } from '../lib/format';
import { CommandPalette } from './CommandPalette';
import { ProfileModal } from './Members';
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
  const { me, myEmail, site, isExec, tasks, signOut } = store;
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [profile, setProfile] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const menu = useMenu();
  const userBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => setActor(myEmail), [myEmail]);
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

  const links: { to: string; label: string; icon: ReactNode; badge?: number; end?: boolean; exec?: boolean }[] = [
    { to: '/app', label: 'Overview', icon: <LayoutDashboard />, end: true },
    { to: '/app/projects', label: 'Projects', icon: <FolderKanban /> },
    { to: '/app/tasks', label: 'Tasks', icon: <CheckSquare />, badge: myOpen },
    { to: '/app/meetings', label: 'Meetings', icon: <NotebookPen /> },
    { to: '/app/finance', label: 'Finance', icon: <Wallet /> },
    { to: '/app/members', label: 'Members', icon: <Users /> },
    { to: '/app/activity', label: 'Activity', icon: <ActivityIcon /> },
    { to: '/app/website', label: 'Website', icon: <Globe />, exec: true },
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
          <span className="wordmark-mark" aria-hidden="true">
            {initials(site.shortName || site.clubName)}
          </span>
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
          .filter((l) => !l.exec || isExec)
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
          <span className="ellipsis">{isExec ? me?.title || 'Exec team' : me?.title || 'Member'}</span>
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
            <span className="wordmark-mark" aria-hidden="true">
              {initials(site.shortName || site.clubName)}
            </span>
          </Link>
          <button className="btn btn-ghost btn-icon" onClick={() => setPalette(true)} aria-label="Search">
            <Search />
          </button>
        </div>
        <Outlet />
      </div>
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
