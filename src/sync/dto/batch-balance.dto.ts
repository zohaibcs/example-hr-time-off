import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class BatchBalanceItemDto {
  @IsString()
  employeeId: string;

  @IsString()
  locationId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  availableDays: number;

  @IsOptional()
  @IsDateString()
  asOf?: string;
}

export class BatchBalanceIngestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchBalanceItemDto)
  items: BatchBalanceItemDto[];
}
