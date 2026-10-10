import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Copy, ImageUp, Mail, Plus, Search, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { compressSquare, inviteMember, removeMember, updateMember } from '../lib/actions';
import { OWNER_EMAIL, ROLES, TEAMS } from '../lib/constants';
import { ago, initials } from '../lib/format';
import { emailReady, notify } from '../lib/notify';
import type { Member, Role } from '../lib/types';
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
  const others = list.filter((m) => m.role !== 'exec');

  const card = (m: Member) => {
    const openTasks = store.tasks.filter((t) => t.assigneeEmail === m.id && t.status !== 'done').length;
    const leads = store.projects.filter((p) => p.leadEmail === m.id && p.stage !== 'done').length;
    return (
      <button key={m.id} className="member-card" onClick={() => setOpen(m)}>
        <Avatar member={m} size={44} />
        <span className="info">
          <strong className="ellipsis">{m.name || m.email.split('@')[0]}</strong>
          <span className="small muted ellipsis">{[m.title, m.team].filter(Boolean).join(', ') || (m.role === 'exec' ? 'Exec team' : 'Member')}</span>
          <span className="load">
            <span>
              {openTasks} open {openTasks === 1 ? 'task' : 'tasks'}
            </span>
            {leads > 0 && <span>Leads {leads}</span>}
            {!m.uid && <span className="pending">Hasn't signed in yet</span>}
          </span>
        </span>
      </button>
    );
  };

  return (
    <div className="page">
      <PageHead
        title="Members"
        sub={`${store.members.length} ${store.members.length === 1 ? 'person' : 'people'}, ${store.members.filter((m) => m.role === 'exec').length} on the exec team`}
        actions={
          store.isExec && (
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
          {store.members.length <= 1 && store.isExec && (
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
  const [f, setF] = useState({ name: member.name ?? '', title: member.title ?? '', team: member.team ?? '', role: member.role, bio: member.bio ?? '', showOnSite: !!member.showOnSite, emailOff: !!member.emailOff });
  const [mailReady, setMailReady] = useState(false);
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    if (self) emailReady().then(setMailReady);
  }, [self]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const [sitePhoto, setSitePhoto] = useState(member.sitePhoto ?? '');
  const [busyPhoto, setBusyPhoto] = useState(false);
  const toast = useToast();
  const asExec = store.isExec;
  const canEdit = asExec || !!self;
  const isOwnerRow = member.id === OWNER_EMAIL;
  const openTasks = store.tasks.filter((t) => t.assigneeEmail === member.id && t.status !== 'done');
  const leads = store.projects.filter((p) => p.leadEmail === member.id);

  const save = async () => {
    const patch: Partial<Member> = asExec ? { ...f, name: f.name.trim() } : { name: f.name.trim(), bio: f.bio, showOnSite: f.showOnSite, emailOff: f.emailOff };
    if (sitePhoto !== (member.sitePhoto ?? '')) patch.sitePhoto = sitePhoto;
    if (isOwnerRow) patch.role = 'exec';
    const ok = await run(async () => {
      await updateMember(member, patch, !!self && !asExec);
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
          {asExec && !self && !isOwnerRow && (
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
          <div className="small faint">{member.uid ? `Last active ${ago(member.lastSeenAt ?? 0) || 'recently'}` : "Hasn't signed in yet"}</div>
        </div>
      </div>
      <div className="form-grid">
        <Field label="Name">
          <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} disabled={!canEdit} />
        </Field>
        <Field label="Role" hint={isOwnerRow ? 'The club owner is always on the exec team.' : asExec ? 'Exec members can edit everything, including money.' : undefined}>
          <Seg<Role>
            label="Role"
            value={f.role}
            onChange={(v) => asExec && !isOwnerRow && set('role', v)}
            options={[
              { key: 'member', label: 'Member' },
              { key: 'exec', label: 'Exec' },
            ]}
          />
        </Field>
        <Field label="Title">
          <input className="input" list="role-options" value={f.title} onChange={(e) => set('title', e.target.value)} disabled={!asExec} placeholder="Pick a role or type one" />
          <datalist id="role-options">
            {ROLES.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <Field label="Team">
          <input className="input" list="team-options" value={f.team} onChange={(e) => set('team', e.target.value)} disabled={!asExec} placeholder="e.g. Marketing" />
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
        <label className="check full">
          <input type="checkbox" checked={f.showOnSite} onChange={(e) => set('showOnSite', e.target.checked)} disabled={!canEdit} />
          List on the public website's team section (name, title, photo and bio)
        </label>
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
  const [role, setRole] = useState<Role>('member');
  const [team, setTeam] = useState('');
  const [title, setTitle] = useState('');
  const [done, setDone] = useState<string[] | null>(null);
  const parsed = emails
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const invalid = parsed.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  const already = parsed.filter((e) => store.memberMap.has(e));
  const valid = parsed.filter((e) => !invalid.includes(e) && !already.includes(e));
  const link = `${window.location.origin}/app`;

  const save = async () => {
    const added: string[] = [];
    for (const email of valid) {
      const ok = await run(async () => {
        await inviteMember({ email, name: '', role, title: parsed.length === 1 ? title : '', team, showOnSite: role === 'exec' });
        return true;
      });
      if (ok) added.push(email);
    }
    if (added.length) setDone(added);
  };

  if (done)
    return (
      <Modal
        title={`Added ${done.length} ${done.length === 1 ? 'person' : 'people'}`}
        onClose={onClose}
        size="narrow"
        footer={
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        }
      >
        <p className="muted" style={{ marginBottom: 14 }}>
          Send them this link. They sign in with Google using the email you added.
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
      title="Add members"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!valid.length || invalid.length > 0} onClick={save}>
            Add {valid.length > 1 ? `${valid.length} people` : 'member'}
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
        <Field label="Role">
          <Seg<Role>
            label="Role"
            value={role}
            onChange={setRole}
            options={[
              { key: 'member', label: 'Member' },
              { key: 'exec', label: 'Exec' },
            ]}
          />
        </Field>
        <Field label="Team">
          <select className="select" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">None yet</option>
            {teams.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        {parsed.length <= 1 && (
          <Field label="Title" className="full">
            <input className="input" list="invite-role-options" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Treasurer" />
            <datalist id="invite-role-options">
              {ROLES.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </Field>
        )}
      </div>
    </Modal>
  );
}
