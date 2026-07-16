import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthUser } from './types/auth-user.type';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Method: POST
   * URL: /api/auth/login
   * Purpose: Authenticate staff and issue access (1h) + refresh (12h) tokens
   * Required permission: none
   * Request body: { email, password }
   * Response example: { data: { accessToken, refreshToken, expiresIn: 3600, user } }
   * Error cases: 401 invalid credentials / locked / expired account
   */
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const result = await this.authService.login(dto);
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/auth/refresh
   * Purpose: Rotate access + refresh tokens (frontend auto-calls on 401)
   * Required permission: none
   * Request body: { refreshToken }
   * Response example: { data: { accessToken, refreshToken, expiresIn: 3600, user } }
   * Error cases: 401 invalid/expired/revoked refresh token
   */
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    const result = await this.authService.refresh(dto.refreshToken);
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/auth/logout
   * Purpose: Revoke refresh token (works without a valid access JWT)
   * Required permission: none
   * Request body: { refreshToken }
   * Response example: { data: { success: true } }
   * Error cases: 400 validation
   */
  @Post('logout')
  async logout(@Body() dto: RefreshTokenDto) {
    const result = await this.authService.logout(dto.refreshToken);
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/auth/me
   * Purpose: Current authenticated user profile
   * Required permission: valid access JWT
   * Request body: none
   * Response example: { data: { id, email, firstName, lastName, roles } }
   * Error cases: 401
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return { data: user };
  }
}
