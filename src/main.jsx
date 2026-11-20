import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft, ArrowUp, Bell, Check, CheckCheck, ChevronDown, ChevronLeft, CircleHelp,
  ImagePlus, Info, LogOut, MessageCircle, MoreHorizontal, Paperclip, Pencil,
  Plus, Search, Send, Settings, Smile, Sparkles, User, UserPlus, X, Camera, BarChart3,
  Menu, Moon, Sun, CheckCircle2, Lock, Mail, ShieldCheck, Shield, Palette, PanelLeftClose, Home, MessageSquare, PlusCircle, UserCircle, BellRing, ArrowRight, Image, FileText, Eye, EyeOff, Newspaper, Play, Pause, Volume2, VolumeX, Maximize2, CornerDownRight, Trash2
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from './supabase';
import { AppearanceDashboard, AdminDashboard, DEFAULT_APPEARANCE, APPEARANCE_ACCENTS } from './AppearanceAdmin';
import { AuthScreen, PasswordRecoveryModal } from './AuthFlow';
import { compressMediaFile, formatMediaBytes } from './mediaCompressor';
import { SocialPostCard, NotificationCenter, EmojiPicker, PollCard, PollDraftEditor, renderRichContent } from './SocialFeatures';
import './styles.css';

const BRAND = 'Chatter';
const PRODUCTION_AUTH_URL = 'https://chatter22.vercel.app/';
const getAuthRedirectUrl = () => {
  const { hostname, origin } = window.location;
  return hostname === 'localhost' || hostname === '127.0.0.1' ? `${origin}/` : PRODUCTION_AUTH_URL;
};
const FALLBACK_COLORS = ['#397d79', '#6b5dd3', '#bc7651', '#47729d', '#9a5e88', '#8b8f4b'];
const initials = (name = '?') => name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('') || '?';
const timeLabel = value => {
  if (!value) return '';
  const d = new Date(value);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};
const fullTime = value => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
const avatarColor = str => FALLBACK_COLORS[(str || '').charCodeAt(0) % FALLBACK_COLORS.length];
const renderMentions = text => String(text || '').split(/(@[a-z0-9_]+)/gi).map((part, index) => /^@[a-z0-9_]+$/i.test(part) ? <span className="mention-token" key={index}>{part}</span> : part);
const getMentionIds = (text, directory, currentUserId) => {
  const handles = [...String(text || '').matchAll(/@([a-z0-9_]+)/gi)].map(match => match[1].toLowerCase());
  return Object.values(directory || {}).filter(person => person.id !== currentUserId && handles.includes(String(person.username || '').toLowerCase())).map(person => person.id);
};
const safeExternalUrl = value => {
  try {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
};
const hydratePollRows = async rows => {
  const pollIds = [...new Set((rows || []).map(row => row.poll_id).filter(Boolean))];
  if (!pollIds.length) return (rows || []).map(row => ({ ...row, poll: null }));
  const [{ data: polls, error: pollError }, { data: options, error: optionError }] = await Promise.all([
    supabase.from('chatter_polls').select('*').in('id', pollIds),
    supabase.from('chatter_poll_options').select('*').in('poll_id', pollIds).order('position', { ascending: true }),
  ]);
  if (pollError) throw pollError;
  if (optionError) throw optionError;
  const byId = new Map((polls || []).map(poll => [poll.id, { ...poll, options: (options || []).filter(option => option.poll_id === poll.id) }]));
  return (rows || []).map(row => ({ ...row, poll: row.poll_id ? (byId.get(row.poll_id) || null) : null }));
};
function CompressionStatus({ status }) {
  if (!status) return null;
  const active = status.phase === 'compressing';
  const failed = status.phase === 'error';
  const saved = status.savedBytes || 0;
  return <div className={`media-compression-status ${active ? 'is-compressing' : ''} ${failed ? 'is-error' : 'is-done'}`} role="status" aria-live="polite">
    <div className="compression-status-top">
      <span className="compression-status-title">{active ? <><span className="compression-spinner"/> Compressing media on this device…</> : failed ? 'Compression problem' : saved > 0 ? 'Compression complete' : 'Media check complete'}</span>
      <b>{Math.round(status.progress || 0)}%</b>
    </div>
    <div className="compression-track"><span style={{ width: `${Math.max(4, status.progress || 0)}%` }}/></div>
    <small>{status.message}</small>
    {status.originalSize != null && <small className="compression-size-line">Original: {formatMediaBytes(status.originalSize)} · Final: {formatMediaBytes(status.outputSize ?? status.originalSize)}{saved > 0 ? ` · Saved ${formatMediaBytes(saved)}` : ''}</small>}
  </div>;
}

function Avatar({ profile, size = 'md', className = '' }) {
  return <div className={`avatar avatar-${size} ${className}`} style={{ background: profile?.avatar_url ? 'transparent' : avatarColor(profile?.id || profile?.display_name || 'a') }}>
    {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span>{initials(profile?.display_name || profile?.username || 'U')}</span>}
    {profile?.badges?.length > 0 && <span className="avatar-role-badge" title={profile.badges.map(role => role.name).join(', ')}>{profile.badges[0].badge || '✦'}</span>}
  </div>;
}

function ProfileModal({ profile, onClose, onSave, onSignOut }) {
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [bioLinks, setBioLinks] = useState((profile?.bio_links || []).join('\n'));
  const [profileStatus, setProfileStatus] = useState(profile?.profile_status || '');
  const [profileThemeColor, setProfileThemeColor] = useState(profile?.profile_theme_color || '#A3E6D3');
  const [usernameColor, setUsernameColor] = useState(profile?.username_color || '#A3E6D3');
  const [compressMedia, setCompressMedia] = useState(localStorage.getItem('chatter-compress-media') !== 'false');
  const [avatar, setAvatar] = useState(null);
  const [banner, setBanner] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url || '');
  const [bannerPreview, setBannerPreview] = useState(profile?.banner_url || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [compression, setCompression] = useState(null);
  const avatarInput = useRef(null); const bannerInput = useRef(null);

  const readFile = (file, setter, previewSetter) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('Please choose an image smaller than 20 MB.'); return; }
    setter(file); previewSetter(URL.createObjectURL(file)); setError('');
  };
  const save = async e => {
    e.preventDefault(); setBusy(true); setError('');
    if (!/^#[0-9a-fA-F]{6}$/.test(usernameColor)) { setError('Enter a valid 6-digit HEX colour.'); setBusy(false); return; }
    try { await onSave({ displayName, username, bio, bioLinks, profileStatus, profileThemeColor, usernameColor, compressMedia, avatar, banner }, setCompression); onClose(); }
    catch (e2) { setError(e2.message || 'Could not save your profile.'); }
    finally { setBusy(false); }
  };

  return <div className="modal-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className="profile-modal">
      <div className="modal-top"><div><div className="eyebrow">MAKE IT YOURS</div><h2>Your profile</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></div>
      <form onSubmit={save}>
        <div className="banner-editor" style={bannerPreview ? { backgroundImage: `linear-gradient(90deg,rgba(8,17,22,.24),rgba(8,17,22,.08)),url(${bannerPreview})` } : {}}>
          <button type="button" className="banner-edit" onClick={() => bannerInput.current?.click()}><ImagePlus size={15}/> Change banner</button>
          <input ref={bannerInput} type="file" accept="image/*" hidden onChange={e => readFile(e.target.files?.[0], setBanner, setBannerPreview)}/>
        </div>
        <div className="avatar-edit-row"><div className="avatar-wrap"><Avatar profile={{...profile, avatar_url: avatarPreview, display_name: displayName}} size="xl"/><button type="button" className="camera-bubble" onClick={() => avatarInput.current?.click()}><Camera size={14}/></button><input ref={avatarInput} type="file" accept="image/*" hidden onChange={e => readFile(e.target.files?.[0], setAvatar, setAvatarPreview)}/></div><div><strong>{displayName || 'Your name'}</strong><span>Profile photo</span></div></div>
        <div className="profile-fields"><label>Display name<input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={32} placeholder="Your name" required/></label><label>Username<div className="username-input"><span>@</span><input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} maxLength={24} minLength={3} placeholder="username" required/></div></label><label className="compress-setting"><span>Compress photos and videos before upload</span><input type="checkbox" checked={compressMedia} onChange={e=>setCompressMedia(e.target.checked)}/></label><label>About<textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={100} placeholder="A little about you…"/></label><label>Profile links<textarea value={bioLinks} onChange={e => setBioLinks(e.target.value)} rows={3} maxLength={500} placeholder="yourwebsite.com\ninstagram.com/username"/><small className="field-hint">Add up to 5 links, one per line. Links open in a new tab.</small></label><label>Profile status<input value={profileStatus} onChange={e => setProfileStatus(e.target.value)} maxLength={80} placeholder="What are you up to?"/></label><label>Profile theme colour<div className="username-colour-control"><input type="color" aria-label="Profile theme colour" value={profileThemeColor} onChange={e => setProfileThemeColor(e.target.value)}/><span className="username-live-preview" style={{color:profileThemeColor}}>Your profile accent</span></div></label><label>Username colour<div className="username-colour-control"><input aria-label="Choose username colour" type="color" value={usernameColor} onChange={e=>setUsernameColor(e.target.value)}/><input aria-label="Username colour HEX" value={usernameColor} onChange={e=>/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)&&setUsernameColor(e.target.value)} maxLength={7}/><span className="username-live-preview" style={{color:usernameColor}}>@{username || 'yourname'}</span></div><div className="colour-presets">{['#A3E6D3','#FF5733','#FFC300','#7B61FF','#42A5F5','#F06292','#8BC34A','#FFFFFF'].map(c=><button type="button" key={c} aria-label={c} style={{background:c}} onClick={()=>setUsernameColor(c)}/>)}</div></label></div>
        <CompressionStatus status={compression}/>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions"><button type="button" className="text-button danger" onClick={onSignOut}><LogOut size={16}/> Sign out</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}<Check size={16}/></button></div>
      </form>
    </div>
  </div>;
}

