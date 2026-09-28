import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.type';
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

function actorLabel(user: AuthUser): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
  );
}

function pagination(page?: number, limit?: number) {
  const p = Math.max(page ?? 1, 1);
  const l = Math.min(Math.max(limit ?? 50, 1), 200);
  return { page: p, limit: l, skip: (p - 1) * l };
}

function padId(id: number): string {
  return String(id).padStart(5, '0');
}

@Injectable()
export class FleetService {
  constructor(private readonly prisma: PrismaService) {}

  async listVehicles(query: FleetListQueryDto) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const where = query.status ? { STATUS: query.status } : {};

    const [rows, total] = await Promise.all([
      this.prisma.fleetVehicles.findMany({
        where,
        orderBy: { REG_NO: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.fleetVehicles.count({ where }),
    ]);

    return {
      items: rows.map((v) => ({
        vehicleId: v.VEHICLE_ID,
        regNo: v.REG_NO,
        type: v.TYPE,
        model: v.MODEL,
        status: v.STATUS,
      })),
      meta: { page, limit, total },
    };
  }

  async createVehicle(dto: CreateFleetVehicleDto, user: AuthUser) {
    const row = await this.prisma.fleetVehicles.create({
      data: {
        REG_NO: dto.regNo.trim().toUpperCase(),
        TYPE: dto.type.trim(),
        MODEL: dto.model?.trim() ?? null,
        INSURANCE_EXPIRY: dto.insuranceExpiry
          ? new Date(`${dto.insuranceExpiry.slice(0, 10)}T00:00:00.000Z`)
          : null,
        REGISTRATION_EXPIRY: dto.registrationExpiry
          ? new Date(`${dto.registrationExpiry.slice(0, 10)}T00:00:00.000Z`)
          : null,
        NOTES: dto.notes?.trim() ?? null,
        CREATED_BY_ID: user.id,
        CREATED_BY: actorLabel(user),
      },
    });
    return { vehicleId: row.VEHICLE_ID, regNo: row.REG_NO };
  }

  async updateVehicle(
    id: number,
    dto: UpdateFleetVehicleDto,
    user: AuthUser,
  ) {
    const existing = await this.prisma.fleetVehicles.findUnique({
      where: { VEHICLE_ID: id },
    });
    if (!existing) throw new NotFoundException('Vehicle not found');

    const updated = await this.prisma.fleetVehicles.update({
      where: { VEHICLE_ID: id },
      data: {
        ...(dto.type != null ? { TYPE: dto.type.trim() } : {}),
        ...(dto.model !== undefined ? { MODEL: dto.model?.trim() ?? null } : {}),
        ...(dto.status != null ? { STATUS: dto.status } : {}),
        ...(dto.insuranceExpiry !== undefined
          ? {
              INSURANCE_EXPIRY: dto.insuranceExpiry
                ? new Date(`${dto.insuranceExpiry.slice(0, 10)}T00:00:00.000Z`)
                : null,
            }
          : {}),
        ...(dto.registrationExpiry !== undefined
          ? {
              REGISTRATION_EXPIRY: dto.registrationExpiry
                ? new Date(
                    `${dto.registrationExpiry.slice(0, 10)}T00:00:00.000Z`,
                  )
                : null,
            }
          : {}),
        ...(dto.notes !== undefined ? { NOTES: dto.notes?.trim() ?? null } : {}),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: actorLabel(user),
        UPDATED_DATE: new Date(),
      },
    });
    return { vehicleId: updated.VEHICLE_ID, status: updated.STATUS };
  }

  async softDeleteVehicle(id: number, user: AuthUser) {
    return this.updateVehicle(id, { status: 'Inactive' }, user);
  }

  async listDrivers() {
    const rows = await this.prisma.fleetDrivers.findMany({
      where: { STATUS: 'Active' },
      orderBy: { NAME: 'asc' },
    });
    return rows.map((d) => ({
      driverId: d.DRIVER_ID,
      name: d.NAME,
      phone: d.PHONE,
      licenseNo: d.LICENSE_NO,
    }));
  }

  async createDriver(dto: CreateFleetDriverDto, user: AuthUser) {
    const row = await this.prisma.fleetDrivers.create({
      data: {
        NAME: dto.name.trim(),
        PHONE: dto.phone?.trim() ?? null,
        LICENSE_NO: dto.licenseNo?.trim() ?? null,
        LICENSE_EXPIRY: dto.licenseExpiry
          ? new Date(`${dto.licenseExpiry.slice(0, 10)}T00:00:00.000Z`)
          : null,
        CREATED_BY_ID: user.id,
        CREATED_BY: actorLabel(user),
      },
    });
    return { driverId: row.DRIVER_ID, name: row.NAME };
  }

  async listTripRequests(query: FleetListQueryDto) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const where = query.status ? { STATUS: query.status } : {};

    const [rows, total] = await Promise.all([
      this.prisma.fleetTripRequests.findMany({
        where,
        orderBy: { CREATED_DATE: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.fleetTripRequests.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        requestId: r.REQUEST_ID,
        requestNo: r.REQUEST_NO,
        purpose: r.PURPOSE,
        destination: r.DESTINATION,
        priority: r.PRIORITY,
        status: r.STATUS,
        requestedBy: r.REQUESTED_BY,
      })),
      meta: { page, limit, total },
    };
  }

  async createTripRequest(dto: CreateFleetTripRequestDto, user: AuthUser) {
    const year = new Date().getFullYear();
    const label = actorLabel(user);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.fleetTripRequests.create({
        data: {
          REQUEST_NO: `TRQ-${year}-PENDING`,
          PERSON_ID: dto.personId ?? null,
          REQUESTED_BY_ID: user.id,
          REQUESTED_BY: label,
          DEPARTMENT: dto.department?.trim() ?? null,
          PURPOSE: dto.purpose.trim(),
          PICKUP_LOCATION: dto.pickupLocation?.trim() ?? null,
          DESTINATION: dto.destination.trim(),
          PRIORITY: dto.priority?.trim() ?? 'Routine',
          CREATED_BY_ID: user.id,
          CREATED_BY: label,
        },
      });
      return tx.fleetTripRequests.update({
        where: { REQUEST_ID: row.REQUEST_ID },
        data: { REQUEST_NO: `TRQ-${year}-${padId(row.REQUEST_ID)}` },
      });
    });

    return {
      requestId: created.REQUEST_ID,
      requestNo: created.REQUEST_NO,
      status: created.STATUS,
    };
  }

