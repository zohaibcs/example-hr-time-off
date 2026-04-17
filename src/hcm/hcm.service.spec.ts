import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { HcmService } from './hcm.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HcmService', () => {
  let service: HcmService;
  let mockGet: jest.Mock;
  let mockPost: jest.Mock;

  beforeEach(() => {
    mockGet = jest.fn();
    mockPost = jest.fn();
    mockedAxios.create = jest.fn(() => ({
      get: mockGet,
      post: mockPost,
      defaults: {},
    })) as unknown as typeof mockedAxios.create;

    service = new HcmService(
      new ConfigService({ HCM_BASE_URL: 'http://hcm.test', HCM_TIMEOUT_MS: 5000 }),
    );
  });

  it('fetchBalance returns numeric availableDays', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: { availableDays: 12.5 },
    });

    const v = await service.fetchBalance('e', 'l');
    expect(v).toBe(12.5);
    expect(mockGet).toHaveBeenCalled();
  });

  it('fetchBalance throws on HTTP error', async () => {
    mockGet.mockResolvedValue({ status: 500, data: {} });

    await expect(service.fetchBalance('e', 'l')).rejects.toThrow(/HCM balance fetch failed/);
  });

  it('validateTimeOff returns ok false on 4xx', async () => {
    mockPost.mockResolvedValue({ status: 400, data: {} });

    const r = await service.validateTimeOff('e', 'l', 1);
    expect(r.ok).toBe(false);
  });

  it('submitTimeOff throws when submissionId missing', async () => {
    mockPost.mockResolvedValue({ status: 200, data: {} });

    await expect(
      service.submitTimeOff('e', 'l', 1, '2026-01-01', '2026-01-02'),
    ).rejects.toThrow();
  });
});
