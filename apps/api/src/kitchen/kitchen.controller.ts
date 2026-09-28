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
import { KitchenService } from './kitchen.service';
import {
  CreateKitchenMenuDto,
  CreateKitchenOrderDto,
  CreateKitchenWastageDto,
  KitchenListQueryDto,
  UpdateKitchenMenuDto,
  UpdateKitchenOrderStatusDto,
} from './dto/kitchen.dto';

@Controller('kitchen')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  @Get('menus')
  @RequirePermissions(PERMISSIONS.KITCHEN_MENU_READ)
  async listMenus(@Query() query: KitchenListQueryDto) {
    return { data: await this.kitchen.listMenus(query) };
  }

  @Post('menus')
  @RequirePermissions(PERMISSIONS.KITCHEN_MENU_CREATE)
  async createMenu(
    @Body() dto: CreateKitchenMenuDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.kitchen.createMenu(dto, user) };
  }

  @Patch('menus/:id')
  @RequirePermissions(PERMISSIONS.KITCHEN_MENU_UPDATE)
  async updateMenu(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKitchenMenuDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.kitchen.updateMenu(id, dto, user) };
  }

  @Get('orders')
  @RequirePermissions(PERMISSIONS.KITCHEN_ORDER_READ)
  async listOrders(@Query() query: KitchenListQueryDto) {
    return { data: await this.kitchen.listOrders(query) };
  }

  @Post('orders')
  @RequirePermissions(PERMISSIONS.KITCHEN_ORDER_CREATE)
  async createOrder(
    @Body() dto: CreateKitchenOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.kitchen.createOrder(dto, user) };
  }

  @Patch('orders/:id/status')
  @RequirePermissions(PERMISSIONS.KITCHEN_ORDER_UPDATE)
  async updateOrderStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKitchenOrderStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.kitchen.updateOrderStatus(id, dto, user) };
  }

  @Get('wastage')
  @RequirePermissions(PERMISSIONS.KITCHEN_WASTAGE_READ)
  async listWastage(@Query() query: KitchenListQueryDto) {
    return { data: await this.kitchen.listWastage(query) };
  }

  @Post('wastage')
  @RequirePermissions(PERMISSIONS.KITCHEN_WASTAGE_CREATE)
  async createWastage(
    @Body() dto: CreateKitchenWastageDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.kitchen.createWastage(dto, user) };
  }

  @Get('diet-signals')
  @RequirePermissions(PERMISSIONS.KITCHEN_DIET_READ)
  async listDietSignals() {
    return { data: await this.kitchen.listDietSignals() };
  }
}
