import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/format';
import { formatMoney, parseDollars } from '../lib/money';
import { ErrorNote, Loading, Page } from '../components/Layout';
import { ClientPicker, resolveClient, type ClientChoice } from '../components/ClientPicker';
import { QUOTE_PHOTO_BUCKET, preparePhoto, quotePhotoUrl, uploadQuotePhoto, type PreparedPhoto } from '../lib/photos';
import type { OptionKind, Quote, QuoteOption, QuotePhoto } from '../lib/types';

interface OptionDraft {
  key: string;
  kind: OptionKind;
  /** For a choice: the key of its group. */
  group: string | null;
  swatch: string | null;
  title: string;
  detail: string;
  price: string;
  recommended: boolean;
}

interface GroupDraft {
  key: string;
  name: string;
  swatches: boolean;
}

/** A photo already on the quote, or one picked on this page and not uploaded yet. */
interface PhotoDraft {
  key: string;
  label: string;
  existing?: QuotePhoto;
  prepared?: PreparedPhoto;
}

const PHOTO_LABELS = ['Outside', 'Inside', 'Close up', 'Before'];
const MAX_PHOTOS = 6;

const DEPOSITS = [
  { rate: 0, label: 'None' },
  { rate: 0.05, label: '5%' },
  { rate: 0.1, label: '10%' },
  { rate: 0.25, label: '25%' },
];

