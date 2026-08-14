import {
  Controller,
  Get,
  NotFoundException,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { existsSync } from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StorageService } from './storage.service';

@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  /** Stream a locally stored object (Azure uses SAS URLs directly). */
  @Get('download')
  @UseGuards(JwtAuthGuard)
  downloadLocal(@Query('path') path: string, @Res() res: Response) {
    const blobPath = String(path ?? '').replace(/^\/+/, '');
    if (!blobPath || blobPath.includes('..')) {
      throw new NotFoundException('File not found');
    }
    const abs = this.storage.localAbsolutePath(blobPath);
    if (!existsSync(abs)) throw new NotFoundException('File not found');
    return res.sendFile(abs);
  }
}
