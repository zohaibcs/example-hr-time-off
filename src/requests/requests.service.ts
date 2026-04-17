import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BalancesService } from '../balances/balances.service';
import { Balance } from '../entities/balance.entity';
import {
  TimeOffRequest,
  TimeOffRequestStatus,
} from '../entities/time-off-request.entity';
import { HcmService } from '../hcm/hcm.service';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly requestRepo: Repository<TimeOffRequest>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly balances: BalancesService,
    private readonly hcm: HcmService,
  ) {}

  async create(dto: CreateTimeOffRequestDto) {
    await this.balances.ensureRow(dto.employeeId, dto.locationId);
    const snapshot = await this.requestRepo.manager.findOne(Balance, {
      where: { employeeId: dto.employeeId, locationId: dto.locationId },
    });
    if (!snapshot) {
      throw new BadRequestException('Balance row missing');
    }
    const projected = snapshot.availableDays - snapshot.pendingDays;
    if (projected + 1e-9 < dto.days) {
      throw new BadRequestException(
        `Insufficient projected balance (have ${projected}, need ${dto.days})`,
      );
    }

    const validation = await this.hcm.validateTimeOff(
      dto.employeeId,
      dto.locationId,
      dto.days,
    );
    if (!validation.ok) {
      throw new BadRequestException(
        validation.message ?? 'HCM rejected validation',
      );
    }

    let created: TimeOffRequest;
    await this.dataSource.transaction(async (m) => {
      const bal = await m.findOne(Balance, {
        where: { employeeId: dto.employeeId, locationId: dto.locationId },
      });
      if (!bal) {
        throw new BadRequestException('Balance row missing in transaction');
      }
      const p = bal.availableDays - bal.pendingDays;
      if (p + 1e-9 < dto.days) {
        throw new BadRequestException('Insufficient projected balance (race)');
      }
      bal.pendingDays += dto.days;
      bal.version += 1;
      await m.save(bal);

      const req = m.create(TimeOffRequest, {
        employeeId: dto.employeeId,
        locationId: dto.locationId,
        startDate: dto.startDate,
        endDate: dto.endDate,
        days: dto.days,
        status: TimeOffRequestStatus.PENDING_MANAGER,
        hcmSubmissionId: null,
      });
      created = await m.save(req);
    });

    return {
      id: created!.id,
      status: created!.status,
      employeeId: created!.employeeId,
      locationId: created!.locationId,
      days: created!.days,
      startDate: created!.startDate,
      endDate: created!.endDate,
    };
  }

  async getById(id: string) {
    const r = await this.requestRepo.findOne({ where: { id } });
    if (!r) {
      throw new NotFoundException(id);
    }
    return r;
  }

  async approve(id: string) {
    const existing = await this.requestRepo.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException(id);
    }
    if (existing.status !== TimeOffRequestStatus.PENDING_MANAGER) {
      throw new BadRequestException('Request is not awaiting manager approval');
    }

    let submissionId: string;
    try {
      const sub = await this.hcm.submitTimeOff(
        existing.employeeId,
        existing.locationId,
        existing.days,
        existing.startDate,
        existing.endDate,
      );
      submissionId = sub.submissionId;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'HCM submit failed';
      throw new BadRequestException(msg);
    }

    await this.dataSource.transaction(async (m) => {
      const r = await m.findOne(TimeOffRequest, { where: { id } });
      if (!r || r.status !== TimeOffRequestStatus.PENDING_MANAGER) {
        throw new BadRequestException('Request state changed');
      }
      const bal = await m.findOne(Balance, {
        where: { employeeId: r.employeeId, locationId: r.locationId },
      });
      if (!bal) {
        throw new BadRequestException('Balance missing');
      }
      bal.pendingDays = Math.max(0, bal.pendingDays - r.days);
      bal.version += 1;
      try {
        const fresh = await this.hcm.fetchBalance(r.employeeId, r.locationId);
        bal.availableDays = fresh;
      } catch {
        bal.availableDays = Math.max(0, bal.availableDays - r.days);
      }
      bal.lastSyncedAt = new Date();
      if (bal.availableDays + 1e-9 < bal.pendingDays) {
        bal.reconciliationRequired = true;
      }
      r.status = TimeOffRequestStatus.APPROVED;
      r.hcmSubmissionId = submissionId;
      await m.save(bal);
      await m.save(r);
    });

    return this.getById(id);
  }

  async reject(id: string) {
    await this.releasePending(id, TimeOffRequestStatus.REJECTED);
    return this.getById(id);
  }

  async cancel(id: string) {
    await this.releasePending(id, TimeOffRequestStatus.CANCELLED);
    return this.getById(id);
  }

  private async releasePending(id: string, terminal: TimeOffRequestStatus) {
    await this.dataSource.transaction(async (m) => {
      const r = await m.findOne(TimeOffRequest, { where: { id } });
      if (!r) {
        throw new NotFoundException(id);
      }
      if (r.status !== TimeOffRequestStatus.PENDING_MANAGER) {
        throw new BadRequestException('Request is not pending manager');
      }
      const bal = await m.findOne(Balance, {
        where: { employeeId: r.employeeId, locationId: r.locationId },
      });
      if (!bal) {
        throw new BadRequestException('Balance missing');
      }
      bal.pendingDays = Math.max(0, bal.pendingDays - r.days);
      bal.version += 1;
      r.status = terminal;
      await m.save(bal);
      await m.save(r);
    });
  }
}
