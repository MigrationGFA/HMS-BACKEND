import { Injectable } from '@nestjs/common';
import { NursingOpsService } from '../nursing/nursing-ops.service';
import type { AuthUser } from '../auth/types/auth-user.type';

/**
 * Thin pharmacy bridge: dispensing flips MAR pharmacy flag
 * until a dedicated pharmacy domain exists.
 */
@Injectable()
export class PharmacyService {
  constructor(private readonly nursingOps: NursingOpsService) {}

  listMarPending(params?: {
    personId?: number;
    admissionId?: number;
  }) {
    return this.nursingOps.listMar({
      ...params,
      status: 'PENDING',
    });
  }

  dispenseMar(marId: number, actor?: AuthUser) {
    return this.nursingOps.markMarDispensed(marId, actor);
  }
}
