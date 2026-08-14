import { IsString, MinLength, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  /** New login PIN/password (min 4 — supports first-login PIN reset). */
  @IsString()
  @MinLength(4)
  @MaxLength(128)
  newPassword!: string;
}