function NewChatModal({ profiles, currentUserId, onlineUserIds, onClose, onStart, onViewProfile }) {
  const [query, setQuery] = useState('');
  const matches = profiles.filter(p => p.id !== currentUserId && `${p.display_name} ${p.username}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="modal-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="new-chat-modal">
    <div className="modal-top"><div><div className="eyebrow">FIND YOUR PEOPLE</div><h2>New conversation</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></div>
    <div className="search-box"><Search size={16}/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search people or usernames"/></div>
    <div className="people-list">{matches.length ? matches.map(p => <div className="person-row" key={p.id}><button type="button" className="person-row-main" onClick={() => onStart(p)}><Avatar profile={p}/><span className="person-info"><strong>{p.display_name}</strong><small>@{p.username || 'new-user'} · <span className={onlineUserIds?.has(p.id) ? 'status-online' : 'status-offline'}>{onlineUserIds?.has(p.id) ? 'Online' : 'Offline'}</span>{p.bio ? ` · ${p.bio}` : ''}</small></span><ArrowUp className="person-arrow" size={16}/></button><button type="button" className="person-view-button" onClick={() => onViewProfile?.(p)} title={`View ${p.display_name}'s profile`} aria-label={`View ${p.display_name}'s profile`}><User size={16}/></button></div>) : <div className="empty-search">{query ? 'No people found. Try another name.' : 'No other members yet. Invite someone to join.'}</div>}</div>
  </div></div>;
}

function ChatList({ conversations, activeId, onSelect, profiles, currentProfile, onlineUserIds, onNewChat, onEditProfile, search, setSearch, loading, mobileBack }) {
  const filtered = conversations.filter(c => {
    const other = profiles[c.other_id] || {};
    return `${other.display_name || ''} ${other.username || ''} ${c.last_message?.content || ''}`.toLowerCase().includes(search.toLowerCase());
  });
  return <aside className="sidebar">
    <div className="sidebar-head"><div className="brand-small"><div className="brand-symbol"><MessageCircle size={17} fill="currentColor"/></div><span>chatter</span><span className="beta-chip">BETA</span></div><div className="head-actions"><button className="icon-button" title="New conversation" onClick={onNewChat}><Plus size={19}/></button><button className="icon-button" title="Profile settings" onClick={onEditProfile}><MoreHorizontal size={20}/></button></div></div>
    <button className="my-profile" onClick={onEditProfile}><Avatar profile={currentProfile} size="md"/><span className="my-profile-name"><strong>{currentProfile?.display_name || 'Your profile'}</strong><small>View your profile</small></span><ChevronDown size={16}/></button>
    <div className="list-heading"><div><span>MESSAGES</span><span className="count-pill">{conversations.length}</span></div><button className="new-chat-text" onClick={onNewChat}><UserPlus size={14}/> New chat</button></div>
    <div className="search-box sidebar-search"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations"/><kbd>⌘ K</kbd></div>
    <div className="chat-list">{loading ? <div className="list-state">Loading conversations…</div> : filtered.length ? filtered.map(c => {
      const other = profiles[c.other_id] || { display_name: 'Chatter user' };
      const active = c.id === activeId;
      const isOnline = onlineUserIds?.has(other.id);
      return <button key={c.id} className={`chat-row ${active ? 'selected' : ''}`} onClick={() => onSelect(c)}>
        <div className="avatar-holder"><Avatar profile={other} size="lg"/><i className={isOnline ? 'online-dot' : 'offline-dot'}/></div>
        <div className="chat-row-copy"><div className="chat-row-top"><strong>{other.display_name}</strong><small className={isOnline ? 'status-online' : 'status-offline'}>{isOnline ? 'Online' : 'Offline'}</small><time>{timeLabel(c.last_message?.created_at || c.updated_at)}</time></div><div className="chat-row-bottom"><span>{c.last_message?.sender_id === currentProfile?.id ? 'You: ' : ''}{c.last_message?.content || 'Say hello 👋'}</span>{c.unread_count > 0 && <b className="unread-badge">{c.unread_count}</b>}</div></div>
      </button>;
    }) : <div className="empty-list"><div className="empty-icon"><MessageCircle size={21}/></div><strong>{search ? 'No matches' : 'No conversations yet'}</strong><p>{search ? 'Try a different search.' : 'Start a conversation with someone.'}</p>{!search && <button className="text-button" onClick={onNewChat}>Find people <ArrowUp size={14}/></button>}</div>}</div>
    <div className="sidebar-bottom"><div className="secure-note"><span className="secure-icon"><ShieldCheck size={14}/></span><span><strong>Your space is private</strong><small>Only you and your people.</small></span></div><div className="sidebar-user-foot"><span>MADE FOR GOOD CONVERSATIONS</span><button className="icon-button" onClick={onEditProfile}><Settings size={16}/></button></div></div>
  </aside>;
}

function MessageBubble({ message, mine, onOpenMedia, onReply, replyMessage, onJumpToMessage, currentProfile, other, onEdit, onDelete, customEmojis = [] }) {
  const isImage = message.attachment_type?.startsWith('image/');
  const isVideo = message.attachment_type?.startsWith('video/');
  const [editing,setEditing] = useState(false);
  const [draft,setDraft] = useState(message.content || '');
  const [menuOpen,setMenuOpen] = useState(false);
  const quote = replyMessage || (message.reply_to_message_id ? {id:message.reply_to_message_id,sender_id:message.reply_to_sender_id,content:message.reply_to_content} : null);
  const quotedSenderId = quote?.sender_id || message.reply_to_sender_id;
  const quotedSender = quotedSenderId === currentProfile?.id ? 'You' : (quotedSenderId === other?.id ? (other?.display_name || 'message') : 'message');
  const quotedContent = quote?.deleted_at ? 'This message was deleted' : (quote?.content || message.reply_to_content || quote?.attachment_name || (quote?.attachment_type?.startsWith('image/') ? 'Photo' : quote?.attachment_type?.startsWith('video/') ? 'Video' : 'Original message'));
  const [messageReactions, setMessageReactions] = useState([]);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [reactionBusy, setReactionBusy] = useState(false);
  const reactionChoices = ['❤️','😂','👍','🔥','😮','👏'];
  useEffect(() => {
    if (!message.id) return;
    let alive = true;
    const refresh = async () => {
      const { data, error } = await supabase.from('message_reactions').select('message_id,user_id,emoji').eq('message_id', message.id);
      if (alive && !error) setMessageReactions(data || []);
    };
    refresh();
    const channel = supabase.channel(`message-reactions:${message.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions', filter: `message_id=eq.${message.id}` }, refresh)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [message.id]);
  const toggleReaction = async emoji => {
    if (reactionBusy || message.deleted_at) return;
    setReactionBusy(true); setReactionPickerOpen(false);
    const exists = messageReactions.some(row => row.user_id === currentProfile?.id && row.emoji === emoji);
    const result = exists
      ? await supabase.from('message_reactions').delete().eq('message_id', message.id).eq('user_id', currentProfile.id).eq('emoji', emoji)
      : await supabase.from('message_reactions').insert({ message_id: message.id, user_id: currentProfile.id, emoji });
    if (result.error) window.alert(result.error.message || 'Could not save reaction.');
    else setMessageReactions(rows => exists ? rows.filter(row => !(row.user_id === currentProfile.id && row.emoji === emoji)) : [...rows, { message_id: message.id, user_id: currentProfile.id, emoji }]);
    setReactionBusy(false);
  };
  const saveEdit = async () => {
    const next = draft.trim();
    if (!next || next === message.content) { setEditing(false); return; }
    try { await onEdit?.(message.id,next); setEditing(false); }
    catch (error) { window.alert(error?.message || 'Could not edit this message.'); }
  };
  const deleteThis = async () => {
    setMenuOpen(false);
    if (!window.confirm('Delete this message for everyone in this chat?')) return;
    try { await onDelete?.(message.id); }
    catch (error) { window.alert(error?.message || 'Could not delete this message.'); }
  };
  return <div id={`message-${message.id}`} className={`message-line ${mine ? 'mine' : 'theirs'}`}><div className={`message-bubble ${mine ? 'bubble-mine' : 'bubble-theirs'}`}>
    {quote && <button type="button" className="message-reply-preview" onClick={() => onJumpToMessage?.(quote.id || message.reply_to_message_id)} disabled={!quote.id && !message.reply_to_message_id} title="Jump to original message"><small><CornerDownRight size={11}/> Replying to {quotedSender}</small><span>{renderRichContent(quotedContent, customEmojis)}</span></button>}
    {message.deleted_at ? <span className="deleted-message">This message was deleted</span> : <>
      {message.attachment_url && (isImage
        ? <button type="button" className="message-attachment-image media-open-button" onClick={() => onOpenMedia?.({src:message.attachment_url,type:'image',name:message.attachment_name})}><img src={message.attachment_url} alt={message.attachment_name || 'Shared image'}/></button>
        : isVideo
          ? <button type="button" className="message-video-open media-open-button" onClick={() => onOpenMedia?.({src:message.attachment_url,type:'video',name:message.attachment_name})}><video className="message-attachment-video" src={message.attachment_url} muted playsInline preload="metadata"/><span className="media-play-mark">▶</span></button>
          : <a className="message-attachment-file" href={message.attachment_url} target="_blank" rel="noreferrer"><FileText size={18}/><span>{message.attachment_name || 'Download file'}</span><ArrowUp size={13}/></a>)}
      {editing
        ? <div className="message-edit-box"><textarea value={draft} onChange={event => setDraft(event.target.value)} maxLength={4000} rows={Math.min(5,Math.max(2,draft.split(String.fromCharCode(10)).length))}/><div><button type="button" onClick={() => {setEditing(false);setDraft(message.content || '')}}>Cancel</button><button type="button" onClick={saveEdit} disabled={!draft.trim()}>Save</button></div></div>
        : message.content && message.content !== '📊 Poll' && (!message.attachment_url || message.content !== message.attachment_name) && <span>{renderRichContent(message.content, customEmojis)}</span>}
      {message.poll && <PollCard poll={message.poll} currentUserId={currentProfile?.id}/>}
    </>}
    {messageReactions.length > 0 && <div className="message-reactions" aria-label="Message reactions">{[...new Set(messageReactions.map(row => row.emoji))].map(emoji => { const rows = messageReactions.filter(row => row.emoji === emoji); const mineReaction = rows.some(row => row.user_id === currentProfile?.id); return <button type="button" key={emoji} className={mineReaction ? 'selected' : ''} onClick={() => toggleReaction(emoji)} disabled={reactionBusy} aria-pressed={mineReaction} aria-label={`${emoji}, ${rows.length} reactions`}><span className="reaction-emoji">{emoji}</span><span className="reaction-count">{rows.length}</span></button>; })}</div>}
    <div className="message-meta"><time>{timeLabel(message.created_at)}{message.edited_at && !message.deleted_at ? ' · edited' : ''}</time>{mine && <CheckCheck size={14} className="read-tick"/>}{!message.deleted_at && <div className="message-reaction-picker-wrap"><button type="button" className="message-react-trigger" onClick={() => setReactionPickerOpen(value => !value)} aria-label="React to message" aria-expanded={reactionPickerOpen} title="Add reaction"><Smile size={14}/></button>{reactionPickerOpen && <div className="message-reaction-popover" role="group" aria-label="Choose a reaction">{reactionChoices.map(emoji => <button type="button" key={emoji} onClick={() => toggleReaction(emoji)} aria-label={emoji}>{emoji}</button>)}</div>}</div>}<button type="button" className="message-reply-action" onClick={onReply} title="Reply to message"><CornerDownRight size={13}/></button>{mine && !message.deleted_at && !editing && <div className="message-actions-wrap"><button type="button" className="message-reply-action" title="Message options" onClick={() => setMenuOpen(value => !value)}><MoreHorizontal size={15}/></button>{menuOpen && <div className="message-actions-menu"><button type="button" onClick={() => {setDraft(message.content || '');setEditing(true);setMenuOpen(false)}}><Pencil size={13}/> Edit</button><button type="button" className="danger" onClick={deleteThis}><Trash2 size={13}/> Delete</button></div>}</div>}</div>
  </div></div>;
}

function ChatPanel({ conversation, other, currentProfile, messages, onSend, onSendFile, onEditMessage, onDeleteMessage, loading, isMobile, onBack, onOpenProfile, onOpenMedia, onlineUserIds, wallpaper, onSaveWallpaper, profiles, customEmojis }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showWallpaper, setShowWallpaper] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [compression, setCompression] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pollDraft, setPollDraft] = useState(null);
  const [otherTyping,setOtherTyping] = useState(false);
  const fileInputRef = useRef(null);
  const endRef = useRef(null); const inputRef = useRef(null);
  const typingChannelRef = useRef(null), typingTimerRef = useRef(null), typingOffRef = useRef(null), lastTypingAtRef = useRef(0);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, conversation?.id]);
  useEffect(() => { if(filePreview) URL.revokeObjectURL(filePreview); setDraft(''); setShowDetails(false); setShowWallpaper(false); setSelectedFile(null); setFilePreview(''); setCompression(null); setReplyTo(null); setEmojiOpen(false); setPollDraft(null); }, [conversation?.id]);
  useEffect(() => { if (conversation?.id) inputRef.current?.focus(); }, [conversation?.id]);
  useEffect(() => {
    if (!conversation?.id || !currentProfile?.id) return;
    let alive = true;
    const channel = supabase.channel('typing:' + conversation.id,{config:{broadcast:{self:false}}});
    typingChannelRef.current = channel;
    const clearTyping = () => { setOtherTyping(false); if (typingOffRef.current) window.clearTimeout(typingOffRef.current); };
    channel.on('broadcast',{event:'typing'},({payload}) => {
      if (!alive || payload?.user_id === currentProfile.id) return;
      setOtherTyping(Boolean(payload?.typing));
      if (typingOffRef.current) window.clearTimeout(typingOffRef.current);
      if (payload?.typing) typingOffRef.current = window.setTimeout(clearTyping,2400);
    }).subscribe();
    return () => {
      alive = false;
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      if (typingOffRef.current) window.clearTimeout(typingOffRef.current);
      channel.send({type:'broadcast',event:'typing',payload:{user_id:currentProfile.id,typing:false}}).catch(()=>{});
      typingChannelRef.current = null;
      supabase.removeChannel(channel);
      setOtherTyping(false);
    };
  },[conversation?.id,currentProfile?.id]);
  const updateDraft = value => {
    setDraft(value);
    const channel = typingChannelRef.current;
    if (!channel || !currentProfile?.id) return;
    if (!value.trim()) { channel.send({type:'broadcast',event:'typing',payload:{user_id:currentProfile.id,typing:false}}).catch(()=>{}); return; }
    if (Date.now() - lastTypingAtRef.current > 800) {
      lastTypingAtRef.current = Date.now();
      channel.send({type:'broadcast',event:'typing',payload:{user_id:currentProfile.id,typing:true}}).catch(()=>{});
    }
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => channel.send({type:'broadcast',event:'typing',payload:{user_id:currentProfile.id,typing:false}}).catch(()=>{}),1800);
  };
  const mentionMatch = draft.match(/@([a-z0-9_]*)$/i);
  const mentionCandidates = mentionMatch ? Object.values(profiles || {}).filter(person => person.id !== currentProfile?.id && String(person.username || '').toLowerCase().startsWith(mentionMatch[1].toLowerCase())).slice(0,5) : [];
  const chooseMention = person => setDraft(value => value.replace(/@([a-z0-9_]*)$/i, `@${person.username} `));
  const chooseFile = async file => {
    if (!file) return;
    if (filePreview) URL.revokeObjectURL(filePreview);
    setSelectedFile(null); setFilePreview('');
    setCompression({ phase:'compressing',progress:1,message:'Preparing your attachment…',originalSize:file.size,outputSize:file.size });
    let chosen = file;
    const autoCompress = localStorage.getItem('chatter-compress-media') !== 'false';
    if (autoCompress && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
      try {
        const result = await compressMediaFile(file,{maxDimension:1280,quality:.8,targetBytes:4.5*1024*1024,videoBitsPerSecond:1100000,fps:24,maxVideoSeconds:240,onProgress:setCompression});
        chosen = result.file;
      } catch (caught) {
        setCompression({phase:'error',progress:100,message:caught?.message || 'Could not compress this attachment.'});
        return;
      }
    } else {
      setCompression({phase:'done',progress:100,message:autoCompress?'This file type cannot be recompressed safely. The original file will be used.':'Compression is turned off. The original file will be used.',originalSize:file.size,outputSize:file.size});
    }
    if (chosen.size > 5*1024*1024) {
      setCompression({phase:'error',progress:100,message:`After compression this file is still ${formatMediaBytes(chosen.size)}. Chat attachments have a 5 MB limit. Try a shorter video or smaller image.`,originalSize:file.size,outputSize:chosen.size});
      return;
    }
    setSelectedFile(chosen);
    setFilePreview(chosen.type.startsWith('image/') || chosen.type.startsWith('video/') ? URL.createObjectURL(chosen) : '');
  };
  const submit = async event => {
    event.preventDefault();
    const value = draft.trim();
    if ((!value && !selectedFile && !pollDraft) || sending || uploading || compression?.phase === 'compressing') return;
    if (selectedFile && pollDraft) { window.alert('Send a poll separately from a file attachment.'); return; }
    if (pollDraft && (!pollDraft.question.trim() || pollDraft.options.filter(item => item.trim()).length < 2)) { window.alert('Add a poll question and at least two options.'); return; }
    setSending(true);
    try {
      if (selectedFile) {
        setUploading(true);
        await onSendFile(selectedFile,value,replyTo?.id || null,replyTo || null);
        if (filePreview) URL.revokeObjectURL(filePreview);
        setSelectedFile(null);setFilePreview('');setCompression(null);
      } else await onSend(pollDraft && !value ? '📊 Poll' : value,replyTo?.id || null,replyTo || null,pollDraft);
      setDraft('');setReplyTo(null);setPollDraft(null);updateDraft('');
    } catch (error) { window.alert(error.message || 'Message could not be sent.'); }
    finally { setSending(false);setUploading(false);inputRef.current?.focus(); }
  };
  const jumpToMessage = async messageId => {
    if (!messageId || !conversation?.id) return;
    const scrollToTarget = () => document.getElementById(`message-${messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (document.getElementById(`message-${messageId}`)) { scrollToTarget(); return; }
    const { data, error } = await supabase.from('messages').select('*').eq('id', messageId).eq('conversation_id', conversation.id).maybeSingle();
    if (error || !data) return;
    let hydrated = data;
    if (data.attachment_url) {
      const { data: signed } = await supabase.storage.from('chat-media').createSignedUrl(data.attachment_url, 3600);
      hydrated = { ...data, attachment_url: signed?.signedUrl || null };
    }
    const [withPoll] = await hydratePollRows([hydrated]);
    setMessages(current => [...current.filter(row => row.id !== messageId), withPoll].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
    window.setTimeout(scrollToTarget, 180);
  };
  if (!conversation) return <main className="chat-placeholder"><div className="placeholder-art"><div className="art-orbit orbit-a"/><div className="art-orbit orbit-b"/><div className="art-core"><MessageCircle size={35} fill="currentColor"/></div><span className="art-spark spark-a">✳</span><span className="art-spark spark-b">✦</span></div><div className="placeholder-copy"><span className="eyebrow">A LITTLE CLOSER</span><h2>Every good story<br/>starts with <em>hello.</em></h2><p>Choose a conversation or find someone new to talk to.</p></div><div className="placeholder-footer"><Lock size={13}/> Your messages stay between you and the people you chat with.</div></main>;
  return <main className="chat-panel">
    <header className="chat-header"><div className="chat-header-person"><button className="icon-button mobile-back" onClick={onBack}><ArrowLeft size={19}/></button><button className="header-avatar-button" onClick={onOpenProfile}><Avatar profile={other} size="md"/></button><button className="header-person-copy" onClick={onOpenProfile}><strong>{other?.display_name || 'Chatter user'}</strong><small><i className={otherTyping || onlineUserIds?.has(other?.id) ? 'online-dot' : 'offline-dot'}/> <span className={otherTyping || onlineUserIds?.has(other?.id) ? 'status-online' : 'status-offline'}>{otherTyping ? 'typing…' : (onlineUserIds?.has(other?.id) ? 'Online' : 'Offline')}</span>{!otherTyping && <><span>·</span><span style={{color:other?.username_color || '#A3E6D3'}}>@{other?.username || 'member'}</span></>}</small></button></div><div className="chat-header-actions"><span className="header-divider"/><button className="icon-button" onClick={() => setShowWallpaper(true)} title="Chat wallpaper"><Image size={18}/></button><button className="icon-button" onClick={() => setShowDetails(v => !v)} title="Conversation details"><Info size={18}/></button></div></header>
    <div className="chat-body" data-wallpaper={wallpaper?.theme || 'default'} style={wallpaper?.url ? {backgroundImage:`linear-gradient(rgba(5,12,15,.38),rgba(5,12,15,.38)),url("${wallpaper.url}")`,backgroundSize:'cover',backgroundPosition:'center'} : undefined} onClick={() => showDetails && setShowDetails(false)}>
      <div className="day-divider"><span>YOUR CONVERSATION</span></div>
      {loading ? <div className="messages-loading">Loading messages…</div> : <>{!messages.length && <div className="start-card"><div className="start-avatar"><Avatar profile={other} size="xl"/></div><strong>{other?.display_name || 'Chatter user'}</strong><span>@{other?.username || 'member'}</span>{other?.bio && <p>{other.bio}</p>}<small>This is the beginning of your conversation.</small><button className="text-button" onClick={onOpenProfile}>View profile <ArrowUp size={13}/></button></div>}{messages.map(message => <MessageBubble key={message.id} message={message} mine={message.sender_id === currentProfile?.id} currentProfile={currentProfile} other={other} customEmojis={customEmojis} onEdit={onEditMessage} onDelete={onDeleteMessage} onOpenMedia={onOpenMedia} onReply={() => setReplyTo(message)} onJumpToMessage={jumpToMessage} replyMessage={messages.find(row => row.id === message.reply_to_message_id)}/>)}</>}
      <div ref={endRef}/>
    </div>
    <form className="composer" onSubmit={submit}>
      {selectedFile && <div className="attachment-preview">{filePreview && selectedFile.type.startsWith('image/') ? <img src={filePreview} alt="Preview"/> : filePreview && selectedFile.type.startsWith('video/') ? <video src={filePreview} muted playsInline/> : <FileText size={19}/>}<span><b>{selectedFile.name}</b><small>{formatMediaBytes(selectedFile.size)} · Ready to send</small></span><button type="button" className="icon-button" onClick={()=>{if(filePreview)URL.revokeObjectURL(filePreview);setSelectedFile(null);setFilePreview('');setCompression(null);}}><X size={16}/></button></div>}
      <CompressionStatus status={compression}/>
      {pollDraft && <PollDraftEditor value={pollDraft} onChange={setPollDraft} disabled={sending}/>}
      {replyTo && <div className="replying-strip"><span>Replying to {replyTo.sender_id === currentProfile?.id ? 'your message' : (other?.display_name || 'this person')}: {replyTo.deleted_at ? 'This message was deleted' : (replyTo.content || replyTo.attachment_name || 'Attachment')}</span><button type="button" onClick={() => setReplyTo(null)}><X size={14}/></button></div>}
      {mentionCandidates.length > 0 && <div className="mention-suggestions">{mentionCandidates.map(person => <button type="button" key={person.id} onClick={() => chooseMention(person)}>@{person.username}<small>{person.display_name}</small></button>)}</div>}
      {emojiOpen && <EmojiPicker customEmojis={customEmojis || []} onSelect={value => updateDraft(`${draft}${value}`)}/>}
      {uploading && <div className="upload-progress"><i/></div>}
      <input ref={fileInputRef} type="file" hidden accept="image/*,video/mp4,video/webm,video/quicktime,image/gif,application/pdf,text/plain" onChange={e=>{chooseFile(e.target.files?.[0]);e.target.value='';}}/>
      <div className="composer-inner"><button type="button" className="composer-tool" title="Attach media (5 MB max)" onClick={()=>fileInputRef.current?.click()} disabled={compression?.phase==='compressing'||uploading}><Paperclip size={19}/></button><textarea ref={inputRef} value={draft} onChange={e => updateDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e); } }} rows={1} placeholder={`Message ${other?.display_name || 'your friend'}…`} maxLength={4000}/><button type="button" className="composer-tool" title="Create a poll" disabled={Boolean(selectedFile) || sending} onClick={() => setPollDraft(value => value ? null : ({ question: '', options: ['', ''], allowMultiple: false }))}><BarChart3 size={18}/></button><button type="button" className="composer-tool emoji-tool" title="Emoji" onClick={() => setEmojiOpen(value => !value)}><Smile size={19}/></button><button className="send-button" disabled={(!draft.trim()&&!selectedFile&&!pollDraft) || sending} title="Send message"><Send size={16}/></button></div><div className="composer-hint"><span>Up to 5 MB · Images, videos, GIFs, PDF, TXT</span><span>{draft.length}/4000</span></div></form>
    {showDetails && <div className="details-popover"><div className="details-banner" style={other?.banner_url ? {backgroundImage:`url(${other.banner_url})`} : {}}/><Avatar profile={other} size="xl"/><h3>{other?.display_name}</h3><span style={{color:other?.username_color || '#A3E6D3'}}>@{other?.username}</span><p>{other?.bio || 'No bio yet.'}</p><button className="text-button" onClick={() => {setShowDetails(false);onOpenProfile();}}>View profile <ArrowUp size={13}/></button></div>}
    {showWallpaper && <ChatWallpaperModal wallpaper={wallpaper} onClose={() => setShowWallpaper(false)} onSave={async (value,onProgress) => { await onSaveWallpaper(value,onProgress); setShowWallpaper(false); }}/>}
  </main>;
}


function PublicProfileModal({ profile, onClose, isOnline, currentUserId }) {
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!profile?.id) return;
    let alive = true;
    const load = async () => {
      const [followerResult, followingResult, edgeResult] = await Promise.all([
        supabase.from('user_follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', profile.id),
        supabase.from('user_follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', profile.id),
        currentUserId && currentUserId !== profile.id
          ? supabase.from('user_follows').select('follower_id').eq('follower_id', currentUserId).eq('following_id', profile.id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (!alive) return;
      const failed = followerResult.error || followingResult.error || edgeResult.error;
      if (failed) { setError(failed.message || 'Could not load follow details.'); return; }
      setFollowers(followerResult.count || 0);
      setFollowingCount(followingResult.count || 0);
      setFollowing(Boolean(edgeResult.data));
    };
    load();
    return () => { alive = false; };
  }, [profile?.id, currentUserId]);
  const toggleFollow = async () => {
    if (!currentUserId || !profile?.id || currentUserId === profile.id || busy) return;
    setBusy(true); setError('');
    if (following) {
      const { error: followError } = await supabase.from('user_follows').delete().eq('follower_id', currentUserId).eq('following_id', profile.id);
      if (followError) setError(followError.message);
      else { setFollowing(false); setFollowers(value => Math.max(0, value - 1)); }
    } else {
      const { error: followError } = await supabase.from('user_follows').insert({ follower_id: currentUserId, following_id: profile.id });
      if (followError && followError.code !== '23505') setError(followError.message);
      else {
        setFollowing(true); setFollowers(value => value + 1);
        const { error: noticeError } = await supabase.from('chatter_notifications').insert({
          recipient_user_id: profile.id, actor_user_id: currentUserId, notification_type: 'new_follower',
          target_type: 'profile', target_id: currentUserId, body: 'Started following you.',
        });
        if (noticeError) console.warn('Follower notification could not be saved:', noticeError.message);
      }
    }
    setBusy(false);
  };
  const links = (Array.isArray(profile?.bio_links) ? profile.bio_links : []).map((value, index) => ({ url: safeExternalUrl(value), label: `Link ${index + 1}` })).filter(item => item.url);
  return <div className="modal-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="public-profile-modal"><button className="icon-button public-close" onClick={onClose}><X size={18}/></button><div className="public-banner" style={profile?.banner_url ? {backgroundImage:`url(${profile.banner_url})`} : {background:`linear-gradient(130deg,${profile?.profile_theme_color || '#335951'},#204346)`}}/><div className="public-profile-content" style={{'--profile-accent':profile?.profile_theme_color || '#A3E6D3'}}><Avatar profile={profile} size="xl"/><h2>{profile?.display_name}</h2><span style={{color:profile?.username_color || '#A3E6D3'}}>@{profile?.username}</span><span className={isOnline?'profile-presence status-online':'profile-presence status-offline'}><i className={isOnline?'online-dot':'offline-dot'}/>{isOnline?'Online':'Offline'}</span><div className="profile-follow-stats"><span><b>{followers}</b> followers</span><span><b>{followingCount}</b> following</span></div>{currentUserId !== profile?.id && <button type="button" className={`primary-button profile-follow-button ${following?'is-following':''}`} onClick={toggleFollow} disabled={busy}>{busy?'Please wait…':following?'Following':'Follow'}</button>}<p>{profile?.bio || 'A Chatter member.'}</p>{profile?.profile_status && <small className="public-profile-status">{profile.profile_status}</small>}{links.length > 0 && <div className="profile-bio-links">{links.map((item,index)=><a key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noopener noreferrer"><ArrowUp size={12}/>{new URL(item.url).hostname.replace(/^www\./,'')}</a>)}</div>}{error && <small className="profile-follow-error">{error}</small>}</div></div></div>;
}

function MediaViewer({ media, onClose }) {
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const formatTime = value => `${Math.floor((value || 0) / 60)}:${String(Math.floor((value || 0) % 60)).padStart(2, '0')}`;
  useEffect(() => {
    if (!media) return;
    setPlaying(false); setMuted(true); setVolume(1); setCurrentTime(0); setDuration(0);
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0; }
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [media, onClose]);
  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    try { if (video.paused) await video.play(); else video.pause(); }
    catch (error) { console.warn('Video playback could not start:', error); }
  };
  const setPlaybackPosition = value => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Number(value);
    setCurrentTime(video.currentTime);
  };
  const setVideoVolume = value => {
    const next = Number(value);
    setVolume(next); setMuted(next === 0);
    if (videoRef.current) { videoRef.current.volume = next; videoRef.current.muted = next === 0; }
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen?.();
      else if (videoRef.current?.webkitEnterFullscreen) videoRef.current.webkitEnterFullscreen();
      else await stageRef.current?.requestFullscreen?.();
    } catch (error) { console.warn('Fullscreen is unavailable:', error); }
  };
  if (!media) return null;
  return <div className="media-viewer" role="dialog" aria-modal="true" aria-label={media.name || 'Media preview'} onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <button className="media-viewer-close" onClick={onClose} aria-label="Close media viewer"><X size={22}/></button>
    <div className={`media-viewer-stage ${media.type === 'video' ? 'has-custom-player' : ''}`} ref={stageRef}>
      {media.type === 'video' ? <>
        <video ref={videoRef} src={media.src} muted={muted} playsInline webkit-playsinline="true" preload="metadata" onClick={togglePlay} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime || 0)} onLoadedMetadata={event => setDuration(event.currentTarget.duration || 0)} onVolumeChange={event => { setMuted(event.currentTarget.muted); setVolume(event.currentTarget.volume); }} onEnded={() => setPlaying(false)}/>
        <div className="custom-video-controls" onClick={event => event.stopPropagation()}>
          <button type="button" onClick={togglePlay} aria-label={playing ? 'Pause video' : 'Play video'}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button>
          <span className="video-time">{formatTime(currentTime)}</span>
          <input className="video-seek" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={event => setPlaybackPosition(event.target.value)} aria-label="Seek video"/>
          <span className="video-time">{formatTime(duration)}</span>
          <button type="button" onClick={() => { const next = !muted; setMuted(next); if (videoRef.current) videoRef.current.muted = next; }} aria-label={muted ? 'Unmute video' : 'Mute video'}>{muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}</button>
          <input className="video-volume" type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={event => setVideoVolume(event.target.value)} aria-label="Video volume"/>
          <button type="button" onClick={toggleFullscreen} aria-label="Toggle fullscreen"><Maximize2 size={17}/></button>
        </div>
      </> : <img src={media.src} alt={media.name || 'Photo'}/>}
      {media.name && <span className="media-viewer-name">{media.name}</span>}
    </div>
  </div>;
}

