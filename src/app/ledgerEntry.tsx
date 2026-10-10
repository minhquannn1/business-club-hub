import { useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { useStore } from '../lib/store';
import { addRows, compressImage, createSheet, ledgerColumns, saveReceipt, writeCells } from '../lib/actions';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../lib/constants';
import { parseLooseNumber } from '../lib/formula';
import { getCurrency, todayISO } from '../lib/format';
import { Field, Modal, Seg, useRun } from '../components/ui';
import type { Sheet } from '../lib/types';

/** Adds one money movement to the club ledger: fills the first empty row, or appends one. */
export function LedgerEntryForm({ projectId = '', direction = 'out', onClose }: { projectId?: string; direction?: 'in' | 'out'; onClose: () => void }) {
  const store = useStore();
  const run = useRun();
  const ledgers = store.sheets.filter((s) => s.isLedger);
  const [sheetId, setSheetId] = useState(ledgers[0]?.id ?? '');
  const [dir, setDir] = useState<'in' | 'out'>(direction);
  const [f, setF] = useState({ date: todayISO(), desc: '', cat: '', proj: projectId, amt: '', payer: store.myEmail, note: '' });
  const [receipt, setReceipt] = useState<{ dataUrl: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const amount = parseLooseNumber(f.amt);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const cats = dir === 'in' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const save = async () => {
    if (!f.desc.trim() || amount === null || amount <= 0) return;
    setBusy(true);
    const ok = await run(async () => {
      let sheet: Sheet | undefined = ledgers.find((s) => s.id === sheetId);
      let rows = sheet ? store.rows.get(sheet.id) ?? [] : [];
      if (!sheet) {
        const id = await createSheet('Ledger', 'ledger', 0);
        sheet = { id, name: 'Ledger', order: 0, isLedger: true, columns: ledgerColumns(), createdAt: Date.now(), createdBy: store.myEmail };
        rows = [];
      }
      const col = (role: string) => sheet!.columns.find((c) => c.role === role)?.key;
      const cells: Record<string, string> = {};
      const put = (role: string, v: string) => {
        const k = col(role);
        if (k && v) cells[k] = v;
      };
      put('date', f.date);
      put('description', f.desc.trim());
      put('direction', dir === 'in' ? 'In' : 'Out');
      put('category', f.cat);
      put('project', f.proj);
      put('amount', String(amount));
      put('payer', f.payer);
      const noteKey = sheet.columns.find((c) => !c.role && c.type === 'text')?.key;
      if (noteKey && f.note.trim()) cells[noteKey] = f.note.trim();
      if (receipt) {
        const rid = await saveReceipt(receipt.dataUrl, receipt.name, sheet.name);
        put('receipt', rid);
      }
      const empty = rows.find((r) => !Object.values(r.cells ?? {}).some((v) => v !== ''));
      if (empty) await writeCells(sheet.id, Object.entries(cells).map(([colKey, value]) => ({ rowId: empty.id, colKey, value })));
      else await addRows(sheet.id, rows.length ? rows[rows.length - 1].order : 0, null, 1, [cells]);
      return true;
    }, dir === 'in' ? 'Income recorded' : 'Expense recorded');
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      title={dir === 'in' ? 'Record income' : 'Record an expense'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !f.desc.trim() || amount === null || amount <= 0} onClick={save}>
            {busy ? 'Saving...' : dir === 'in' ? 'Record income' : 'Record expense'}
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
        <Field label="Money" className="full">
          <Seg<'in' | 'out'>
            label="Direction"
            value={dir}
            onChange={setDir}
            options={[
              { key: 'out', label: 'Spent' },
              { key: 'in', label: 'Received' },
            ]}
          />
        </Field>
        <Field label="What for" className="full">
          <input className="input" value={f.desc} onChange={(e) => set('desc', e.target.value)} placeholder={dir === 'in' ? 'e.g. Sponsorship from a local café' : 'e.g. Printing 200 flyers'} />
        </Field>
        <Field label={`Amount (${getCurrency()})`} hint={f.amt && amount === null ? <span className="neg">Type a number, like 350,000</span> : undefined}>
          <input className="input num" inputMode="decimal" value={f.amt} onChange={(e) => set('amt', e.target.value)} placeholder="0" />
        </Field>
        <Field label="Date">
          <input type="date" className="input" value={f.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Category">
          <select className="select" value={f.cat} onChange={(e) => set('cat', e.target.value)}>
            <option value="">Choose...</option>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Project">
          <select className="select" value={f.proj} onChange={(e) => set('proj', e.target.value)}>
            <option value="">General club money</option>
            {store.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label={dir === 'in' ? 'Received by' : 'Paid by'}>
          <select className="select" value={f.payer} onChange={(e) => set('payer', e.target.value)}>
            {store.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.email}
              </option>
            ))}
          </select>
        </Field>
        {ledgers.length > 1 && (
          <Field label="Ledger">
            <select className="select" value={sheetId} onChange={(e) => setSheetId(e.target.value)}>
              {ledgers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Notes" className="full">
          <input className="input" value={f.note} onChange={(e) => set('note', e.target.value)} />
        </Field>
        <div className="full" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const r = await run(async () => ({ dataUrl: await compressImage(file), name: file.name }));
              if (r) setReceipt(r);
            }}
          />
          <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
            <Paperclip /> {receipt ? 'Replace receipt' : 'Attach receipt photo'}
          </button>
          {receipt && <img src={receipt.dataUrl} alt="Receipt preview" style={{ height: 44, borderRadius: 4, border: '1px solid var(--rule)' }} />}
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
