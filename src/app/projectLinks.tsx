import { useState } from 'react';
import { ExternalLink, Link2, Plus, X } from 'lucide-react';
import { updateProject } from '../lib/actions';
import type { Project } from '../lib/types';
import { useRun } from '../components/ui';

/** Masterplans, forms and shared files that belong to one project. */
export function ProjectLinks({ project, canEdit }: { project: Project; canEdit: boolean }) {
  const run = useRun();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const links = project.links ?? [];
  if (!links.length && !canEdit) return null;
  const add = async () => {
    const u = url.trim();
    if (!u) return;
    const full = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    const ok = await run(async () => {
      await updateProject(project, { links: [...links, { label: label.trim() || full, url: full }] }, 'updated', 'added a link');
      return true;
    });
    if (ok) {
      setLabel('');
      setUrl('');
      setAdding(false);
    }
  };
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="h3" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link2 size={16} /> Links
        </h2>
        {canEdit && !adding && (
          <button className="btn btn-sm btn-ghost" onClick={() => setAdding(true)}>
            <Plus /> Add
          </button>
        )}
      </div>
      {links.length > 0 && (
        <ul className="list">
          {links.map((l, i) => (
            <li key={i} className="link-row">
              <a href={l.url} target="_blank" rel="noreferrer" className="row-link">
                <ExternalLink size={15} aria-hidden="true" />
                <span className="title ellipsis">{l.label}</span>
              </a>
              {canEdit && (
                <button className="btn btn-ghost btn-icon btn-sm" aria-label={`Remove ${l.label}`} onClick={() => run(() => updateProject(project, { links: links.filter((_, k) => k !== i) }, 'updated', 'removed a link'))}>
                  <X />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="panel-body" style={{ display: 'grid', gap: 8 }}>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name, e.g. Masterplan" aria-label="Link name" autoFocus />
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." aria-label="Link address" inputMode="url" onKeyDown={(e) => e.key === 'Enter' && add()} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-sm" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button className="btn btn-sm btn-primary" disabled={!url.trim()} onClick={add}>
              Add link
            </button>
          </div>
        </div>
      ) : (
        !links.length && <p className="panel-body faint small">Add the masterplan or any shared file for this project.</p>
      )}
    </section>
  );
}