function ChatWallpaperModal({ wallpaper, onClose, onSave }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [compression, setCompression] = useState(null);
  const fileRef = useRef(null);
  const choices = [
    ['default','Classic','#102126'],['midnight','Midnight','#111827'],['forest','Forest','#16372f'],
    ['dusk','Dusk','#32233d'],['rose','Rose','#3a2633'],['paper','Paper','#e9e4d8']
  ];
  const save = async value => {
    setBusy(true); setError('');
    if (!value.file) setCompression(null);
    try { await onSave(value, setCompression); }
    catch (caught) { setError(caught?.message || 'Could not save this wallpaper.'); }
    finally { setBusy(false); }
  };
  return <div className="modal-scrim" onMouseDown={event => event.target === event.currentTarget && !busy && onClose()}>
    <section className="chat-wallpaper-modal">
      <div className="modal-top"><div><span className="eyebrow">MAKE IT YOURS</span><h2>Chat wallpaper</h2></div><button className="icon-button" onClick={onClose} disabled={busy}><X size={18}/></button></div>
      <p>Choose a background for this conversation. It syncs with your account on other devices.</p>
      <div className="wallpaper-choice-grid">{choices.map(([id,label,color])=><button key={id} className={wallpaper?.theme===id?'selected':''} onClick={()=>save({theme:id})} disabled={busy}><span style={{background:color}}/><b>{label}</b></button>)}</div>
      <button className="wallpaper-upload" onClick={()=>fileRef.current?.click()} disabled={busy}><ImagePlus size={17}/>{busy?'Saving…':'Use a photo from your device'}</button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)save({file});}}/>
      <CompressionStatus status={compression}/>
      {error&&<div className="form-error">{error}</div>}
    </section>
  </div>;
}

