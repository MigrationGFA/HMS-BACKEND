import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { AppointmentsService } from './appointments.service';

class SetMeetingUrlDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  meetingUrl?: string | null;
}

@Controller('appointments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  /**
   * Method: GET
   * URL: /api/appointments/bookings
   * Purpose: Staff list of service bookings (doctor / records / cashier)
   */
  @Get('bookings')
  @RequirePermissions(PERMISSIONS.ENCOUNTER_READ)
  async listBookings(
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('patientType') patientType?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.appointmentsService.listStaffBookings({
      date,
      from,
      to,
      status,
      paymentStatus,
      patientType,
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/appointments/bookings/:bookingId/meeting-url
   * Purpose: Doctor sets external telemedicine meeting link for ONLINE booking
   */
  @Patch('bookings/:bookingId/meeting-url')
  @RequirePermissions(PERMISSIONS.ENCOUNTER_UPDATE)
  async setMeetingUrl(
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() dto: SetMeetingUrlDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.appointmentsService.setMeetingUrl(
      bookingId,
      dto.meetingUrl ?? null,
      { id: user.id, email: user.email },
    );
    return { data };
  }
}
