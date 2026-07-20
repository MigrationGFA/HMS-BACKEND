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
  CreateClinicalNoteDto,
  ReturnClinicalNoteDto,
  SignClinicalNoteDto,
  UpdateClinicalNoteDto,
} from './dto/clinical-note.dto';
import { ClinicalNotesService } from './clinical-notes.service';

@Controller('clinical-notes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClinicalNotesController {
  constructor(private readonly clinicalNotesService: ClinicalNotesService) {}

  /**
   * Method: GET
   * URL: /api/clinical-notes/templates
   * Purpose: List available clinical note templates and required fields
   * Required permission: clinical-note:read
   * Request body: none
   * Response example: { data: { items: [{ noteType, desc, bestFor, fields, fieldCount }] } }
   * Error cases: 401, 403
   */
  @Get('templates')
  @RequirePermissions(PERMISSIONS.CLINICAL_NOTE_READ)
  listTemplates() {
    return { data: this.clinicalNotesService.listTemplates() };
  }

  /**
   * Method: GET
   * URL: /api/clinical-notes/summary
   * Purpose: KPI counts for Clinical Documentation page (drafts, reviews, signed this month)
   * Required permission: clinical-note:read
   * Request body: none
   * Response example: { data: { drafts, awaitingReview, signedThisMonth, templates } }
   * Error cases: 401, 403
   */
  @Get('summary')
  @RequirePermissions(PERMISSIONS.CLINICAL_NOTE_READ)
  async summary(@CurrentUser() user: AuthUser) {
    const result = await this.clinicalNotesService.summary(user);
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/clinical-notes?q=&status=&noteType=&personId=&mine=&page=&limit=
   * Purpose: List clinical notes (drafts / reviews / signed) with patient search filters
   * Required permission: clinical-note:read
   * Request body: none
   * Response example: { data: { items: [...], meta: { page, limit, total } } }
   * Error cases: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.CLINICAL_NOTE_READ)
  async list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('noteType') noteType?: string,
    @Query('personId') personId?: string,
    @Query('mine') mine?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.clinicalNotesService.list({
      q,
      status,
      noteType,
      personId: personId ? Number(personId) : undefined,
      mine: mine === '1' || mine === 'true',
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      actor: user,
    });
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/clinical-notes
   * Purpose: Create a draft clinical documentation note for a patient
   * Required permission: clinical-note:create
   * Request body: { personId, noteType, clinic?, encounterId?, priority?, fields? }
   * Response example: { data: { clinicalNoteId, noteNo: "CN-2026-0001", status: "Draft", fields, patient } }
   * Error cases: 400 validation, 401, 403, 404 person/encounter not found
   */
  @Post()
  @RequirePermissions(PERMISSIONS.CLINICAL_NOTE_CREATE)
  async create(
    @Body() dto: CreateClinicalNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.clinicalNotesService.create(dto, user);
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/clinical-notes/:id
   * Purpose: Clinical note detail with structured fields and patient summary
   * Required permission: clinical-note:read
   * Request body: none
   * Response example: { data: { clinicalNoteId, noteNo, fields, patient, version, status } }
   * Error cases: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.CLINICAL_NOTE_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const result = await this.clinicalNotesService.findById(id);
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/clinical-notes/:id/versions
   * Purpose: Immutable version history for a clinical note
   * Required permission: clinical-note:read
   * Request body: none
   * Response example: { data: { items: [{ version, status, changeSummary, fields, createdBy, isCurrent }] } }
   * Error cases: 401, 403, 404
   */
  @Get(':id/versions')
  @RequirePermissions(PERMISSIONS.CLINICAL_NOTE_READ)
  async versions(@Param('id', ParseIntPipe) id: number) {
    const result = await this.clinicalNotesService.listVersions(id);
    return { data: result };
  }

  /**
   * Method: PATCH
   * URL: /api/clinical-notes/:id
   * Purpose: Autosave draft fields (optimistic version + optional idempotencyKey)
   * Required permission: clinical-note:update
   * Request body: { version?, idempotencyKey?, fields?, noteType?, clinic?, priority?, changeSummary? }
   * Response example: { data: { clinicalNoteId, version: 2, status: "In Progress", fields } }
   * Error cases: 400 not editable, 401, 403, 404, 409 version conflict
   */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CLINICAL_NOTE_UPDATE)
  async updateDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClinicalNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.clinicalNotesService.updateDraft(id, dto, user);
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/clinical-notes/:id/submit
   * Purpose: Submit draft note for consultant review (does not sign)
   * Required permission: clinical-note:update
   * Request body: none
   * Response example: { data: { status: "Awaiting Review", submittedAt } }
   * Error cases: 400 wrong status, 401, 403, 404
   */
  @Post(':id/submit')
  @RequirePermissions(PERMISSIONS.CLINICAL_NOTE_UPDATE)
  async submit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.clinicalNotesService.submit(id, user);
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/clinical-notes/:id/sign
   * Purpose: Digitally sign and lock a clinical note (Review and Sign)
   * Required permission: clinical-note:sign
   * Request body: { attestation? }
   * Response example: { data: { status: "Signed", signedBy, signedAt } }
   * Error cases: 400 already signed/voided, 401, 403, 404
   */
  @Post(':id/sign')
  @RequirePermissions(PERMISSIONS.CLINICAL_NOTE_SIGN)
  async sign(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SignClinicalNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.clinicalNotesService.sign(id, dto, user);
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/clinical-notes/:id/approve
   * Purpose: Consultant approve a note awaiting review (signs and locks)
   * Required permission: clinical-note:review
   * Request body: none
   * Response example: { data: { status: "Signed" } }
   * Error cases: 400 not in review, 401, 403, 404
   */
  @Post(':id/approve')
  @RequirePermissions(PERMISSIONS.CLINICAL_NOTE_REVIEW)
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.clinicalNotesService.approve(id, user);
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/clinical-notes/:id/return
   * Purpose: Return a note for correction with required reason
   * Required permission: clinical-note:review
   * Request body: { reason }
   * Response example: { data: { status: "Returned for Correction", returnReason } }
   * Error cases: 400 missing reason / wrong status, 401, 403, 404
   */
  @Post(':id/return')
  @RequirePermissions(PERMISSIONS.CLINICAL_NOTE_REVIEW)
  async returnForCorrection(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReturnClinicalNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.clinicalNotesService.returnForCorrection(
      id,
      dto,
      user,
    );
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/clinical-notes/:id/void
   * Purpose: Soft-void a draft clinical note (never hard-delete)
   * Required permission: clinical-note:update
   * Request body: none
   * Response example: { data: { status: "Voided", voidedAt } }
   * Error cases: 400 signed or not draft, 401, 403, 404
   */
  @Post(':id/void')
  @RequirePermissions(PERMISSIONS.CLINICAL_NOTE_UPDATE)
  async void(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.clinicalNotesService.void(id, user);
    return { data: result };
  }
}
