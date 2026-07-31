import {
  BadRequestException,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { ServiceCatalogService } from './service-catalog.service';
import {
  ApprovalDecisionDto,
  CreateDepartmentDto,
  CreateMasterServiceDto,
  CreateServicePayerDto,
  SetServicePricingDto,
  UpdateMasterServiceDto,
  UpdateServicePayerDto,
} from './dto/service-catalog.dto';

@Controller('billing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ServicePricingController {
  constructor(private readonly catalog: ServiceCatalogService) {}

  /**
   * Method: GET
   * URL: /api/billing/service-categories
   * Purpose: List active service categories
   * Required permission: service:read
   * Response: { data: { items: [{ categoryId, code, name, status }] } }
   * Errors: 401, 403
   */
  @Get('service-categories')
  @RequirePermissions(PERMISSIONS.SERVICE_READ)
  async listCategories() {
    return { data: await this.catalog.listCategories() };
  }

  /**
   * Method: GET
   * URL: /api/billing/departments?status=&q=
   * Purpose: List hospital departments
   * Required permission: service:read
   * Response: { data: { items: [{ departmentId, name, code, status }] } }
   * Errors: 401, 403
   */
  @Get('departments')
  @RequirePermissions(PERMISSIONS.SERVICE_READ)
  async listDepartments(
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return { data: await this.catalog.listDepartments({ status, q }) };
  }

  /**
   * Method: POST
   * URL: /api/billing/departments
   * Purpose: Create a department (IT / admin)
   * Required permission: service:approve
   * Request body: { name, code? }
   * Response: { data: { departmentId, name, code, status } }
   * Errors: 400, 401, 403
   */
  @Post('departments')
  @RequirePermissions(PERMISSIONS.SERVICE_APPROVE)
  async createDepartment(
    @Body() dto: CreateDepartmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.catalog.createDepartment(dto, user) };
  }

  /**
   * Method: GET
   * URL: /api/billing/services?categoryId=&departmentId=&status=&q=&page=&limit=
   * Purpose: Paginated master service catalog
   * Required permission: service:read
   * Response: { data: { items, meta } }
   * Errors: 401, 403
   */
  @Get('services')
  @RequirePermissions(PERMISSIONS.SERVICE_READ)
  async listServices(
    @Query('categoryId') categoryId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.catalog.listServices({
        categoryId: categoryId ? Number(categoryId) : undefined,
        departmentId: departmentId ? Number(departmentId) : undefined,
        status,
        q,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 50,
      }),
    };
  }

  /**
   * Method: GET
   * URL: /api/billing/services/orderable?categoryId=&departmentId=&q=
   * Purpose: ACTIVE services only (for doctors / order UIs)
   * Required permission: service:read
   * Response: { data: { items, meta } }
   * Errors: 401, 403
   */
  @Get('services/orderable')
  @RequirePermissions(PERMISSIONS.SERVICE_READ)
  async listOrderable(
    @Query('categoryId') categoryId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('q') q?: string,
  ) {
    return {
      data: await this.catalog.listOrderable({
        categoryId: categoryId ? Number(categoryId) : undefined,
        departmentId: departmentId ? Number(departmentId) : undefined,
        q,
      }),
    };
  }

  /**
   * Method: GET
   * URL: /api/billing/services/:id
   * Purpose: Service detail with prices and payer prices
   * Required permission: service:read
   * Response: { data: { serviceId, generalPrice, staffPrice, payerPrices, … } }
   * Errors: 401, 403, 404
   */
  @Get('services/:id')
  @RequirePermissions(PERMISSIONS.SERVICE_READ)
  async findService(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.catalog.findById(id) };
  }

  /**
   * Method: GET
   * URL: /api/billing/services/:id/resolve-price?payerType=&payerId=
   * Purpose: Resolve billable amount (payer → STAFF → GENERAL)
   * Required permission: service:read
   * Response: { data: { amount, source, payerId?, payerType? } }
   * Errors: 400 (not priced), 401, 403, 404
   */
  @Get('services/:id/resolve-price')
  @RequirePermissions(PERMISSIONS.SERVICE_READ)
  async resolvePrice(
    @Param('id', ParseIntPipe) id: number,
    @Query('payerType') payerType?: string,
    @Query('payerId') payerId?: string,
  ) {
    return {
      data: await this.catalog.resolvePrice(id, {
        payerType,
        payerId: payerId ? Number(payerId) : undefined,
      }),
    };
  }

  /**
   * Method: POST
   * URL: /api/billing/services
   * Purpose: Department create service (no prices; rejects priced body fields)
   * Required permission: service:create
   * Request body: { categoryId, departmentId, name, description?, durationMinutes?, flags… }
   * Response: { data: service } STATUS=PENDING_PRICING
   * Errors: 400, 401, 403
   */
  @Post('services')
  @RequirePermissions(PERMISSIONS.SERVICE_CREATE)
  async createService(
    @Body() dto: CreateMasterServiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    const raw = dto as CreateMasterServiceDto & {
      generalPrice?: unknown;
      staffPrice?: unknown;
      payerPrices?: unknown;
    };
    if (
      raw.generalPrice != null ||
      raw.staffPrice != null ||
      raw.payerPrices != null
    ) {
      throw new BadRequestException(
        'Prices are not allowed on service create — use PATCH …/pricing',
      );
    }
    return { data: await this.catalog.createService(dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/billing/services/:id
   * Purpose: Metadata update (not a price bypass)
   * Required permission: service:update
   * Request body: partial metadata fields
   * Response: { data: service }
   * Errors: 400, 401, 403, 404
   */
  @Patch('services/:id')
  @RequirePermissions(PERMISSIONS.SERVICE_UPDATE)
  async updateService(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMasterServiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.catalog.updateService(id, dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/billing/services/:id/pricing
   * Purpose: Finance set GENERAL/STAFF + upsert payer prices → PENDING_APPROVAL
   * Required permission: service:price
   * Request body: { generalPrice, staffPrice?, payerPrices?: [{ payerId, amount }], submitForApproval? }
   * Response: { data: service }
   * Errors: 400, 401, 403, 404
   */
  @Patch('services/:id/pricing')
  @RequirePermissions(PERMISSIONS.SERVICE_PRICE)
  async setPricing(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetServicePricingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.catalog.setPricing(id, dto, user) };
  }

  /**
   * Method: POST
   * URL: /api/billing/services/:id/submit-approval
   * Purpose: Move priced service to PENDING_APPROVAL
   * Required permission: service:price
   * Response: { data: service }
   * Errors: 400, 401, 403, 404
   */
  @Post('services/:id/submit-approval')
  @RequirePermissions(PERMISSIONS.SERVICE_PRICE)
  async submitApproval(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.catalog.submitApproval(id, user) };
  }

  /**
   * Method: POST
   * URL: /api/billing/services/:id/approve
   * Purpose: IT approve → ACTIVE
   * Required permission: service:approve
   * Request body: { notes? }
   * Response: { data: service }
   * Errors: 400, 401, 403, 404
   */
  @Post('services/:id/approve')
  @RequirePermissions(PERMISSIONS.SERVICE_APPROVE)
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApprovalDecisionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.catalog.approve(id, dto, user) };
  }

  /**
   * Method: POST
   * URL: /api/billing/services/:id/reject
   * Purpose: IT reject pricing
   * Required permission: service:approve
   * Request body: { notes? }
   * Response: { data: service }
   * Errors: 400, 401, 403, 404
   */
  @Post('services/:id/reject')
  @RequirePermissions(PERMISSIONS.SERVICE_APPROVE)
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApprovalDecisionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.catalog.reject(id, dto, user) };
  }

  /**
   * Method: GET
   * URL: /api/billing/service-payers?payerType=&status=
   * Purpose: List NHIA / HMO / Corporate payers
   * Required permission: service_payer:manage
   * Response: { data: { items } }
   * Errors: 401, 403
   */
  @Get('service-payers')
  @RequirePermissions(PERMISSIONS.SERVICE_PAYER_MANAGE)
  async listPayers(
    @Query('payerType') payerType?: string,
    @Query('status') status?: string,
  ) {
    return { data: await this.catalog.listPayers({ payerType, status }) };
  }

  /**
   * Method: POST
   * URL: /api/billing/service-payers
   * Purpose: Create payer entity
   * Required permission: service_payer:manage
   * Request body: { payerType: NHIA|HMO|CORPORATE, code, name }
   * Response: { data: payer }
   * Errors: 400, 401, 403
   */
  @Post('service-payers')
  @RequirePermissions(PERMISSIONS.SERVICE_PAYER_MANAGE)
  async createPayer(
    @Body() dto: CreateServicePayerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.catalog.createPayer(dto, user) };
  }

  /**
   * Method: PATCH
   * URL: /api/billing/service-payers/:id
   * Purpose: Update payer name/status
   * Required permission: service_payer:manage
   * Request body: { name?, status? }
   * Response: { data: payer }
   * Errors: 400, 401, 403, 404
   */
  @Patch('service-payers/:id')
  @RequirePermissions(PERMISSIONS.SERVICE_PAYER_MANAGE)
  async updatePayer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServicePayerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.catalog.updatePayer(id, dto, user) };
  }
}
