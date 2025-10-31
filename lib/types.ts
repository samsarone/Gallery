export interface VideoStats {
  likes: number;
  comments: number;
  shares: number;
}

export interface VideoComment {
  id: string;
  text: string;
  creatorHandle: string;
  createdBy: string;
  createdAt: string;
  likes: number;
  isBotUser?: boolean;
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
  title: string;
  description: string;
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
  [key: string]: unknown;
}
