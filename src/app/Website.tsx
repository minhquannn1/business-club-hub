import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useStore } from '../lib/store';
import { saveSite } from '../lib/actions';
import type { SiteContent } from '../lib/types';
import { Empty, Field, useRun } from '../components/ui';
import { PageHead } from './Shell';
import { DEFAULT_SITE } from '../lib/constants';
import { Pictograms, PICTOGRAM_KEYS } from '../components/Art';

const CURRENCIES = ['VND', 'USD', 'EUR', 'GBP', 'SGD', 'AUD'];

export function WebsitePage() {
  const store = useStore();
  const run = useRun();
  const [f, setF] = useState<SiteContent>(store.site);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setF(store.site);
  }, [store.site, dirty]);
  const set = <K extends keyof SiteContent>(k: K, v: SiteContent[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setDirty(true);
  };
  const save = async () => {
    const ok = await run(async () => {
      await saveSite({ ...f, clubName: f.clubName.trim() || 'Business Club', shortName: f.shortName.trim() || f.clubName.trim() });
      return true;
    }, 'Website updated');
    if (ok) setDirty(false);
  };
  if (!store.canWebsite)
    return (
      <div className="page">
        <div className="panel">
          <Empty title="Only admins and whoever runs the website can edit it" />
        </div>
      </div>
    );
  const publicCount = store.projects.filter((p) => p.isPublic).length;
  const listed = store.members.filter((m) => m.showOnSite).length;
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <PageHead
        title="Public website"
        sub="What visitors see. Projects and team members appear when you mark them as public."
        actions={
          <>
            <a className="btn" href="/" target="_blank" rel="noreferrer">
              <ExternalLink /> View site
            </a>
            <button className="btn btn-primary" disabled={!dirty} onClick={save}>
              Publish changes
            </button>
          </>
        }
      />
      <div className="section-gap">
        <section className="panel">
          <div className="panel-head">
            <h2 className="h3">Club</h2>
          </div>
          <div className="panel-body form-grid">
            <Field label="Full name">
              <input className="input" value={f.clubName} onChange={(e) => set('clubName', e.target.value)} />
            </Field>
            <Field label="Short name" hint="Used in the header and on small screens.">
              <input className="input" value={f.shortName} onChange={(e) => set('shortName', e.target.value)} />
            </Field>
            <Field label="School">
              <input className="input" value={f.school} onChange={(e) => set('school', e.target.value)} />
            </Field>
            <Field label="School year">
              <input className="input" value={f.year} onChange={(e) => set('year', e.target.value)} placeholder="2026–27" />
            </Field>
            <Field label="Founded" hint="Year the club started. Shown above the headline.">
              <input className="input" value={f.founded ?? ''} onChange={(e) => set('founded', e.target.value)} placeholder="2021" inputMode="numeric" />
            </Field>
            <label className="check full">
              <input type="checkbox" checked={!!f.showTeam} onChange={(e) => set('showTeam', e.target.checked)} />
              Show the Meet the team section (turn on once everyone has a photo)
            </label>
            <Field label="Headline" className="full" hint="The big line at the top of the homepage. Short and confident works best.">
              <input className="input" value={f.tagline} onChange={(e) => set('tagline', e.target.value)} />
            </Field>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2 className="h3">About</h2>
          </div>
          <div className="panel-body form-grid">
            <Field label="About the club" className="full">
              <textarea className="textarea" value={f.about} onChange={(e) => set('about', e.target.value)} />
            </Field>
            <Field label="Mission" className="full" hint="Shown as a highlighted line.">
              <textarea className="textarea" style={{ minHeight: 64 }} value={f.mission} onChange={(e) => set('mission', e.target.value)} />
            </Field>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2 className="h3">What we do</h2>
            <span className="small faint">The cards under the hero</span>
          </div>
          <div className="panel-body" style={{ display: 'grid', gap: 14 }}>
            {(f.activities?.length ? f.activities : DEFAULT_SITE.activities).map((a, i) => {
              const list = f.activities?.length ? f.activities : DEFAULT_SITE.activities;
              const upd = (patch: Partial<typeof a>) => set('activities', list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              const Icon = Pictograms[a.icon] ?? Pictograms.pitch;
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '56px 150px minmax(0, 1fr)', gap: 12, alignItems: 'start' }} className="activity-edit">
                  <Icon size={48} />
                  <select className="select" value={a.icon} onChange={(e) => upd({ icon: e.target.value })} aria-label="Icon">
                    {PICTOGRAM_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {k[0].toUpperCase() + k.slice(1)}
                      </option>
                    ))}
                  </select>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <input className="input" value={a.title} onChange={(e) => upd({ title: e.target.value })} aria-label="Title" />
                    <textarea className="textarea" style={{ minHeight: 56 }} value={a.text} onChange={(e) => upd({ text: e.target.value })} aria-label="Description" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2 className="h3">Joining and contact</h2>
          </div>
          <div className="panel-body form-grid">
            <Field label="For students: how to join" className="full">
              <textarea className="textarea" style={{ minHeight: 64 }} value={f.joinText} onChange={(e) => set('joinText', e.target.value)} />
            </Field>
            <Field label="For partners and sponsors" className="full">
              <textarea className="textarea" style={{ minHeight: 64 }} value={f.partnerText ?? ''} onChange={(e) => set('partnerText', e.target.value)} />
            </Field>
            <Field label="Sign-up link" hint="A Google Form, for example. Leave empty to hide the button.">
              <input className="input" type="url" value={f.joinLink} onChange={(e) => set('joinLink', e.target.value)} placeholder="https://forms.gle/..." />
            </Field>
            <Field label="Contact email">
              <input className="input" type="email" value={f.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
            </Field>
            <Field label="Instagram handle">
              <input className="input" value={f.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@yourclub" />
            </Field>
            <Field label="Currency" hint="Used everywhere money is shown.">
              <select className="select" value={f.currency} onChange={(e) => set('currency', e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
        </section>
        <section className="panel">
          <div className="panel-body small muted" style={{ display: 'grid', gap: 6 }}>
            <p>
              {publicCount} {publicCount === 1 ? 'project is' : 'projects are'} public. Turn this on from a project's Edit form.
            </p>
            <p>
              {listed} {listed === 1 ? 'person is' : 'people are'} listed in the team section. Change it from their profile under Members.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