  async approveTripRequest(
    id: number,
    dto: DecideTripRequestDto,
    user: AuthUser,
  ) {
    return this.decideTripRequest(id, 'Approved', dto, user);
  }

  async rejectTripRequest(
    id: number,
    dto: DecideTripRequestDto,
    user: AuthUser,
  ) {
    return this.decideTripRequest(id, 'Rejected', dto, user);
  }

  private async decideTripRequest(
    id: number,
    status: 'Approved' | 'Rejected',
    dto: DecideTripRequestDto,
    user: AuthUser,
  ) {
    const req = await this.prisma.fleetTripRequests.findUnique({
      where: { REQUEST_ID: id },
    });
    if (!req) throw new NotFoundException('Trip request not found');
    if (req.STATUS !== 'Pending') {
      throw new BadRequestException(`Request is already ${req.STATUS}`);
    }

    const label = actorLabel(user);
    await this.prisma.fleetTripRequests.update({
      where: { REQUEST_ID: id },
      data: {
        STATUS: status,
        DECISION_NOTE: dto.decisionNote?.trim() ?? null,
        APPROVED_BY_ID: user.id,
        APPROVED_BY: label,
        APPROVED_AT: new Date(),
        UPDATED_DATE: new Date(),
      },
    });

    return { requestId: id, status };
  }

  async listTrips(query: FleetListQueryDto) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const where = query.status ? { STATUS: query.status } : {};

