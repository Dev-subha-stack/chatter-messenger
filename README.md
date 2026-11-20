# Chatter — real-time messenger + PWA

Chatter is a mobile-first messaging and social web app built with React, Vite and Supabase.

## Features

### Messaging
- Real-time one-to-one chats, online presence and typing indicators.
- Message replies, editing and soft deletion from a WhatsApp-style right-click or press-and-hold action menu.
- Quick emoji reactions from the message action menu, with live reaction counts.
- @pings to the other participant in a private chat, delivered as a message notification.
- Optional in-app sound alerts for incoming messages and pings (enable sound with the toggle in Notifications).
- Polls inside messages, including single-choice and multiple-choice voting.
- In-app notifications for new messages, mentions and followers.
- Private image, GIF, video, PDF and TXT attachments.
- Custom inline video player in chats and posts with play/pause, seek, volume and a separate optional fullscreen button. Videos start paused in the feed or conversation instead of opening a fullscreen overlay.
- Per-conversation wallpapers and optional on-device media compression.

### Community
- Text, photo and video posts.
- Likes, reposts, threaded comments, live comment updates and likes on individual comments.
- Polls on posts with live vote totals and percentage results.
- @mentions and custom image emojis in community content.

### Profiles
- Editable display name, username, bio, avatar, banner and username colour.
- Profile status text, custom profile theme colour, three public profile card styles (gradient, glass and minimal) and up to five clickable links.
- Follow/unfollow, follower and following counts, and new-follower notifications.

### Emoji
- Searchable emoji picker with categories and a large Unicode emoji collection.
- Personal custom emoji shortcuts using Unicode symbols or image uploads.
- Shared public-read emoji images rendered by shortcode across users.

### App customisation and PWA
- Dark/light/system appearance, preset or custom accent colour, message text size and width, layout density, bubble shape, typeface, chat background and motion settings.
- PWA manifest, app icons and service worker for installability and offline shell caching.
- Profile, presence, reactions and poll votes update in real time.

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Never put a service-role key in frontend code.
4. For a new Supabase project, run `supabase/schema.sql`. For an existing project, apply all files in `supabase/migrations/` in filename order.
5. Start the dev server with `npm run dev`; build with `npm run build`.

## Storage and security

- `chat-media` is private; chat files and wallpapers are only readable by conversation participants through signed URLs.
- `profile-media` stores profile photos and banners.
- `post-media` stores community post media.
- `custom-emojis` is public-read so emoji images resolve for every recipient; upload/delete access is limited to the owner's UUID folder.
- Row-level security restricts message reactions to chat participants, poll creation to the author of the target post/message, and voting to authenticated users who can access the poll.
- Poll votes are recorded through the `toggle_chatter_poll_vote` database function, which enforces poll choice rules and close times.

## PWA install

Deploy over HTTPS, then use the browser's **Install app** or **Add to Home Screen** action. The app shell can be cached offline; authentication, messages, votes and uploads require a network connection.

## Upload limits

- Direct chat attachments: 5 MB.
- Community post media: 30 MB.
- Custom emoji images: 512 KB after compression.


## Authentication email delivery

Chatter uses Supabase Auth for confirmation and password-reset emails. Configure a valid custom SMTP provider in **Supabase Dashboard → Authentication → SMTP Settings** before allowing public sign-ups. For Gmail SMTP, use an account-specific Google App Password (with 2-Step Verification enabled), not the regular Gmail password. Check Supabase Auth logs for SMTP responses such as `535 5.7.8 BadCredentials` when delivery fails.
