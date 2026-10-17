import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/format';
import { ErrorNote, Loading, Page } from '../components/Layout';
import type { Subcontractor } from '../lib/types';
import { paperworkStatus } from '../lib/paperwork';

/** Your subs and their WSIB clearance and insurance dates (/subs). */
export function Subs() {
  const [subs, setSubs] = useState<Subcontractor[] | null>(null);
  const [editing, setEditing] = useState<Subcontractor | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('subcontractors').select('*').order('name');
    if (error) return setError(errorMessage(error));
    setSubs((data ?? []) as Subcontractor[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Page nav={false}>
      <Link to="/money" className="back">
        Back to Money
      </Link>
      <h1>Subs</h1>
      <p className="muted">
        Keep each sub’s WSIB clearance and insurance dates here. Money shows who’s expiring in the next 30 days.
      </p>
      <ErrorNote message={error} />
      {!subs && !error && <Loading />}
      {editing ? (
        <SubForm
          sub={editing === 'new' ? null : editing}
          onDone={async () => {
            setEditing(null);
            await load();
          }}
        />
      ) : (
        <button type="button" className="btn primary" onClick={() => setEditing('new')}>
          Add a sub
        </button>
      )}
      {subs && subs.length > 0 && (
        <ul className="card rows">
          {subs.map((s) => {
            const status = paperworkStatus(s);
            return (
              <li key={s.id}>
                <button type="button" className="row-link row-button" onClick={() => setEditing(s)}>
                  <span className="row-main">
                    <strong>
                      {s.name}
                      {s.trade ? ` · ${s.trade}` : ''}
                    </strong>
                    <span className={status.level === 'ok' ? 'muted small' : 'waiting-text small'}>{status.text}</span>
                  </span>
                  <span className="edit-link">Edit</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}

function SubForm({ sub, onDone }: { sub: Subcontractor | null; onDone: () => Promise<void> }) {
  const [name, setName] = useState(sub?.name ?? '');
  const [trade, setTrade] = useState(sub?.trade ?? '');
  const [phone, setPhone] = useState(sub?.phone ?? '');
  const [email, setEmail] = useState(sub?.email ?? '');
  const [wsib, setWsib] = useState(sub?.wsib_expires_on ?? '');
  const [insurance, setInsurance] = useState(sub?.insurance_expires_on ?? '');
  const [notes, setNotes] = useState(sub?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const row = {
      name: name.trim(),
      trade: trade.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      wsib_expires_on: wsib || null,
      insurance_expires_on: insurance || null,
      notes: notes.trim() || null,
    };
    const { error } = sub
      ? await supabase.from('subcontractors').update(row).eq('id', sub.id)
      : await supabase.from('subcontractors').insert(row);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await onDone();
  }

  async function remove() {
    if (!sub || !window.confirm(`Remove ${sub.name}?`)) return;
    const { error } = await supabase.from('subcontractors').delete().eq('id', sub.id);
    if (error) return setError(errorMessage(error));
    await onDone();
  }

  return (
    <form onSubmit={save} className="card pad-card stack">
      <h2>{sub ? `Edit ${sub.name}` : 'Add a sub'}</h2>
      <label className="field">
        <span>Company or name</span>
        <input required maxLength={120} placeholder="Sparks Electric" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Trade</span>
        <input maxLength={80} placeholder="Electrician" value={trade} onChange={(e) => setTrade(e.target.value)} />
      </label>
      <label className="field">
        <span>Mobile</span>
        <input type="tel" inputMode="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label className="field">
        <span>Email</span>
        <input type="email" inputMode="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <div className="date-row">
        <label className="field">
          <span>WSIB clearance expires</span>
          <input type="date" value={wsib} onChange={(e) => setWsib(e.target.value)} />
        </label>
        <label className="field">
          <span>Insurance expires</span>
          <input type="date" value={insurance} onChange={(e) => setInsurance(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Notes</span>
        <input maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <ErrorNote message={error} />
      <button className="btn primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button type="button" className="btn plain" onClick={() => void onDone()}>
        Cancel
      </button>
      {sub && (
        <button type="button" className="btn small plain danger" onClick={() => void remove()}>
          Remove {sub.name}
        </button>
      )}
    </form>
  );
}
