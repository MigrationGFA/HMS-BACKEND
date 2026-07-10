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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CreatePersonDto } from './dto/create-person.dto';
import { PatientsService } from './patients.service';

@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  /**
   * Method: POST
   * URL: /api/patients
   * Purpose: Register a new patient (PERSONS row)
   * Required permission: authenticated staff (JWT); patient:create when RBAC is wired
   * Request body: CreatePersonDto
   * Response example: { data: { personId, hospitalNo, firstName, lastName, ... } }
   * Error cases: 400 validation, 401 unauthorized, 409 duplicate identity/phone+name
   */
  @Post()
  @UseGuards(JwtAuthGuard)
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
   * Required permission: authenticated staff (JWT)
   * Request body: none
   * Response example: { data: { items: [...], meta: { page, limit, total } } }
   * Error cases: 401 unauthorized
   */
  @Get()
  @UseGuards(JwtAuthGuard)
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
   * Required permission: authenticated staff (JWT)
   * Request body: none
   * Response example: { data: { personId, hospitalNo, ... } }
   * Error cases: 401 unauthorized, 404 not found
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const person = await this.patientsService.findById(id);
    return { data: person };
  }
}
