export type Platform = "xiaohongshu" | "zhihu" | "x";
export type MediaKind = "image" | "video" | "gif";

export interface MediaVariant {
  label: string;
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  bytes?: number;
  verified?: boolean;
  downloadUrl?: string;
}
export interface MediaItem {
  kind: MediaKind;
  thumbnail?: string;
  original?: boolean;
  watermarkFree?: boolean | null;
  variants: MediaVariant[];
}
export interface ParsedContent {
  platform: Platform;
  id: string;
  sourceUrl: string;
  type: "post" | "answer" | "article" | "pin" | "video";
  title: string;
  author: { name: string; id?: string; avatar?: string };
  text: string;
  publishedAt?: string;
  media: MediaItem[];
  warnings: string[];
}
export class ParseError extends Error {
  constructor(public code: string, message: string, public status = 422) { super(message); }
}
export interface Parser {
  platform: Platform;
  parse(url: URL, fetcher?: typeof fetch): Promise<ParsedContent>;
}
