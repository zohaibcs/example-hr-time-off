import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsString, Min } from 'class-validator';

export class CreateTimeOffRequestDto {
  @IsString()
  employeeId: string;

  @IsString()
  locationId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  days: number;
}
