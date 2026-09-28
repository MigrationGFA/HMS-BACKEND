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
import { FleetService } from './fleet.service';
import {
  CreateFleetDriverDto,
  CreateFleetFuelDto,
  CreateFleetMaintenanceDto,
  CreateFleetTripDto,
  CreateFleetTripRequestDto,
  CreateFleetVehicleDto,
  DecideTripRequestDto,
  FleetListQueryDto,
  UpdateFleetMaintenanceDto,
  UpdateFleetTripDto,
  UpdateFleetVehicleDto,
} from './dto/fleet.dto';

@Controller('fleet')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  @Get('vehicles')
  @RequirePermissions(PERMISSIONS.FLEET_VEHICLE_READ)
  async listVehicles(@Query() query: FleetListQueryDto) {
    return { data: await this.fleet.listVehicles(query) };
  }

  @Post('vehicles')
  @RequirePermissions(PERMISSIONS.FLEET_VEHICLE_CREATE)
  async createVehicle(
    @Body() dto: CreateFleetVehicleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.fleet.createVehicle(dto, user) };
  }

  @Patch('vehicles/:id')
  @RequirePermissions(PERMISSIONS.FLEET_VEHICLE_UPDATE)
  async updateVehicle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFleetVehicleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.fleet.updateVehicle(id, dto, user) };
  }

  @Delete('vehicles/:id')
  @RequirePermissions(PERMISSIONS.FLEET_VEHICLE_DELETE)
  async softDeleteVehicle(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.fleet.softDeleteVehicle(id, user) };
  }

  @Get('drivers')
  @RequirePermissions(PERMISSIONS.FLEET_TRIP_READ)
  async listDrivers() {
    return { data: await this.fleet.listDrivers() };
  }

  @Post('drivers')
  @RequirePermissions(PERMISSIONS.FLEET_VEHICLE_CREATE)
  async createDriver(
    @Body() dto: CreateFleetDriverDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.fleet.createDriver(dto, user) };
  }

  @Get('trip-requests')
  @RequirePermissions(PERMISSIONS.FLEET_TRIP_READ)
  async listTripRequests(@Query() query: FleetListQueryDto) {
    return { data: await this.fleet.listTripRequests(query) };
  }

  @Post('trip-requests')
  @RequirePermissions(PERMISSIONS.FLEET_TRIP_CREATE)
  async createTripRequest(
    @Body() dto: CreateFleetTripRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.fleet.createTripRequest(dto, user) };
  }

  @Post('trip-requests/:id/approve')
  @RequirePermissions(PERMISSIONS.FLEET_TRIP_APPROVE)
  async approveTripRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideTripRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.fleet.approveTripRequest(id, dto, user) };
  }

  @Post('trip-requests/:id/reject')
  @RequirePermissions(PERMISSIONS.FLEET_TRIP_APPROVE)
  async rejectTripRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideTripRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.fleet.rejectTripRequest(id, dto, user) };
  }

  @Get('trips')
  @RequirePermissions(PERMISSIONS.FLEET_TRIP_READ)
  async listTrips(@Query() query: FleetListQueryDto) {
    return { data: await this.fleet.listTrips(query) };
  }

  @Post('trips')
  @RequirePermissions(PERMISSIONS.FLEET_TRIP_CREATE)
  async createTrip(
    @Body() dto: CreateFleetTripDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.fleet.createTrip(dto, user) };
  }

  @Patch('trips/:id')
  @RequirePermissions(PERMISSIONS.FLEET_TRIP_UPDATE)
  async updateTrip(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFleetTripDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.fleet.updateTrip(id, dto, user) };
  }

  @Get('fuel')
  @RequirePermissions(PERMISSIONS.FLEET_FUEL_READ)
  async listFuel(@Query() query: FleetListQueryDto) {
    return { data: await this.fleet.listFuelLogs(query) };
  }

  @Post('fuel')
  @RequirePermissions(PERMISSIONS.FLEET_FUEL_CREATE)
  async createFuel(
    @Body() dto: CreateFleetFuelDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.fleet.createFuelLog(dto, user) };
  }

  @Get('maintenance')
  @RequirePermissions(PERMISSIONS.FLEET_MAINT_READ)
  async listMaintenance(@Query() query: FleetListQueryDto) {
    return { data: await this.fleet.listMaintenance(query) };
  }

  @Post('maintenance')
  @RequirePermissions(PERMISSIONS.FLEET_MAINT_CREATE)
  async createMaintenance(
    @Body() dto: CreateFleetMaintenanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.fleet.createMaintenance(dto, user) };
  }

  @Patch('maintenance/:id')
  @RequirePermissions(PERMISSIONS.FLEET_MAINT_UPDATE)
  async updateMaintenance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFleetMaintenanceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.fleet.updateMaintenance(id, dto, user) };
  }
}
