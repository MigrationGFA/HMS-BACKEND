import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import {
  CreateKitchenMenuDto,
  CreateKitchenOrderDto,
  CreateKitchenWastageDto,
  KitchenListQueryDto,
  UpdateKitchenMenuDto,
  UpdateKitchenOrderStatusDto,
} from './dto/kitchen.dto';

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
export class KitchenService {
  constructor(private readonly prisma: PrismaService) {}

  async listMenus(query: KitchenListQueryDto) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const where = {
      STATUS: query.status ?? 'Active',
      ...(query.mealSlot ? { MEAL_SLOT: query.mealSlot } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.kitchenMenus.findMany({
        where,
        orderBy: { NAME: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.kitchenMenus.count({ where }),
    ]);

    return {
      items: rows.map((m) => ({
        menuId: m.MENU_ID,
        name: m.NAME,
        mealSlot: m.MEAL_SLOT,
        dietTags: m.DIET_TAGS,
        status: m.STATUS,
      })),
      meta: { page, limit, total },
    };
  }

  async createMenu(dto: CreateKitchenMenuDto, user: AuthUser) {
    const row = await this.prisma.kitchenMenus.create({
      data: {
        NAME: dto.name.trim(),
        MEAL_SLOT: dto.mealSlot.trim(),
        DESCRIPTION: dto.description?.trim() ?? null,
        DIET_TAGS: dto.dietTags?.trim() ?? null,
        CREATED_BY_ID: user.id,
        CREATED_BY: actorLabel(user),
      },
    });
    return { menuId: row.MENU_ID, name: row.NAME };
  }

  async updateMenu(id: number, dto: UpdateKitchenMenuDto, user: AuthUser) {
    const existing = await this.prisma.kitchenMenus.findUnique({
      where: { MENU_ID: id },
    });
    if (!existing) throw new NotFoundException('Menu not found');

    const updated = await this.prisma.kitchenMenus.update({
      where: { MENU_ID: id },
      data: {
        ...(dto.name != null ? { NAME: dto.name.trim() } : {}),
        ...(dto.mealSlot != null ? { MEAL_SLOT: dto.mealSlot.trim() } : {}),
        ...(dto.description !== undefined
          ? { DESCRIPTION: dto.description?.trim() ?? null }
          : {}),
        ...(dto.dietTags !== undefined
          ? { DIET_TAGS: dto.dietTags?.trim() ?? null }
          : {}),
        ...(dto.status != null ? { STATUS: dto.status } : {}),
        UPDATED_BY_ID: user.id,
        UPDATED_BY: actorLabel(user),
        UPDATED_DATE: new Date(),
      },
    });
    return { menuId: updated.MENU_ID, status: updated.STATUS };
  }

  async listOrders(query: KitchenListQueryDto) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const where = {
      ...(query.status ? { STATUS: query.status } : {}),
      ...(query.mealSlot ? { MEAL_SLOT: query.mealSlot } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.kitchenOrders.findMany({
        where,
        include: { menu: true },
        orderBy: { CREATED_DATE: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.kitchenOrders.count({ where }),
    ]);

    return {
      items: rows.map((o) => ({
        orderId: o.ORDER_ID,
        orderNo: o.ORDER_NO,
        mealSlot: o.MEAL_SLOT,
        wardLabel: o.WARD_LABEL,
        menuName: o.menu?.NAME ?? null,
        status: o.STATUS,
        quantity: o.QUANTITY,
        scheduledFor: o.SCHEDULED_FOR?.toISOString().slice(0, 10) ?? null,
      })),
      meta: { page, limit, total },
    };
  }

  async createOrder(dto: CreateKitchenOrderDto, user: AuthUser) {
    const year = new Date().getFullYear();
    const label = actorLabel(user);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.kitchenOrders.create({
        data: {
          ORDER_NO: `KIT-${year}-PENDING`,
          PERSON_ID: dto.personId ?? null,
          ADMISSION_ID: dto.admissionId ?? null,
          MENU_ID: dto.menuId ?? null,
          MEAL_SLOT: dto.mealSlot.trim(),
          WARD_LABEL: dto.wardLabel?.trim() ?? null,
          DIET_NOTES: dto.dietNotes?.trim() ?? null,
          QUANTITY: dto.quantity ?? 1,
          SCHEDULED_FOR: dto.scheduledFor
            ? new Date(`${dto.scheduledFor.slice(0, 10)}T00:00:00.000Z`)
            : null,
          REQUESTED_BY_ID: user.id,
          REQUESTED_BY: label,
          CREATED_BY_ID: user.id,
          CREATED_BY: label,
        },
      });
      return tx.kitchenOrders.update({
        where: { ORDER_ID: row.ORDER_ID },
        data: { ORDER_NO: `KIT-${year}-${padId(row.ORDER_ID)}` },
      });
    });

    return {
      orderId: created.ORDER_ID,
      orderNo: created.ORDER_NO,
      status: created.STATUS,
    };
  }

  async updateOrderStatus(
    id: number,
    dto: UpdateKitchenOrderStatusDto,
    user: AuthUser,
  ) {
    const order = await this.prisma.kitchenOrders.findUnique({
      where: { ORDER_ID: id },
    });
    if (!order) throw new NotFoundException('Kitchen order not found');

    const allowed = [
      'Pending',
      'Preparing',
      'Ready',
      'Served',
      'Cancelled',
    ];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException('Invalid kitchen order status');
    }

    const updated = await this.prisma.kitchenOrders.update({
      where: { ORDER_ID: id },
      data: {
        STATUS: dto.status,
        SERVED_AT: dto.status === 'Served' ? new Date() : order.SERVED_AT,
        UPDATED_BY_ID: user.id,
        UPDATED_BY: actorLabel(user),
        UPDATED_DATE: new Date(),
      },
    });

    return { orderId: updated.ORDER_ID, status: updated.STATUS };
  }

  async listWastage(query: KitchenListQueryDto) {
    const { page, limit, skip } = pagination(query.page, query.limit);
    const [rows, total] = await Promise.all([
      this.prisma.kitchenWastage.findMany({
        include: { menu: true },
        orderBy: { RECORDED_DATE: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.kitchenWastage.count(),
    ]);

    return {
      items: rows.map((w) => ({
        wastageId: w.WASTAGE_ID,
        itemName: w.ITEM_NAME,
        quantity: Number(w.QUANTITY),
        unit: w.UNIT,
        menuName: w.menu?.NAME ?? null,
        recordedDate: w.RECORDED_DATE.toISOString(),
      })),
      meta: { page, limit, total },
    };
  }

  async createWastage(dto: CreateKitchenWastageDto, user: AuthUser) {
    const row = await this.prisma.kitchenWastage.create({
      data: {
        MENU_ID: dto.menuId ?? null,
        ITEM_NAME: dto.itemName.trim(),
        QUANTITY: dto.quantity,
        UNIT: dto.unit?.trim() ?? null,
        REASON: dto.reason?.trim() ?? null,
        RECORDED_BY_ID: user.id,
        RECORDED_BY: actorLabel(user),
      },
    });
    return { wastageId: row.WASTAGE_ID };
  }

  /** Stub: ward diet signals from admissions — read-only for kitchen staff. */
  async listDietSignals() {
    const rows = await this.prisma.kitchenOrders.findMany({
      where: {
        STATUS: { in: ['Pending', 'Preparing'] },
        DIET_NOTES: { not: null },
      },
      take: 50,
      orderBy: { CREATED_DATE: 'desc' },
      select: {
        ORDER_ID: true,
        WARD_LABEL: true,
        DIET_NOTES: true,
        MEAL_SLOT: true,
        SCHEDULED_FOR: true,
      },
    });

    return {
      items: rows.map((r) => ({
        orderId: r.ORDER_ID,
        wardLabel: r.WARD_LABEL,
        dietNotes: r.DIET_NOTES,
        mealSlot: r.MEAL_SLOT,
        scheduledFor: r.SCHEDULED_FOR?.toISOString().slice(0, 10) ?? null,
      })),
      note: 'Stub aggregator — link nursing diet orders in a later phase.',
    };
  }
}
