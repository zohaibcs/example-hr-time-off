export class BalanceResponseDto {
  employeeId: string;
  locationId: string;
  availableDays: number;
  pendingDays: number;
  projectedAvailableDays: number;
  reconciliationRequired: boolean;
  lastSyncedAt: string | null;
}
