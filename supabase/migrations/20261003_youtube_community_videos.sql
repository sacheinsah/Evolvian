-- Evolvian: store YouTube video references instead of large video files.
-- Apply this migration in the Supabase SQL Editor before using YouTube uploads.

alter table public.posts
  add column if not exists media_provider text,
  add column if not exists media_type text,
  add column if not exists youtube_video_id text;

alter table public.posts
  drop constraint if exists posts_media_provider_check;

alter table public.posts
  add constraint posts_media_provider_check
  check (media_provider is null or media_provider in ('supabase','youtube'));

alter table public.posts
  drop constraint if exists posts_media_type_check;

alter table public.posts
  add constraint posts_media_type_check
  check (media_type is null or media_type in ('image','video'));

create index if not exists posts_youtube_video_id_idx
  on public.posts (youtube_video_id)
  where youtube_video_id is not null;

comment on column public.posts.youtube_video_id is
  'YouTube video ID for community videos; the actual video bytes are hosted by YouTube.';
comment on column public.posts.media_provider is
  'Media host: youtube for community videos, supabase for other media.';
