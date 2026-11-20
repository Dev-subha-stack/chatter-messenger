import React, { useEffect, useState } from 'react';
import { Heart, Repeat2, MessageCircle, CornerDownRight, Send, Smile, Trash2, X, Bell } from 'lucide-react';
import { supabase } from './supabase';

const initials = (name = '?') => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || '?';
const mentionIds = (text, profiles, currentUserId) => {
  const handles = [...String(text || '').matchAll(/@([a-z0-9_]+)/gi)].map(match => match[1].toLowerCase());
  return Object.values(profiles || {}).filter(person => person.id !== currentUserId && handles.includes(String(person.username || '').toLowerCase())).map(person => person.id);
};
const renderMentions = text => String(text || '').split(/(@[a-z0-9_]+)/gi).map((part, index) => /^@[a-z0-9_]+$/i.test(part) ? <span className="mention-token" key={index}>{part}</span> : part);

function SmallAvatar({ profile }) {
  return <span className="social-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt=""/> : initials(profile?.display_name || profile?.username || '?')}</span>;
}

export function SocialPostCard({ post, onOpenMedia, currentUserId, profiles = {}, customEmojis = [] }) {
  const author = post.author || {};
  const image = post.media_type?.startsWith('image/');
  const video = post.media_type?.startsWith('video/');
  const [comments, setComments] = useState([]);
  const [likes, setLikes] = useState([]);
  const [reposts, setReposts] = useState([]);
  const [showComments, setShowComments] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mentionQuery, setMentionQuery] = useState('');

  const load = async () => {
    const [commentResult, likeResult, repostResult] = await Promise.all([
      supabase.from('post_comments').select('id,post_id,user_id,parent_id,content,mentions,created_at,author:profiles!post_comments_user_id_fkey(id,display_name,username,avatar_url,username_color)').eq('post_id', post.id).order('created_at', { ascending: true }),
      supabase.from('post_likes').select('user_id').eq('post_id', post.id),
      supabase.from('post_reposts').select('user_id').eq('post_id', post.id),
    ]);
    if (!commentResult.error) setComments(commentResult.data || []);
    if (!likeResult.error) setLikes(likeResult.data || []);
    if (!repostResult.error) setReposts(repostResult.data || []);
  };
  useEffect(() => { load(); }, [post.id]);

  const liked = likes.some(row => row.user_id === currentUserId);
  const reposted = reposts.some(row => row.user_id === currentUserId);
  const mentionedUsers = mentionQuery ? Object.values(profiles).filter(person => person.id !== currentUserId && String(person.username || '').toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 5) : [];

  const toggleLike = async () => {
    setError('');
    const result = liked
      ? await supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', currentUserId)
      : await supabase.from('post_likes').insert({ post_id: post.id, user_id: currentUserId });
    if (result.error) { setError(result.error.message); return; }
    setLikes(rows => liked ? rows.filter(row => row.user_id !== currentUserId) : [...rows, { user_id: currentUserId }]);
  };
  const toggleRepost = async () => {
    setError('');
    const result = reposted
      ? await supabase.from('post_reposts').delete().eq('post_id', post.id).eq('user_id', currentUserId)
      : await supabase.from('post_reposts').insert({ post_id: post.id, user_id: currentUserId });
    if (result.error) { setError(result.error.message); return; }
    setReposts(rows => reposted ? rows.filter(row => row.user_id !== currentUserId) : [...rows, { user_id: currentUserId }]);
  };
  const publishComment = async event => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true); setError('');
    const result = await supabase.from('post_comments').insert({
      post_id: post.id, user_id: currentUserId, parent_id: replyTo?.id || null,
      content, mentions: mentionIds(content, profiles, currentUserId),
    }).select('id,post_id,user_id,parent_id,content,mentions,created_at,author:profiles!post_comments_user_id_fkey(id,display_name,username,avatar_url,username_color)').single();
    if (result.error) setError(result.error.message);
    else {
      setComments(rows => [...rows, result.data]);
      if (result.data.mentions?.length) {
        const { error: pingError } = await supabase.from('chatter_notifications').insert(result.data.mentions.map(recipient_user_id => ({
          recipient_user_id, actor_user_id: currentUserId, notification_type: 'comment_mention',
          target_type: 'post', target_id: post.id,
          body: `You were mentioned in a comment by ${result.data.author?.display_name || 'a Chatter member'}.`,
        })));
        if (pingError) console.warn('Comment mention notifications were not delivered:', pingError.message);
      }
      setDraft(''); setReplyTo(null);
    }
    setBusy(false);
  };
  const updateDraft = value => {
    setDraft(value);
    const match = value.match(/@([a-z0-9_]*)$/i);
    setMentionQuery(match ? match[1] : '');
  };
  const selectMention = person => { setDraft(value => value.replace(/@([a-z0-9_]*)$/i, `@${person.username} `)); setMentionQuery(''); };
  const addEmoji = emoji => { setDraft(value => value + emoji); setEmojiOpen(false); };
  const renderThread = parentId => comments.filter(comment => (comment.parent_id || null) === parentId).map(comment => (
    <div className="post-comment-thread" key={comment.id}>
      <div className="post-comment-row">
        <SmallAvatar profile={comment.author}/>
        <div className="post-comment-copy"><b>{comment.author?.display_name || 'Chatter member'}</b><p>{renderMentions(comment.content)}</p><small>{new Date(comment.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></div>
        <button type="button" className="comment-reply-button" onClick={() => { setReplyTo(comment); setShowComments(true); }}><CornerDownRight size={13}/> Reply</button>
      </div>
      {renderThread(comment.id)}
    </div>
  ));

  return <article className="post-card">
    <div className="post-card-head">
      <SmallAvatar profile={author}/>
      <div className="post-card-author">
        <strong>{author.display_name || 'Chatter member'}</strong>
        <div className="social-role-badges">{(author.badges || []).map(role => <span key={role.id || role.name} style={{ '--role-color': role.color || '#A3E6D3' }}>{role.badge || '✦'} {role.name}</span>)}</div>
        <small><span style={{color:author.username_color || '#A3E6D3'}}>@{author.username || 'member'}</span><span className="post-dot">·</span><time dateTime={post.created_at}>{new Date(post.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></small>
      </div>
    </div>
    {post.content && <p className="post-content">{renderMentions(post.content)}</p>}
    {post.media_url && image && <button type="button" className="post-media-open media-open-button" onClick={() => onOpenMedia?.({src:post.media_url,type:'image',name:post.media_name})}><img className="post-media-preview" src={post.media_url} alt={post.media_name || 'Post image'}/></button>}
    {post.media_url && video && <button type="button" className="post-media-open post-video-open media-open-button" onClick={() => onOpenMedia?.({src:post.media_url,type:'video',name:post.media_name})}><video className="post-media-preview" src={post.media_url} muted playsInline preload="metadata"/><span className="media-play-mark">▶</span></button>}
    <div className="post-interaction-bar">
      <button type="button" className={liked ? 'active liked' : ''} onClick={toggleLike}><Heart size={16} fill={liked ? 'currentColor' : 'none'}/><span>{likes.length} Like{likes.length === 1 ? '' : 's'}</span></button>
      <button type="button" className={showComments ? 'active' : ''} onClick={() => setShowComments(value => !value)}><MessageCircle size={16}/><span>{comments.length} Comment{comments.length === 1 ? '' : 's'}</span></button>
      <button type="button" className={reposted ? 'active' : ''} onClick={toggleRepost}><Repeat2 size={16}/><span>{reposts.length} Repost{reposts.length === 1 ? '' : 's'}</span></button>
    </div>
    {showComments && <div className="post-comments">
      {comments.length ? renderThread(null) : <p className="post-comments-empty">Be the first to comment.</p>}
      {replyTo && <div className="replying-strip"><span>Replying to {replyTo.author?.display_name || 'a comment'}</span><button type="button" onClick={() => setReplyTo(null)}><X size={14}/></button></div>}
      <form className="post-comment-form" onSubmit={publishComment}>
        <textarea value={draft} onChange={event => updateDraft(event.target.value)} rows={2} maxLength={1000} placeholder={replyTo ? 'Write a reply…' : 'Write a comment…'}/>
        {mentionedUsers.length > 0 && <div className="mention-suggestions">{mentionedUsers.map(person => <button type="button" key={person.id} onClick={() => selectMention(person)}>@{person.username} <small>{person.display_name}</small></button>)}</div>}
        <div className="post-comment-actions">
          <div className="emoji-inline"><button type="button" className="comment-emoji-toggle" onClick={() => setEmojiOpen(value => !value)}><Smile size={16}/></button>{emojiOpen && <span className="emoji-inline-options">{['😀','😂','🥹','❤️','🔥','🎉','👍','✨'].map(emoji => <button type="button" key={emoji} onClick={() => addEmoji(emoji)}>{emoji}</button>)}{customEmojis.map(item => <button type="button" key={item.id} title={item.shortcode} onClick={() => addEmoji(item.emoji)}>{item.emoji}</button>)}</span>}</div>
          <button type="submit" className="primary-button" disabled={!draft.trim() || busy}>{busy ? 'Sending…' : 'Comment'} <Send size={14}/></button>
        </div>
      </form>
      {error && <p className="form-error">{error}</p>}
    </div>}
  </article>;
}

export function EmojiSettings({ currentUserId, customEmojis = [], onChange }) {
  const [shortcode, setShortcode] = useState('');
  const [emoji, setEmoji] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const addEmoji = async event => {
    event.preventDefault();
    const clean = shortcode.trim().toLowerCase().replace(/^:/, '').replace(/:$/, '');
    if (!/^[a-z0-9_]{2,24}$/.test(clean) || !emoji.trim()) { setError('Use a 2–24 character name and enter an emoji symbol.'); return; }
    setBusy(true); setError('');
    const { data, error: insertError } = await supabase.from('user_custom_emojis').insert({ owner_id: currentUserId, shortcode: clean, emoji: emoji.trim() }).select().single();
    if (insertError) setError(insertError.code === '23505' ? 'That emoji name already exists.' : insertError.message);
    else { onChange(current => [...current, data]); setShortcode(''); setEmoji(''); }
    setBusy(false);
  };
  const removeEmoji = async item => {
    const { error: removeError } = await supabase.from('user_custom_emojis').delete().eq('id', item.id).eq('owner_id', currentUserId);
    if (removeError) setError(removeError.message); else onChange(current => current.filter(row => row.id !== item.id));
  };
  return <div className="custom-emoji-settings">
    <div className="appearance-card-title"><Smile size={17}/><div><b>Custom emojis</b><small>Create personal emoji shortcuts for chats and comments</small></div></div>
    <form className="custom-emoji-form" onSubmit={addEmoji}><input value={shortcode} onChange={event => setShortcode(event.target.value)} placeholder="name e.g. sloptube" maxLength={24}/><input value={emoji} onChange={event => setEmoji(event.target.value)} placeholder="Emoji symbol" maxLength={12}/><button type="submit" className="primary-button" disabled={busy || !shortcode.trim() || !emoji.trim()}>{busy ? 'Adding…' : 'Add emoji'}</button></form>
    {error && <p className="form-error">{error}</p>}
    <div className="custom-emoji-list">{customEmojis.map(item => <span className="custom-emoji-chip" key={item.id}><b>{item.emoji}</b><small>:{item.shortcode}:</small><button type="button" aria-label={`Remove ${item.shortcode}`} onClick={() => removeEmoji(item)}><Trash2 size={13}/></button></span>)}</div>
    {!customEmojis.length && <p className="custom-emoji-empty">Your personal emoji collection is empty.</p>}
  </div>;
}

export function NotificationCenter({ currentUserId }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const unread = notifications.filter(item => !item.is_read).length;
  const refresh = async () => {
    if (!currentUserId) return;
    setLoading(true);
    const { data, error } = await supabase.from('chatter_notifications')
      .select('id,notification_type,target_type,target_id,body,is_read,created_at,actor:profiles!chatter_notifications_actor_user_id_fkey(display_name,username,avatar_url)')
      .eq('recipient_user_id', currentUserId).order('created_at', { ascending: false }).limit(30);
    if (error) console.warn('Could not load notifications:', error.message);
    else setNotifications(data || []);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, [currentUserId]);
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase.channel(`notifications:${currentUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chatter_notifications', filter: `recipient_user_id=eq.${currentUserId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUserId]);
  const markRead = async item => {
    if (!item.is_read) {
      const { error } = await supabase.from('chatter_notifications').update({ is_read: true }).eq('id', item.id).eq('recipient_user_id', currentUserId);
      if (error) console.warn('Could not mark notification as read:', error.message);
      else setNotifications(rows => rows.map(row => row.id === item.id ? { ...row, is_read: true } : row));
    }
  };
  return <div className="notification-center">
    <button type="button" className="icon-button notification-trigger" title="Notifications" aria-label="Notifications" onClick={() => { const next = !open; setOpen(next); if (next) refresh(); }}>
      <Bell size={18}/>{unread > 0 && <span className="notification-count">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <div className="notification-popover">
      <div className="notification-popover-head"><b>Notifications</b><span>{unread ? `${unread} unread` : 'All caught up'}</span><button type="button" onClick={() => setOpen(false)} aria-label="Close notifications"><X size={15}/></button></div>
      <div className="notification-items">
        {loading && !notifications.length ? <p className="notification-empty">Loading notifications…</p> : notifications.length ? notifications.map(item => <button type="button" className={`notification-item ${item.is_read ? '' : 'unread'}`} key={item.id} onClick={() => markRead(item)}>
          <span className="notification-avatar">{item.actor?.avatar_url ? <img src={item.actor.avatar_url} alt=""/> : initials(item.actor?.display_name || item.actor?.username || 'C')}</span>
          <span className="notification-copy"><b>{item.actor?.display_name || 'A Chatter member'}</b><small>{item.body}</small><time>{new Date(item.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></span>
          {!item.is_read && <i/>}
        </button>) : <p className="notification-empty">No mentions yet. When someone tags you, they will show up here.</p>}
      </div>
    </div>}
  </div>;
}
