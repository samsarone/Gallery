export interface VideoStats {
  likes: number;
  comments: number;
  shares: number;
  views: number;
}

export interface VideoComment {
  id: string;
  text: string;
  creatorHandle: string;
  createdBy: string;
  createdAt: string;
  likes: number;
  isBotUser?: boolean;
  replies?: VideoComment[];
}

export interface VideoCommentState {
  items: VideoComment[];
  nextCursor: string | null;
  hasMore: boolean;
  isLoading: boolean;
  isPosting: boolean;
  error: string | null;
  hasLoadedInitial: boolean;
}

export interface PublishedVideo {
  id: string;
  videoUrl: string;
  posterUrl?: string;
  title: string;
  description: string;
  aspectRatio?: string | null;
  originalPrompt?: string;
  tags?: string[];
  creatorHandle?: string;
  createdBy?: string | null;
  sessionId?: string | null;
  createdAt?: string | null;
  stats: VideoStats;
  viewerHasLiked: boolean;
  isBotUser?: boolean;
}

export interface AuthenticatedUser {
  _id?: string;
  username?: string;
  email?: string;
  displayName?: string;
  isAdminUser?: boolean;
  [key: string]: unknown;
}
