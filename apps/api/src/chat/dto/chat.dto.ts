import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CHAT_GROUPS, CHAT_MODULES } from '../chat.constants';

export class CreateConversationDto {
  @IsIn(['direct', 'department', 'patient'])
  type!: 'direct' | 'department' | 'patient';

  @IsString()
  @IsIn([...CHAT_GROUPS])
  group!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  participantUserIds!: number[];

  @IsOptional()
  @IsArray()
  @IsIn([...CHAT_MODULES], { each: true })
  moduleScope?: string[];

  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  patientName?: string;

  @IsOptional()
  @IsString()
  hospitalNo?: string;

  @IsOptional()
  @IsBoolean()
  urgent?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  initialMessage?: string;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  text!: string;

  @IsOptional()
  @IsBoolean()
  urgent?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentions?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  attachmentUrl?: string;
}

export class CreateBroadcastDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  target!: string;

  @IsIn(['Normal', 'Urgent', 'Emergency'])
  priority!: 'Normal' | 'Urgent' | 'Emergency';

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsArray()
  @IsIn([...CHAT_MODULES], { each: true })
  moduleScope?: string[];

  @IsOptional()
  @IsString()
  patientName?: string;

  @IsOptional()
  @IsString()
  expiry?: string;
}
