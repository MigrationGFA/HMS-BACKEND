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
import { StoresService } from './stores.service';
import {
  CreateRequisitionDto,
  CreateStoreItemDto,
  DecideRequisitionDto,
  IssueRequisitionDto,
  ListQueryDto,
  StockAdjustDto,
  StockIssueDto,
  StockReceiveDto,
  UpdateStoreItemDto,
} from './dto/stores.dto';

@Controller('stores')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get('dashboard')
  @RequirePermissions(PERMISSIONS.STORES_STOCK_READ)
  async getDashboard() {
    return { data: await this.stores.getDashboard() };
  }

  @Get('categories')
  @RequirePermissions(PERMISSIONS.STORES_ITEM_READ)
  async listCategories() {
    return { data: await this.stores.listCategories() };
  }

  @Get('locations')
  @RequirePermissions(PERMISSIONS.STORES_STOCK_READ)
  async listLocations() {
    return { data: await this.stores.listLocations() };
  }

  @Get('items')
  @RequirePermissions(PERMISSIONS.STORES_ITEM_READ)
  async listItems(@Query() query: ListQueryDto) {
    return { data: await this.stores.listItems(query) };
  }

  @Post('items')
  @RequirePermissions(PERMISSIONS.STORES_ITEM_CREATE)
  async createItem(
    @Body() dto: CreateStoreItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.stores.createItem(dto, user) };
  }

  @Patch('items/:id')
  @RequirePermissions(PERMISSIONS.STORES_ITEM_UPDATE)
  async updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStoreItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.stores.updateItem(id, dto, user) };
  }

  @Delete('items/:id')
  @RequirePermissions(PERMISSIONS.STORES_ITEM_DELETE)
  async softDeleteItem(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.stores.softDeleteItem(id, user) };
  }

  @Post('stock/receive')
  @RequirePermissions(PERMISSIONS.STORES_STOCK_RECEIVE)
  async receiveStock(
    @Body() dto: StockReceiveDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.stores.receiveStock(dto, user) };
  }

  @Post('stock/issue')
  @RequirePermissions(PERMISSIONS.STORES_STOCK_ISSUE)
  async issueStock(
    @Body() dto: StockIssueDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.stores.issueStock(dto, user) };
  }

  @Post('stock/adjust')
  @RequirePermissions(PERMISSIONS.STORES_STOCK_ADJUST)
  async adjustStock(
    @Body() dto: StockAdjustDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.stores.adjustStock(dto, user) };
  }

  @Get('requisitions')
  @RequirePermissions(PERMISSIONS.STORES_REQUISITION_READ)
  async listRequisitions(@Query() query: ListQueryDto) {
    return { data: await this.stores.listRequisitions(query) };
  }

  @Post('requisitions')
  @RequirePermissions(PERMISSIONS.STORES_REQUISITION_CREATE)
  async createRequisition(
    @Body() dto: CreateRequisitionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.stores.createRequisition(dto, user) };
  }

  @Post('requisitions/:id/approve')
  @RequirePermissions(PERMISSIONS.STORES_REQUISITION_APPROVE)
  async approveRequisition(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideRequisitionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.stores.approveRequisition(id, dto, user) };
  }

  @Post('requisitions/:id/reject')
  @RequirePermissions(PERMISSIONS.STORES_REQUISITION_APPROVE)
  async rejectRequisition(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideRequisitionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.stores.rejectRequisition(id, dto, user) };
  }

  @Post('requisitions/:id/issue')
  @RequirePermissions(PERMISSIONS.STORES_STOCK_ISSUE)
  async issueRequisition(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IssueRequisitionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.stores.issueRequisition(id, dto, user) };
  }
}
