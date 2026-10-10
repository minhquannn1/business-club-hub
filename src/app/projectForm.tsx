import { useState } from 'react';
import { useStore } from '../lib/store';
import { createProject, updateProject } from '../lib/actions';
import { COMP_STAGE_LABEL, PROJECT_COLORS, STAGES } from '../lib/constants';
import { parseLooseNumber } from '../lib/formula';
import { getCurrency } from '../lib/format';
import type { Project, ProjectKind, Stage } from '../lib/types';
import { Avatar, Field, Modal, Seg, useRun } from '../components/ui';

type Draft = Omit<Project, 'id' | 'createdAt' | 'createdBy' | 'updatedAt'>;

export function blankProject(stage: Stage = 'idea', order = Date.now()): Draft {
  return {
    title: '',
    kind: 'event',
    summary: '',
    description: '',
    goals: '',
    stage,
    leadEmail: '',
    teamEmails: [],
    startDate: '',
    endDate: '',
    location: '',
    color: PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
    budgetPlanned: 0,
    isPublic: false,
    publicBlurb: '',
    order,
  };
}

export function ProjectForm({ project, stage, kind, onClose, onCreated }: { project?: Project; stage?: Stage; kind?: ProjectKind; onClose: () => void; onCreated?: (id: string) => void }) {
  const store = useStore();
  const run = useRun();
  const [f, setF] = useState<Draft>(() => (project ? { ...blankProject(), ...project } : { ...blankProject(stage), kind: kind ?? 'event', leadEmail: store.myEmail }));
  const isComp = f.kind === 'competition';
  const [budgetText, setBudgetText] = useState(project?.budgetPlanned ? String(project.budgetPlanned) : '');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggleTeam = (email: string) => set('teamEmails', f.teamEmails.includes(email) ? f.teamEmails.filter((e) => e !== email) : [...f.teamEmails, email]);
  const dateError = f.startDate && f.endDate && f.endDate < f.startDate ? 'The end date is before the start date.' : '';
  const budget = budgetText.trim() ? parseLooseNumber(budgetText) : 0;
  const budgetError = budget === null ? 'Type a number, like 2,500,000' : '';

  const save = async () => {
    if (!f.title.trim() || dateError || budgetError) return;
    const data: Draft = { ...f, title: f.title.trim(), budgetPlanned: budget ?? 0, teamEmails: f.teamEmails.filter((e) => e !== f.leadEmail) };
    const id = await run(async () => {
      if (project) {
        await updateProject(project, data);
        return project.id;
      }
      return createProject(data);
    }, project ? 'Saved' : isComp ? 'Competition created' : 'Project created');
    if (id) {
      onClose();
      if (!project) onCreated?.(id);
    }
  };

  return (
    <Modal
      size="wide"
      title={project ? (isComp ? 'Edit competition' : 'Edit project') : isComp ? 'New competition' : 'New project or event'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!f.title.trim() || !!dateError || !!budgetError}>
            {project ? 'Save changes' : 'Create'}
          </button>
        </>
      }
    >
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Name" className="full">
          <input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder={isComp ? 'e.g. Wharton Investment Competition 2026-27' : 'e.g. Business Week'} />
        </Field>
        {isComp && (
          <Field label="Organised by" className="full" hint="Add the deadlines on the competition's page after you create it.">
            <input className="input" value={f.organizer ?? ''} onChange={(e) => set('organizer', e.target.value)} placeholder="e.g. Wharton Global Youth Program" />
          </Field>
        )}
        <Field label="Type">
          <Seg<ProjectKind>
            label="Type"
            value={f.kind}
            onChange={(v) => set('kind', v)}
            options={[
              { key: 'event', label: 'Event' },
              { key: 'project', label: 'Ongoing project' },
              { key: 'competition', label: 'Competition' },
            ]}
          />
        </Field>
        <Field label="Stage">
          <select className="select" value={f.stage} onChange={(e) => set('stage', e.target.value as Stage)}>
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {isComp ? COMP_STAGE_LABEL[s.key] : s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="One-line summary" className="full">
          <input className="input" value={f.summary} onChange={(e) => set('summary', e.target.value)} placeholder="What is it, in one sentence?" />
        </Field>
        <Field label="Lead">
          <select className="select" value={f.leadEmail} onChange={(e) => set('leadEmail', e.target.value)}>
            <option value="">No lead yet</option>
            {store.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.email}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Location">
          <input className="input" value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Main hall" />
        </Field>
        <Field label="Starts">
          <input type="date" className="input" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
        <Field label="Ends" hint={dateError ? <span className="neg">{dateError}</span> : 'Leave empty for a one-day event.'}>
          <input type="date" className="input" value={f.endDate} min={f.startDate || undefined} onChange={(e) => set('endDate', e.target.value)} />
        </Field>
        <Field label={`Planned budget (${getCurrency()})`} hint={budgetError ? <span className="neg">{budgetError}</span> : 'Spending is tracked in Finance against this.'}>
          <input className="input num" inputMode="decimal" value={budgetText} onChange={(e) => setBudgetText(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Colour">
          <div className="swatches">
            {PROJECT_COLORS.map((c) => (
              <button type="button" key={c} className="swatch" style={{ background: c }} aria-pressed={f.color === c} aria-label={`Colour ${c}`} onClick={() => set('color', c)} />
            ))}
          </div>
        </Field>
        <div className="field full">
          <span>Team</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 150, overflow: 'auto', padding: 2 }}>
            {store.members
              .filter((m) => m.id !== f.leadEmail)
              .map((m) => {
                const on = f.teamEmails.includes(m.id);
                return (
                  <button
                    type="button"
                    key={m.id}
                    className="chip"
                    aria-pressed={on}
                    onClick={() => toggleTeam(m.id)}
                    style={{ height: 30, cursor: 'pointer', border: `1px solid ${on ? 'var(--ink)' : 'transparent'}`, background: on ? 'var(--marker-soft)' : undefined, color: on ? 'var(--ink)' : undefined, paddingLeft: 4 }}
                  >
                    <Avatar member={m} size={22} />
                    {m.name || m.email}
                  </button>
                );
              })}
            {store.members.length <= 1 && <span className="small faint">Invite members first, then add them here.</span>}
          </div>
        </div>
        <Field label="Goals" className="full" hint="What does success look like? Numbers help: attendance, money raised, sign-ups.">
          <textarea className="textarea" value={f.goals} onChange={(e) => set('goals', e.target.value)} style={{ minHeight: 70 }} />
        </Field>
        <Field label="Details" className="full">
          <textarea className="textarea" value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="The plan, schedule, who to contact..." />
        </Field>
        <div className="full" style={{ display: 'grid', gap: 10, padding: '14px 16px', borderRadius: 'var(--radius-s)', background: 'var(--surface-2)', border: '1px solid var(--rule-soft)' }}>
          <label className="check">
            <input type="checkbox" checked={f.isPublic} onChange={(e) => set('isPublic', e.target.checked)} />
            <span>
              <strong>Show on the public website</strong>
              <span className="small muted" style={{ display: 'block' }}>
                Visitors see the name, dates, location, blurb and details. Budget, tasks and team stay private.
              </span>
            </span>
          </label>
          {f.isPublic && (
            <Field label="Public blurb" hint="Written for students and parents. Leave empty to use the summary.">
              <textarea className="textarea" style={{ minHeight: 64 }} value={f.publicBlurb} onChange={(e) => set('publicBlurb', e.target.value)} />
            </Field>
          )}
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
