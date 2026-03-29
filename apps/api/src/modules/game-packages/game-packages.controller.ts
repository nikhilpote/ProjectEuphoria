import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Express } from 'express';
import { IsBoolean } from 'class-validator';
import { GamePackagesService } from './game-packages.service';
import { Public } from '../../common/decorators/public.decorator';
import type { GamePackage } from '@euphoria/types';

class SetEnabledDto {
  @IsBoolean()
  isEnabled!: boolean;
}

// ---------------------------------------------------------------------------
// Admin endpoints — no auth (matches existing admin controller pattern)
// ---------------------------------------------------------------------------

@ApiTags('admin / game-packages')
@Controller('admin/games')
export class AdminGamePackagesController {
  constructor(private readonly gamePackagesService: GamePackagesService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a game package ZIP' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: 'uploads/',
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${uuidv4()}${ext}`);
        },
      }),
      limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (ext !== '.zip') {
          return cb(new BadRequestException('Only .zip files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadPackage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<GamePackage> {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.gamePackagesService.uploadPackage(file.path);
  }

  @Get()
  @ApiOperation({ summary: 'List all game packages (admin)' })
  getAll(): Promise<GamePackage[]> {
    return this.gamePackagesService.getAll();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Enable or disable a game package' })
  setEnabled(
    @Param('id') id: string,
    @Body() body: SetEnabledDto,
  ): Promise<GamePackage> {
    return this.gamePackagesService.setEnabled(id, body.isEnabled);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a game package' })
  async deletePackage(@Param('id') id: string): Promise<void> {
    return this.gamePackagesService.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Public endpoint — no auth required
// ---------------------------------------------------------------------------

@ApiTags('game-packages')
@Controller('games')
export class PublicGamePackagesController {
  constructor(private readonly gamePackagesService: GamePackagesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List enabled game packages (public)' })
  getEnabled(): Promise<GamePackage[]> {
    return this.gamePackagesService.getEnabled();
  }
}
