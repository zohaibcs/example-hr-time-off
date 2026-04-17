import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('balances')
export class Balance {
  @PrimaryColumn()
  employeeId: string;

  @PrimaryColumn()
  locationId: string;

  /** Last known HCM entitlement for this bucket (days). */
  @Column('real', { default: 0 })
  availableDays: number;

  /** Days held for in-flight non-terminal requests. */
  @Column('real', { default: 0 })
  pendingDays: number;

  @Column({ default: 0 })
  version: number;

  @Column({ default: false })
  reconciliationRequired: boolean;

  @Column({ type: 'datetime', nullable: true })
  lastSyncedAt: Date | null;
}
