import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@euphoria/types';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get authenticated user profile' })
  getMyProfile(@CurrentUser() user: JwtPayload): Promise<AuthenticatedUser> {
    return this.userService.getProfile(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get public user profile by ID' })
  getProfile(@Param('id') id: string): Promise<AuthenticatedUser> {
    return this.userService.getProfile(id);
  }
}
