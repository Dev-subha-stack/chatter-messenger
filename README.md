# Chatter — web app + PWA

Chatter is a mobile-first real-time messaging web app powered by Supabase.

## What's in this first UI pass
- New authenticated app shell with a dedicated Home screen
- Four-tab navigation: Home, Chats, Create, Profile
- Top bar with global conversation search, notifications and profile shortcut
- Responsive mobile bottom navigation and desktop side navigation
- Recent conversation cards and quick actions
- Dark mode by default and a light-mode toggle
- Press feedback and lightweight entrance transitions
- PWA manifest, app icons and service worker for installability and offline shell caching
- Signup email confirmation redirects back to the current site origin
- Profile HEX username colour picker with presets and live preview; colour is stored in Supabase and shown beside usernames
- 5 MB image, GIF, short-video, PDF and TXT attachments in direct chats
- Attachment preview before sending, image compression option, oversized-image compression prompt, and upload activity indicator
- Chat attachments stored in a private bucket; only members of the matching conversation can read them via expiring signed URLs
- Profile pictures can be cropped square and compressed to 512×512 WebP (up to 500 KB target) before upload when compression is enabled
- Authenticated members can publish text updates to a real-time community feed; row-level security restricts each post's edits and deletion to its author
- Community posts support private image/video attachments up to 30 MB, with in-app full-screen photo and video viewing
- Chat wallpapers can be selected from built-in themes or uploaded per conversation and sync through the user's membership settings
- Profile photos and banners refresh live for other members, while chat and people lists show realtime online/offline presence

## Run locally
1. Install Node.js 20+.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (Supabase publishable/anon key only; never use service-role keys in the browser)
4. Run `npm run dev`.
5. Build with `npm run build`.

## PWA install
Deploy over HTTPS, then use the browser's Install app / Add to Home Screen option. The service worker caches the app shell and static assets; authentication, messages and uploads still require a network connection.

- Client-side media compression runs in the browser for images and supported video formats, with visible progress, before/after sizes and an original-file fallback when video encoding is unavailable

## Next implementation steps
1. Add a posts/feed data model and real Create flow.
1. Build the real social feed and post creation tables/UI.
2. Add moderator/admin roles and special username gradients using trusted app metadata.
3. Replace the indeterminate upload activity indicator with byte-accurate upload progress.
4. Add signed private-media URLs and server-side media moderation.
5. Add notification delivery, read receipts and typing indicators.
