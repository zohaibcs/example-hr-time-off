import { Controller, Get, Param } from '@nestjs/common';
import { BalancesService } from './balances.service';

@Controller('employees')
export class BalancesController {
  constructor(private readonly balances: BalancesService) {}

  @Get(':employeeId/balances')
  list(@Param('employeeId') employeeId: string) {
    return this.balances.listForEmployee(employeeId);
  }

  @Get(':employeeId/balances/:locationId')
  one(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
  ) {
    return this.balances.getOne(employeeId, locationId);
  }
}
