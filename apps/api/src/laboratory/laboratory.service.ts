import { Injectable } from '@nestjs/common';
import { NursingOpsService } from '../nursing/nursing-ops.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import type { CreateLabRequestDto } from './dto/create-lab-request.dto';

/**
 * Thin lab bridge: requests / samples map to nursing lab orders
 * until a dedicated laboratory domain exists.
 */
@Injectable()
export class LaboratoryService {
  constructor(private readonly nursingOps: NursingOpsService) {}

  createRequest(dto: CreateLabRequestDto, actor?: AuthUser) {
    return this.nursingOps.createOrder(
      {
        personId: dto.personId,
        admissionId: dto.admissionId,
        kind: 'lab',
        items: dto.items,
        orderedBy: dto.orderedBy,
        paymentStatus: dto.paymentStatus ?? 'UNPAID',
      },
      actor,
    );
  }

  listRequests(params?: {
    personId?: number;
    admissionId?: number;
    status?: string;
  }) {
    return this.nursingOps.listOrders({ ...params, kind: 'lab' });
  }

  listSamples(params?: { personId?: number; admissionId?: number }) {
    return this.nursingOps.listSamples(params);
  }

  collectSample(orderId: number, actor?: AuthUser) {
    return this.nursingOps.collectSample(orderId, actor);
  }
}
