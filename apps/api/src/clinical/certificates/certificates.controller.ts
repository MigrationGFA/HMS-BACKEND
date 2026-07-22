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
import { CertificatesService } from './certificates.service';
import {
  CancelCertificateDto,
  CreateCertificateDto,
  NoteDto,
  UpdateCertificateDto,
} from './dto/certificate.dto';

@Controller('clinical-certificates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  /**
   * Method: GET
   * URL: /api/clinical-certificates/templates
   * Purpose: List active certificate/report templates
   * Required permission: certificate:read
   * Response: { data: Template[] }
   * Errors: 401, 403
   */
  @Get('templates')
  @RequirePermissions(PERMISSIONS.CERTIFICATE_READ)
  async listTemplates() {
    const data = await this.certificates.listTemplates();
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/clinical-certificates/templates/:id
   * Purpose: Template detail including field schema
   * Required permission: certificate:read
   * Errors: 401, 403, 404
   */
  @Get('templates/:id')
  @RequirePermissions(PERMISSIONS.CERTIFICATE_READ)
  async getTemplate(@Param('id', ParseIntPipe) id: number) {
    const data = await this.certificates.getTemplate(id);
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/clinical-certificates/summary
   * Purpose: KPI counts for certificates cards (mine)
   * Required permission: certificate:read
   * Errors: 401, 403
   */
  @Get('summary')
  @RequirePermissions(PERMISSIONS.CERTIFICATE_READ)
  async summary(@CurrentUser() user: AuthUser) {
    const data = await this.certificates.summary(user);
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/clinical-certificates?scope=mine&status=&personId=&q=&page=&limit=
   * Purpose: List clinical certificates
   * Required permission: certificate:read
   * Response: { data: { items, meta } }
   * Errors: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.CERTIFICATE_READ)
  async list(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope?: string,
    @Query('status') status?: string,
    @Query('personId') personId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.certificates.list(
      {
        scope,
        status,
        personId: personId ? Number(personId) : undefined,
        q,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 50,
      },
      user,
    );
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/clinical-certificates/:id
   * Purpose: Certificate detail + immutable events
   * Required permission: certificate:read
   * Errors: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.CERTIFICATE_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const data = await this.certificates.findOne(id);
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/clinical-certificates
   * Purpose: Create draft certificate from template + patient
   * Required permission: certificate:create
   * Request body: { personId, templateId, fields?, layout?, validityUntil? }
   * Response: { data: certificate }
   * Errors: 400, 401, 403, 404
   * Audit: certificate:create
   */
  @Post()
  @RequirePermissions(PERMISSIONS.CERTIFICATE_CREATE)
  async create(
    @Body() dto: CreateCertificateDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.certificates.create(dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/clinical-certificates/:id
   * Purpose: Update draft fields
   * Required permission: certificate:update
   * Request body: { fields?, layout?, validityUntil? }
   * Errors: 401, 403, 404, 409
   * Audit: certificate:update
   */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CERTIFICATE_UPDATE)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCertificateDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.certificates.update(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/clinical-certificates/:id/submit-sign
   * Purpose: Draft → PendingSignature
   * Required permission: certificate:update or certificate:sign
   * Request body: { note? }
   * Errors: 401, 403, 404, 409
   * Audit: certificate:submit-sign
   */
  @Patch(':id/submit-sign')
  @RequirePermissions(
    PERMISSIONS.CERTIFICATE_UPDATE,
    PERMISSIONS.CERTIFICATE_SIGN,
  )
  async submitSign(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.certificates.submitSign(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/clinical-certificates/:id/sign
   * Purpose: Sign + lock → Issued, or PendingApproval when template requires approval
   * Required permission: certificate:sign
   * Request body: { note? }
   * Errors: 401, 403, 404, 409
   * Audit: certificate:sign
   */
  @Patch(':id/sign')
  @RequirePermissions(PERMISSIONS.CERTIFICATE_SIGN)
  async sign(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.certificates.sign(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/clinical-certificates/:id/approve
   * Purpose: Approve PendingApproval → Issued (Admin/CMD via FULL_ACCESS)
   * Required permission: certificate:approve
   * Request body: { note? }
   * Errors: 401, 403, 404, 409
   * Audit: certificate:approve
   */
  @Patch(':id/approve')
  @RequirePermissions(PERMISSIONS.CERTIFICATE_APPROVE)
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.certificates.approve(id, dto, user);
    return { data };
  }

  /**
   * Method: PATCH
   * URL: /api/clinical-certificates/:id/cancel
   * Purpose: Cancel non-issued certificate
   * Required permission: certificate:update
   * Request body: { reason? }
   * Errors: 401, 403, 404, 409
   * Audit: certificate:cancel
   */
  @Patch(':id/cancel')
  @RequirePermissions(PERMISSIONS.CERTIFICATE_UPDATE)
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelCertificateDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.certificates.cancel(id, dto, user);
    return { data };
  }
}
