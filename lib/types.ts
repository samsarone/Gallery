export interface PublishedVideo {
  videoUrl: string;
  title: string;
  description: string;
  originalPrompt?: string;
}

export interface AuthenticatedUser {
  _id?: string;
  username?: string;
  email?: string;
  [key: string]: unknown;
}