function PostCard({ post, onOpenMedia }) {
  const author = post.author || {};
  const image = post.media_type?.startsWith('image/');
  const video = post.media_type?.startsWith('video/');
  return <article className="post-card">
    <div className="post-card-head">
      <Avatar profile={author} size="md"/>
      <div className="post-card-author">
        <strong>{author.display_name || 'Chatter member'}</strong>
        <small><span style={{color:author.username_color || '#A3E6D3'}}>@{author.username || 'member'}</span><span className="post-dot">·</span><time dateTime={post.created_at} title={fullTime(post.created_at)}>{timeLabel(post.created_at)}</time></small>
      </div>
    </div>
    {post.content && <p className="post-content">{post.content}</p>}
    {post.media_url && image && <button type="button" className="post-media-open media-open-button" onClick={()=>onOpenMedia?.({src:post.media_url,type:'image',name:post.media_name})}><img className="post-media-preview" src={post.media_url} alt={post.media_name || 'Post image'}/></button>}
    {post.media_url && video && <button type="button" className="post-media-open post-video-open media-open-button" onClick={()=>onOpenMedia?.({src:post.media_url,type:'video',name:post.media_name})}><video className="post-media-preview" src={post.media_url} muted playsInline preload="metadata"/><span className="media-play-mark">▶</span></button>}
  </article>;
}

function PostFeed({ posts, loading, onOpenMedia, currentUserId, profiles, customEmojis }) {
  if (loading && !posts.length) return <div className="post-feed-state">Loading community posts…</div>;
  if (!posts.length) return <div className="feed-empty-card"><div className="feed-empty-art"><Sparkles size={24}/></div><div><b>Your feed is ready for good moments.</b><p>There are no updates yet. Start the conversation by sharing the first post.</p></div></div>;
  return <div className="post-feed">{posts.map(post => <SocialPostCard key={post.id} post={post} onOpenMedia={onOpenMedia} currentUserId={currentUserId} profiles={profiles} customEmojis={customEmojis}/>)}</div>;
}

