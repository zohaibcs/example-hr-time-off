import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalancesModule } from './balances/balances.module';
import { Balance } from './entities/balance.entity';
import { TimeOffRequest } from './entities/time-off-request.entity';
import { HealthController } from './health.controller';
import { HcmModule } from './hcm/hcm.module';
import { RequestsModule } from './requests/requests.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'sqlite',
        database: process.env.DATABASE_PATH ?? 'data/timeoff.sqlite',
        entities: [Balance, TimeOffRequest],
        synchronize: true,
        logging: false,
      }),
    }),
    HcmModule,
    BalancesModule,
    RequestsModule,
    SyncModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
