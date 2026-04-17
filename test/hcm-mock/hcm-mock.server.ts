import * as express from 'express';
import type { Express } from 'express';
import { randomUUID } from 'crypto';

export interface HcmMockHandles {
  app: Express;
  /** Current HCM-side balance (authoritative in mock). */
  getBalance(employeeId: string, locationId: string): number;
  setBalance(employeeId: string, locationId: string, value: number): void;
}

function key(employeeId: string, locationId: string) {
  return `${employeeId}|${locationId}`;
}

/**
 * Minimal HCM simulator: in-memory balances, validate/submit semantics.
 * Used by integration/e2e tests to model realtime HCM APIs.
 */
export function createHcmMockServer(
  seed: Array<{ employeeId: string; locationId: string; availableDays: number }> = [],
): HcmMockHandles {
  const balances = new Map<string, number>();
  for (const row of seed) {
    balances.set(key(row.employeeId, row.locationId), row.availableDays);
  }

  const app = express();
  app.use(express.json());

  app.get('/balances/:employeeId/:locationId', (req, res) => {
    const k = key(req.params.employeeId, req.params.locationId);
    const availableDays = balances.has(k) ? balances.get(k)! : 0;
    res.json({ availableDays });
  });

  app.post('/time-off/validate', (req, res) => {
    const { employeeId, locationId, days } = req.body ?? {};
    if (!employeeId || !locationId || typeof days !== 'number') {
      res.status(400).json({ ok: false, message: 'invalid payload' });
      return;
    }
    const k = key(employeeId, locationId);
    const b = balances.get(k) ?? 0;
    if (b + 1e-9 >= days) {
      res.json({ ok: true });
    } else {
      res.json({ ok: false, message: 'Insufficient in HCM' });
    }
  });

  app.post('/time-off/submit', (req, res) => {
    const { employeeId, locationId, days } = req.body ?? {};
    if (!employeeId || !locationId || typeof days !== 'number') {
      res.status(400).json({ message: 'invalid payload' });
      return;
    }
    const k = key(employeeId, locationId);
    const b = balances.get(k) ?? 0;
    if (b + 1e-9 < days) {
      res.status(400).json({ message: 'HCM submit denied' });
      return;
    }
    balances.set(k, b - days);
    res.json({ submissionId: randomUUID() });
  });

  return {
    app,
    getBalance(employeeId: string, locationId: string) {
      const k = key(employeeId, locationId);
      return balances.get(k) ?? 0;
    },
    setBalance(employeeId: string, locationId: string, value: number) {
      balances.set(key(employeeId, locationId), value);
    },
  };
}
