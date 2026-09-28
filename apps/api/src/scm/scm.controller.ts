import {
  Body,
  Controller,
  Delete,
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
import { ScmService } from './scm.service';
import {
  CreateScmGrnDto,
  CreateScmPoDto,
  CreateScmSupplierDto,
  ScmListQueryDto,
  UpdateScmPoDto,
  UpdateScmSupplierDto,
} from './dto/scm.dto';

@Controller('scm')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ScmController {
  constructor(private readonly scm: ScmService) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.SCM_DASHBOARD_READ)
  async getDashboard() {
    return { data: await this.scm.getDashboard() };
  }

  @Get('suppliers')
  @RequirePermissions(PERMISSIONS.SCM_SUPPLIER_READ)
  async listSuppliers(@Query() query: ScmListQueryDto) {
    return { data: await this.scm.listSuppliers(query) };
  }

  @Post('suppliers')
  @RequirePermissions(PERMISSIONS.SCM_SUPPLIER_CREATE)
  async createSupplier(
    @Body() dto: CreateScmSupplierDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.scm.createSupplier(dto, user) };
  }

  @Patch('suppliers/:id')
  @RequirePermissions(PERMISSIONS.SCM_SUPPLIER_UPDATE)
  async updateSupplier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateScmSupplierDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.scm.updateSupplier(id, dto, user) };
  }

  @Delete('suppliers/:id')
  @RequirePermissions(PERMISSIONS.SCM_SUPPLIER_UPDATE)
  async softDeleteSupplier(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.scm.softDeleteSupplier(id, user) };
  }

  @Get('purchase-orders')
  @RequirePermissions(PERMISSIONS.SCM_PO_READ)
  async listPurchaseOrders(@Query() query: ScmListQueryDto) {
    return { data: await this.scm.listPurchaseOrders(query) };
  }

  @Post('purchase-orders')
  @RequirePermissions(PERMISSIONS.SCM_PO_CREATE)
  async createPurchaseOrder(
    @Body() dto: CreateScmPoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.scm.createPurchaseOrder(dto, user) };
  }

  @Patch('purchase-orders/:id')
  @RequirePermissions(PERMISSIONS.SCM_PO_UPDATE)
  async updatePurchaseOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateScmPoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.scm.updatePurchaseOrder(id, dto, user) };
  }

  @Post('purchase-orders/:id/approve')
  @RequirePermissions(PERMISSIONS.SCM_PO_APPROVE)
  async approvePurchaseOrder(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.scm.approvePurchaseOrder(id, user) };
  }

  @Post('purchase-orders/:id/cancel')
  @RequirePermissions(PERMISSIONS.SCM_PO_DELETE)
  async cancelPurchaseOrder(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.scm.cancelPurchaseOrder(id, user) };
  }

  @Get('grns')
  @RequirePermissions(PERMISSIONS.SCM_GRN_READ)
  async listGrns(@Query() query: ScmListQueryDto) {
    return { data: await this.scm.listGrns(query) };
  }

  @Post('grns')
  @RequirePermissions(PERMISSIONS.SCM_GRN_CREATE)
  async createGrn(
    @Body() dto: CreateScmGrnDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.scm.createGrn(dto, user) };
  }
}
