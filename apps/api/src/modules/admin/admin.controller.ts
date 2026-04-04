import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ValidationPipe,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Express } from 'express';
import { AdminService, ClipRangeInput } from './admin.service';
import { StorageService, type MediaFile } from '../../common/storage/storage.service';
import { TranscodeService } from '../../common/transcode/transcode.service';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import type {
  AdminStatsResponse,
  ShowSummary,
  CreateShowPayload,
  FeatureFlag,
} from '@euphoria/types';

class SetFeatureFlagDto {
  key!: string;
  value!: boolean | string | number;
  description?: string;
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly storageService: StorageService,
    private readonly transcodeService: TranscodeService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get platform stats' })
  getStats(): Promise<AdminStatsResponse> {
    return this.adminService.getStats();
  }

  @Post('shows')
  @ApiOperation({ summary: 'Create a new show' })
  createShow(
    @Body(new ValidationPipe({ whitelist: false, transform: false })) payload: CreateShowPayload,
  ): Promise<ShowSummary> {
    return this.adminService.createShow(payload);
  }

  @Post('shows/:showId/start')
  @ApiOperation({ summary: 'Start a scheduled show (begins round loop)' })
  startShow(@Param('showId') showId: string): Promise<void> {
    return this.adminService.startShow(showId);
  }

  @Get('media')
  @ApiOperation({ summary: 'List uploaded media files from storage (videos)' })
  listMedia(): Promise<MediaFile[]> {
    return this.storageService.listMedia();
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload a video clip for a show round' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: 'uploads/',
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${uuidv4()}${ext}`);
        },
      }),
      limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
      fileFilter: (_req, file, cb) => {
        const allowed = ['.mp4', '.mov', '.webm', '.m4v', '.jpg', '.jpeg', '.png', '.webp', '.gif'];
        const ext = extname(file.originalname).toLowerCase();
        if (!allowed.includes(ext)) {
          return cb(new BadRequestException(`File type not allowed. Allowed: ${allowed.join(', ')}`), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadVideo(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('No file uploaded');
    // Upload directly — videos should be pre-transcoded locally before upload
    const url = await this.storageService.upload(file.path, file.filename);
    return { url };
  }

  @Get('shows/:showId/clips')
  @ApiOperation({ summary: 'List existing PlayClips for a show' })
  getShowClips(@Param('showId') showId: string) {
    return this.adminService.getShowClips(showId);
  }

  @Post('shows/:showId/clips')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extract clip ranges from a completed show video and create PlayClips' })
  createShowClips(
    @Param('showId') showId: string,
    @Body() ranges: ClipRangeInput[],
  ): Promise<{ created: number }> {
    return this.adminService.createShowClips(showId, ranges);
  }

  @Get('clips')
  @ApiOperation({ summary: 'List all PlayClips across all shows' })
  getAllClips() {
    return this.adminService.getAllClips();
  }

  @Delete('shows/:showId/clips/:clipId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a saved PlayClip and its stored video' })
  deleteClip(
    @Param('showId') showId: string,
    @Param('clipId') clipId: string,
  ): Promise<void> {
    return this.adminService.deleteClip(showId, clipId);
  }

  @Post('feature-flags')
  @ApiOperation({ summary: 'Set a feature flag' })
  setFlag(
    @Body() body: SetFeatureFlagDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<FeatureFlag> {
    return this.adminService.setFeatureFlag(
      body.key,
      body.value,
      user.email,
      body.description,
    );
  }

  @Delete('feature-flags/:key')
  @ApiOperation({ summary: 'Delete a feature flag' })
  deleteFlag(@Param('key') key: string): Promise<void> {
    return this.adminService.deleteFeatureFlag(key);
  }
}
