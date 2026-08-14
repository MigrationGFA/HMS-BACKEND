import { IsEmail, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

/**
 * Staff may sign in with phone (legacy / migrated) or email (seed / IT accounts).
 * At least one of email or phone is required.
 */
export class LoginDto {
  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(7)
  phone?: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
