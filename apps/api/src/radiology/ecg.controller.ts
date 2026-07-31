import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { RadiologyService } from './radiology.service';
import { InterpretEcgDto, RecordEcgDto } from './dto/radiology.dto';

@Controller('radiology/ecg')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EcgController {
  constructor(private readonly radiology: RadiologyService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ECG_READ)
  async list(
    @Query('personId') personId?: string,
    @Query('critical') critical?: string,
  ) {
    return {
      data: await this.radiology.listEcgs({
        personId: personId ? Number(personId) : undefined,
        critical: critical === 'true' ? true : critical === 'false' ? false : undefined,
      }),
    };
  }

  @Get('critical')
  @RequirePermissions(PERMISSIONS.ECG_READ)
  async critical() {
    return {
      data: await this.radiology.listEcgs({ critical: true }),
    };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ECG_CREATE)
  async record(@Body() dto: RecordEcgDto, @CurrentUser() user: AuthUser) {
    return { data: await this.radiology.recordEcg(dto, user) };
  }

  @Post(':id/interpret')
  @RequirePermissions(PERMISSIONS.ECG_INTERPRET)
  async interpret(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: InterpretEcgDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.radiology.interpretEcg(id, dto, user) };
  }
}
