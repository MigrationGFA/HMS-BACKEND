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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { RadiologyService } from './radiology.service';
import {
  CompleteImagingDto,
  CreateImagingRequestDto,
  ScheduleImagingDto,
  UpdateImagingRequestDto,
} from './dto/radiology.dto';

/**
 * Imaging requests + study catalog.
 * Permissions: accept either radiology-* or imaging:* (cashiers/doctors may hold either).
 */
@Controller('radiology/imaging')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ImagingController {
  constructor(private readonly radiology: RadiologyService) {}

  @Get('studies')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_STUDY_READ, PERMISSIONS.IMAGING_READ)
  async listStudies(
    @Query('modality') modality?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return { data: await this.radiology.listStudies({ modality, status, q }) };
  }

  @Get('requests')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_REQUEST_READ, PERMISSIONS.IMAGING_READ)
  async listRequests(
    @Query('personId') personId?: string,
    @Query('encounterId') encounterId?: string,
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('source') source?: string,
    @Query('workQueue') workQueue?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.radiology.listRequests({
        personId: personId ? Number(personId) : undefined,
        encounterId: encounterId ? Number(encounterId) : undefined,
        status,
        paymentStatus,
        source,
        workQueue: workQueue === 'true' || workQueue === '1',
        q,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 50,
      }),
    };
  }

  @Post('requests')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_REQUEST_CREATE, PERMISSIONS.IMAGING_CREATE)
  async createRequest(
    @Body() dto: CreateImagingRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.radiology.createRequest(dto, user) };
  }

  @Patch('requests/:id')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_REQUEST_UPDATE, PERMISSIONS.IMAGING_UPDATE)
  async updateRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateImagingRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.radiology.updateRequest(id, dto, user) };
  }

  @Post('requests/:id/schedule')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_REQUEST_UPDATE, PERMISSIONS.IMAGING_UPDATE)
  async schedule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ScheduleImagingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.radiology.schedule(id, dto, user) };
  }

  @Post('requests/:id/start')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_REQUEST_UPDATE, PERMISSIONS.IMAGING_UPDATE)
  async start(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.radiology.startExam(id, user) };
  }

  @Post('requests/:id/complete-imaging')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_REQUEST_UPDATE, PERMISSIONS.IMAGING_UPDATE)
  async complete(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteImagingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.radiology.completeImaging(id, dto, user) };
  }

  @Get('requests/:id/files')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_REQUEST_READ, PERMISSIONS.IMAGING_READ)
  async listFiles(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.radiology.listStudyFiles(id) };
  }

  @Post('requests/:id/files')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_REQUEST_UPDATE, PERMISSIONS.IMAGING_UPDATE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 40 * 1024 * 1024 } }))
  async uploadFile(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Query('kind') kind: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return {
      data: await this.radiology.uploadStudyFile(
        id,
        {
          originalname: file?.originalname ?? 'file',
          mimetype: file?.mimetype ?? 'application/octet-stream',
          size: file?.size ?? 0,
          buffer: file?.buffer ?? Buffer.alloc(0),
        },
        { kind },
        user,
      ),
    };
  }

  @Delete('requests/:id/files/:fileId')
  @RequirePermissions(PERMISSIONS.RADIOLOGY_REQUEST_UPDATE, PERMISSIONS.IMAGING_UPDATE)
  async deleteFile(
    @Param('id', ParseIntPipe) id: number,
    @Param('fileId', ParseIntPipe) fileId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { data: await this.radiology.deleteStudyFile(id, fileId, user) };
  }
}
