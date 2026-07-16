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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CreateDrugDto } from './dto/create-drug.dto';
import { UpdateDrugDto } from './dto/update-drug.dto';
import { DrugsService } from './drugs.service';

@Controller('pharmacy/drugs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DrugsController {
  constructor(private readonly drugsService: DrugsService) {}

  /**
   * Method: POST
   * URL: /api/pharmacy/drugs
   * Purpose: Add a drug to the catalog (stock arrives later via GRN batches)
   * Required permission: drug:create
   * Request body: CreateDrugDto { name, genericName?, category?, form?, strength?, unit?, unitPrice?, reorderLevel?, shelf?, controlled?, supplierId? }
   * Response example: { data: { drugId, name, supplierId, stock: 0, stockStatus: "Out of Stock", ... } }
   * Error cases: 400 validation / unknown supplier, 401 unauthorized, 403 missing permission
   */
  @Post()
  @RequirePermissions(PERMISSIONS.DRUG_CREATE)
  async create(@Body() dto: CreateDrugDto, @CurrentUser() user: AuthUser) {
    const drug = await this.drugsService.create(dto, user);
    return { data: drug };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/drugs?q=&category=&stockStatus=&supplierId=&page=&limit=
   * Purpose: Drug catalog list with computed stock, earliest expiry and stock status
   * Required permission: pharmacy:read
   * Request body: none
   * Response example: { data: { items: [{ drugId, name, stock, earliestExpiry, stockStatus, supplierName, ... }], meta } }
   * Error cases: 401 unauthorized, 403 missing permission
   */
  @Get()
  @RequirePermissions(PERMISSIONS.PHARMACY_READ)
  async list(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('stockStatus') stockStatus?: string,
    @Query('supplierId') supplierId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.drugsService.list({
      q,
      category,
      status,
      stockStatus,
      supplierId: supplierId ? Number(supplierId) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/drugs/:id
   * Purpose: Drug detail including all batches (expiry/amount per batch)
   * Required permission: pharmacy:read
   * Request body: none
   * Response example: { data: { drugId, name, stock, batches: [{ batchNo, expiryDate, qtyAvailable, ... }] } }
   * Error cases: 401 unauthorized, 403 missing permission, 404 not found
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.PHARMACY_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const drug = await this.drugsService.findById(id);
    return { data: drug };
  }

  /**
   * Method: PATCH
   * URL: /api/pharmacy/drugs/:id
   * Purpose: Update drug catalog info (price, reorder level, shelf, supplier, soft-discontinue)
   * Required permission: drug:update
   * Request body: UpdateDrugDto (partial; status: "Active" | "Discontinued")
   * Response example: { data: { drugId, name, ... } }
   * Error cases: 400 validation, 401, 403, 404
   */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DRUG_UPDATE)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDrugDto,
    @CurrentUser() user: AuthUser,
  ) {
    const drug = await this.drugsService.update(id, dto, user);
    return { data: drug };
  }
}
