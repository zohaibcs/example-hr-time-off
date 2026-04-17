import { Body, Controller, Post } from '@nestjs/common';
import { BatchBalanceIngestDto } from './dto/batch-balance.dto';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('balances/batch')
  batch(@Body() body: BatchBalanceIngestDto) {
    return this.sync.applyBatch(body.items);
  }
}