function isoDate(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function blankOption(kind: OptionDraft['kind'], group: string | null = null): OptionDraft {
  return { key: crypto.randomUUID(), kind, group, swatch: null, title: '', detail: '', price: '', recommended: false };
}

/** New quote, or edit a draft (/quotes/:quoteId/edit). Sent quotes are locked. */
export function QuoteEdit() {
  const { quoteId } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const leadId = quoteId ? null : params.get('lead');
  const [loading, setLoading] = useState(Boolean(quoteId));
  const [client, setClient] = useState<ClientChoice>({ kind: 'new', name: '', phone: '' });
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [scope, setScope] = useState('');
  const [base, setBase] = useState('');
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [groups, setGroups] = useState<GroupDraft[]>([]);
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [removedPhotos, setRemovedPhotos] = useState<QuotePhoto[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [deposit, setDeposit] = useState(0);
  const [validUntil, setValidUntil] = useState(isoDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Starting from a lead: fill in who and what.
  useEffect(() => {
    if (!leadId) return;
    supabase
      .from('leads')
      .select('name, phone, project')
      .eq('id', leadId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setClient({ kind: 'new', name: data.name ?? '', phone: data.phone ?? '' });
        if (data.project) setScope(data.project);
      });
  }, [leadId]);

  useEffect(() => {
    if (!quoteId) return;
    supabase
      .from('quotes')
      .select('*, quote_options(*), quote_photos(*)')
      .eq('id', quoteId)
      .maybeSingle()
      .then(({ data, error }) => {
        setLoading(false);
        if (error || !data) return setError(error ? errorMessage(error) : 'We couldn’t find that quote.');
        const q = data as Quote & { quote_options: QuoteOption[]; quote_photos: QuotePhoto[] };
        if (q.status !== 'draft') {
          navigate(`/quotes/${q.id}`, { replace: true });
          return;
        }
        setClient({ kind: 'existing', id: q.client_id });
        setTitle(q.title);
        setAddress(q.address ?? '');
        setScope(q.scope ?? '');
        setBase((q.base_cents / 100).toFixed(2));
        setDeposit(Number(q.deposit_rate));
        setValidUntil(q.valid_until ?? '');
        const sorted = [...q.quote_options].sort((a, b) => a.position - b.position);
        const loadedGroups: GroupDraft[] = [];
        for (const o of sorted) {
          if (o.kind !== 'choice' || !o.group_name) continue;
          const g = loadedGroups.find((x) => x.name === o.group_name);
          if (g) g.swatches = g.swatches && Boolean(o.swatch);
          else loadedGroups.push({ key: crypto.randomUUID(), name: o.group_name, swatches: Boolean(o.swatch) });
        }
        setGroups(loadedGroups);
        setOptions(
          sorted.map((o) => ({
            key: o.id,
            kind: o.kind ?? 'addon',
            group: o.kind === 'choice' ? (loadedGroups.find((g) => g.name === o.group_name)?.key ?? null) : null,
            swatch: o.swatch ?? null,
            title: o.title,
            detail: o.detail ?? '',
            price: (o.price_cents / 100).toFixed(2),
            recommended: o.recommended,
          })),
        );
        setPhotos(
          [...(q.quote_photos ?? [])]
            .sort((a, b) => a.position - b.position)
            .map((p) => ({ key: p.id, label: p.label ?? '', existing: p })),
        );
      });
  }, [quoteId, navigate]);

  function updateOption(key: string, values: Partial<OptionDraft>) {
    setOptions((current) => current.map((o) => (o.key === key ? { ...o, ...values } : o)));
  }

  const packages = options.filter((o) => o.kind === 'package');
  const addons = options.filter((o) => o.kind === 'addon');

  function addGroup() {
    const key = crypto.randomUUID();
    setGroups((g) => [...g, { key, name: '', swatches: false }]);
    setOptions((c) => [...c, { ...blankOption('choice', key), recommended: true }, blankOption('choice', key)]);
  }

  function updateGroup(key: string, values: Partial<GroupDraft>) {
    setGroups((current) => current.map((g) => (g.key === key ? { ...g, ...values } : g)));
    if (values.swatches !== undefined) {
      setOptions((current) =>
        current.map((o) => (o.group === key ? { ...o, swatch: values.swatches ? (o.swatch ?? '#8a8f8c') : null } : o)),
      );
    }
  }

  function removeGroup(key: string) {
    setGroups((current) => current.filter((g) => g.key !== key));
    setOptions((current) => current.filter((o) => o.group !== key));
  }

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    try {
      const room = MAX_PHOTOS - photos.length;
      const prepared = await Promise.all(Array.from(files).slice(0, room).map(preparePhoto));
      setPhotos((current) => [
        ...current,
        ...prepared.map((p, i) => ({
          key: p.previewUrl,
          label: PHOTO_LABELS[current.length + i] ?? '',
          prepared: p,
        })),
      ]);
      if (files.length > room) setError(`Up to ${MAX_PHOTOS} photos per quote.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function removePhoto(key: string) {
    const photo = photos.find((p) => p.key === key);
    if (photo?.existing) setRemovedPhotos((r) => [...r, photo.existing!]);
    if (photo?.prepared) URL.revokeObjectURL(photo.prepared.previewUrl);
    setPhotos((current) => current.filter((p) => p.key !== key));
  }
  const baseCents = parseDollars(base) ?? 0;
  const recommendedCents = options
    .filter((o) => o.recommended)
    .reduce((t, o) => t + (parseDollars(o.price) ?? 0), 0);

  async function save(e: FormEvent) {
    e.preventDefault();
    const baseValue = parseDollars(base);
    if (baseValue === null || baseValue < 0) return setError('Enter the base price in dollars, before tax.');
    const cleanOptions = options.filter((o) => o.title.trim() || o.price.trim());
    // A choice with no extra cost is just included.
    for (const o of cleanOptions) if (o.kind === 'choice' && !o.price.trim()) o.price = '0';
    for (const g of groups) {
      const choices = cleanOptions.filter((o) => o.group === g.key);
      if (!g.name.trim()) return setError('Give every group of choices a name, like Frame or Colour.');
      if (choices.length < 2) return setError(`Add at least two choices to “${g.name.trim()}”, or remove the group.`);
      if (groups.filter((x) => x.name.trim().toLowerCase() === g.name.trim().toLowerCase()).length > 1) {
        return setError(`Two groups are called “${g.name.trim()}”. Give each its own name.`);
      }
      // Exactly one choice per group is picked to start.
      const start = choices.find((o) => o.recommended) ?? choices[0];
      for (const o of choices) o.recommended = o === start;
    }
    const cleanPackages = cleanOptions.filter((o) => o.kind === 'package');
    if (cleanPackages.length === 1) return setError('Add at least two packages, or turn the one into an add-on.');
    if (cleanPackages.length > 1 && !cleanPackages.some((o) => o.recommended)) cleanPackages[0].recommended = true;
    for (const o of cleanOptions) {
      if (!o.title.trim()) return setError('Give every option a name, or remove it.');
      if (parseDollars(o.price) === null) return setError(`Enter a price for “${o.title.trim()}”.`);
    }
    setBusy(true);
    setError(null);
    try {
      const clientId = await resolveClient(client);
      const values = {
        client_id: clientId,
        title: title.trim(),
        address: address.trim() || null,
        scope: scope.trim() || null,
        base_cents: baseValue,
        deposit_rate: deposit,
        valid_until: validUntil || null,
      };
      let id = quoteId;
      if (id) {
        const { error } = await supabase.from('quotes').update(values).eq('id', id);
        if (error) throw error;
        const { error: delError } = await supabase.from('quote_options').delete().eq('quote_id', id);
        if (delError) throw delError;
      } else {
        id = crypto.randomUUID();
        const { error } = await supabase.from('quotes').insert({ id, ...values, status: 'draft' });
        if (error) throw error;
      }
      if (cleanOptions.length > 0) {
        const { error } = await supabase.from('quote_options').insert(
          cleanOptions.map((o, i) => ({
            quote_id: id,
            position: i + 1,
            title: o.title.trim(),
            detail: o.detail.trim() || null,
            price_cents: parseDollars(o.price) ?? 0,
            recommended: o.recommended,
            kind: o.kind,
            group_name: o.kind === 'choice' ? (groups.find((g) => g.key === o.group)?.name.trim() ?? null) : null,
            swatch: o.kind === 'choice' ? o.swatch : null,
          })),
        );
        if (error) throw error;
      }
      await savePhotos(id);
      if (leadId) await supabase.from('leads').update({ status: 'quoted' }).eq('id', leadId);
      navigate(`/quotes/${id}`, { replace: true });
    } catch (err) {
      setBusy(false);
      setError(errorMessage(err));
    }
  }

  /** Removes, relabels and uploads photos once the quote exists. */
  async function savePhotos(id: string) {
    if (removedPhotos.length > 0) {
      const { error } = await supabase
        .from('quote_photos')
        .delete()
        .in(
          'id',
          removedPhotos.map((p) => p.id),
        );
      if (error) throw error;
      await supabase.storage.from(QUOTE_PHOTO_BUCKET).remove(removedPhotos.map((p) => p.storage_path));
      setRemovedPhotos([]);
    }
    for (const [i, p] of photos.entries()) {
      const label = p.label.trim() || null;
      if (p.existing) {
        if (p.existing.label !== label || p.existing.position !== i + 1) {
          const { error } = await supabase.from('quote_photos').update({ label, position: i + 1 }).eq('id', p.existing.id);
          if (error) throw error;
        }
      } else if (p.prepared) {
        const path = await uploadQuotePhoto(id, p.prepared);
        const { error } = await supabase.from('quote_photos').insert({
          quote_id: id,
          storage_path: path,
          label,
          position: i + 1,
          width: p.prepared.width,
          height: p.prepared.height,
        });
        if (error) throw error;
      }
    }
  }

  if (loading) {
    return (
      <Page nav={false}>
        <Loading />
      </Page>
    );
  }

  return (
    <Page nav={false}>
      <Link to={quoteId ? `/quotes/${quoteId}` : '/quotes'} className="back">
        {quoteId ? 'Back to the quote' : 'Back to quotes'}
      </Link>
      <h1>{quoteId ? 'Edit quote' : 'New quote'}</h1>
      <form onSubmit={save} className="stack">
        <ClientPicker value={client} onChange={setClient} />
        <label className="field">
          <span>Job</span>
          <input required maxLength={120} placeholder="Basement finish, about 750 sq ft" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>Address</span>
          <input maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label className="field">
          <span>What’s included</span>
          <textarea
            rows={5}
            maxLength={4000}
            placeholder={'Framing, insulation, drywall and paint\nElectrical and two-piece bath by licensed trades\nPermit, drawings and inspections handled'}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          />
          <span className="hint">One item per line. Each line shows with a checkmark.</span>
        </label>
        <label className="field">
          <span>Base price, before tax</span>
          <div className="money-input">
            <span aria-hidden="true">$</span>
            <input inputMode="decimal" required value={base} onChange={(e) => setBase(e.target.value)} />
          </div>
        </label>

        <fieldset className="field chips-field">
          <legend>Photos of the space (optional)</legend>
          <p className="hint">They show at the top of the quote. Label them so the client can flip between them.</p>
          {photos.length > 0 && (
            <div className="stack">
              {photos.map((p) => (
                <div key={p.key} className="card quote-photo-edit">
                  <div className="photo">
                    <img src={p.prepared ? p.prepared.previewUrl : quotePhotoUrl(p.existing!.storage_path)} alt="" />
                    <button type="button" className="photo-remove" aria-label="Remove photo" onClick={() => removePhoto(p.key)}>
                      ×
                    </button>
                  </div>
                  <div className="chips">
                    {PHOTO_LABELS.map((l) => (
                      <button
                        key={l}
                        type="button"
                        className={`chip small-chip ${p.label === l ? 'selected' : ''}`}
                        aria-pressed={p.label === l}
                        onClick={() => setPhotos((c) => c.map((x) => (x.key === p.key ? { ...x, label: l } : x)))}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <input
                    aria-label="Photo label"
                    maxLength={40}
                    placeholder="Or type a label"
                    value={p.label}
                    onChange={(e) => setPhotos((c) => c.map((x) => (x.key === p.key ? { ...x, label: e.target.value } : x)))}
                  />
                </div>
              ))}
            </div>
          )}
          {photos.length < MAX_PHOTOS && (
            <label className="photo-add">
              <input ref={fileInput} type="file" accept="image/*" multiple onChange={(e) => void addPhotos(e.target.files)} />
              Add photos
            </label>
          )}
        </fieldset>

        <fieldset className="field chips-field">
          <legend>Choices the client picks from (optional)</legend>
          {groups.length === 0 && (
            <p className="hint">
              Like Frame: Aluminium or PVC. The client picks one in each group and the price updates as they tap. Use
              colour swatches for colours.
            </p>
          )}
          <div className="stack">
            {groups.map((g) => (
              <ChoiceGroupCard
                key={g.key}
                group={g}
                choices={options.filter((o) => o.group === g.key)}
                onChangeGroup={(values) => updateGroup(g.key, values)}
                onRemoveGroup={() => removeGroup(g.key)}
                onChangeChoice={updateOption}
                onRemoveChoice={(key) => setOptions((current) => current.filter((x) => x.key !== key))}
                onPickStart={(key) =>
                  setOptions((current) => current.map((x) => (x.group === g.key ? { ...x, recommended: x.key === key } : x)))
                }
                onAddChoice={() =>
                  setOptions((c) => [...c, { ...blankOption('choice', g.key), swatch: g.swatches ? '#8a8f8c' : null }])
                }
              />
            ))}
            <button type="button" className="btn secondary" onClick={addGroup}>
              Add a group of choices
            </button>
          </div>
        </fieldset>

        <fieldset className="field chips-field">
          <legend>Packages (optional)</legend>
          {packages.length === 0 && (
            <p className="hint">
              Good, Better, Best: whole versions of the job at different prices. The client picks one. Leave the base
              price at 0 if each package has its full price.
            </p>
          )}
          <div className="stack">
            {packages.map((o, i) => (
              <OptionCard
                key={o.key}
                option={o}
                index={i}
                onChange={(values) => updateOption(o.key, values)}
                onRemove={() => setOptions((current) => current.filter((x) => x.key !== o.key))}
                onPickDefault={() =>
                  setOptions((current) =>
                    current.map((x) => (x.kind === 'package' ? { ...x, recommended: x.key === o.key } : x)),
                  )
                }
              />
            ))}
            <button
              type="button"
              className="btn secondary"
              onClick={() =>
                setOptions((c) => [
                  ...c,
                  { ...blankOption('package'), title: ['Good', 'Better', 'Best'][packages.length] ?? '', recommended: packages.length === 0 },
                ])
              }
            >
              Add a package
            </button>
          </div>
        </fieldset>

        <fieldset className="field chips-field">
          <legend>Add-ons the client can tick</legend>
          {addons.length === 0 && (
            <p className="hint">Upgrades or extras, like an insulated subfloor. The client ticks the ones they want.</p>
          )}
          <div className="stack">
            {addons.map((o, i) => (
              <OptionCard
                key={o.key}
                option={o}
                index={i}
                onChange={(values) => updateOption(o.key, values)}
                onRemove={() => setOptions((current) => current.filter((x) => x.key !== o.key))}
              />
            ))}
            <button type="button" className="btn secondary" onClick={() => setOptions((c) => [...c, blankOption('addon')])}>
              Add an add-on
            </button>
          </div>
        </fieldset>

        <fieldset className="field chips-field">
          <legend>Deposit to book</legend>
          <div className="chips">
            {DEPOSITS.map((d) => (
              <button
                key={d.rate}
                type="button"
                className={deposit === d.rate ? 'chip selected' : 'chip'}
                aria-pressed={deposit === d.rate}
                onClick={() => setDeposit(d.rate)}
              >
                {d.label}
              </button>
            ))}
          </div>
          {deposit > 0 && (
            <span className="hint">When the client accepts, this goes into the job’s payment schedule.</span>
          )}
        </fieldset>

        <label className="field">
          <span>Good until</span>
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </label>

        <div className="card totals">
          <div className="line">
            <span>Base price</span>
            <span className="money">{formatMoney(baseCents, { alwaysCents: true })}</span>
          </div>
          {recommendedCents !== 0 && (
            <div className="line">
              <span>Ticked options</span>
              <span className="money">{formatMoney(recommendedCents, { alwaysCents: true })}</span>
            </div>
          )}
          {(packages.length > 0 || groups.length > 0) && (
            <p className="muted small">Starting total uses what’s picked to start.</p>
          )}
          <div className="line grand">
            <span>Starting total</span>
            <span className="money">{formatMoney(baseCents + recommendedCents, { alwaysCents: true })}</span>
          </div>
          <p className="muted small">Before HST.</p>
        </div>

        <ErrorNote message={error} />
        <button className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save draft'}
        </button>
      </form>
    </Page>
  );
}

function OptionCard({
  option: o,
  index,
  onChange,
  onRemove,
  onPickDefault,
}: {
  option: OptionDraft;
  index: number;
  onChange: (values: Partial<OptionDraft>) => void;
  onRemove: () => void;
  onPickDefault?: () => void;
}) {
  const isPackage = o.kind === 'package';
  const noun = isPackage ? 'Package' : 'Add-on';
  return (
    <div className={`card option-edit ${isPackage && o.recommended ? 'picked' : ''}`}>
      <div className="option-edit-row">
        <input
          aria-label={`${noun} ${index + 1} name`}
          placeholder={isPackage ? 'Better' : 'Insulated subfloor'}
          maxLength={120}
          value={o.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <div className="money-input narrow">
          <span aria-hidden="true">$</span>
          <input aria-label={`${noun} ${index + 1} price`} inputMode="decimal" value={o.price} onChange={(e) => onChange({ price: e.target.value })} />
        </div>
      </div>
      <input
        aria-label={`${noun} ${index + 1} details`}
        placeholder={isPackage ? 'Standard LVP, paint-grade trim, no subfloor' : 'Warmer floor, about 1 in. higher'}
        maxLength={300}
        value={o.detail}
        onChange={(e) => onChange({ detail: e.target.value })}
      />
      <div className="option-edit-foot">
        {isPackage ? (
          <label className="check-row small">
            <input type="radio" name="default-package" checked={o.recommended} onChange={() => onPickDefault?.()} />
            <span>Picked to start</span>
          </label>
        ) : (
          <label className="check-row small">
            <input type="checkbox" checked={o.recommended} onChange={(e) => onChange({ recommended: e.target.checked })} />
            <span>Ticked to start</span>
          </label>
        )}
        <button type="button" className="btn small plain danger" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

function ChoiceGroupCard({
  group: g,
  choices,
  onChangeGroup,
  onRemoveGroup,
  onChangeChoice,
  onRemoveChoice,
  onPickStart,
  onAddChoice,
}: {
  group: GroupDraft;
  choices: OptionDraft[];
  onChangeGroup: (values: Partial<GroupDraft>) => void;
  onRemoveGroup: () => void;
  onChangeChoice: (key: string, values: Partial<OptionDraft>) => void;
  onRemoveChoice: (key: string) => void;
  onPickStart: (key: string) => void;
  onAddChoice: () => void;
}) {
  return (
    <div className="card option-edit choice-group-edit">
      <input
        aria-label="Group name"
        className="group-name-input"
        placeholder="Frame"
        maxLength={60}
        value={g.name}
        onChange={(e) => onChangeGroup({ name: e.target.value })}
      />
      <label className="check-row small">
        <input type="checkbox" checked={g.swatches} onChange={(e) => onChangeGroup({ swatches: e.target.checked })} />
        <span>Show as colour swatches</span>
      </label>
      {choices.map((o, i) => (
        <div key={o.key} className="choice-edit">
          <div className="option-edit-row">
            {g.swatches && (
              <input
                type="color"
                aria-label={`Choice ${i + 1} colour`}
                className="swatch-input"
                value={o.swatch ?? '#8a8f8c'}
                onChange={(e) => onChangeChoice(o.key, { swatch: e.target.value })}
              />
            )}
            <input
              aria-label={`Choice ${i + 1} name`}
              placeholder={g.swatches ? ['Anthracite grey', 'Traffic white'][i] ?? 'Colour name' : ['Aluminium', 'PVC'][i] ?? 'Choice'}
              maxLength={120}
              value={o.title}
              onChange={(e) => onChangeChoice(o.key, { title: e.target.value })}
            />
            <div className="money-input narrow">
              <span aria-hidden="true">+$</span>
              <input
                aria-label={`Choice ${i + 1} extra cost`}
                inputMode="decimal"
                placeholder="0"
                value={o.price}
                onChange={(e) => onChangeChoice(o.key, { price: e.target.value })}
              />
            </div>
          </div>
          <div className="option-edit-foot">
            <label className="check-row small">
              <input type="radio" name={`start-${g.key}`} checked={o.recommended} onChange={() => onPickStart(o.key)} />
              <span>Picked to start</span>
            </label>
            {choices.length > 2 && (
              <button type="button" className="btn small plain danger" onClick={() => onRemoveChoice(o.key)}>
                Remove
              </button>
            )}
          </div>
        </div>
      ))}
      <div className="option-edit-foot">
        <button type="button" className="btn small plain" onClick={onAddChoice}>
          Add a choice
        </button>
        <button type="button" className="btn small plain danger" onClick={onRemoveGroup}>
          Remove group
        </button>
      </div>
    </div>
  );
}
