import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Client } from '../lib/types';

export type ClientChoice = { kind: 'existing'; id: string } | { kind: 'new'; name: string; phone: string };

/** Pick one of your clients, or add a new one inline. */
export function ClientPicker({
  value,
  onChange,
}: {
  value: ClientChoice;
  onChange: (choice: ClientChoice) => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    supabase
      .from('clients')
      .select('*')
      .order('name')
      .then(({ data }) => setClients((data as Client[]) ?? []));
  }, []);

  const selectValue = value.kind === 'existing' ? value.id : 'new';

  return (
    <div className="stack">
      {clients.length > 0 && (
        <label className="field">
          <span>Client</span>
          <select
            value={selectValue}
            onChange={(e) =>
              onChange(e.target.value === 'new' ? { kind: 'new', name: '', phone: '' } : { kind: 'existing', id: e.target.value })
            }
          >
            <option value="new">New client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {value.kind === 'new' && (
        <>
          <label className="field">
            <span>Client name</span>
            <input required value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Client mobile</span>
            <input
              type="tel"
              inputMode="tel"
              required
              minLength={7}
              value={value.phone}
              onChange={(e) => onChange({ ...value, phone: e.target.value })}
            />
          </label>
        </>
      )}
    </div>
  );
}

/** Returns the client id, creating the client first if it's new. */
export async function resolveClient(choice: ClientChoice): Promise<string> {
  if (choice.kind === 'existing') return choice.id;
  const id = crypto.randomUUID();
  const { error } = await supabase.from('clients').insert({ id, name: choice.name.trim(), phone: choice.phone.trim() });
  if (error) throw error;
  return id;
}
