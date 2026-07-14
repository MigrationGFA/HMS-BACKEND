import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { CreatePersonDto } from './dto/create-person.dto';
import { PatientsService } from './patients.service';

@Controller('patients')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  /**
   * Method: POST
   * URL: /api/patients
   * Purpose: Register a new patient (PERSONS row) + open registration card (payment Pending)
   * Required permission: patient:create (RECORDS, ADMIN, SUPER_ADMIN, CMD, IT)
   * Request body: CreatePersonDto (email optional; regFee/consultFee/cardFee optional)
   * Response example: { data: { personId, hospitalNo, ..., card: { cardId, paymentStatus: "Pending", totalAmount } } }
   * Error cases: 400 validation, 401 unauthorized, 403 missing permission, 409 duplicate identity/phone+name
   */
  @Post()
  @RequirePermissions(PERMISSIONS.PATIENT_CREATE)
  async register(
    @Body() dto: CreatePersonDto,
    @CurrentUser() user: AuthUser,
  ) {
    const person = await this.patientsService.register(dto, user);
    return { data: person };
  }

  /**
   * Method: GET
   * URL: /api/patients?q=&page=&limit=
   * Purpose: Search/list persons
   * Required permission: patient:read
   * Request body: none
   * Response example: { data: { items: [...], meta: { page, limit, total } } }
   * Error cases: 401 unauthorized, 403 missing permission
   */
  @Get()
  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  async search(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.patientsService.search(
      q,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/patients/:id
   * Purpose: Get person by PERSON_ID
   * Required permission: patient:read
   * Request body: none
   * Response example: { data: { personId, hospitalNo, ... } }
   * Error cases: 401 unauthorized, 403 missing permission, 404 not found
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const person = await this.patientsService.findById(id);
    return { data: person };
  }
}
