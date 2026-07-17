import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../../common/constants';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/types/auth-user.type';
import {
  CompleteEncounterDto,
  StartEncounterDto,
  UpdateEncounterDto,
} from './dto/encounter.dto';
import { EncountersService } from './encounters.service';

@Controller('encounters')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EncountersController {
  constructor(private readonly encountersService: EncountersService) {}

  /**
   * Method: GET
   * URL: /api/encounters/consultation-queue?q=&clinic=&priority=&page=&limit=&timezoneOffsetMinutes=
   * Purpose: Doctor waiting queue for /dashboard/doctor/clinical/workspace (today's Triage Completed / Sent to Consultation)
   * Required permission: encounter:read
   * Request body: none
   * Response example: { data: { summary, items: [{ triageId, personId, name, mrn, paymentCleared, canStart, ... }], meta } }
   * Error cases: 401, 403
   */
  @Get('consultation-queue')
  @RequirePermissions(PERMISSIONS.ENCOUNTER_READ)
  async consultationQueue(
    @Query('q') q?: string,
    @Query('clinic') clinic?: string,
    @Query('priority') priority?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('timezoneOffsetMinutes') timezoneOffsetMinutes?: string,
  ) {
    const result = await this.encountersService.consultationQueue({
      q,
      clinic,
      priority,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      timezoneOffsetMinutes: timezoneOffsetMinutes
        ? Number(timezoneOffsetMinutes)
        : undefined,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/encounters/active
   * Purpose: Logged-in doctor's in-progress consultations
   * Required permission: encounter:read
   * Request body: none
   * Response example: { data: { items: [{ encounterId, patient, note, version, status }], meta } }
   * Error cases: 401, 403
   */
  @Get('active')
  @RequirePermissions(PERMISSIONS.ENCOUNTER_READ)
  async listActive(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.encountersService.listActive(user, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/encounters/start
   * Purpose: Start consultation from triage queue; payment must be Paid/Waived
   * Required permission: encounter:create
   * Request body: { triageId, clinic? }
   * Response example: { data: { encounterId, status: "In Consultation", patient, note, version: 1 } }
   * Error cases: 400 wrong triage status, 401, 403, 404, 409 payment pending or already started
   */
  @Post('start')
  @RequirePermissions(PERMISSIONS.ENCOUNTER_CREATE)
  async start(
    @Body() dto: StartEncounterDto,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.encountersService.start(dto, user);
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/encounters/:id
   * Purpose: Encounter detail with person + triage vitals
   * Required permission: encounter:read
   * Request body: none
   * Response example: { data: { encounterId, patient, note, version, status } }
   * Error cases: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.ENCOUNTER_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const result = await this.encountersService.findOne(id);
    return { data: result };
  }

  /**
   * Method: PATCH
   * URL: /api/encounters/:id
   * Purpose: Autosave draft clinical notes (optimistic VERSION + optional idempotencyKey)
   * Required permission: encounter:update
   * Request body: { version?, idempotencyKey?, chiefComplaint?, history?, examination?, assessment?, plan? }
   * Response example: { data: { encounterId, version: 2, note: {...} } }
   * Error cases: 400 not in consultation, 401, 403, 404, 409 version conflict
   */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ENCOUNTER_UPDATE)
  async updateDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEncounterDto,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.encountersService.updateDraft(id, dto, user);
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/encounters/:id/complete
   * Purpose: Complete an active consultation
   * Required permission: encounter:complete
   * Request body: { outcome? }
   * Response example: { data: { encounterId, status: "Completed", outcome, completedAt } }
   * Error cases: 400 not in consultation, 401, 403, 404
   */
  @Post(':id/complete')
  @RequirePermissions(PERMISSIONS.ENCOUNTER_COMPLETE)
  async complete(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteEncounterDto,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.encountersService.complete(id, dto, user);
    return { data: result };
  }
}