function HomeDashboard({ profile, conversations, profiles, posts, loadingPosts, onOpenChats, onNewChat, onEditProfile, onCreate, onOpenMedia, onViewPosts, currentUserId, customEmojis }) {
  const recent = conversations.slice(0, 3);
  return <section className="home-dashboard">
    <div className="home-welcome"><div><span className="eyebrow">YOUR SPACE, YOUR PEOPLE</span><h1>Good to see you, <em>{profile?.display_name?.split(' ')[0] || 'friend'}.</em></h1><p>A little hello can make someone's day.</p></div><div className="welcome-orb"><MessageCircle size={31}/><span>✦</span></div></div>
    <div className="home-quick-actions"><button className="quick-action primary" onClick={onNewChat}><span><Plus size={19}/></span><b>New chat</b><small>Say hello to someone</small></button><button className="quick-action" onClick={onOpenChats}><span><MessageSquare size={19}/></span><b>Messages</b><small>Pick up where you left off</small></button><button className="quick-action" onClick={onEditProfile}><span><UserCircle size={19}/></span><b>Your profile</b><small>Make it yours</small></button></div>
    <div className="home-feed-heading"><div><span className="eyebrow">YOUR COMMUNITY</span><h2>Your feed</h2><p>Little updates from the people you care about.</p></div><div className="home-feed-actions"><button className="text-button" onClick={onViewPosts}>View all <ArrowRight size={14}/></button><button className="primary-button" onClick={onCreate}><Plus size={15}/> Create a post</button></div></div>
    <PostFeed posts={posts.slice(0,1)} loading={loadingPosts} onOpenMedia={onOpenMedia} currentUserId={currentUserId} profiles={profiles} customEmojis={customEmojis}/>
    <div className="home-section-heading"><div><span className="eyebrow">KEEP IN TOUCH</span><h2>Recent conversations</h2></div><button className="text-button" onClick={onOpenChats}>View all <ArrowRight size={14}/></button></div>
    {recent.length ? <div className="home-recent-list">{recent.map(c => { const person=profiles[c.other_id] || {}; return <button className="home-recent-row" key={c.id} onClick={onOpenChats}><Avatar profile={person} size="lg"/><span><b>{person.display_name || 'Chatter member'}</b><small>{c.last_message?.content || 'Start a conversation'}</small></span><time>{timeLabel(c.last_message?.created_at || c.updated_at)}</time><ArrowRight size={15}/></button>; })}</div> : <div className="home-empty"><div className="empty-icon"><MessageCircle size={21}/></div><b>Your conversations start here</b><p>Find a friend and start your first Chatter conversation.</p><button className="primary-button" onClick={onNewChat}>Find people <ArrowRight size={15}/></button></div>}
    <div className="home-note"><div className="home-note-icon"><ShieldCheck size={18}/></div><div><b>A calmer corner of the internet.</b><p>Chatter is made for meaningful conversations, without the noise.</p></div></div>
  </section>;
}

