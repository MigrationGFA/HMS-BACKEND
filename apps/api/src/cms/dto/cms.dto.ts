import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpsertSitePageDto {
  @IsString()
  @MaxLength(80)
  slug!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;
}

export class UpdateSitePageDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;
}

export class UpsertSiteSectionDto {
  @IsString()
  @MaxLength(80)
  sectionKey!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  heading?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subheading?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ctaLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  ctaHref?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  imageAlt?: string;
}

export class PublishPageDto {
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}
