import { useState, type FormEvent } from 'react';
import { supabase, projectLink } from '../lib/supabase';
import { errorMessage } from '../lib/format';
import { firstName, smsHref } from '../lib/sms';
import { CATEGORIES, PAINT_FINISHES, groupSelections, selectionDetails, selectionsMessage } from '../lib/selections';
import type { JobData } from '../lib/useJob';
import type { Selection, SelectionCategory } from '../lib/types';
import { ErrorNote } from './Layout';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

/** Paint colours, flooring and other picks, written down once. Shown to the client and on job sheets. */
export function SelectionsTab({ data, reload }: { data: JobData; reload: () => Promise<void> }) {
  const { job, client, selections } = data;
  const [editing, setEditing] = useState<string | null>(null);
  const unconfirmed = selections.filter((s) => !s.confirmed_at);
  const name = firstName(client.name) || 'client';

  return (
    <section aria-label="Selections" className="stack">
      {selections.length === 0 && (
        <p className="muted">
          Write down what {name} picked: paint colours with the brand and code, flooring, fixtures, and where each one
          goes. {name} sees them on the client page and confirms them, and your trades see them on their job sheets.
        </p>
      )}
      {unconfirmed.length > 0 && (
        <div className="card pad-card stack-tight confirm-ask">
          <strong>
            {unconfirmed.length === 1 ? '1 pick isn’t' : `${unconfirmed.length} picks aren’t`} confirmed yet
          </strong>
          <span className="muted small">{name} confirms them on the client page with their name.</span>
          <a
            className="btn small"
            href={smsHref(
              client.phone,
              selectionsMessage({
                clientName: client.name,
                jobTitle: job.title,
                count: unconfirmed.length,
                link: projectLink(job.share_token),
              }),
            )}
          >
            Text {name} to confirm
          </a>
        </div>
      )}
      {groupSelections(selections).map((g) => (
        <div key={g.id} className="stack-tight">
          <h2>{g.plural}</h2>
          <ul className="selection-list">
            {g.items.map((s) =>
              editing === s.id ? (
                <li key={s.id}>
                  <SelectionForm
                    jobId={job.id}
                    existing={s}
                    onDone={async (saved) => {
                      setEditing(null);
                      if (saved) await reload();
                    }}
                  />
                </li>
              ) : (
                <li key={s.id}>
                  <SelectionCard item={s} onEdit={() => setEditing(s.id)} reload={reload} />
                </li>
              ),
            )}
          </ul>
        </div>
      ))}
      {editing === null && <AddSelection jobId={job.id} reload={reload} />}
    </section>
  );
}

function SelectionCard({ item: s, onEdit, reload }: { item: Selection; onEdit: () => void; reload: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const details = selectionDetails(s);

  async function remove() {
    if (!window.confirm(`Remove “${s.name}”?`)) return;
    const { error } = await supabase.from('job_selections').delete().eq('id', s.id);
    if (error) return setError(errorMessage(error));
    await reload();
  }

  return (
    <article className={`card selection-card ${s.confirmed_at ? 'confirmed' : ''}`}>
      <strong className="selection-name">{s.name}</strong>
      {details && <span className="selection-details">{details}</span>}
      {s.location && <span className="small">Where: {s.location}</span>}
      {s.note && <span className="muted small">{s.note}</span>}
      <span className={s.confirmed_at ? 'confirmed-text small' : 'waiting-text small'}>
        {s.confirmed_at ? `Confirmed by ${s.confirmed_name} · ${shortDate(s.confirmed_at)}` : 'Not confirmed yet'}
      </span>
      <div className="row-actions">
        <button type="button" className="btn small plain" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="btn small plain danger" onClick={() => void remove()}>
          Remove
        </button>
      </div>
      <ErrorNote message={error} />
    </article>
  );
}

function AddSelection({ jobId, reload }: { jobId: string; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn secondary" onClick={() => setOpen(true)}>
        Add a selection
      </button>
    );
  }
  return (
    <SelectionForm
      jobId={jobId}
      onDone={async (saved) => {
        setOpen(false);
        if (saved) await reload();
      }}
    />
  );
}

