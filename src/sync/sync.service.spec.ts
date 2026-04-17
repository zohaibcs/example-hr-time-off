import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BalancesService } from '../balances/balances.service';
import { Balance } from '../entities/balance.entity';
import { SyncService } from './sync.service';

describe('SyncService', () => {
  let service: SyncService;
  let dataSource: DataSource;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Balance],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Balance]),
      ],
      providers: [SyncService, BalancesService],
    }).compile();

    service = module.get(SyncService);
    dataSource = module.get(DataSource);
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('sets reconciliation when HCM balance is below pending', async () => {
    await dataSource.getRepository(Balance).save({
      employeeId: 'e',
      locationId: 'l',
      availableDays: 10,
      pendingDays: 6,
      version: 0,
      reconciliationRequired: false,
      lastSyncedAt: null,
    });

    const res = await service.applyBatch([
      { employeeId: 'e', locationId: 'l', availableDays: 3 },
    ]);

    expect(res.applied).toBe(1);
    expect(res.reconciliationFlagged).toHaveLength(1);

    const row = await dataSource.getRepository(Balance).findOne({
      where: { employeeId: 'e', locationId: 'l' },
    });
    expect(row!.reconciliationRequired).toBe(true);
  });
});