function PostDashboard({ profile, posts, loadingPosts, onCreatePost, onOpenMedia, onNewChat, currentUserId, profiles, customEmojis }) {
  const [content, setContent] = useState('');
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [pollDraft, setPollDraft] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [compression, setCompression] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const chooseMedia = async file => {
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { setError('Choose an image or video.'); return; }
    setBusy(true); setError('');
    setCompression({ phase: 'compressing', progress: 1, message: 'Preparing your post media…', originalSize: file.size, outputSize: file.size });
    try {
      let chosen = file;
      if (localStorage.getItem('chatter-compress-media') !== 'false') {
        const result = await compressMediaFile(file, {
          maxDimension: 1920, quality: .8, targetBytes: 27 * 1024 * 1024,
          videoBitsPerSecond: 1900000, fps: 24, maxVideoSeconds: 240,
          onProgress: setCompression,
        });
        chosen = result.file;
      } else {
        setCompression({ phase: 'done', progress: 100, message: 'Compression is turned off. The original media will be uploaded.', originalSize: file.size, outputSize: file.size });
      }
      if (chosen.size > 30 * 1024 * 1024) throw new Error(`This media is still ${formatMediaBytes(chosen.size)}. Posts support files up to 30 MB.`);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setSelectedMedia(chosen);
      setPreviewUrl(URL.createObjectURL(chosen));
    } catch (caught) {
      setCompression({ phase: 'error', progress: 100, message: caught?.message || 'Could not prepare this media.', originalSize: file.size, outputSize: file.size });
      setError(caught?.message || 'Could not prepare this media.');
    } finally {
      setBusy(false);
    }
  };
  const clearMedia = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(''); setSelectedMedia(null); setCompression(null);
  };
  const submit = async event => {
    event.preventDefault();
    const cleaned = content.trim();
    if ((!cleaned && !selectedMedia && !pollDraft) || busy) return;
    if (pollDraft && (!pollDraft.question.trim() || pollDraft.options.filter(item => item.trim()).length < 2)) { setError('Add a poll question and at least two options.'); return; }
    setBusy(true); setError('');
    try { await onCreatePost(cleaned, selectedMedia, pollDraft); setContent(''); clearMedia(); setPollDraft(null); }
    catch (caught) { setError(caught?.message || 'Could not publish your post.'); }
    finally { setBusy(false); }
  };
  return <section className="simple-dashboard create-dashboard">
    <span className="eyebrow">YOUR COMMUNITY</span>
    <h1>Community <em>posts.</em></h1>
    <p>Share text, photos and videos with everyone in your Chatter community.</p>
    <form className="post-composer" onSubmit={submit}>
      <div className="post-composer-head"><Avatar profile={profile} size="md"/><span>Posting as <b>{profile?.display_name || 'you'}</b></span></div>
      <textarea value={content} onChange={event => setContent(event.target.value)} maxLength={1000} rows={4} placeholder="What's happening? Share an update…" aria-label="Write a post"/>
      {pollDraft && <PollDraftEditor value={pollDraft} onChange={setPollDraft} disabled={busy}/>}
      {selectedMedia && <div className="post-composer-media">{selectedMedia.type.startsWith('image/') ? <img src={previewUrl} alt="Post preview"/> : <video src={previewUrl} muted playsInline loop/>}<span>{selectedMedia.name} · {formatMediaBytes(selectedMedia.size)}</span><button type="button" className="icon-button" onClick={clearMedia} aria-label="Remove attachment"><X size={16}/></button></div>}
      <div className="post-composer-footer"><span>{content.length}/1000 · {selectedMedia ? '1 attachment' : 'No attachment'}</span><div><input ref={fileRef} type="file" hidden accept="image/*,video/mp4,video/webm,video/quicktime" onChange={event=>{chooseMedia(event.target.files?.[0]);event.target.value='';}}/><button type="button" className="composer-tool" onClick={()=>fileRef.current?.click()} title="Attach a photo or video" disabled={busy}><ImagePlus size={18}/></button><button type="button" className="composer-tool" title="Create a poll" onClick={()=>setPollDraft(value=>value?null:({question:'',options:['',''],allowMultiple:false}))} disabled={busy}><BarChart3 size={18}/></button><button type="submit" className="primary-button" disabled={(!content.trim()&&!selectedMedia&&!pollDraft)||busy}>{busy ? 'Preparing…' : 'Publish post'}<ArrowUp size={15}/></button></div></div>
      <CompressionStatus status={compression}/>
      {error && <div className="form-error" role="alert">{error}</div>}
    </form>
    <div className="create-feed-heading"><span className="eyebrow">LATEST UPDATES</span><h2>Community feed</h2></div>
    <PostFeed posts={posts} loading={loadingPosts} onOpenMedia={onOpenMedia} currentUserId={currentUserId} profiles={profiles} customEmojis={customEmojis}/>
    <button className="text-button create-chat-link" onClick={onNewChat}><MessageSquare size={15}/> Start a conversation instead</button>
  </section>;
}

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [conversations, setConversations] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [customEmojis, setCustomEmojis] = useState([]);
  const [mediaViewer, setMediaViewer] = useState(null);
  const [chatWallpaper, setChatWallpaper] = useState({ theme: 'default', path: null, url: null });
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [viewProfile, setViewProfile] = useState(null);
  const [search, setSearch] = useState('');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [activeTab, setActiveTab] = useState('home');
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);
  const [appearanceLoadedFor, setAppearanceLoadedFor] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true);
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) { setAppearanceLoadedFor(''); return; }
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(`chatter-appearance:${userId}`) || '{}'); } catch {}
    setAppearance({ ...DEFAULT_APPEARANCE, ...saved });
    setAppearanceLoadedFor(userId);
  }, [session?.user?.id]);
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || appearanceLoadedFor !== userId) return;
    localStorage.setItem(`chatter-appearance:${userId}`, JSON.stringify(appearance));
  }, [appearance, appearanceLoadedFor, session?.user?.id]);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const update = event => setSystemPrefersDark(event.matches);
    setSystemPrefersDark(media.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  const lightMode = appearance.theme === 'light' || (appearance.theme === 'system' && !systemPrefersDark);
  const accent = APPEARANCE_ACCENTS[appearance.accent] || APPEARANCE_ACCENTS.mint;

  const notify = msg => { setToast(msg); window.clearTimeout(notify.timer); notify.timer = window.setTimeout(() => setToast(''), 3000); };

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    let mounted = true;
    let authEventReceived = false;
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      authEventReceived = true;
      if (!mounted) return;
      setSession(newSession);
      if (event === 'PASSWORD_RECOVERY') setShowPasswordRecovery(true);
    });
    const restoreSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!mounted) return;
        if (!authEventReceived) setSession(data?.session || null);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const queryParams = new URLSearchParams(window.location.search);
        if (hashParams.get('type') === 'recovery' || queryParams.get('type') === 'recovery') {
          setShowPasswordRecovery(true);
        }
      } catch (error) {
        console.error('Could not restore the Chatter session:', error);
        if (mounted && !authEventReceived) setSession(null);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };
    restoreSession();
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const loadProfile = useCallback(async user => {
    const base = { id: user.id, display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'New member', username: user.user_metadata?.username || user.email?.split('@')[0] || 'new-member', avatar_url: null, banner_url: null, bio: '' };
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (data) { setProfile(data); return data; }
    const { data: created, error: insertError } = await supabase.from('profiles').insert(base).select().single();
    if (insertError) throw insertError;
    setProfile(created); return created;
  }, []);

  const loadPosts = useCallback(async (showLoader = true) => {
    if (showLoader) setLoadingPosts(true);
    try {
      const { data, error } = await supabase.from('posts')
        .select('id,author_id,content,created_at,media_path,media_type,media_name,media_size,poll_id,author:profiles!posts_author_id_fkey(id,display_name,username,avatar_url,username_color)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const hydrated = await Promise.all((data || []).map(async post => {
        if (!post.media_path) return { ...post, media_url: null };
        const { data: signed } = await supabase.storage.from('post-media').createSignedUrl(post.media_path, 3600);
        return { ...post, media_url: signed?.signedUrl || null };
      }));
      const withPolls = await hydratePollRows(hydrated);
      const authorIds = [...new Set(withPolls.map(post => post.author_id).filter(Boolean))];
      if (authorIds.length) {
        const { data: roleRows } = await supabase.from('profile_roles').select('user_id,role:chatter_roles(id,name,badge,color)').in('user_id', authorIds);
        const badgesByUser = new Map();
        (roleRows || []).forEach(row => badgesByUser.set(row.user_id, [...(badgesByUser.get(row.user_id) || []), row.role].filter(Boolean)));
        withPolls.forEach(post => { post.author = { ...post.author, badges: badgesByUser.get(post.author_id) || [] }; });
      }
      setPosts(withPolls);
    } catch (error) {
      console.error('Could not load Chatter posts:', error);
      notify('Could not load community posts.');
    } finally {
      if (showLoader) setLoadingPosts(false);
    }
  }, []);

  const loadConversations = useCallback(async (userId, showLoader = true) => {
    if (showLoader) setLoadingChats(true);
    try {
      const { data: memberRows, error: memberErr } = await supabase.from('conversation_members').select('conversation_id, last_read_at').eq('user_id', userId);
      if (memberErr) throw memberErr;
      const ids = (memberRows || []).map(r => r.conversation_id);
      if (!ids.length) { setConversations([]); setProfiles(prev => ({...prev})); return; }
      const [{ data: convs, error: convErr }, { data: allMembers, error: allMemberErr }, { data: lastMessages, error: msgErr }] = await Promise.all([
        supabase.from('conversations').select('*').in('id', ids).order('updated_at', { ascending: false }),
        supabase.from('conversation_members').select('conversation_id,user_id').in('conversation_id', ids),
        supabase.from('messages').select('*').in('conversation_id', ids).order('created_at', { ascending: false })
      ]);
      if (convErr) throw convErr; if (allMemberErr) throw allMemberErr; if (msgErr) throw msgErr;
      const otherIds = [...new Set((allMembers || []).filter(m => m.user_id !== userId).map(m => m.user_id))];
      let people = [];
      if (otherIds.length) { const { data, error } = await supabase.from('profiles').select('*').in('id', otherIds); if (error) throw error; people = data || []; }
      if (otherIds.length) {
        const { data: roleRows } = await supabase.from('profile_roles').select('user_id,role:chatter_roles(id,name,badge,color)').in('user_id', otherIds);
        const badgesByUser = new Map();
        (roleRows || []).forEach(row => badgesByUser.set(row.user_id, [...(badgesByUser.get(row.user_id) || []), row.role].filter(Boolean)));
        people = people.map(person => ({ ...person, badges: badgesByUser.get(person.id) || [] }));
      }
      setProfiles(prev => ({...prev, ...Object.fromEntries(people.map(p => [p.id, p]))}));
      const latest = new Map(); for (const m of (lastMessages || [])) if (!latest.has(m.conversation_id)) latest.set(m.conversation_id, m);
      const me = memberRows.reduce((acc, r) => (acc[r.conversation_id] = r.last_read_at, acc), {});
      const next = (convs || []).map(c => {
        const other = (allMembers || []).find(m => m.conversation_id === c.id && m.user_id !== userId);
        const last = latest.get(c.id);
        return {...c, other_id: other?.user_id, last_message: last, unread_count: last && last.sender_id !== userId && (!me[c.id] || new Date(last.created_at) > new Date(me[c.id])) ? 1 : 0};
      }).sort((a,b) => new Date(b.last_message?.created_at || b.updated_at) - new Date(a.last_message?.created_at || a.updated_at));
      setConversations(next);
    } catch (e) { console.error(e); notify('Could not refresh conversations.'); }
    finally { if (showLoader) setLoadingChats(false); }
  }, []);

  useEffect(() => {
    if (!session?.user || !supabase) { setProfile(null); setConversations([]); setActive(null); return; }
    let alive = true;
    (async () => { try { const p = await loadProfile(session.user); if (!alive) return; await loadConversations(p.id); } catch (e) { console.error(e); notify(e.message || 'Could not load your account.'); } })();
    return () => { alive = false; };
  }, [session?.user?.id, loadProfile, loadConversations]);

  useEffect(() => {
    if (!profile?.id || !supabase) return;
    let alive = true;
    (async () => {
      const [{ data: people, error: peopleError }, { data: emojiRows, error: emojiError }] = await Promise.all([
        supabase.from('profiles').select('*').order('display_name').limit(500),
        supabase.from('user_custom_emojis').select('*').order('created_at'),
      ]);
      if (peopleError) throw peopleError;
      if (emojiError) throw emojiError;
      if (!alive) return;
      const ids = (people || []).map(person => person.id);
      let badgeRows = [];
      if (ids.length) {
        const { data, error } = await supabase.from('profile_roles').select('user_id,role:chatter_roles(id,name,badge,color)').in('user_id', ids);
        if (error) throw error;
        badgeRows = data || [];
      }
      const badgesByUser = new Map();
      badgeRows.forEach(row => badgesByUser.set(row.user_id, [...(badgesByUser.get(row.user_id) || []), row.role].filter(Boolean)));
      setProfiles(current => ({ ...current, ...Object.fromEntries((people || []).map(person => [person.id, { ...person, badges: badgesByUser.get(person.id) || [] }])) }));
      const hydrateEmojis = rows => (rows || []).map(item => ({
        ...item,
        image_url: item.image_path ? supabase.storage.from('custom-emojis').getPublicUrl(item.image_path).data.publicUrl : null,
      }));
      setCustomEmojis(hydrateEmojis(emojiRows));
    })().catch(error => console.warn('Could not load member directory or custom emojis:', error));
    const emojiChannel = supabase.channel('chatter:custom-emojis')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_custom_emojis' }, async () => {
        const { data, error } = await supabase.from('user_custom_emojis').select('*').order('created_at');
        if (!alive || error) return;
        setCustomEmojis((data || []).map(item => ({
          ...item,
          image_url: item.image_path ? supabase.storage.from('custom-emojis').getPublicUrl(item.image_path).data.publicUrl : null,
        })));
      }).subscribe();
    return () => { alive = false; supabase.removeChannel(emojiChannel); };
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id || !supabase) {
      setPosts([]);
      setLoadingPosts(false);
      return;
    }
    loadPosts();
    const channel = supabase.channel('chatter:posts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => loadPosts(false))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, loadPosts]);

  useEffect(() => {
    if (!profile?.id || !supabase) return;
    const channel = supabase.channel('chatter:profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, payload => {
        const nextProfile = payload.new;
        if (!nextProfile?.id) return;
        setProfiles(current => ({ ...current, [nextProfile.id]: { ...current[nextProfile.id], ...nextProfile } }));
        setProfile(current => current?.id === nextProfile.id ? { ...current, ...nextProfile } : current);
        setViewProfile(current => current?.id === nextProfile.id ? { ...current, ...nextProfile } : current);
        loadPosts(false);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, loadPosts]);

  useEffect(() => {
    let cancelled = false;
    if (!profile?.id || !supabase) { setIsAdmin(false); return; }
    supabase.from('chatter_admins').select('user_id').eq('user_id', profile.id).maybeSingle()
      .then(({ data, error }) => { if (!cancelled) setIsAdmin(!error && Boolean(data)); });
    return () => { cancelled = true; };
  }, [profile?.id]);

  const onlineUserIds = useMemo(() => new Set(onlineUsers.map(user => user.user_id)), [onlineUsers]);

  useEffect(() => {
    if (!profile?.id || !supabase) { setOnlineUsers([]); return; }
    const presenceKey = `${profile.id}:${window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel('chatter:online', { config: { presence: { key: presenceKey } } });
    const syncOnlineUsers = () => {
      const state = channel.presenceState();
      const unique = new Map();
      Object.values(state).flat().forEach(payload => {
        if (payload?.user_id) unique.set(payload.user_id, payload);
      });
      setOnlineUsers([...unique.values()]);
    };
    channel.on('presence', { event: 'sync' }, syncOnlineUsers)
      .on('presence', { event: 'join' }, syncOnlineUsers)
      .on('presence', { event: 'leave' }, syncOnlineUsers)
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: profile.id,
            display_name: profile.display_name,
            username: profile.username,
            online_at: new Date().toISOString(),
          });
          syncOnlineUsers();
        }
      });
    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [profile?.id, profile?.display_name, profile?.username]);

  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase.channel(`inbox:${profile.id}`).on('postgres_changes', {event:'*', schema:'public', table:'messages'}, () => loadConversations(profile.id, false)).on('postgres_changes', {event:'*', schema:'public', table:'conversation_members', filter:`user_id=eq.${profile.id}`}, () => loadConversations(profile.id, false)).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, loadConversations]);

  useEffect(() => {
    let alive = true;
    if (!active?.id || !profile?.id) { setChatWallpaper({ theme: 'default', path: null, url: null }); return; }
    setChatWallpaper({ theme: 'default', path: null, url: null });
    (async () => {
      const { data, error } = await supabase.from('conversation_members')
        .select('chat_background,chat_background_path')
        .eq('conversation_id', active.id).eq('user_id', profile.id).maybeSingle();
      if (error) { console.warn('Could not load chat wallpaper:', error); return; }
      if (!alive || !data) return;
      let url = null;
      if (data.chat_background_path) {
        const { data: signed } = await supabase.storage.from('chat-media').createSignedUrl(data.chat_background_path, 3600);
        url = signed?.signedUrl || null;
      }
      if (alive) setChatWallpaper({ theme: data.chat_background || 'default', path: data.chat_background_path || null, url });
    })();
    return () => { alive = false; };
  }, [active?.id, profile?.id]);

  useEffect(() => {
    if (!active?.id) { setMessages([]); return; }
    let alive = true; setLoadingMessages(true);
    (async () => {
      const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', active.id).order('created_at', {ascending:true}).limit(200);
      if (error) { notify(error.message); } else if (alive) {
        const hydratedAttachments = await Promise.all((data || []).map(async message => {
          if (!message.attachment_url) return message;
          const { data: signed } = await supabase.storage.from('chat-media').createSignedUrl(message.attachment_url, 3600);
          return { ...message, attachment_url: signed?.signedUrl || null };
        }));
        const hydrated = await hydratePollRows(hydratedAttachments);
        if (alive) setMessages(hydrated);
      }
      if (alive) setLoadingMessages(false);
      await supabase.from('conversation_members').update({last_read_at:new Date().toISOString()}).eq('conversation_id', active.id).eq('user_id', profile.id);
      loadConversations(profile.id, false);
    })();
    const hydrateRealtimeMessage = async message => {
      let hydrated = message;
      if (message.attachment_url) {
        const { data: signed } = await supabase.storage.from('chat-media').createSignedUrl(message.attachment_url, 3600);
        hydrated = { ...message, attachment_url: signed?.signedUrl || null };
      }
      const [withPoll] = await hydratePollRows([hydrated]);
      return withPoll;
    };
    const channel = supabase.channel(`messages:${active.id}`)
      .on('postgres_changes', {event:'INSERT', schema:'public', table:'messages', filter:`conversation_id=eq.${active.id}`}, payload => { hydrateRealtimeMessage(payload.new).then(row => setMessages(current => current.some(m => m.id === row.id) ? current : [...current, row])); })
      .on('postgres_changes', {event:'UPDATE', schema:'public', table:'messages', filter:`conversation_id=eq.${active.id}`}, payload => { hydrateRealtimeMessage(payload.new).then(row => setMessages(current => current.map(m => m.id === row.id ? row : m))); })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [active?.id, profile?.id, loadConversations]);

  const startConversation = async person => {
    try {
      const ids = [profile.id, person.id].sort();
      const { data: existing, error: findErr } = await supabase.from('conversations').select('*').eq('user_one', ids[0]).eq('user_two', ids[1]).order('created_at', { ascending: true }).limit(1).maybeSingle();
      if (findErr) throw findErr;
      let conversation = existing;
      if (!conversation) {
        const { data: created, error: createErr } = await supabase.from('conversations').insert({ user_one:ids[0], user_two:ids[1] }).select().single();
        if (createErr && createErr.code !== '23505') throw createErr;
        if (createErr?.code === '23505') { const { data, error } = await supabase.from('conversations').select('*').eq('user_one',ids[0]).eq('user_two',ids[1]).single(); if(error) throw error; conversation=data; }
        else {
          conversation = created;
          const { error: membersErr } = await supabase.from('conversation_members').insert([{conversation_id:conversation.id,user_id:ids[0]},{conversation_id:conversation.id,user_id:ids[1]}]);
          if (membersErr) throw membersErr;
        }
      }
      setProfiles(prev => ({...prev, [person.id]:person}));
      await loadConversations(profile.id, false);
      setActive({...conversation, other_id:person.id}); setShowNewChat(false); setActiveTab('chats'); setMobileChatOpen(true);
    } catch (e) { notify(e.message || 'Could not start conversation.'); }
  };

  const sendMessage = async (content, replyToId = null, replyTo = null, pollDraft = null) => {
  const mentions = getMentionIds(content, profiles, profile.id);
    const replySnapshot = replyToId ? {
      reply_to_message_id: replyToId,
      reply_to_sender_id: replyTo?.sender_id || null,
      reply_to_content: replyTo?.deleted_at ? 'This message was deleted' : (replyTo?.content || replyTo?.attachment_name || (replyTo?.attachment_type?.startsWith('image/') ? 'Photo' : replyTo?.attachment_type?.startsWith('video/') ? 'Video' : replyTo?.poll ? '📊 Poll' : 'Attachment')),
    } : { reply_to_message_id: null, reply_to_sender_id: null, reply_to_content: null };
    const { data, error } = await supabase.from('messages').insert({ conversation_id:active.id, sender_id:profile.id, content, ...replySnapshot, mentions }).select().single();
    if (error) throw error;
    if (pollDraft) {
      try {
        const messagePoll = await createPoll('message', data.id, pollDraft);
        data.poll_id = messagePoll.id; data.poll = messagePoll;
      } catch (pollError) {
        await supabase.from('messages').delete().eq('id', data.id).eq('sender_id', profile.id);
        throw pollError;
      }
    }
    if (mentions.length) {
      const { error: pingError } = await supabase.from('chatter_notifications').insert(mentions.map(recipient_user_id => ({
        recipient_user_id, actor_user_id: profile.id, notification_type: 'message_mention',
        target_type: 'conversation', target_id: active.id,
        body: `You were mentioned in a message by ${profile.display_name || 'a Chatter member'}.`,
      })));
      if (pingError) console.warn('Message mention notifications were not delivered:', pingError.message);
    }
    if (active?.other_id && active.other_id !== profile.id) {
      const { error: noticeError } = await supabase.from('chatter_notifications').insert({
        recipient_user_id: active.other_id, actor_user_id: profile.id, notification_type: 'new_message',
        target_type: 'conversation', target_id: active.id, body: 'Sent you a message: ' + String(content || '').slice(0,100),
      });
      if (noticeError) console.warn('Message notification could not be saved:', noticeError.message);
    }
    setMessages(current => current.some(m => m.id === data.id) ? current : [...current, data]);
    loadConversations(profile.id, false);
  };

  const createPoll = async (targetType, targetId, draft) => {
    const question = String(draft?.question || '').trim();
    const options = [...new Set((draft?.options || []).map(value => String(value || '').trim()).filter(Boolean))];
    if (!question || options.length < 2 || options.length > 6) throw new Error('Polls need a question and 2–6 different options.');
    const { data: poll, error: pollError } = await supabase.from('chatter_polls').insert({ creator_id: profile.id, target_type: targetType, target_id: targetId, question, allow_multiple: Boolean(draft.allowMultiple) }).select().single();
    if (pollError) throw pollError;
    const { data: optionRows, error: optionError } = await supabase.from('chatter_poll_options').insert(options.map((option_text, position) => ({ poll_id: poll.id, option_text, position }))).select().order('position');
    if (optionError) { await supabase.from('chatter_polls').delete().eq('id', poll.id); throw optionError; }
    const targetTable = targetType === 'post' ? 'posts' : 'messages';
    const { error: linkError } = await supabase.from(targetTable).update({ poll_id: poll.id }).eq('id', targetId);
    if (linkError) { await supabase.from('chatter_polls').delete().eq('id', poll.id); throw linkError; }
    return { ...poll, options: optionRows || [] };
  };

  const createPost = async (content, media, pollDraft = null) => {
    const cleaned = (content || '').trim();
    if (!cleaned && !media && !pollDraft) throw new Error('Write something, attach media or add a poll.');
    const chosen = media || null;
    if (chosen && chosen.size > 30 * 1024 * 1024) throw new Error('Post media must be 30 MB or smaller.');
    let mediaPath = null;
    if (chosen) {
      const ext = (chosen.name.split('.').pop() || 'bin').toLowerCase();
      mediaPath = `${profile.id}/posts/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('post-media').upload(mediaPath, chosen, {
        contentType: chosen.type, cacheControl: '3600', upsert: false
      });
      if (uploadError) throw uploadError;
    }
    const mentions = getMentionIds(cleaned, profiles, profile.id);
    const postContent = cleaned || (pollDraft ? `📊 ${String(pollDraft.question || '').trim()}` : '');
    const { data: createdPost, error } = await supabase.from('posts').insert({
      author_id: profile.id, content: postContent, mentions, media_path: mediaPath,
      media_type: chosen?.type || null, media_name: chosen?.name || null, media_size: chosen?.size || null
    }).select('id').single();
    if (error) {
      if (mediaPath) await supabase.storage.from('post-media').remove([mediaPath]);
      throw error;
    }
    if (pollDraft) {
      try { await createPoll('post', createdPost.id, pollDraft); }
      catch (pollError) {
        await supabase.from('posts').delete().eq('id', createdPost.id).eq('author_id', profile.id);
        if (mediaPath) await supabase.storage.from('post-media').remove([mediaPath]);
        throw pollError;
      }
    }
    if (mentions.length) {
      const { error: pingError } = await supabase.from('chatter_notifications').insert(mentions.map(recipient_user_id => ({
        recipient_user_id, actor_user_id: profile.id, notification_type: 'post_mention',
        target_type: 'post', target_id: createdPost.id,
        body: `You were mentioned in a post by ${profile.display_name || 'a Chatter member'}.`,
      })));
      if (pingError) console.warn('Post mention notifications were not delivered:', pingError.message);
    }
    await loadPosts(false);
    notify('Your post is live.');
  };

  const sendAttachment = async (file, caption='', replyToId=null, replyTo=null) => {
    if(file.size>5*1024*1024) throw new Error('Files must be 5 MB or smaller.');
    const ext=(file.name.split('.').pop()||'bin').toLowerCase();
    const path=`${profile.id}/${active.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const {error:uploadError}=await supabase.storage.from('chat-media').upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});
    if(uploadError) throw uploadError;
    const {data,error}=await supabase.from('messages').insert({
      conversation_id:active.id,sender_id:profile.id,content:caption || file.name,
      attachment_url:path,attachment_name:file.name,attachment_type:file.type,attachment_size:file.size,
      reply_to_message_id:replyToId,
      reply_to_sender_id:replyTo?.sender_id||null,
      reply_to_content:replyToId ? (replyTo?.deleted_at ? 'This message was deleted' : (replyTo?.content||replyTo?.attachment_name||(replyTo?.attachment_type?.startsWith('image/')?'Photo':replyTo?.attachment_type?.startsWith('video/')?'Video':replyTo?.poll?'📊 Poll':'Attachment'))) : null
    }).select().single();
    if(error) throw error;
    if (active?.other_id && active.other_id !== profile.id) {
      const { error: noticeError } = await supabase.from('chatter_notifications').insert({
        recipient_user_id: active.other_id, actor_user_id: profile.id, notification_type: 'new_message',
        target_type: 'conversation', target_id: active.id, body: 'Sent you an attachment: ' + file.name.slice(0,120),
      });
      if (noticeError) console.warn('Attachment notification could not be saved:', noticeError.message);
    }
    const {data:signed}=await supabase.storage.from('chat-media').createSignedUrl(path,3600);
    const localMessage={...data,attachment_url:signed?.signedUrl||null};
    setMessages(current=>current.some(m=>m.id===data.id)?current:[...current,localMessage]);
    loadConversations(profile.id,false);
  };

  const editMessage = async (messageId, content) => {
    const { data, error } = await supabase.from('messages')
      .update({ content, edited_at: new Date().toISOString() })
      .eq('id', messageId).eq('sender_id', profile.id).select().single();
    if (error) throw error;
    setMessages(rows => rows.map(row => row.id === messageId ? { ...row, ...data } : row));
  };

  const deleteMessage = async messageId => {
    const { data, error } = await supabase.from('messages')
      .update({ content: 'Message deleted', deleted_at: new Date().toISOString() })
      .eq('id', messageId).eq('sender_id', profile.id).select().single();
    if (error) throw error;
    setMessages(rows => rows.map(row => row.id === messageId ? { ...row, ...data } : row));
  };

  const saveProfile = async (changes, onCompressionProgress) => {
    localStorage.setItem('chatter-compress-media', String(changes.compressMedia));
    let avatarUrl = profile.avatar_url; let bannerUrl = profile.banner_url;
    const upload = async (file, kind) => {
      if (!file) return null;
      let chosen = file;
      if (changes.compressMedia && file.type.startsWith('image/')) {
        const result = await compressMediaFile(file, {
          maxDimension: kind === 'avatar' ? 512 : 1800,
          cropSquare: kind === 'avatar',
          quality: kind === 'avatar' ? .86 : .82,
          targetBytes: kind === 'avatar' ? 450 * 1024 : 4.5 * 1024 * 1024,
          onProgress: state => onCompressionProgress?.({ ...state, message: `${kind === 'avatar' ? 'Profile photo' : 'Profile banner'} · ${state.message}` }),
        });
        chosen = result.file;
      }
      if (chosen.size > 5 * 1024 * 1024) throw new Error(`${kind === 'avatar' ? 'Profile photos' : 'Profile banners'} must be 5 MB or smaller after compression.`);
      const ext = (chosen.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${profile.id}/${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('profile-media').upload(path, chosen, { contentType:chosen.type, cacheControl:'3600', upsert:false });
      if (error) throw error;
      return supabase.storage.from('profile-media').getPublicUrl(path).data.publicUrl;
    };
    const newAvatar = await upload(changes.avatar, 'avatar');
    const newBanner = await upload(changes.banner, 'banner');
    if (newAvatar) avatarUrl = newAvatar; if (newBanner) bannerUrl = newBanner;
    const username = changes.username.trim().toLowerCase();
    const bioLinks = String(changes.bioLinks || '').split('\n').map(value => value.trim()).filter(Boolean);
    if (bioLinks.length > 5) throw new Error('Add no more than 5 profile links.');
    const safeBioLinks = bioLinks.map(value => {
      const safe = safeExternalUrl(value);
      if (!safe) throw new Error(`This profile link is not a valid web address: ${value}`);
      return safe;
    });
    const { data, error } = await supabase.from('profiles').update({ display_name:changes.displayName.trim(), username, bio:changes.bio.trim(), bio_links:safeBioLinks, profile_status:String(changes.profileStatus || '').trim(), profile_theme_color:changes.profileThemeColor || '#A3E6D3', username_color:changes.usernameColor, avatar_url:avatarUrl, banner_url:bannerUrl, updated_at:new Date().toISOString() }).eq('id',profile.id).select().single();
    if (error) throw error;
    setProfile(data); setProfiles(prev => ({...prev,[data.id]:data})); notify('Profile updated.');
  };

  const saveChatWallpaper = async ({ theme = 'default', file = null }, onCompressionProgress) => {
    if (!active?.id || !profile?.id) throw new Error('Open a conversation first.');
    let path = null;
    if (file) {
      if (!file.type.startsWith('image/')) throw new Error('Choose an image for your chat wallpaper.');
      const result = await compressMediaFile(file, {
        maxDimension: 1600, quality: .8, targetBytes: 4.5 * 1024 * 1024,
        onProgress: state => onCompressionProgress?.({ ...state, message: `Chat wallpaper · ${state.message}` }),
      });
      const chosen = result.file;
      if (chosen.size > 5 * 1024 * 1024) throw new Error('Wallpaper images must be 5 MB or smaller after compression.');
      const ext = (chosen.name.split('.').pop() || 'jpg').toLowerCase();
      path = `${profile.id}/${active.id}/wallpaper-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('chat-media').upload(path, chosen, { contentType: chosen.type, cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;
      theme = 'custom';
    }
    const { error } = await supabase.from('conversation_members').update({
      chat_background: theme, chat_background_path: path
    }).eq('conversation_id', active.id).eq('user_id', profile.id);
    if (error) {
      if (path) await supabase.storage.from('chat-media').remove([path]);
      throw error;
    }
    let url = null;
    if (path) {
      const { data: signed, error: signedError } = await supabase.storage.from('chat-media').createSignedUrl(path, 3600);
      if (signedError) throw signedError;
      url = signed?.signedUrl || null;
    }
    setChatWallpaper({ theme, path, url });
    notify('Chat wallpaper updated.');
  };

  const signOut = async () => { await supabase.auth.signOut(); setShowProfile(false); setActive(null); setMobileChatOpen(false); };

  if (!isSupabaseConfigured) return <div className="setup-screen"><div className="setup-card"><div className="brand-mark"><MessageCircle size={23} fill="currentColor"/><span>chatter</span><i/></div><span className="eyebrow">ALMOST READY</span><h1>Connect your<br/><em>Supabase project.</em></h1><p>This app is ready for a Supabase backend. Add your project URL and publishable key to the environment file to turn on sign-in, profiles, and live messaging.</p><div className="setup-steps"><div><b>01</b><span>Create a Supabase project</span></div><div><b>02</b><span>Run <code>supabase/schema.sql</code></span></div><div><b>03</b><span>Copy values into <code>.env.local</code></span></div></div><div className="setup-note"><Info size={15}/> Never put your Supabase service-role key in this frontend.</div></div></div>;
  if (authLoading) return <div className="loading-screen"><div className="brand-symbol"><MessageCircle size={18} fill="currentColor"/></div><span>Getting your space ready…</span></div>;
  if (!session) return <AuthScreen/>;
  if (!profile || profile.id !== session.user.id) return <div className="loading-screen"><div className="brand-symbol"><MessageCircle size={18} fill="currentColor"/></div><span>Loading your profile…</span></div>;
  const activeOther = active ? profiles[active.other_id] : null;
  const allProfiles = Object.values(profiles);

  const openNewChat = async () => { const {data,error}=await supabase.from('profiles').select('*').order('display_name').limit(100); if(error) notify(error.message); else {setProfiles(prev=>({...prev,...Object.fromEntries((data||[]).map(p=>[p.id,p]))}));setShowNewChat(true);} };
  const openConversation = c => { setActive(c); setMobileChatOpen(true); setActiveTab('chats'); };
  const tabs = [{id:'home',label:'Home',icon:Home},{id:'chats',label:'Chats',icon:MessageSquare},{id:'posts',label:'Posts',icon:Newspaper},{id:'appearance',label:'Settings',icon:Palette},{id:'profile',label:'Profile',icon:UserCircle},...(isAdmin?[{id:'admin',label:'Admin',icon:Shield}]:[])];
  return <div className={`chatter-app ${lightMode ? 'light-mode' : ''} ${appearance.motion==='off'?'no-motion':''}`}
    data-density={appearance.density} data-wallpaper={appearance.wallpaper} data-bubble-style={appearance.bubbleStyle} data-font={appearance.font}
    style={{'--mint':appearance.customAccent || accent.primary,'--mint2':appearance.customAccent || accent.strong,'--mint-dim':accent.dim,'--chat-font-size':`${appearance.messageFontSize || 12}px`}}>
    <header className="app-topbar"><button className="topbar-brand" onClick={()=>{setActiveTab('home');setMobileChatOpen(false);}}><span className="brand-symbol"><MessageCircle size={17} fill="currentColor"/></span><b>chatter</b><i>YOUR SPACE</i></button><div className="topbar-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search conversations and people"/><kbd>⌘ K</kbd></div><div className="topbar-actions"><NotificationCenter currentUserId={profile.id} onOpenNotification={item=>{if(item.target_type==='conversation'){const target=conversations.find(row=>row.id===item.target_id);if(target)openConversation(target)}else if(item.target_type==='profile'){const person=profiles[item.target_id];if(person)setViewProfile(person);else supabase.from('profiles').select('*').eq('id',item.target_id).maybeSingle().then(({data})=>data&&setViewProfile(data))}else if(item.target_type==='post')setActiveTab('posts')}}/><button className="icon-button" title={lightMode?'Switch to dark mode':'Switch to light mode'} onClick={()=>setAppearance(v=>({...v,theme:lightMode?'dark':'light'}))}>{lightMode?<Moon size={18}/>:<Sun size={18}/>}</button><button className="topbar-profile" onClick={()=>setActiveTab('profile')}><Avatar profile={profile} size="sm"/></button></div></header>
    <div className="app-content"><nav className="desktop-nav">{tabs.map(t=><button key={t.id} className={activeTab===t.id?'active':''} onClick={()=>{setActiveTab(t.id);setMobileChatOpen(false);}}><t.icon size={18}/><span>{t.label}</span>{t.id==='chats'&&conversations.some(c=>c.unread_count>0)&&<i/>}</button>)}<div className="desktop-nav-foot"><ShieldCheck size={15}/><span>Private by design</span></div></nav>
      <main className="app-main">
        {activeTab==='home'&&<HomeDashboard profile={profile} conversations={conversations} profiles={profiles} posts={posts} loadingPosts={loadingPosts} currentUserId={profile.id} customEmojis={customEmojis} onOpenChats={()=>setActiveTab('chats')} onNewChat={openNewChat} onEditProfile={()=>setActiveTab('profile')} onCreate={()=>setActiveTab('posts')} onViewPosts={()=>setActiveTab('posts')} onOpenMedia={setMediaViewer}/>} 
        {activeTab==='chats'&&<div className={`chat-workspace ${mobileChatOpen?'mobile-open':''}`}><ChatList conversations={conversations} activeId={active?.id} onSelect={openConversation} profiles={profiles} currentProfile={profile} onlineUserIds={onlineUserIds} onNewChat={openNewChat} onEditProfile={()=>setActiveTab('profile')} search={search} setSearch={setSearch} loading={loadingChats}/><div className={`main-stage ${mobileChatOpen?'mobile-open':''}`}><ChatPanel conversation={active} other={activeOther} currentProfile={profile} messages={messages} profiles={profiles} customEmojis={customEmojis} onSend={sendMessage} onSendFile={sendAttachment} onEditMessage={editMessage} onDeleteMessage={deleteMessage} loading={loadingMessages} isMobile={mobileChatOpen} onBack={()=>setMobileChatOpen(false)} onOpenProfile={()=>activeOther&&setViewProfile(activeOther)} onOpenMedia={setMediaViewer} onlineUserIds={onlineUserIds} wallpaper={chatWallpaper} onSaveWallpaper={saveChatWallpaper}/></div></div>}
        {activeTab==='posts'&&<PostDashboard profile={profile} posts={posts} loadingPosts={loadingPosts} currentUserId={profile.id} profiles={profiles} customEmojis={customEmojis} onCreatePost={createPost} onOpenMedia={setMediaViewer} onNewChat={openNewChat}/>} 
        {activeTab==='appearance'&&<AppearanceDashboard appearance={appearance} onChange={setAppearance} currentUserId={profile.id} customEmojis={customEmojis} onCustomEmojisChange={setCustomEmojis} onReset={()=>{setAppearance(DEFAULT_APPEARANCE);notify('Appearance reset for this browser.');}}/>}
        {activeTab==='admin'&&isAdmin&&<AdminDashboard onlineUsers={onlineUsers} currentUserId={profile?.id} onNotify={notify}/>}
        {activeTab==='profile'&&<section className="profile-dashboard"><span className="eyebrow">YOUR ACCOUNT</span><h1>Your <em>profile.</em></h1><div className="profile-dashboard-card"><div className="profile-dashboard-banner" style={profile?.banner_url?{backgroundImage:`url(${profile.banner_url})`}:{background:`linear-gradient(130deg,${profile?.profile_theme_color || '#34544c'},#1d4140)`}}/><div className="profile-dashboard-info"><Avatar profile={profile} size="xl"/><div><h2>{profile?.display_name}</h2><span style={{color:profile?.username_color || '#A3E6D3'}}>@{profile?.username}</span><p>{profile?.bio||'Add a little about yourself.'}</p>{profile?.profile_status && <small className="profile-dashboard-status">{profile.profile_status}</small>}</div><button className="primary-button" onClick={()=>setShowProfile(true)}><Settings size={15}/> Edit profile</button></div></div><button className="profile-signout" onClick={signOut}><LogOut size={16}/> Sign out</button></section>}
      </main></div>
    <nav className="mobile-bottom-nav">{tabs.map(t=><button key={t.id} className={activeTab===t.id?'active':''} onClick={()=>{setActiveTab(t.id);setMobileChatOpen(false);}}><t.icon size={20}/><span>{t.label}</span></button>)}</nav>
    {showProfile&&<ProfileModal profile={profile} onClose={()=>setShowProfile(false)} onSave={saveProfile} onSignOut={signOut}/>}
    {showPasswordRecovery&&<PasswordRecoveryModal onClose={()=>setShowPasswordRecovery(false)} onNotify={notify}/>}
    {showNewChat&&<NewChatModal profiles={allProfiles} currentUserId={profile.id} onlineUserIds={onlineUserIds} onClose={()=>setShowNewChat(false)} onStart={startConversation} onViewProfile={person=>setViewProfile(person)}/>}
    {viewProfile&&<PublicProfileModal profile={viewProfile} onClose={()=>setViewProfile(null)} isOnline={onlineUserIds.has(viewProfile.id)} currentUserId={profile.id}/>}
    {mediaViewer&&<MediaViewer media={mediaViewer} onClose={()=>setMediaViewer(null)}/>}
    {toast&&<div className="toast"><CheckCircle2 size={16}/>{toast}</div>}
  </div>;
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('Chatter failed to render:', error, info);
  }
  render() {
    if (this.state.error) {
      return <div className="app-crash-fallback">
        <div className="app-crash-card">
          <div className="brand-symbol"><MessageCircle size={18} fill="currentColor"/></div>
          <h1>Chatter hit a problem.</h1>
          <p>The app could not finish loading. Your account and messages have not been deleted.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload Chatter</button>
          <small>{String(this.state.error?.message || 'Unexpected app error').slice(0, 180)}</small>
        </div>
      </div>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(<AppErrorBoundary><App/></AppErrorBoundary>);
