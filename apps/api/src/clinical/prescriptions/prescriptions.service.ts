import { Injectable } from '@nestjs/common';
import { NursingOpsService } from '../../nursing/nursing-ops.service';
import type { AuthUser } from '../../auth/types/auth-user.type';
import type { CreatePrescriptionDto } from './dto/create-prescription.dto';

/**
 * Thin clinical bridge: prescriptions create nursing drug orders (+ MAR rows)
 * until a dedicated prescriptions domain exists.
 */
@Injectable()
export class PrescriptionsService {
  constructor(private readonly nursingOps: NursingOpsService) {}

  async createDrugOrder(dto: CreatePrescriptionDto, actor?: AuthUser) {
    return this.nursingOps.createOrder(
      {
        personId: dto.personId,
        admissionId: dto.admissionId,
        kind: 'drug',
        items: dto.items,
        orderedBy: dto.orderedBy,
        paymentStatus: dto.paymentStatus ?? 'PAID',
      },
      actor,
    );
  }

  list(params?: {
    personId?: number;
    admissionId?: number;
    status?: string;
  }) {
    return this.nursingOps.listOrders({ ...params, kind: 'drug' });
  }
}
