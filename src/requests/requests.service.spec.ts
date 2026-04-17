import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BalancesService } from '../balances/balances.service';
import { Balance } from '../entities/balance.entity';
import {
  TimeOffRequest,
  TimeOffRequestStatus,
} from '../entities/time-off-request.entity';
import { HcmService } from '../hcm/hcm.service';
import { RequestsService } from './requests.service';

describe('RequestsService', () => {
  let service: RequestsService;
  let dataSource: DataSource;
  let hcm: jest.Mocked<
    Pick<HcmService, 'validateTimeOff' | 'submitTimeOff' | 'fetchBalance'>
  >;

  beforeEach(async () => {
    hcm = {
      validateTimeOff: jest.fn(),
      submitTimeOff: jest.fn(),
      fetchBalance: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Balance, TimeOffRequest],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Balance, TimeOffRequest]),
      ],
      providers: [RequestsService, BalancesService, { provide: HcmService, useValue: hcm }],
    }).compile();

    service = module.get(RequestsService);
    dataSource = module.get(DataSource);
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('creates a request after HCM validation and reserves pending days', async () => {
    await dataSource.getRepository(Balance).save({
      employeeId: 'e1',
      locationId: 'l1',
      availableDays: 10,
      pendingDays: 0,
      version: 0,
      reconciliationRequired: false,
      lastSyncedAt: null,
    });

    hcm.validateTimeOff.mockResolvedValue({ ok: true });

    const out = await service.create({
      employeeId: 'e1',
      locationId: 'l1',
      startDate: '2026-01-10',
      endDate: '2026-01-11',
      days: 3,
    });

    expect(out.days).toBe(3);
    expect(hcm.validateTimeOff).toHaveBeenCalled();

    const row = await dataSource.getRepository(Balance).findOne({
      where: { employeeId: 'e1', locationId: 'l1' },
    });
    expect(row!.pendingDays).toBe(3);

    const req = await dataSource.getRepository(TimeOffRequest).findOne({
      where: { id: out.id },
    });
    expect(req!.status).toBe(TimeOffRequestStatus.PENDING_MANAGER);
  });

  it('rejects when local projected balance is insufficient', async () => {
    await dataSource.getRepository(Balance).save({
      employeeId: 'e1',
      locationId: 'l1',
      availableDays: 1,
      pendingDays: 0,
      version: 0,
      reconciliationRequired: false,
      lastSyncedAt: null,
    });

    await expect(
      service.create({
        employeeId: 'e1',
        locationId: 'l1',
        startDate: '2026-01-10',
        endDate: '2026-01-11',
        days: 3,
      }),
    ).rejects.toThrow(/Insufficient projected balance/);

    expect(hcm.validateTimeOff).not.toHaveBeenCalled();
  });

  it('approves, submits to HCM, and clears pending', async () => {
    await dataSource.getRepository(Balance).save({
      employeeId: 'e1',
      locationId: 'l1',
      availableDays: 10,
      pendingDays: 2,
      version: 0,
      reconciliationRequired: false,
      lastSyncedAt: null,
    });

    const req = await dataSource.getRepository(TimeOffRequest).save({
      employeeId: 'e1',
      locationId: 'l1',
      startDate: '2026-02-01',
      endDate: '2026-02-02',
      days: 2,
      status: TimeOffRequestStatus.PENDING_MANAGER,
      hcmSubmissionId: null,
    });

    hcm.submitTimeOff.mockResolvedValue({ submissionId: 'sub-1' });
    hcm.fetchBalance.mockResolvedValue(8);

    await service.approve(req.id);

    const bal = await dataSource.getRepository(Balance).findOne({
      where: { employeeId: 'e1', locationId: 'l1' },
    });
    expect(bal!.pendingDays).toBe(0);
    expect(bal!.availableDays).toBe(8);

    const updated = await dataSource.getRepository(TimeOffRequest).findOne({
      where: { id: req.id },
    });
    expect(updated!.status).toBe(TimeOffRequestStatus.APPROVED);
    expect(updated!.hcmSubmissionId).toBe('sub-1');
  });

  it('reject releases pending days', async () => {
    await dataSource.getRepository(Balance).save({
      employeeId: 'e1',
      locationId: 'l1',
      availableDays: 10,
      pendingDays: 4,
      version: 0,
      reconciliationRequired: false,
      lastSyncedAt: null,
    });

    const req = await dataSource.getRepository(TimeOffRequest).save({
      employeeId: 'e1',
      locationId: 'l1',
      startDate: '2026-03-01',
      endDate: '2026-03-02',
      days: 4,
      status: TimeOffRequestStatus.PENDING_MANAGER,
      hcmSubmissionId: null,
    });

    await service.reject(req.id);

    const bal = await dataSource.getRepository(Balance).findOne({
      where: { employeeId: 'e1', locationId: 'l1' },
    });
    expect(bal!.pendingDays).toBe(0);

    const r2 = await dataSource.getRepository(TimeOffRequest).findOne({
      where: { id: req.id },
    });
    expect(r2!.status).toBe(TimeOffRequestStatus.REJECTED);
  });
});
