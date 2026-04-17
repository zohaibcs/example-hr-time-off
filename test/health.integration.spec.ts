import { INestApplication } from '@nestjs/common';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as request from 'supertest';
import { createTestApp } from './utils/create-test-app';

describe('Health (e2e)', () => {
  let app: INestApplication;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `timeoff-health-${Date.now()}.sqlite`);
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    app = await createTestApp({
      DATABASE_PATH: dbPath,
      HCM_BASE_URL: 'http://127.0.0.1:1',
    });
  });

  afterAll(async () => {
    const restore = (app as INestApplication & { __restoreEnv?: () => void })
      .__restoreEnv;
    await app.close();
    restore?.();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('GET /health returns ok', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });
});
