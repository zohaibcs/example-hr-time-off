import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Balance } from '../entities/balance.entity';
import { BalancesService } from './balances.service';

describe('BalancesService', () => {
  let service: BalancesService;
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
      providers: [BalancesService],
    }).compile();

    service = module.get(BalancesService);
    dataSource = module.get(DataSource);
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('ensureRow creates a zero row and getOne returns dto', async () => {
    await service.ensureRow('e', 'loc1');
    const dto = await service.getOne('e', 'loc1');
    expect(dto.availableDays).toBe(0);
    expect(dto.projectedAvailableDays).toBe(0);
  });

  it('listForEmployee returns all buckets', async () => {
    await dataSource.getRepository(Balance).save([
      {
        employeeId: 'e2',
        locationId: 'a',
        availableDays: 5,
        pendingDays: 1,
        version: 0,
        reconciliationRequired: false,
        lastSyncedAt: null,
      },
      {
        employeeId: 'e2',
        locationId: 'b',
        availableDays: 3,
        pendingDays: 0,
        version: 0,
        reconciliationRequired: false,
        lastSyncedAt: null,
      },
    ]);

    const list = await service.listForEmployee('e2');
    expect(list).toHaveLength(2);
    expect(list.map((x) => x.locationId).sort()).toEqual(['a', 'b']);
  });

  it('getOne throws when missing', async () => {
    await expect(service.getOne('x', 'y')).rejects.toThrow('No balance');
  });
});
