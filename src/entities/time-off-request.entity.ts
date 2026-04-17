import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TimeOffRequestStatus {
  PENDING_MANAGER = 'pending_manager',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  HCM_DENIED = 'hcm_denied',
  CANCELLED = 'cancelled',
}

@Entity('time_off_requests')
export class TimeOffRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  employeeId: string;

  @Column()
  locationId: string;

  /** ISO date (YYYY-MM-DD). */
  @Column()
  startDate: string;

  @Column()
  endDate: string;

  @Column('real')
  days: number;

  @Column({ type: 'varchar', length: 32 })
  status: TimeOffRequestStatus;

  @Column({ type: 'varchar', length: 64, nullable: true })
  hcmSubmissionId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
