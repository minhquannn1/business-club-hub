import { useEffect, useMemo, useState } from 'react';
import { Megaphone, Mail, X } from 'lucide-react';
import { useStore, memberName } from '../lib/store';
import { createAnnouncement, deleteAnnouncement } from '../lib/actions';
import { emailReady, notify } from '../lib/notify';
import { ago } from '../lib/format';
import type { Announcement } from '../lib/types';
import { Field, Modal, useConfirm, useRun, useToast } from '../components/ui';

const DAY = 86400000;

function audienceLabel(a: string) {
  if (a === 'exec') return 'Exec team';
  if (a.startsWith('team:')) return a.slice(5);
  return 'Everyone';
}

/** Recent announcements for this member, newest first. */
export function AnnouncementsPanel() {
  const store = useStore();
  const run = useRun();
  const confirm = useConfirm();
  const now = Date.now();
  const list = store.announcements
    .filter((a) => now - a.createdAt < 21 * DAY)
    .filter((a) => store.isExec || a.audience === 'all' || a.audience === `team:${store.me?.team ?? ''}`)
    .slice(0, 2);
  if (!list.length) return null;
  return (
    <section className="panel announce-panel" aria-label="Announcements">
      {list.map((a) => (
        <article key={a.id} className="announce">
          <Megaphone className="announce-icon" aria-hidden="true" />
          <div className="announce-main">
            <h2 className="announce-title">{a.title}</h2>
            <AnnounceBody text={a.body} />
            <p className="small faint">
              {memberName(store, a.createdBy)}, {ago(a.createdAt)}
              {a.audience !== 'all' && `, to ${audienceLabel(a.audience)}`}
              {store.isExec && a.emailedAt ? `, emailed to ${a.recipientCount ?? 0}` : ''}
            </p>
          </div>
          {store.isExec && (
            <button
              className="btn btn-ghost btn-icon btn-sm"
              aria-label={`Remove ${a.title}`}
              onClick={async () => {
                if (await confirm({ title: 'Remove this announcement?', body: 'It disappears from the workspace. Emails already sent stay in inboxes.', confirm: 'Remove', danger: true })) await run(() => deleteAnnouncement(a.id), 'Removed');
              }}
            >
              <X />
            </button>
          )}
        </article>
      ))}
    </section>
  );
}

export function AnnouncementModal({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('all');
  const [ready, setReady] = useState<boolean | null>(null);
  const [email, setEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    emailReady().then(setReady);
  }, []);
  const teams = useMemo(() => [...new Set(store.members.filter((m) => m.role !== 'guest').map((m) => m.team?.trim()).filter(Boolean) as string[])].sort(), [store.members]);
  const count = store.members.filter((m) => m.role !== 'guest' && (audience === 'all' ? true : audience === 'exec' ? m.role === 'exec' : m.team === audience.slice(5))).length;
  const willEmail = email && ready === true;

  const post = async () => {
    setBusy(true);
    let id = '';
    try {
      id = await createAnnouncement({ title: title.trim(), body: body.trim(), audience } as Pick<Announcement, 'title' | 'body' | 'audience'>);
    } catch (e) {
      setBusy(false);
      toast((e as { code?: string }).code === 'permission-denied' ? 'Only the exec team can post announcements.' : (e as Error).message, { kind: 'error' });
      return;
    }
    if (willEmail) {
      const r = await notify({ type: 'announcement', id });
      toast(r.ok ? `Posted and emailed to ${r.sent ?? count} ${r.sent === 1 ? 'person' : 'people'}` : `Posted, but the email failed: ${r.error}`, r.ok ? undefined : { kind: 'error' });
    } else toast('Posted');
    setBusy(false);
    onClose();
  };

  return (
    <Modal
      title="New announcement"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className={`btn btn-primary ${busy ? 'is-busy' : ''}`} disabled={!title.trim() || !body.trim() || busy} onClick={post}>
            {willEmail ? <Mail /> : null} {willEmail ? 'Post and email' : 'Post'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Title" className="full">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sport Day booth: meet at 7:15" maxLength={120} autoFocus />
        </Field>
        <Field label="Message" className="full">
          <textarea className="textarea" style={{ minHeight: 140 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What people need to know" maxLength={4000} />
        </Field>
        <Field label="Send to" className="full">
          <select className="select" value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="all">Everyone</option>
            <option value="exec">Exec team</option>
            {teams.map((t) => (
              <option key={t} value={`team:${t}`}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <div className="field full">
          <label className="check">
            <input type="checkbox" checked={willEmail} disabled={ready !== true} onChange={(e) => setEmail(e.target.checked)} />
            Also email it to {count} {count === 1 ? 'person' : 'people'}
          </label>
          {ready === false && <small className="hint">Email isn't set up yet, so this only shows on everyone's Overview.</small>}
        </div>
      </div>
    </Modal>
  );
}

function AnnounceBody({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 320 || text.split('\n').length > 5;
  return (
    <>
      <p className={`announce-body ${open ? 'open' : ''}`}>{text}</p>
      {long && (
        <button type="button" className="link-btn small" onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </>
  );
}
