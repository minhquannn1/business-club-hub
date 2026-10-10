import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRightLeft, Copy, ImageUp, Mail, Plus, Search, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { compressSquare, handOverTasks, inviteMember, removeMember, updateMember } from '../lib/actions';
import { OWNER_EMAIL, ROLES, TEAMS } from '../lib/constants';
import { ago, initials } from '../lib/format';
import { emailReady, notify } from '../lib/notify';
import type { Member, Perm } from '../lib/types';
import { accessFields, levelOf, LEVELS, PERMS, type Level } from '../lib/access';
import { Avatar, Empty, Field, Modal, Seg, useConfirm, useRun, useToast } from '../components/ui';
import { PageHead } from './Shell';
import { EmptyArt } from '../components/Art';

export function MembersPage() {
  const store = useStore();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [team, setTeam] = useState('');
  const [open, setOpen] = useState<Member | null>(null);
  const [inviting, setInviting] = useState(false);
  useEffect(() => {
    const id = params.get('open');
    if (id) {
      const m = store.memberMap.get(id);
      if (m) setOpen(m);
    }
  }, [params, store.memberMap]);
  const teams = useMemo(() => Array.from(new Set([...TEAMS, ...store.members.map((m) => m.team).filter(Boolean)])) as string[], [store.members]);
  const list = store.members.filter((m) => {
    const s = q.trim().toLowerCase();
    return (!team || m.team === team) && (!s || m.name?.toLowerCase().includes(s) || m.email.includes(s) || m.title?.toLowerCase().includes(s));
  });
  const execs = list.filter((m) => m.role === 'exec');
  const others = list.filter((m) => m.role === 'member');
  const guests = list.filter((m) => m.role === 'guest');
  const clubCount = store.members.filter((m) => m.role !== 'guest').length;
  const guestCount = store.members.length - clubCount;
  const hiddenAccounts = store.isAdmin ? [...store.memberMap.values()].filter((m) => m.hidden && m.id !== store.myEmail) : [];
  const projectsOf = (email: string) => store.projects.filter((p) => p.stage !== 'done' && (p.leadEmail === email || p.teamEmails?.includes(email)));

  const card = (m: Member) => {
    const openTasks = store.tasks.filter((t) => t.assigneeEmail === m.id && t.status !== 'done').length;
    const leads = store.projects.filter((p) => p.leadEmail === m.id && p.stage !== 'done').length;
    return (
      <button key={m.id} className="member-card" onClick={() => setOpen(m)}>
        <Avatar member={m} size={44} />
        <span className="info">
          <strong className="ellipsis">{m.name || m.email.split('@')[0]}</strong>
          <span className="small muted ellipsis">
            {m.role === 'guest'
              ? `Guest on ${projectsOf(m.id).map((p) => p.title).join(', ') || 'no project yet'}`
              : [m.title, m.team].filter(Boolean).join(', ') || (m.role === 'exec' ? 'Exec team' : 'Member')}
          </span>
          <span className="load">
            <span>
              {openTasks} open {openTasks === 1 ? 'task' : 'tasks'}
            </span>
            {leads > 0 && <span>Leads {leads}</span>}
            {levelOf(m) === 'admin' && <span className="tag-access">Admin</span>}
            {levelOf(m) === 'exec' &&
              PERMS.filter((x) => m.perms?.includes(x.key)).map((x) => (
                <span key={x.key} className="tag-access">
                  {x.tag}
                </span>
              ))}
            {!m.uid && <span className="pending">{m.invitedAt ? 'Invited, not signed in yet' : "Hasn't signed in yet"}</span>}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div className="page">
      <PageHead
        title="Members"
        sub={`${clubCount} in the club, ${store.members.filter((m) => m.role === 'exec').length} on the exec team${guestCount ? `, ${guestCount} ${guestCount === 1 ? 'guest' : 'guests'}` : ''}`}
        actions={
          store.isAdmin && (
            <button className="btn btn-primary" onClick={() => setInviting(true)}>
              <Plus /> Add members
            </button>
          )
        }
      />
      <div className="toolbar">
        <div className="search-input">
          <Search />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" />
        </div>
        <select className="select" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Filter by team">
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      {list.length === 0 ? (
        <div className="panel">
          <Empty title="Nobody matches" />
        </div>
      ) : (
        <div className="section-gap">
          {execs.length > 0 && (
            <section>
              <h2 className="h3" style={{ marginBottom: 10 }}>
                Exec team
              </h2>
              <div className="member-grid">{execs.map(card)}</div>
            </section>
          )}
          {others.length > 0 && (
            <section>
              <h2 className="h3" style={{ marginBottom: 10 }}>
                Members
              </h2>
              <div className="member-grid">{others.map(card)}</div>
            </section>
          )}
          {guests.length > 0 && (
            <section>
              <h2 className="h3">Guests</h2>
              <p className="small muted" style={{ margin: '2px 0 10px' }}>
                Not in the club. They only see the projects they are on, their own tasks and the meetings they attended.
              </p>
              <div className="member-grid">{guests.map(card)}</div>
            </section>
          )}
          {hiddenAccounts.length > 0 && (
            <p className="small muted hidden-accounts">
              Backup {hiddenAccounts.length === 1 ? 'account' : 'accounts'}, hidden from lists:
              {hiddenAccounts.map((m) => (
                <button key={m.id} className="btn btn-ghost btn-sm" onClick={() => setOpen(m)}>
                  {m.email}
                </button>
              ))}
            </p>
          )}
          {store.members.length <= 1 && store.isAdmin && (
            <div className="panel">
              <Empty art={<EmptyArt.people />} title="It's just you so far" action={<button className="btn" onClick={() => setInviting(true)}><Plus /> Add members</button>}>
                Add people by their Google email. They sign in with that account and land straight in the workspace.
              </Empty>
            </div>
          )}
        </div>
      )}
      {open && (
        <ProfileModal
          member={store.memberMap.get(open.id) ?? open}
          self={open.id === store.myEmail}
          onClose={() => {
            setOpen(null);
            if (params.get('open')) setParams({}, { replace: true });
          }}
        />
      )}
      {inviting && <InviteModal onClose={() => setInviting(false)} teams={teams} />}
    </div>
  );
}

export function ProfileModal({ member, self, onClose }: { member: Member; self?: boolean; onClose: () => void }) {
  const store = useStore();
  const run = useRun();
  const confirm = useConfirm();
  const [f, setF] = useState({
    name: member.name ?? '',
    title: member.title ?? '',
    team: member.team ?? '',
    level: levelOf(member) as Level,
    perms: member.perms ?? ([] as Perm[]),
    hidden: !!member.hidden,
    bio: member.bio ?? '',
    showOnSite: !!member.showOnSite,
    emailOff: !!member.emailOff,
  });
  const [mailReady, setMailReady] = useState(false);
  const [testing, setTesting] = useState(false);
  const [handTo, setHandTo] = useState('');
  const [inviting, setInviting] = useState(false);
  useEffect(() => {
    if (self || store.isExec) emailReady().then(setMailReady);
  }, [self, store.isExec]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const [sitePhoto, setSitePhoto] = useState(member.sitePhoto ?? '');
  const [busyPhoto, setBusyPhoto] = useState(false);
  const toast = useToast();
  // only admins change other people, roles and permissions
  const asAdmin = store.isAdmin;
  const canEdit = asAdmin || !!self;
  const isOwnerRow = member.id === OWNER_EMAIL;
  const openTasks = store.tasks.filter((t) => t.assigneeEmail === member.id && t.status !== 'done');
  const leads = store.projects.filter((p) => p.leadEmail === member.id);

  const save = async () => {
    const patch: Partial<Member> = asAdmin
      ? {
          name: f.name.trim(),
          title: f.title,
          team: f.team,
          bio: f.bio,
          showOnSite: f.showOnSite,
          emailOff: f.emailOff,
          hidden: f.level !== 'guest' && f.hidden,
          ...accessFields(isOwnerRow ? 'admin' : f.level, f.perms),
        }
      : { name: f.name.trim(), bio: f.bio, showOnSite: f.showOnSite, emailOff: f.emailOff };
    if (sitePhoto !== (member.sitePhoto ?? '')) patch.sitePhoto = sitePhoto;
    if (patch.role === 'guest') patch.showOnSite = false;
    const ok = await run(async () => {
      await updateMember(member, patch, !!self && !asAdmin);
      return true;
    }, 'Profile saved');
    if (ok) onClose();
  };

  return (
    <Modal
      title={self ? 'Your profile' : member.name || member.email}
      onClose={onClose}
      footer={
        <>
          {asAdmin && !self && !isOwnerRow && (
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (
                  await confirm({
                    title: `Remove ${member.name || member.email}?`,
                    body: `They lose access to the workspace straight away. Their ${openTasks.length} open ${openTasks.length === 1 ? 'task stays' : 'tasks stay'} on the list, unassigned in practice.`,
                    confirm: 'Remove member',
                    danger: true,
                  })
                ) {
                  await run(() => removeMember(member), 'Member removed');
                  onClose();
                }
              }}
            >
              <Trash2 /> Remove
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            {canEdit ? 'Cancel' : 'Close'}
          </button>
          {canEdit && (
            <button className="btn btn-primary" onClick={save}>
              Save
            </button>
          )}
        </>
      }
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 18 }}>
        <Avatar member={member} size={56} />
        <div style={{ minWidth: 0 }}>
          <div className="ellipsis">{member.email}</div>
          <div className="small faint">
            {member.uid ? `Last active ${ago(member.lastSeenAt ?? 0) || 'recently'}` : "Hasn't signed in yet"}
            {!member.uid && member.invitedAt ? `, invite sent ${ago(member.invitedAt)}` : ''}
          </div>
        </div>
        {asAdmin && !self && !member.uid && mailReady && (
          <button
            type="button"
            className={`btn btn-sm ${inviting ? 'is-busy' : ''}`}
            style={{ marginLeft: 'auto', flex: 'none' }}
            disabled={inviting}
            onClick={async () => {
              setInviting(true);
              const r = await notify({ type: 'invite', email: member.id });
              setInviting(false);
              toast(r.ok ? (r.sent ? `Invite sent to ${member.email}` : 'Already sent a moment ago') : r.error || 'Email failed', r.ok ? undefined : { kind: 'error' });
            }}
          >
            <Mail /> {member.invitedAt ? 'Resend invite' : 'Send invite'}
          </button>
        )}
      </div>
      <div className="form-grid">
        <Field label="Name">
          <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} disabled={!canEdit} />
        </Field>
        <Field label="Access" className="full" hint={isOwnerRow ? 'The club owner is always an admin.' : LEVELS.find((l) => l.key === f.level)?.hint}>
          <Seg<Level> label="Access" value={f.level} onChange={(v) => asAdmin && !isOwnerRow && set('level', v)} options={LEVELS.map((l) => ({ key: l.key, label: l.label }))} />
        </Field>
        {f.level === 'exec' && (
          <div className="field full perm-list">
            {PERMS.map((x) => (
              <label key={x.key} className="check">
                <input
                  type="checkbox"
                  checked={f.perms.includes(x.key)}
                  disabled={!asAdmin}
                  onChange={(e) => set('perms', e.target.checked ? [...f.perms, x.key] : f.perms.filter((k) => k !== x.key))}
                />
                {x.label}
              </label>
            ))}
          </div>
        )}
        <Field label="Title">
          <input className="input" list="role-options" value={f.title} onChange={(e) => set('title', e.target.value)} disabled={!asAdmin} placeholder="Pick a role or type one" />
          <datalist id="role-options">
            {ROLES.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <Field label="Team">
          <input className="input" list="team-options" value={f.team} onChange={(e) => set('team', e.target.value)} disabled={!asAdmin} placeholder="e.g. Marketing" />
          <datalist id="team-options">
            {TEAMS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Short bio" className="full" hint="Shown on the public website if the profile is listed there.">
          <textarea className="textarea" style={{ minHeight: 64 }} value={f.bio} onChange={(e) => set('bio', e.target.value)} disabled={!canEdit} maxLength={240} />
        </Field>
        <div className="field full">
          <span>Website photo</span>
          <div className="photo-pick">
            <span className="photo-pick-preview">
              {sitePhoto || member.photoURL ? <img src={sitePhoto || member.photoURL} alt="" referrerPolicy="no-referrer" /> : initials(f.name || member.email)}
            </span>
            {canEdit && (
              <div className="photo-pick-actions">
                <label className={`btn btn-sm ${busyPhoto ? 'is-busy' : ''}`}>
                  <ImageUp /> {sitePhoto ? 'Change photo' : 'Upload a photo'}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      setBusyPhoto(true);
                      try {
                        setSitePhoto(await compressSquare(file));
                      } catch (err) {
                        toast((err as Error).message, { kind: 'error' });
                      } finally {
                        setBusyPhoto(false);
                      }
                    }}
                  />
                </label>
                {sitePhoto && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSitePhoto('')}>
                    Remove
                  </button>
                )}
              </div>
            )}
          </div>
          <small className="hint">Cropped to a square for the team section. Without one, the Google account photo is used.</small>
        </div>
        {f.level !== 'guest' && !f.hidden && (
          <label className="check full">
            <input type="checkbox" checked={f.showOnSite} onChange={(e) => set('showOnSite', e.target.checked)} disabled={!canEdit} />
            List on the public website's team section (name, title, photo and bio)
          </label>
        )}
        {asAdmin && f.level !== 'guest' && f.hidden && (
          <label className="check full">
            <input type="checkbox" checked={f.hidden} onChange={(e) => set('hidden', e.target.checked)} />
            Backup account: keep its access but leave it out of the members list, pickers and the website
          </label>
        )}
        <div className="field full">
          <label className="check">
            <input type="checkbox" checked={!f.emailOff} onChange={(e) => set('emailOff', !e.target.checked)} disabled={!canEdit} />
            Email {self ? 'me' : 'them'} when {self ? 'I get' : 'they get'} a new task and when tasks are due
          </label>
          {self && mailReady && (
            <div>
              <button
                type="button"
                className={`btn btn-sm ${testing ? 'is-busy' : ''}`}
                disabled={testing}
                onClick={async () => {
                  setTesting(true);
                  const r = await notify({ type: 'test' });
                  setTesting(false);
                  toast(r.ok ? `Test email sent to ${member.email}` : r.error || 'Email failed', r.ok ? undefined : { kind: 'error' });
                }}
              >
                <Mail /> Send me a test email
              </button>
            </div>
          )}
          <small className="hint">Announcements and meeting notes still come by email.</small>
        </div>
      </div>
      {(openTasks.length > 0 || leads.length > 0) && (
        <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--rule-soft)', display: 'grid', gap: 6 }}>
          {leads.length > 0 && (
            <p className="small">
              <span className="muted">Leads: </span>
              {leads.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <Link to={`/app/projects/${p.id}`} onClick={onClose}>
                    {p.title}
                  </Link>
                </span>
              ))}
            </p>
          )}
          {openTasks.length > 0 && (
            <p className="small muted">
              {openTasks.length} open {openTasks.length === 1 ? 'task' : 'tasks'}
            </p>
          )}
          {asAdmin && openTasks.length > 0 && (
            <div className="handover">
              <label htmlFor="handover-to" className="small">
                Give {self ? 'my' : 'their'} {openTasks.length} open {openTasks.length === 1 ? 'task' : 'tasks'} to
              </label>
              <select id="handover-to" className="select" value={handTo} onChange={(e) => setHandTo(e.target.value)}>
                <option value="">Pick someone</option>
                {store.members
                  .filter((m) => m.id !== member.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name ? `${m.name} (${m.email})` : m.email}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="btn btn-sm"
                disabled={!handTo}
                onClick={async () => {
                  const to = store.memberMap.get(handTo);
                  if (!to) return;
                  const ok = await confirm({
                    title: `Give ${openTasks.length} ${openTasks.length === 1 ? 'task' : 'tasks'} to ${to.name || to.email}?`,
                    body: 'They become the person in charge. Done tasks stay where they are.',
                    confirm: 'Hand over',
                  });
                  if (ok) await run(() => handOverTasks(openTasks, to.id, member.name || member.email, to.name || to.email), `Handed over to ${to.name || to.email}`);
                  setHandTo('');
                }}
              >
                <ArrowRightLeft /> Hand over
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function InviteModal({ onClose, teams }: { onClose: () => void; teams: string[] }) {
  const store = useStore();
  const run = useRun();
  const toast = useToast();
  const [emails, setEmails] = useState('');
  const [level, setLevel] = useState<Level>('member');
  const [team, setTeam] = useState('');
  const [title, setTitle] = useState('');
  const [onProjects, setOnProjects] = useState<string[]>([]);
  const [done, setDone] = useState<{ added: string[]; emailed: string[] } | null>(null);
  const [mailReady, setMailReady] = useState(false);
  const [sendInvite, setSendInvite] = useState(true);
  useEffect(() => {
    emailReady().then(setMailReady);
  }, []);
  const openProjects = store.projects.filter((p) => p.stage !== 'done');
  const isGuest = level === 'guest';
  const parsed = emails
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const invalid = parsed.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  const already = parsed.filter((e) => store.memberMap.has(e));
  const valid = parsed.filter((e) => !invalid.includes(e) && !already.includes(e));
  const link = `${window.location.origin}/app`;

  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const added: string[] = [];
    const emailed: string[] = [];
    for (const email of valid) {
      const ok = await run(async () => {
        const projects = isGuest ? openProjects.filter((p) => onProjects.includes(p.id)) : [];
        await inviteMember({ email, name: '', ...accessFields(level), title: isGuest ? '' : parsed.length === 1 ? title : '', team: isGuest ? '' : team, showOnSite: level === 'exec' || level === 'admin' }, projects);
        return true;
      });
      if (!ok) continue;
      added.push(email);
      if (mailReady && sendInvite) {
        const r = await notify({ type: 'invite', email });
        if (r.ok && r.sent) emailed.push(email);
        else if (!r.ok) toast(`Added ${email}, but the invite email failed: ${r.error}`, { kind: 'error' });
      }
    }
    setSaving(false);
    if (added.length) setDone({ added, emailed });
  };

  if (done)
    return (
      <Modal
        title={`Added ${done.added.length} ${done.added.length === 1 ? 'person' : 'people'}`}
        onClose={onClose}
        size="narrow"
        footer={
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        }
      >
        {done.emailed.length > 0 && (
          <p style={{ marginBottom: 10 }}>
            <Mail size={16} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />
            Invite email with the sign-in link sent to {done.emailed.join(', ')}.
          </p>
        )}
        <p className="muted" style={{ marginBottom: 14 }}>
          {done.emailed.length === done.added.length ? 'You can also send them this link yourself.' : 'Send them this link.'} They sign in with Google using the email you added.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Workspace link" />
          <button
            className="btn"
            onClick={() => {
              navigator.clipboard?.writeText(link).then(() => toast('Link copied'));
            }}
          >
            <Copy /> Copy
          </button>
        </div>
      </Modal>
    );

  return (
    <Modal
      title={isGuest ? 'Add guests' : 'Add members'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className={`btn btn-primary ${saving ? 'is-busy' : ''}`} disabled={saving || !valid.length || invalid.length > 0 || (isGuest && !onProjects.length)} onClick={save}>
            Add {valid.length > 1 ? `${valid.length} people` : isGuest ? 'guest' : 'member'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field
          label="Google emails"
          className="full"
          hint={
            invalid.length ? (
              <span className="neg">Check these: {invalid.join(', ')}</span>
            ) : already.length ? (
              `Already members: ${already.join(', ')}`
            ) : (
              'One or more, separated by commas or new lines. School Google accounts work.'
            )
          }
        >
          <textarea className="textarea" style={{ minHeight: 80 }} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="name@school.edu.vn" />
        </Field>
        <Field label="Access" className="full" hint={isGuest ? undefined : LEVELS.find((l) => l.key === level)?.hint}>
          <Seg<Level> label="Access" value={level} onChange={setLevel} options={LEVELS.map((l) => ({ key: l.key, label: l.label }))} />
        </Field>
        {isGuest ? (
          <div className="field full">
            <span>Projects they help with</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {openProjects.map((p) => {
                const on = onProjects.includes(p.id);
                return (
                  <button
                    type="button"
                    key={p.id}
                    className="chip"
                    aria-pressed={on}
                    onClick={() => setOnProjects((l) => (on ? l.filter((x) => x !== p.id) : [...l, p.id]))}
                    style={{ height: 30, cursor: 'pointer', border: `1px solid ${on ? 'var(--ink)' : 'transparent'}`, color: on ? 'var(--ink)' : undefined }}
                  >
                    <span className="dot" style={{ ['--c' as string]: p.color }} />
                    {p.title}
                  </button>
                );
              })}
            </div>
            <small className="hint">Guests are not club members. They only see these projects, their own tasks and the meetings they attended. They are not on the website or in club announcements.</small>
          </div>
        ) : (
        <Field label="Team">
          <select className="select" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">None yet</option>
            {teams.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        )}
        {parsed.length <= 1 && !isGuest && (
          <Field label="Title" className="full">
            <input className="input" list="invite-role-options" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Treasurer" />
            <datalist id="invite-role-options">
              {ROLES.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </Field>
        )}
        {mailReady && (
          <label className="check full">
            <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} />
            Email {valid.length > 1 ? 'them' : isGuest ? 'the guest' : 'them'} an invite with the sign-in link{isGuest ? ' and the projects they are on' : ''}
          </label>
        )}
      </div>
    </Modal>
  );
}
