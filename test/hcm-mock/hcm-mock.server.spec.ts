import { createServer } from 'http';
import * as request from 'supertest';
import { createHcmMockServer } from './hcm-mock.server';

describe('HCM mock server', () => {
  it('validates and submits against shared balances', async () => {
    const mock = createHcmMockServer([
      { employeeId: 'a', locationId: 'b', availableDays: 5 },
    ]);
    const server = createServer(mock.app);
    await new Promise<void>((r) => server.listen(0, r));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const agent = request(`http://127.0.0.1:${port}`);

    await agent
      .post('/time-off/validate')
      .send({ employeeId: 'a', locationId: 'b', days: 2 })
      .expect(200)
      .expect((res) => {
        expect(res.body.ok).toBe(true);
      });

    await agent
      .post('/time-off/submit')
      .send({ employeeId: 'a', locationId: 'b', days: 2 })
      .expect(200);

    expect(mock.getBalance('a', 'b')).toBe(3);

    await server.close();
  });
});
