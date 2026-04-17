import { INestApplication } from '@nestjs/common';
import { createServer } from 'http';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as request from 'supertest';
import { createHcmMockServer } from './hcm-mock/hcm-mock.server';
import { createTestApp } from './utils/create-test-app';

describe('Time-off flow (e2e with HCM mock)', () => {
  let app: INestApplication;
  let dbPath: string;
  let hcmBaseUrl: string;
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    const mock = createHcmMockServer([
      { employeeId: 'e1', locationId: 'locA', availableDays: 10 },
    ]);
    server = createServer(mock.app);
    await new Promise<void>((resolve) =>
      server.listen(0, () => resolve()),
    );
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('mock bind failed');
    }
    hcmBaseUrl = `http://127.0.0.1:${addr.port}`;

    dbPath = path.join(os.tmpdir(), `timeoff-e2e-${Date.now()}.sqlite`);
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }

    app = await createTestApp({
      DATABASE_PATH: dbPath,
      HCM_BASE_URL: hcmBaseUrl,
    });
  });

  afterAll(async () => {
    if (app) {
      const restore = (app as INestApplication & { __restoreEnv?: () => void })
        .__restoreEnv;
      await app.close();
      restore?.();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (dbPath && fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('seeds via batch, creates request, approves, and keeps projected balance consistent', async () => {
    await request(app.getHttpServer())
      .post('/sync/balances/batch')
      .send({
        items: [
          { employeeId: 'e1', locationId: 'locA', availableDays: 10 },
        ],
      })
      .expect(201)
      .expect((res) => {
        expect(res.body.applied).toBe(1);
        expect(res.body.reconciliationFlagged).toEqual([]);
      });

    const balBefore = await request(app.getHttpServer()).get(
      '/employees/e1/balances/locA',
    );
    expect(balBefore.body.projectedAvailableDays).toBe(10);

    const created = await request(app.getHttpServer())
      .post('/time-off/requests')
      .send({
        employeeId: 'e1',
        locationId: 'locA',
        startDate: '2026-06-01',
        endDate: '2026-06-02',
        days: 2,
      })
      .expect(201);

    const id = created.body.id as string;

    const balPending = await request(app.getHttpServer()).get(
      '/employees/e1/balances/locA',
    );
    expect(balPending.body.pendingDays).toBe(2);
    expect(balPending.body.projectedAvailableDays).toBe(8);

    await request(app.getHttpServer())
      .post(`/time-off/requests/${id}/approve`)
      .expect(201);

    const balAfter = await request(app.getHttpServer()).get(
      '/employees/e1/balances/locA',
    );
    expect(balAfter.body.pendingDays).toBe(0);
    expect(balAfter.body.availableDays).toBe(8);
    expect(balAfter.body.projectedAvailableDays).toBe(8);
  });

  it('flags reconciliation when batch drops below pending', async () => {
    await request(app.getHttpServer())
      .post('/sync/balances/batch')
      .send({
        items: [
          { employeeId: 'e1', locationId: 'locA', availableDays: 10 },
        ],
      })
      .expect(201);

    const created = await request(app.getHttpServer())
      .post('/time-off/requests')
      .send({
        employeeId: 'e1',
        locationId: 'locA',
        startDate: '2026-07-01',
        endDate: '2026-07-05',
        days: 5,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/sync/balances/batch')
      .send({
        items: [
          { employeeId: 'e1', locationId: 'locA', availableDays: 2 },
        ],
      })
      .expect(201)
      .expect((res) => {
        expect(res.body.reconciliationFlagged.length).toBeGreaterThan(0);
      });

    const bal = await request(app.getHttpServer()).get(
      '/employees/e1/balances/locA',
    );
    expect(bal.body.reconciliationRequired).toBe(true);

    await request(app.getHttpServer())
      .post(`/time-off/requests/${created.body.id}/reject`)
      .expect(201);
  });
});