const FIELDS: Record<SelectionCategory, { name: [string, string]; brand: string; code: [string, string]; color?: [string, string] }> = {
  paint: { name: ['Colour name', 'Chantilly Lace'], brand: 'Benjamin Moore', code: ['Colour code', 'OC-65'] },
  flooring: {
    name: ['Product name', 'Everest Elite'],
    brand: 'Torlys',
    code: ['SKU or style number (optional)', '1500-123'],
    color: ['Colour', 'Natural Oak'],
  },
  other: {
    name: ['What it is', 'Vanity faucet'],
    brand: 'Moen',
    code: ['Model or SKU (optional)', '6400BN'],
    color: ['Colour or finish (optional)', 'Brushed nickel'],
  },
};

function SelectionForm({
  jobId,
  existing,
  onDone,
}: {
  jobId: string;
  existing?: Selection;
  onDone: (saved: boolean) => Promise<void>;
}) {
  const [category, setCategory] = useState<SelectionCategory>(existing?.category ?? 'paint');
  const [brand, setBrand] = useState(existing?.brand ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [code, setCode] = useState(existing?.code ?? '');
  const [color, setColor] = useState(existing?.color ?? '');
  const [finish, setFinish] = useState(existing?.finish ?? '');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const f = FIELDS[category];

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const row = {
      category,
      brand: brand.trim() || null,
      name: name.trim(),
      code: code.trim() || null,
      color: category === 'paint' ? null : color.trim() || null,
      finish: category === 'paint' ? finish || null : null,
      location: location.trim() || null,
      note: note.trim() || null,
    };
    const { error } = existing
      ? await supabase.from('job_selections').update(row).eq('id', existing.id)
      : await supabase.from('job_selections').insert({ job_id: jobId, ...row });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    await onDone(true);
  }

  return (
    <form onSubmit={save} className="card pad-card stack">
      <h2>{existing ? 'Edit selection' : 'Add a selection'}</h2>
      <div className="seg three" role="group" aria-label="Kind">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={category === c.id ? 'selected' : ''}
            aria-pressed={category === c.id}
            onClick={() => setCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Brand{category === 'other' ? ' (optional)' : ''}</span>
        <input maxLength={80} placeholder={f.brand} value={brand} onChange={(e) => setBrand(e.target.value)} />
      </label>
      <label className="field">
        <span>{f.name[0]}</span>
        <input required maxLength={120} placeholder={f.name[1]} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {f.color && (
        <label className="field">
          <span>{f.color[0]}</span>
          <input maxLength={80} placeholder={f.color[1]} value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
      )}
      <label className="field">
        <span>{f.code[0]}</span>
        <input maxLength={60} placeholder={f.code[1]} value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      {category === 'paint' && (
        <fieldset className="chips-field">
          <legend>Finish</legend>
          <div className="chips">
            {PAINT_FINISHES.map((x) => (
              <button
                key={x}
                type="button"
                className={`chip ${finish === x ? 'selected' : ''}`}
                aria-pressed={finish === x}
                onClick={() => setFinish(finish === x ? '' : x)}
              >
                {x}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <label className="field">
        <span>Where it goes</span>
        <input
          maxLength={200}
          placeholder={category === 'paint' ? 'Living room, all walls' : 'Whole basement'}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </label>
      <label className="field">
        <span>Note (optional)</span>
        <input
          maxLength={500}
          placeholder={category === 'paint' ? 'Bought at the Barrie store, 2 gallons' : 'Run the planks long way'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {existing?.confirmed_at && (
        <p className="muted small">
          {firstName(existing.confirmed_name ?? '') || 'The client'} confirmed this. If you change it, they’ll need
          to confirm it again.
        </p>
      )}
      <ErrorNote message={error} />
      <button className="btn primary" disabled={busy}>
        {busy ? 'Saving…' : existing ? 'Save' : 'Add'}
      </button>
      <button type="button" className="btn plain" onClick={() => void onDone(false)}>
        Cancel
      </button>
    </form>
  );
}
