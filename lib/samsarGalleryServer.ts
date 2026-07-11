import 'server-only';

import crypto from 'crypto';
import SamsarClient from 'samsar-js';
import type { NextRequest } from 'next/server';
import { getRequestAuthToken } from './serverAdmin';
import { verifyAuthToken } from './auth';
import type {
  AuthenticatedUser,
  GalleryTaxonomyKind,
  PublishedVideo
} from './types';
import { SAMSAR_V1_API_SERVER } from './config';

export interface GallerySearchResponse {
  query: string;
  items: PublishedVideo[];
  total: number;
}

export interface GalleryRecommendationsResponse {
  items: PublishedVideo[];
  reason: string;
  personalized: boolean;
}

export interface GallerySyncResponse {
  status: string;
  indexed: number;
  skipped: number;
  failed: number;
  refreshed?: boolean;
  stale?: boolean;
  scanned?: number;
  removed?: number;
  lastUpdatedAt?: string | null;
  nextUpdateAt?: string | null;
  [key: string]: unknown;
}

export interface UpstreamGalleryTaxonomyResponse {
  kind: 'category' | 'topic';
  items: Array<{
    name: string;
    publication_count?: number;
    publication_ids?: string[];
  }>;
  total: number;
  limit: number;
  offset: number;
}

export interface UpstreamGalleryTaxonomyPublicationsResponse {
  kind: 'category' | 'topic';
  name: string;
  publication_ids: string[];
  total: number;
  limit: number;
  offset: number;
}

const getClient = () => {
  const apiKey = process.env.SAMSAR_API_KEY?.trim();
  if (!apiKey) throw new Error('SAMSAR_API_KEY is not configured.');

  return new SamsarClient({
    apiKey,
    baseUrl: SAMSAR_V1_API_SERVER,
    timeoutMs: 240_000
  });
};

export const searchGallery = async (payload: {
  query: string;
  limit?: number;
  format?: 'landscape' | 'portrait' | 'square';
}): Promise<GallerySearchResponse> => {
  const response = await getClient().postV2<GallerySearchResponse>('gallery/search', payload);
  return response.data;
};

export const loadGalleryRecommendations = async (payload: {
  viewer_id?: string;
  publication_id?: string;
  limit?: number;
  format?: 'landscape' | 'portrait' | 'square';
  exclude_ids?: string[];
}): Promise<GalleryRecommendationsResponse> => {
  const response = await getClient().postV2<GalleryRecommendationsResponse>(
    'gallery/recommendations',
    payload
  );
  return response.data;
};

export const sendGalleryView = async (payload: Record<string, unknown>) => {
  const response = await getClient().postV2<Record<string, unknown>>(
    'gallery/events/view',
    payload
  );
  return response.data;
};

export const updateGalleryPublicationEmbeddings = async (): Promise<GallerySyncResponse> => {
  const response = await getClient().postV2<GallerySyncResponse>(
    'gallery/publications/update_embeddings',
    { force: false }
  );
  return response.data;
};

export const loadGalleryTaxonomy = async (
  kind: GalleryTaxonomyKind,
  payload: { limit?: number; offset?: number; includePublicationIds?: boolean } = {}
): Promise<UpstreamGalleryTaxonomyResponse> => {
  const response = await getClient().getV2<UpstreamGalleryTaxonomyResponse>(
    `gallery/taxonomy/${kind}`,
    {
      query: {
        limit: payload.limit ?? 500,
        offset: payload.offset ?? 0,
        include_publication_ids: payload.includePublicationIds ?? true
      }
    }
  );
  return response.data;
};

export const loadGalleryTaxonomyPublicationIds = async (
  kind: GalleryTaxonomyKind,
  name: string,
  payload: { limit?: number; offset?: number } = {}
): Promise<UpstreamGalleryTaxonomyPublicationsResponse> => {
  const response = await getClient().getV2<UpstreamGalleryTaxonomyPublicationsResponse>(
    `gallery/taxonomy/${kind}/${encodeURIComponent(name)}/publications`,
    {
      query: {
        limit: payload.limit ?? 48,
        offset: payload.offset ?? 0
      }
    }
  );
  return response.data;
};

export const resolveAuthenticatedGalleryUser = async (
  request: NextRequest
): Promise<AuthenticatedUser | null> => {
  const token = getRequestAuthToken(request);
  return token ? verifyAuthToken(token) : null;
};

export const createGalleryViewerId = (identifier: string): string => {
  const secret = process.env.GALLERY_VIEWER_SALT?.trim();
  if (!secret) throw new Error('GALLERY_VIEWER_SALT is not configured.');
  return crypto
    .createHmac('sha256', secret)
    .update(`samsar-gallery-viewer:${identifier}`)
    .digest('hex');
};
