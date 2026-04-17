import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalancesModule } from '../balances/balances.module';
import { Balance } from '../entities/balance.entity';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [TypeOrmModule.forFeature([Balance]), BalancesModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
