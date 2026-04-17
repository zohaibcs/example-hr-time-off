import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BalancesService } from '../balances/balances.service';
import { Balance } from '../entities/balance.entity';
import { BatchBalanceItemDto } from './dto/batch-balance.dto';

export interface BatchApplyResult {
  applied: number;
  reconciliationFlagged: Array<{
    employeeId: string;
    locationId: string;
    availableDays: number;
    pendingDays: number;
  }>;
}

@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(Balance)
    private readonly balanceRepo: Repository<Balance>,
    private readonly balances: BalancesService,
  ) {}

  async applyBatch(items: BatchBalanceItemDto[]): Promise<BatchApplyResult> {
    const reconciliationFlagged: BatchApplyResult['reconciliationFlagged'] = [];
    let applied = 0;
    for (const item of items) {
      await this.balances.ensureRow(item.employeeId, item.locationId);
      const row = await this.balanceRepo.findOne({
        where: { employeeId: item.employeeId, locationId: item.locationId },
      });
      if (!row) {
        continue;
      }
      row.availableDays = item.availableDays;
      row.lastSyncedAt = item.asOf ? new Date(item.asOf) : new Date();
      row.reconciliationRequired = row.availableDays + 1e-9 < row.pendingDays;
      row.version += 1;
      await this.balanceRepo.save(row);
      applied += 1;
      if (row.reconciliationRequired) {
        reconciliationFlagged.push({
          employeeId: row.employeeId,
          locationId: row.locationId,
          availableDays: row.availableDays,
          pendingDays: row.pendingDays,
        });
      }
    }
    return { applied, reconciliationFlagged };
  }
}
