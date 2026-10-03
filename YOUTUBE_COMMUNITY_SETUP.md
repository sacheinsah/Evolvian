# Evolvian YouTube-backed community videos

The Community composer now sends video bytes to the Evolvian YouTube channel instead of Supabase Storage. Supabase stores only the post metadata and YouTube video ID.

## 1. Apply the database migration

Run this file in the Supabase SQL Editor:

`supabase/migrations/20261003_youtube_community_videos.sql`

## 2. Create Google/YouTube OAuth credentials

Create a Google Cloud OAuth client for the Google account that owns the Evolvian YouTube channel. Enable **YouTube Data API v3** and authorize the account with the `https://www.googleapis.com/auth/youtube.upload` scope.

The long-lived refresh token must be kept server-side. Never put it in `config.js`, frontend JavaScript, GitHub source, or browser storage.

## 3. Configure Supabase Edge Function secrets

Set these secrets for the `youtube-upload-init` Edge Function:

- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_REFRESH_TOKEN`

Supabase automatically supplies its normal function environment variables such as `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

## 4. Deploy the Edge Function

Deploy:

`supabase/functions/youtube-upload-init/index.ts`

The frontend calls the function only to create a temporary resumable upload session. YouTube OAuth credentials never reach the browser.

## 5. YouTube visibility

Evolvian requests **Unlisted** videos with embedding enabled. This is intentional: YouTube Private videos cannot be reliably embedded for ordinary Evolvian members, while Unlisted videos can be embedded and do not normally appear in YouTube search/channel video listings.

Important: Unlisted is link-based privacy, not true access control. Anyone who obtains the YouTube URL can share/watch it. Evolvian controls whether the post/player is shown inside the community, but YouTube itself still treats the video as accessible by link.

## 6. API project verification

YouTube documents that videos uploaded through `videos.insert` by unverified API projects created after July 28, 2020 can be forced into Private viewing. If the Evolvian upload remains Private despite requesting Unlisted, the Google API project needs to satisfy YouTube's verification/audit requirements before this workflow can provide the intended embedded Unlisted behavior.

## 7. User flow

Community → Add photo/video → select video → Upload to Evolvian YouTube → YouTube returns video ID → save post in Supabase → embedded YouTube player appears in the Evolvian feed.

The browser uses YouTube's resumable upload protocol in 8 MB chunks so large uploads can report progress and resume from the last acknowledged range after an interruption.
