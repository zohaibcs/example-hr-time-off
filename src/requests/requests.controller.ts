import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { RequestsService } from './requests.service';

@Controller('time-off')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post('requests')
  create(@Body() body: CreateTimeOffRequestDto) {
    return this.requests.create(body);
  }

  @Get('requests/:id')
  get(@Param('id') id: string) {
    return this.requests.getById(id);
  }

  @Post('requests/:id/approve')
  approve(@Param('id') id: string) {
    return this.requests.approve(id);
  }

  @Post('requests/:id/reject')
  reject(@Param('id') id: string) {
    return this.requests.reject(id);
  }

  @Post('requests/:id/cancel')
  cancel(@Param('id') id: string) {
    return this.requests.cancel(id);
  }
}
