import {
  Body,
  Controller,
  Get,
  Headers,
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
import { HmoBrokerService } from './broker/hmo-broker.service';
import {
  BenefitsQueryDto,
  CreatePreAuthDto,
  EligibilityQueryDto,
  SubmitClaimDto,
  UpsertCoverageDto,
} from './broker/dto/hmo-broker.dto';

@Controller('insurance/hmo')
export class HmoController {
  constructor(private readonly broker: HmoBrokerService) {}

  /**
   * Method: GET
   * URL: /api/insurance/hmo/payers
   * Purpose: List HMO payers with integration status / checklist
   * Required permission: insurance:read
   * Response: { data: { items: [...] } }
   * Errors: 401, 403
   */
  @Get('payers')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.INSURANCE_READ)
  async listPayers() {
    return { data: await this.broker.listPayers() };
  }

  /**
   * Method: POST
   * URL: /api/insurance/hmo/coverage
   * Purpose: Upsert patient HMO membership and link Persons.HMO_ID
   * Required permission: insurance:eligibility
   * Request body: { personId, payerId, memberNo, planCode?, planName?, employerName?, ... }
   * Response: { data: coverage }
   * Errors: 400, 401, 403, 404
   */
  @Post('coverage')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.INSURANCE_ELIGIBILITY)
  async upsertCoverage(@Body() dto: UpsertCoverageDto, @CurrentUser() user: AuthUser) {
    return { data: await this.broker.upsertCoverage(dto, user) };
  }

  /**
   * Method: GET
   * URL: /api/insurance/hmo/coverage/:personId
   * Purpose: Latest stored HMO coverage + eligibility snapshot for encounter headers
   * Required permission: insurance:read
   * Response: { data: { coverage, latestEligibility } }
   * Errors: 401, 403, 404
   */
  @Get('coverage/:personId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.INSURANCE_READ)
  async getCoverage(@Param('personId', ParseIntPipe) personId: number) {
    return { data: await this.broker.getPersonCoverage(personId) };
  }

  /**
   * Method: GET
   * URL: /api/insurance/hmo/eligibility
   * Purpose: Verify member eligibility (stores immutable snapshot)
   * Required permission: insurance:eligibility
   * Query: personId, payerId, memberNo, encounterId?
   * Response: { data: { checkId, status, member, plan, ... } }
   * Errors: 400, 401, 403, 404
   */
  @Get('eligibility')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.INSURANCE_ELIGIBILITY)
  async eligibility(@Query() query: EligibilityQueryDto, @CurrentUser() user: AuthUser) {
    return { data: await this.broker.verifyEligibility(query, user) };
  }

  /**
   * Method: GET
   * URL: /api/insurance/hmo/benefits
   * Purpose: Fetch plan benefits / limits for display on clinical & billing screens
   * Required permission: insurance:read
   * Query: personId, payerId, memberNo, serviceCode?, category?
   * Response: { data: { benefits, exclusions, planName, ... } }
   * Errors: 400, 401, 403, 404
   */
  @Get('benefits')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.INSURANCE_READ)
  async benefits(@Query() query: BenefitsQueryDto, @CurrentUser() user: AuthUser) {
    return { data: await this.broker.getBenefits(query, user) };
  }

  /**
   * Method: POST
   * URL: /api/insurance/hmo/pre-auth
   * Purpose: Request pre-authorization for high-cost care
   * Required permission: insurance:preauth
   * Request body: CreatePreAuthDto (+ optional Idempotency-Key header mirrored in body)
   * Response: { data: { authId, status, authCode, ... } }
   * Errors: 400, 401, 403, 404
   */
  @Post('pre-auth')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.INSURANCE_PREAUTH)
  async preAuth(
    @Body() dto: CreatePreAuthDto,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!dto.idempotencyKey && idempotencyKey) {
      dto.idempotencyKey = idempotencyKey;
    }
    return { data: await this.broker.requestPreAuth(dto, user) };
  }

  /**
   * Method: GET
   * URL: /api/insurance/hmo/pre-auth/:id
   * Purpose: Get authorization status / details
   * Required permission: insurance:read
   * Response: { data: authorization }
   * Errors: 401, 403, 404
   */
  @Get('pre-auth/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.INSURANCE_READ)
  async getPreAuth(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.broker.getPreAuth(id) };
  }

  /**
   * Method: POST
   * URL: /api/insurance/hmo/claims
   * Purpose: Submit electronic claim to HMO / aggregator
   * Required permission: insurance:claim-submit
   * Request body: SubmitClaimDto
   * Response: { data: { claimId, status, externalClaimRef, ... } }
   * Errors: 400, 401, 403, 404
   */
  @Post('claims')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.INSURANCE_CLAIM_SUBMIT)
  async submitClaim(
    @Body() dto: SubmitClaimDto,
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!dto.idempotencyKey && idempotencyKey) {
      dto.idempotencyKey = idempotencyKey;
    }
    return { data: await this.broker.submitClaim(dto, user) };
  }

  /**
   * Method: GET
   * URL: /api/insurance/hmo/claims/:id
   * Purpose: Claim detail + status timeline
   * Required permission: insurance:claim-read
   * Response: { data: claim }
   * Errors: 401, 403, 404
   */
  @Get('claims/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.INSURANCE_CLAIM_READ)
  async getClaim(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.broker.getClaim(id) };
  }

  /**
   * Method: POST
   * URL: /api/insurance/hmo/claims/:id/poll
   * Purpose: Poll external claim status via adapter
   * Required permission: insurance:claim-read
   * Response: { data: claim }
   * Errors: 400, 401, 403, 404
   */
  @Post('claims/:id/poll')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.INSURANCE_CLAIM_READ)
  async pollClaim(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return { data: await this.broker.pollClaimStatus(id, user) };
  }

  /**
   * Method: POST
   * URL: /api/insurance/hmo/webhooks/:payerCode
   * Purpose: Receive async claim/pre-auth callbacks (Curably / direct HMO)
   * Auth: signed secret (X-Cura-Signature) when CURABLY_WEBHOOK_SECRET set — no JWT
   * Request body: webhook payload
   * Response: { data: { received: true } }
   * Errors: 400, 404
   */
  @Post('webhooks/:payerCode')
  async webhook(
    @Param('payerCode') payerCode: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-cura-signature') signature?: string,
  ) {
    return {
      data: await this.broker.handleWebhook(payerCode, body ?? {}, signature),
    };
  }
}
