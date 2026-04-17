import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Balance } from '../entities/balance.entity';
import { BalanceResponseDto } from './dto/balance-response.dto';

@Injectable()
export class BalancesService {
  constructor(
    @InjectRepository(Balance)
    private readonly balanceRepo: Repository<Balance>,
  ) {}

  toDto(b: Balance): BalanceResponseDto {
    const projected = b.availableDays - b.pendingDays;
    return {
      employeeId: b.employeeId,
      locationId: b.locationId,
      availableDays: b.availableDays,
      pendingDays: b.pendingDays,
      projectedAvailableDays: projected,
      reconciliationRequired: b.reconciliationRequired,
      lastSyncedAt: b.lastSyncedAt ? b.lastSyncedAt.toISOString() : null,
    };
  }

  async listForEmployee(employeeId: string): Promise<BalanceResponseDto[]> {
    const rows = await this.balanceRepo.find({
      where: { employeeId },
      order: { locationId: 'ASC' },
    });
    return rows.map((b) => this.toDto(b));
  }

  async getOne(employeeId: string, locationId: string): Promise<BalanceResponseDto> {
    const b = await this.balanceRepo.findOne({ where: { employeeId, locationId } });
    if (!b) {
      throw new NotFoundException(`No balance for ${employeeId} / ${locationId}`);
    }
    return this.toDto(b);
  }

  async ensureRow(employeeId: string, locationId: string): Promise<Balance> {
    let row = await this.balanceRepo.findOne({ where: { employeeId, locationId } });
    if (!row) {
      row = this.balanceRepo.create({
        employeeId,
        locationId,
        availableDays: 0,
        pendingDays: 0,
        version: 0,
        reconciliationRequired: false,
        lastSyncedAt: null,
      });
      await this.balanceRepo.save(row);
    }
    return row;
  }
}
