import { afterEach, describe, expect, it, vi } from 'vitest';
import { changeMessage, dailyLogMessage, paymentRequestMessage, projectMessage, quoteMessage, smsHref, smsNumber } from './sms';

function setUserAgent(ua: string, maxTouchPoints = 0) {
  vi.stubGlobal('navigator', { userAgent: ua, maxTouchPoints });
}

afterEach(() => vi.unstubAllGlobals());

describe('changeMessage', () => {
  it('matches the brief’s template', () => {
    expect(
      changeMessage({
        clientName: 'Sarah Lee',
        number: 2,
        jobTitle: 'kitchen reno',
        description: 'Add four pot lights over the island.',
        priceCents: 85000,
        timeAdded: 'Half a day',
        link: 'https://jobthread.app/a/abc',
      }),
    ).toBe(
      'Hi Sarah, change #2 for your kitchen reno: Add four pot lights over the island. $850 + HST, adds half a day. Approve here: https://jobthread.app/a/abc',
    );
  });

  it('leaves out the time when none is given', () => {
    const text = changeMessage({
      clientName: 'Sarah',
      number: 1,
      jobTitle: 'deck',
      description: 'Stain the railings',
      priceCents: 30050,
      timeAdded: '',
      link: 'L',
    });
    expect(text).toBe('Hi Sarah, change #1 for your deck: Stain the railings. $300.50 + HST. Approve here: L');
  });
});

describe('schedule wording', () => {
  it('says "no change to the schedule" for the No change chip', () => {
    const text = changeMessage({
      clientName: 'Matt P.',
      number: 8,
      jobTitle: 'basement',
      description: 'Move stair light switch to the top',
      priceCents: 18500,
      timeAdded: 'No change',
      link: 'L',
    });
    expect(text).toBe(
      'Hi Matt, change #8 for your basement: Move stair light switch to the top. $185 + HST, no change to the schedule. Approve here: L',
    );
  });
});

describe('smsHref', () => {
  it('uses & on iPhone', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    expect(smsHref('(705) 555-0199', 'Hi & bye')).toBe('sms:7055550199&body=Hi%20%26%20bye');
  });

  it('uses & on iPad (which says it is a Mac)', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5);
    expect(smsHref('7055550199', 'x')).toBe('sms:7055550199&body=x');
  });

  it('uses ? on Android', () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel 9)');
    expect(smsHref('+1 705 555 0199', 'Hi')).toBe('sms:+17055550199?body=Hi');
  });

  it('keeps a leading + only', () => {
    expect(smsNumber('+1 (705) 555-0199')).toBe('+17055550199');
    expect(smsNumber('705.555.0199')).toBe('7055550199');
  });
});

describe('other messages', () => {
  it('writes a payment request with HST and e-Transfer details', () => {
    expect(
      paymentRequestMessage({
        clientName: 'Matt P.',
        jobTitle: 'basement',
        title: 'Rough-in complete',
        amountCents: 1119333,
        taxRate: 0.13,
        etransferEmail: 'pay@keel.ca',
      }),
    ).toBe(
      'Hi Matt, a payment is due for your basement: Rough-in complete. $11,193.33 + HST = $12,648.46. You can e-Transfer it to pay@keel.ca. Thank you!',
    );
  });

  it('writes a quote text', () => {
    expect(
      quoteMessage({
        clientName: 'Jordan R.',
        businessName: 'Keel Contracting',
        title: 'basement finish',
        baseCents: 7219000,
        hasOptions: true,
        link: 'L',
      }),
    ).toBe(
      "Hi Jordan, here's your quote from Keel Contracting for your basement finish: $72,190 + HST, with options you can choose from. See it and accept here: L",
    );
  });

  it('writes a daily log text', () => {
    expect(
      dailyLogMessage({ clientName: 'Matt', jobTitle: 'basement', body: 'Rough-in done.', when: new Date(2026, 9, 15) }),
    ).toBe('Hi Matt, update on your basement, Oct 15: Rough-in done.');
  });
});

describe('project page messages', () => {
  it('adds the project link to payment requests when given', () => {
    expect(
      paymentRequestMessage({
        clientName: 'Britt',
        jobTitle: 'basement',
        title: 'Drywall',
        amountCents: 100000,
        taxRate: 0.13,
        etransferEmail: null,
        projectLink: 'L',
      }),
    ).toBe('Hi Britt, a payment is due for your basement: Drywall. $1,000 + HST = $1,130.00. Thank you! Your payment schedule: L');
  });

  it('writes the project page text', () => {
    expect(projectMessage({ clientName: 'Britt K', businessName: 'Growthway', jobTitle: 'basement', link: 'L' })).toBe(
      "Hi Britt, here's the page for your basement with Growthway. It shows what's left to pay, the payment schedule, changes and updates, and it stays up to date: L",
    );
  });
});
