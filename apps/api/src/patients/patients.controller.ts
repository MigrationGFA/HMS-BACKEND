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
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { PatientsService } from './patients.service';

@Controller('patients')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  /**
   * Method: POST
   * URL: /api/patients
   * Purpose: Early-register a person after Next of Kin (creates PERSONS + PATIENT_CARDS with payment Pending)
   * Required permission: patient:create
   * Request body: CreatePersonDto (email optional; regFee/consultFee/cardFee optional)
   * Response example: { data: { personId, hospitalNo, status: "Pending Payment", card: { paymentStatus: "Pending", ... } } }
   * Error cases: 400 validation, 401 unauthorized, 403 missing permission, 409 duplicate
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

  /**
   * Method: PATCH
   * URL: /api/patients/:id
   * Purpose: Update person after payment (medical / insurance / complete status → Active)
   * Required permission: patient:update
   * Request body: UpdatePersonDto (partial)
   * Response example: { data: { personId, status: "Active", ... } }
   * Error cases: 400 validation, 401, 403, 404
   */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PATIENT_UPDATE)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePersonDto,
    @CurrentUser() user: AuthUser,
  ) {
    const person = await this.patientsService.update(id, dto, user);
    return { data: person };
  }
}
