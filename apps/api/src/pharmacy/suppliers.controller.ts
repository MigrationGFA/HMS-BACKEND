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
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SuppliersService } from './suppliers.service';

@Controller('pharmacy/suppliers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  /**
   * Method: POST
   * URL: /api/pharmacy/suppliers
   * Purpose: Add a supplier for pharmacy procurement
   * Required permission: supplier:create
   * Request body: CreateSupplierDto { name, contactPerson?, phone?, email?, address?, categories?, performance?, notes? }
   * Response example: { data: { supplierId, name, contactPerson, phone, email, address, categories: [], performance, status: "Active", createdAt } }
   * Error cases: 400 validation, 401 unauthorized, 403 missing permission, 409 duplicate name
   */
  @Post()
  @RequirePermissions(PERMISSIONS.SUPPLIER_CREATE)
  async create(@Body() dto: CreateSupplierDto, @CurrentUser() user: AuthUser) {
    const supplier = await this.suppliersService.create(dto, user);
    return { data: supplier };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/suppliers?q=&status=&page=&limit=
   * Purpose: Supplier Management tab — list/search suppliers
   * Required permission: pharmacy:read
   * Request body: none
   * Response example: { data: { items: [...], meta: { page, limit, total } } }
   * Error cases: 401 unauthorized, 403 missing permission
   */
  @Get()
  @RequirePermissions(PERMISSIONS.PHARMACY_READ)
  async list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.suppliersService.list({
      q,
      status,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/suppliers/:id
   * Purpose: Get one supplier profile
   * Required permission: pharmacy:read
   * Request body: none
   * Response example: { data: { supplierId, name, ... } }
   * Error cases: 401 unauthorized, 403 missing permission, 404 not found
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.PHARMACY_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const supplier = await this.suppliersService.findById(id);
    return { data: supplier };
  }

  /**
   * Method: PATCH
   * URL: /api/pharmacy/suppliers/:id
   * Purpose: Update supplier profile (or soft-deactivate via status)
   * Required permission: supplier:update
   * Request body: UpdateSupplierDto (partial; status: "Active" | "Inactive")
   * Response example: { data: { supplierId, name, status, ... } }
   * Error cases: 400 validation, 401, 403, 404
   */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SUPPLIER_UPDATE)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: AuthUser,
  ) {
    const supplier = await this.suppliersService.update(id, dto, user);
    return { data: supplier };
  }
}
