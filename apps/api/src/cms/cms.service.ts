import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../files/storage.service';
import type { AuthUser } from '../auth/types/auth-user.type';
import type {
  UpdateSitePageDto,
  UpsertSitePageDto,
  UpsertSiteSectionDto,
} from './dto/cms.dto';

@Injectable()
export class CmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async listPages() {
    return this.prisma.sitePage.findMany({
      orderBy: { SLUG: 'asc' },
      include: { _count: { select: { sections: true } } },
    });
  }

  async getPageBySlug(slug: string, publishedOnly: boolean) {
    const page = await this.prisma.sitePage.findUnique({
      where: { SLUG: slug },
      include: {
        sections: { orderBy: { SORT_ORDER: 'asc' } },
      },
    });
    if (!page) throw new NotFoundException(`Page not found: ${slug}`);
    if (publishedOnly && page.STATUS !== 'PUBLISHED') {
      throw new NotFoundException(`Page not published: ${slug}`);
    }
    return this.mapPage(page);
  }

  async getPageById(pageId: number) {
    const page = await this.prisma.sitePage.findUnique({
      where: { PAGE_ID: pageId },
      include: { sections: { orderBy: { SORT_ORDER: 'asc' } } },
    });
    if (!page) throw new NotFoundException(`Page not found: ${pageId}`);
    return this.mapPage(page);
  }

  async upsertPage(dto: UpsertSitePageDto, user: AuthUser) {
    const page = await this.prisma.sitePage.upsert({
      where: { SLUG: dto.slug },
      create: {
        SLUG: dto.slug,
        TITLE: dto.title,
        META_DESCRIPTION: dto.metaDescription ?? null,
        LOCALE: dto.locale ?? 'en',
        STATUS: 'DRAFT',
        CREATED_BY: user.email,
        UPDATED_BY: user.email,
      },
      update: {
        TITLE: dto.title,
        META_DESCRIPTION: dto.metaDescription ?? null,
        LOCALE: dto.locale ?? 'en',
        UPDATED_BY: user.email,
      },
    });
    await this.audit.log({
      type: 'cms:page-upsert',
      entity: 'SITE_PAGES',
      entityId: page.PAGE_ID,
      userId: user.id,
      createdBy: user.email,
      newValue: { slug: page.SLUG, title: page.TITLE },
    });
    return page;
  }

  async updatePage(pageId: number, dto: UpdateSitePageDto, user: AuthUser) {
    const existing = await this.prisma.sitePage.findUnique({
      where: { PAGE_ID: pageId },
    });
    if (!existing) throw new NotFoundException(`Page not found: ${pageId}`);
    const page = await this.prisma.sitePage.update({
      where: { PAGE_ID: pageId },
      data: {
        ...(dto.title != null ? { TITLE: dto.title } : {}),
        ...(dto.metaDescription !== undefined
          ? { META_DESCRIPTION: dto.metaDescription }
          : {}),
        ...(dto.status != null ? { STATUS: dto.status } : {}),
        UPDATED_BY: user.email,
      },
    });
    await this.audit.log({
      type: 'cms:page-update',
      entity: 'SITE_PAGES',
      entityId: pageId,
      userId: user.id,
      createdBy: user.email,
      oldValue: { title: existing.TITLE, status: existing.STATUS },
      newValue: { title: page.TITLE, status: page.STATUS },
    });
    return page;
  }

  async setPublish(pageId: number, publish: boolean, user: AuthUser) {
    const page = await this.prisma.sitePage.update({
      where: { PAGE_ID: pageId },
      data: {
        STATUS: publish ? 'PUBLISHED' : 'DRAFT',
        PUBLISHED_AT: publish ? new Date() : null,
        UPDATED_BY: user.email,
      },
    });
    await this.audit.log({
      type: publish ? 'cms:page-publish' : 'cms:page-unpublish',
      entity: 'SITE_PAGES',
      entityId: pageId,
      userId: user.id,
      createdBy: user.email,
      newValue: { slug: page.SLUG, status: page.STATUS },
    });
    return page;
  }

  async upsertSection(
    pageId: number,
    dto: UpsertSiteSectionDto,
    user: AuthUser,
  ) {
    const page = await this.prisma.sitePage.findUnique({
      where: { PAGE_ID: pageId },
    });
    if (!page) throw new NotFoundException(`Page not found: ${pageId}`);

    const section = await this.prisma.siteSection.upsert({
      where: {
        PAGE_ID_SECTION_KEY: {
          PAGE_ID: pageId,
          SECTION_KEY: dto.sectionKey,
        },
      },
      create: {
        PAGE_ID: pageId,
        SECTION_KEY: dto.sectionKey,
        SORT_ORDER: dto.sortOrder ?? 0,
        HEADING: dto.heading ?? null,
        SUBHEADING: dto.subheading ?? null,
        BODY: dto.body ?? null,
        CTA_LABEL: dto.ctaLabel ?? null,
        CTA_HREF: dto.ctaHref ?? null,
        IMAGE_URL: dto.imageUrl ?? null,
        IMAGE_ALT: dto.imageAlt ?? null,
      },
      update: {
        ...(dto.sortOrder != null ? { SORT_ORDER: dto.sortOrder } : {}),
        ...(dto.heading !== undefined ? { HEADING: dto.heading } : {}),
        ...(dto.subheading !== undefined ? { SUBHEADING: dto.subheading } : {}),
        ...(dto.body !== undefined ? { BODY: dto.body } : {}),
        ...(dto.ctaLabel !== undefined ? { CTA_LABEL: dto.ctaLabel } : {}),
        ...(dto.ctaHref !== undefined ? { CTA_HREF: dto.ctaHref } : {}),
        ...(dto.imageUrl !== undefined ? { IMAGE_URL: dto.imageUrl } : {}),
        ...(dto.imageAlt !== undefined ? { IMAGE_ALT: dto.imageAlt } : {}),
      },
    });

    await this.prisma.sitePage.update({
      where: { PAGE_ID: pageId },
      data: { UPDATED_BY: user.email },
    });

    await this.audit.log({
      type: 'cms:section-upsert',
      entity: 'SITE_SECTIONS',
      entityId: section.SECTION_ID,
      userId: user.id,
      createdBy: user.email,
      newValue: { pageId, key: dto.sectionKey },
    });

    return section;
  }

  async listMedia() {
    return this.prisma.siteMedia.findMany({
      orderBy: { CREATED_AT: 'desc' },
      take: 100,
    });
  }

  async uploadMedia(
    file: Express.Multer.File,
    altText: string | undefined,
    user: AuthUser,
  ) {
    const stored = await this.storage.putObject({
      buffer: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
      prefix: 'cms',
    });
    const media = await this.prisma.siteMedia.create({
      data: {
        FILENAME: file.originalname,
        URL: stored.url,
        BLOB_PATH: stored.blobPath,
        CONTENT_TYPE: stored.contentType,
        ALT_TEXT: altText ?? null,
        SIZE_BYTES: stored.size,
        CREATED_BY: user.email,
      },
    });
    await this.audit.log({
      type: 'cms:media-upload',
      entity: 'SITE_MEDIA',
      entityId: media.MEDIA_ID,
      userId: user.id,
      createdBy: user.email,
      newValue: { url: media.URL, filename: media.FILENAME },
    });
    return media;
  }

  private mapPage(page: {
    PAGE_ID: number;
    SLUG: string;
    TITLE: string;
    META_DESCRIPTION: string | null;
    LOCALE: string;
    STATUS: string;
    PUBLISHED_AT: Date | null;
    UPDATED_AT: Date;
    sections: Array<{
      SECTION_ID: number;
      SECTION_KEY: string;
      SORT_ORDER: number;
      HEADING: string | null;
      SUBHEADING: string | null;
      BODY: string | null;
      CTA_LABEL: string | null;
      CTA_HREF: string | null;
      IMAGE_URL: string | null;
      IMAGE_ALT: string | null;
    }>;
  }) {
    return {
      pageId: page.PAGE_ID,
      slug: page.SLUG,
      title: page.TITLE,
      metaDescription: page.META_DESCRIPTION,
      locale: page.LOCALE,
      status: page.STATUS,
      publishedAt: page.PUBLISHED_AT,
      updatedAt: page.UPDATED_AT,
      sections: page.sections.map((s) => ({
        sectionId: s.SECTION_ID,
        key: s.SECTION_KEY,
        sortOrder: s.SORT_ORDER,
        heading: s.HEADING,
        subheading: s.SUBHEADING,
        body: s.BODY,
        ctaLabel: s.CTA_LABEL,
        ctaHref: s.CTA_HREF,
        imageUrl: s.IMAGE_URL,
        imageAlt: s.IMAGE_ALT,
      })),
    };
  }
}