    const [rows, total] = await Promise.all([
      this.prisma.fleetTrips.findMany({
        where,
        include: { vehicle: true, driver: true },
        orderBy: { CREATED_DATE: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.fleetTrips.count({ where }),
    ]);

    return {
      items: rows.map((t) => ({
        tripId: t.TRIP_ID,
        tripNo: t.TRIP_NO,
        vehicleReg: t.vehicle.REG_NO,
        driverName: t.driver.NAME,
        status: t.STATUS,
        toLocation: t.TO_LOCATION,
      })),
      meta: { page, limit, total },
    };
  }

  async createTrip(dto: CreateFleetTripDto, user: AuthUser) {
    const vehicle = await this.prisma.fleetVehicles.findUnique({
      where: { VEHICLE_ID: dto.vehicleId },
    });
    if (!vehicle || vehicle.STATUS !== 'Available') {
      throw new BadRequestException('Vehicle is not available');
    }

    const year = new Date().getFullYear();
    const label = actorLabel(user);

    const trip = await this.prisma.$transaction(async (tx) => {
      const row = await tx.fleetTrips.create({
        data: {
          TRIP_NO: `TRIP-${year}-PENDING`,
          REQUEST_ID: dto.requestId ?? null,
          VEHICLE_ID: dto.vehicleId,
          DRIVER_ID: dto.driverId,
          PURPOSE: dto.purpose.trim(),
          FROM_LOCATION: dto.fromLocation?.trim() ?? null,
          TO_LOCATION: dto.toLocation.trim(),
          START_AT: dto.startAt ? new Date(dto.startAt) : null,
          CREATED_BY_ID: user.id,
          CREATED_BY: label,
        },
      });

      const withNo = await tx.fleetTrips.update({
        where: { TRIP_ID: row.TRIP_ID },
        data: { TRIP_NO: `TRIP-${year}-${padId(row.TRIP_ID)}` },
      });

      await tx.fleetVehicles.update({
        where: { VEHICLE_ID: dto.vehicleId },
        data: { STATUS: 'OnTrip', UPDATED_DATE: new Date() },
      });

      return withNo;
    });

    return { tripId: trip.TRIP_ID, tripNo: trip.TRIP_NO, status: trip.STATUS };
  }

  async updateTrip(id: number, dto: UpdateFleetTripDto, user: AuthUser) {
    const trip = await this.prisma.fleetTrips.findUnique({
      where: { TRIP_ID: id },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.fleetTrips.update({
        where: { TRIP_ID: id },
        data: {
          ...(dto.status != null ? { STATUS: dto.status } : {}),
          ...(dto.endAt != null ? { END_AT: new Date(dto.endAt) } : {}),
          ...(dto.mileageEnd != null ? { MILEAGE_END: dto.mileageEnd } : {}),
          ...(dto.notes !== undefined ? { NOTES: dto.notes?.trim() ?? null } : {}),
          UPDATED_BY_ID: user.id,
          UPDATED_BY: actorLabel(user),
          UPDATED_DATE: new Date(),
        },
      });

      if (dto.status === 'Completed' || dto.status === 'Cancelled') {
        await tx.fleetVehicles.update({
          where: { VEHICLE_ID: trip.VEHICLE_ID },
          data: { STATUS: 'Available', UPDATED_DATE: new Date() },
        });
      }

      return row;
    });

    return { tripId: updated.TRIP_ID, status: updated.STATUS };
  }

  async listFuelLogs(query: FleetListQueryDto) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const [rows, total] = await Promise.all([
      this.prisma.fleetFuelLogs.findMany({
        include: { vehicle: true },
        orderBy: { FILLED_AT: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.fleetFuelLogs.count(),
    ]);

    return {
      items: rows.map((f) => ({
        fuelId: f.FUEL_ID,
        vehicleReg: f.vehicle.REG_NO,
        liters: Number(f.LITERS),
        cost: Number(f.COST),
        filledAt: f.FILLED_AT.toISOString(),
      })),
      meta: { page, limit, total },
    };
  }

  async createFuelLog(dto: CreateFleetFuelDto, user: AuthUser) {
    const row = await this.prisma.fleetFuelLogs.create({
      data: {
        VEHICLE_ID: dto.vehicleId,
        TRIP_ID: dto.tripId ?? null,
        LITERS: dto.liters,
        COST: dto.cost,
        NOTES: dto.notes?.trim() ?? null,
        RECORDED_BY_ID: user.id,
        RECORDED_BY: actorLabel(user),
      },
    });
    return { fuelId: row.FUEL_ID };
  }

  async listMaintenance(query: FleetListQueryDto) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const where = query.status ? { STATUS: query.status } : {};

    const [rows, total] = await Promise.all([
      this.prisma.fleetMaintenance.findMany({
        where,
        include: { vehicle: true },
        orderBy: { CREATED_DATE: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.fleetMaintenance.count({ where }),
    ]);

    return {
      items: rows.map((m) => ({
        maintId: m.MAINT_ID,
        vehicleReg: m.vehicle.REG_NO,
        type: m.TYPE,
        status: m.STATUS,
        scheduledDate: m.SCHEDULED_DATE?.toISOString().slice(0, 10) ?? null,
      })),
      meta: { page, limit, total },
    };
  }

  async createMaintenance(dto: CreateFleetMaintenanceDto, user: AuthUser) {
    const row = await this.prisma.fleetMaintenance.create({
      data: {
        VEHICLE_ID: dto.vehicleId,
        TYPE: dto.type.trim(),
        DESCRIPTION: dto.description?.trim() ?? null,
        COST: dto.cost ?? null,
        SCHEDULED_DATE: dto.scheduledDate
          ? new Date(`${dto.scheduledDate.slice(0, 10)}T00:00:00.000Z`)
          : null,
        CREATED_BY_ID: user.id,
        CREATED_BY: actorLabel(user),
      },
    });
    return { maintId: row.MAINT_ID };
  }

  async updateMaintenance(
    id: number,
    dto: UpdateFleetMaintenanceDto,
    user: AuthUser,
  ) {
    const existing = await this.prisma.fleetMaintenance.findUnique({
      where: { MAINT_ID: id },
    });
    if (!existing) throw new NotFoundException('Maintenance record not found');

    const updated = await this.prisma.fleetMaintenance.update({
      where: { MAINT_ID: id },
      data: {
        ...(dto.status != null ? { STATUS: dto.status } : {}),
        ...(dto.completedDate !== undefined
          ? {
              COMPLETED_DATE: dto.completedDate
                ? new Date(`${dto.completedDate.slice(0, 10)}T00:00:00.000Z`)
                : null,
            }
          : {}),
        ...(dto.cost !== undefined ? { COST: dto.cost ?? null } : {}),
        ...(dto.description !== undefined
          ? { DESCRIPTION: dto.description?.trim() ?? null }
          : {}),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: actorLabel(user),
        UPDATED_DATE: new Date(),
      },
    });
    return { maintId: updated.MAINT_ID, status: updated.STATUS };
  }
}
