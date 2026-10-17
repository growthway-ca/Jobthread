import { describe, expect, it } from 'vitest';
import { addDaysIso, todayIso } from './format';
import { paperworkStatus } from './paperwork';

describe('paperworkStatus', () => {
  it('flags expiring and expired paperwork and says what to ask for', () => {
    const s = paperworkStatus({ wsib_expires_on: addDaysIso(todayIso(), 12), insurance_expires_on: addDaysIso(todayIso(), -3) });
    expect(s.level).toBe('expired');
    expect(s.text).toBe('WSIB clearance expires in 12 days · Insurance expired 3 days ago');
    expect(s.ask).toEqual(['WSIB clearance certificate', 'insurance certificate']);
  });

  it('is fine when both are more than 30 days out', () => {
    const s = paperworkStatus({ wsib_expires_on: addDaysIso(todayIso(), 90), insurance_expires_on: addDaysIso(todayIso(), 200) });
    expect(s).toEqual({ level: 'ok', text: 'WSIB and insurance on file', ask: [] });
  });
});
