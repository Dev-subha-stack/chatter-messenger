# Chatter — real-time messenger + PWA

Chatter is a mobile-first messaging and social web app built with React, Vite and Supabase. It supports direct conversations, a community feed, member profiles and installable PWA behaviour.

## Features

### Messaging
- Real-time one-to-one conversations with online presence and a live typing indicator.
- Message replies with sender and message previews, plus edit and soft-delete actions.
- Delivery inbox notifications for new messages and @mentions, with unread counts and notification navigation.
- Image, GIF, video, PDF and TXT attachments stored in a private Supabase bucket and served to conversation members with expiring signed URLs.
- An in-app media viewer with custom video play/pause, seek, volume, mute and fullscreen controls rather than the browser's native video control bar.
- Per-conversation wallpapers, attachment previews and optional on-device image/video compression.

### Profiles and social
- Editable display name, username, bio, avatar, banner and username colour.
- Up to five clickable profile links.
- Follow/unfollow, follower and following counts, and new-follower notifications.
- Community posts with image/video attachments, likes, reposts, threaded comments and @mentions.
- In-app notifications for new messages, mentions and new followers.

### Emoji
- Searchable emoji picker with categories and a large Unicode emoji collection.
- Personal custom emoji shortcuts that can use either a Unicode fallback or an uploaded image.
- Image emojis are stored in the public-read `custom-emojis` bucket and shared with other signed-in members; messages store a shortcode such as `:sloptube:`, so recipients render the same image.
- Custom emoji can also be used in community comments and post content.

### App and installability
- Responsive mobile and desktop navigation, dark/light appearance settings and subtle motion.
- PWA manifest, icons and service worker for installability and offline shell caching.
- Profile and presence updates sync between connected clients in real time.

## Run locally

1. Install Node.js 20 or newer.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env.local` and set:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (Supabase publishable/anon key only; never put a service-role key in the browser).

4. Apply the SQL setup for a new project, or apply all migrations in chronological order:

   - `supabase/schema.sql` for a complete fresh database, or
   - the files in `supabase/migrations/` for an existing database.

5. Start the local development server:

   ```bash
   npm run dev
   ```

6. Create a production build:

   ```bash
   npm run build
   ```

## Storage and security

- `chat-media` is a private bucket. Chat attachments and custom wallpapers are accessible only to conversation members through signed URLs.
- `profile-media` is used for public profile pictures and banners.
- `post-media` is private and readable through the post access policies.
- `custom-emojis` is a small public-read bucket so custom emoji images resolve for every recipient. Upload and delete policies restrict each user's files to their own UUID folder.
- Row-level security protects profiles, messages, follows, notifications, posts and custom emoji records.
- Only the Supabase anon/publishable key belongs in frontend environment variables. Keep service-role keys server-side.

## PWA install

Deploy the site over HTTPS, then use the browser's **Install app** or **Add to Home Screen** action. The service worker caches the application shell and static assets; authentication, live messages and media uploads require a network connection.

## Notes

- Chat attachments are limited to 5 MB. Community post media is limited to 30 MB. Custom emoji image uploads are limited to 512 KB after compression.
- Video playback is implemented in the app's media viewer. The operating system may still provide its own fullscreen/media overlay in some browsers.
