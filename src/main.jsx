import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft, ArrowUp, Bell, Check, CheckCheck, ChevronDown, ChevronLeft, CircleHelp,
  ImagePlus, Info, LogOut, MessageCircle, MoreHorizontal, Paperclip, Pencil,
  Plus, Search, Send, Settings, Smile, Sparkles, User, UserPlus, X, Camera,
  Menu, Moon, Sun, CheckCircle2, Lock, Mail, ShieldCheck, PanelLeftClose, Home, MessageSquare, PlusCircle, UserCircle, BellRing, ArrowRight, Image, FileText, Eye, EyeOff
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from './supabase';
import { AppearanceDashboard, AdminDashboard, DEFAULT_APPEARANCE, APPEARANCE_ACCENTS } from './AppearanceAdmin';
import { AuthScreen, PasswordRecoveryModal } from './AuthFlow';
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
async function compressImage(file, maxWidth=1920, quality=.8) {
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(1,maxWidth/bitmap.width);
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(bitmap.width*scale); canvas.height=Math.round(bitmap.height*scale);
  const ctx=canvas.getContext('2d'); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close?.();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
  if(!blob) throw new Error('Compression failed');
  return new File([blob],file.name.replace(/\.[^.]+$/,'.webp'),{type:'image/webp',lastModified:Date.now()});
}

async function compressAvatarImage(file) {
  const bitmap=await createImageBitmap(file);
  const side=Math.min(bitmap.width,bitmap.height);
  const sx=(bitmap.width-side)/2, sy=(bitmap.height-side)/2;
  const canvas=document.createElement('canvas'); canvas.width=512; canvas.height=512;
  const ctx=canvas.getContext('2d'); ctx.drawImage(bitmap,sx,sy,side,side,0,0,512,512); bitmap.close?.();
  let quality=.86, blob=null;
  do { blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality)); quality-=.08; } while(blob && blob.size>500*1024 && quality>.45);
  if(!blob) throw new Error('Avatar compression failed');
  return new File([blob],'avatar.webp',{type:'image/webp',lastModified:Date.now()});
}


function Avatar({ profile, size = 'md', className = '' }) {
  return <div className={`avatar avatar-${size} ${className}`} style={{ background: profile?.avatar_url ? 'transparent' : avatarColor(profile?.id || profile?.display_name || 'a') }}>
    {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span>{initials(profile?.display_name || profile?.username || 'U')}</span>}
  </div>;
}

function ProfileModal({ profile, onClose, onSave, onSignOut }) {
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [usernameColor, setUsernameColor] = useState(profile?.username_color || '#A3E6D3');
  const [compressMedia, setCompressMedia] = useState(localStorage.getItem('chatter-compress-media') !== 'false');
  const [avatar, setAvatar] = useState(null);
  const [banner, setBanner] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url || '');
  const [bannerPreview, setBannerPreview] = useState(profile?.banner_url || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
    try { await onSave({ displayName, username, bio, usernameColor, compressMedia, avatar, banner }); onClose(); }
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
        <div className="profile-fields"><label>Display name<input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={32} placeholder="Your name" required/></label><label>Username<div className="username-input"><span>@</span><input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} maxLength={24} minLength={3} placeholder="username" required/></div></label><label className="compress-setting"><span>Compress media before upload</span><input type="checkbox" checked={compressMedia} onChange={e=>setCompressMedia(e.target.checked)}/></label><label>About<textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={100} placeholder="A little about you…"/></label><label>Username colour<div className="username-colour-control"><input aria-label="Choose username colour" type="color" value={usernameColor} onChange={e=>setUsernameColor(e.target.value)}/><input aria-label="Username colour HEX" value={usernameColor} onChange={e=>/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)&&setUsernameColor(e.target.value)} maxLength={7}/><span className="username-live-preview" style={{color:usernameColor}}>@{username || 'yourname'}</span></div><div className="colour-presets">{['#A3E6D3','#FF5733','#FFC300','#7B61FF','#42A5F5','#F06292','#8BC34A','#FFFFFF'].map(c=><button type="button" key={c} aria-label={c} style={{background:c}} onClick={()=>setUsernameColor(c)}/>)}</div></label></div>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions"><button type="button" className="text-button danger" onClick={onSignOut}><LogOut size={16}/> Sign out</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}<Check size={16}/></button></div>
      </form>
    </div>
  </div>;
}

function NewChatModal({ profiles, currentUserId, onClose, onStart }) {
  const [query, setQuery] = useState('');
  const matches = profiles.filter(p => p.id !== currentUserId && `${p.display_name} ${p.username}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="modal-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="new-chat-modal">
    <div className="modal-top"><div><div className="eyebrow">FIND YOUR PEOPLE</div><h2>New conversation</h2></div><button className="icon-button" onClick={onClose}><X size={19}/></button></div>
    <div className="search-box"><Search size={16}/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search people or usernames"/></div>
    <div className="people-list">{matches.length ? matches.map(p => <button className="person-row" key={p.id} onClick={() => onStart(p)}><Avatar profile={p}/><span className="person-info"><strong>{p.display_name}</strong><small>@{p.username || 'new-user'}{p.bio ? ` · ${p.bio}` : ''}</small></span><ArrowUp className="person-arrow" size={16}/></button>) : <div className="empty-search">{query ? 'No people found. Try another name.' : 'No other members yet. Invite someone to join.'}</div>}</div>
  </div></div>;
}

function ChatList({ conversations, activeId, onSelect, profiles, currentProfile, onNewChat, onEditProfile, search, setSearch, loading, mobileBack }) {
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
      return <button key={c.id} className={`chat-row ${active ? 'selected' : ''}`} onClick={() => onSelect(c)}>
        <div className="avatar-holder"><Avatar profile={other} size="lg"/><i className="online-dot"/></div>
        <div className="chat-row-copy"><div className="chat-row-top"><strong>{other.display_name}</strong><time>{timeLabel(c.last_message?.created_at || c.updated_at)}</time></div><div className="chat-row-bottom"><span>{c.last_message?.sender_id === currentProfile?.id ? 'You: ' : ''}{c.last_message?.content || 'Say hello 👋'}</span>{c.unread_count > 0 && <b className="unread-badge">{c.unread_count}</b>}</div></div>
      </button>;
    }) : <div className="empty-list"><div className="empty-icon"><MessageCircle size={21}/></div><strong>{search ? 'No matches' : 'No conversations yet'}</strong><p>{search ? 'Try a different search.' : 'Start a conversation with someone.'}</p>{!search && <button className="text-button" onClick={onNewChat}>Find people <ArrowUp size={14}/></button>}</div>}</div>
    <div className="sidebar-bottom"><div className="secure-note"><span className="secure-icon"><ShieldCheck size={14}/></span><span><strong>Your space is private</strong><small>Only you and your people.</small></span></div><div className="sidebar-user-foot"><span>MADE FOR GOOD CONVERSATIONS</span><button className="icon-button" onClick={onEditProfile}><Settings size={16}/></button></div></div>
  </aside>;
}

function MessageBubble({ message, mine }) {
  return <div className={`message-line ${mine ? 'mine' : 'theirs'}`}><div className={`message-bubble ${mine ? 'bubble-mine' : 'bubble-theirs'}`}>
    {message.deleted_at ? <span className="deleted-message">This message was deleted</span> : <>{message.attachment_url && (message.attachment_type?.startsWith('image/') ? <a className="message-attachment-image" href={message.attachment_url} target="_blank" rel="noreferrer"><img src={message.attachment_url} alt={message.attachment_name || 'Shared image'}/></a> : message.attachment_type?.startsWith('video/') ? <video className="message-attachment-video" src={message.attachment_url} controls playsInline/> : <a className="message-attachment-file" href={message.attachment_url} target="_blank" rel="noreferrer"><FileText size={18}/><span>{message.attachment_name || 'Download file'}</span><ArrowUp size={13}/></a>)}{message.content && (!message.attachment_url || message.content !== message.attachment_name) && <span>{message.content}</span>}</>}
    <div className="message-meta"><time>{timeLabel(message.created_at)}</time>{mine && <CheckCheck size={14} className="read-tick"/>}</div>
  </div></div>;
}

function ChatPanel({ conversation, other, currentProfile, messages, onSend, onSendFile, loading, isMobile, onBack, onOpenProfile }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const endRef = useRef(null); const inputRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, conversation?.id]);
  useEffect(() => { setDraft(''); setShowDetails(false); setSelectedFile(null); setFilePreview(''); }, [conversation?.id]);
  const chooseFile = async file => {
    if (!file) return;
    let chosen=file;
    const autoCompress=localStorage.getItem('chatter-compress-media') !== 'false';
    if (file.type.startsWith('image/') && autoCompress && file.size <= 5*1024*1024) { try { const smaller=await compressImage(file); if(smaller.size<file.size) chosen=smaller; } catch {} }
    if (file.size > 5*1024*1024) {
      const compress = window.confirm('File too big, compress?');
      if (!compress) return;
      if (!file.type.startsWith('image/')) { window.alert('Only images can be compressed in this version. Please choose a file under 5 MB.'); return; }
      try { chosen=await compressImage(file); } catch { window.alert('Could not compress this image.'); return; }
      if (chosen.size > 5*1024*1024) { window.alert('The compressed image is still over 5 MB. Choose a smaller image.'); return; }
    }
    setSelectedFile(chosen);
    setFilePreview(chosen.type.startsWith('image/') ? URL.createObjectURL(chosen) : '');
  };
  const submit = async e => { e.preventDefault(); const value = draft.trim(); if ((!value && !selectedFile) || sending || uploading) return; setSending(true); try { if(selectedFile){setUploading(true);await onSendFile(selectedFile,value);setSelectedFile(null);setFilePreview('');} else await onSend(value); setDraft(''); } catch (e) { window.alert(e.message || 'Message could not be sent.'); } finally { setSending(false);setUploading(false); inputRef.current?.focus(); } };
  if (!conversation) return <main className="chat-placeholder"><div className="placeholder-art"><div className="art-orbit orbit-a"/><div className="art-orbit orbit-b"/><div className="art-core"><MessageCircle size={35} fill="currentColor"/></div><span className="art-spark spark-a">✳</span><span className="art-spark spark-b">✦</span></div><div className="placeholder-copy"><span className="eyebrow">A LITTLE CLOSER</span><h2>Every good story<br/>starts with <em>hello.</em></h2><p>Choose a conversation or find someone new to talk to.</p></div><div className="placeholder-footer"><Lock size={13}/> Your messages stay between you and the people you chat with.</div></main>;
  return <main className="chat-panel">
    <header className="chat-header"><div className="chat-header-person"><button className="icon-button mobile-back" onClick={onBack}><ArrowLeft size={19}/></button><button className="header-avatar-button" onClick={onOpenProfile}><Avatar profile={other} size="md"/></button><button className="header-person-copy" onClick={onOpenProfile}><strong>{other?.display_name || 'Chatter user'}</strong><small><i className="online-dot"/> <span style={{color:other?.username_color || '#A3E6D3'}}>@{other?.username || 'member'}</span></small></button></div><div className="chat-header-actions"><span className="header-divider"/><button className="icon-button" onClick={() => setShowDetails(v => !v)} title="Conversation details"><Info size={18}/></button></div></header>
    <div className="chat-body" onClick={() => showDetails && setShowDetails(false)}>
      <div className="day-divider"><span>YOUR CONVERSATION</span></div>
      {loading ? <div className="messages-loading">Loading messages…</div> : <>{!messages.length && <div className="start-card"><div className="start-avatar"><Avatar profile={other} size="xl"/></div><strong>{other?.display_name || 'Chatter user'}</strong><span>@{other?.username || 'member'}</span>{other?.bio && <p>{other.bio}</p>}<small>This is the beginning of your conversation.</small><button className="text-button" onClick={onOpenProfile}>View profile <ArrowUp size={13}/></button></div>}{messages.map(m => <MessageBubble key={m.id} message={m} mine={m.sender_id === currentProfile?.id}/>)}</>}
      <div ref={endRef}/>
    </div>
    <form className="composer" onSubmit={submit}>
      {selectedFile && <div className="attachment-preview">{filePreview ? <img src={filePreview} alt="Preview"/> : <FileText size={19}/>}<span><b>{selectedFile.name}</b><small>{(selectedFile.size/1024/1024).toFixed(2)} MB · Ready to send</small></span><button type="button" className="icon-button" onClick={()=>{setSelectedFile(null);setFilePreview('');}}><X size={16}/></button></div>}
      {uploading && <div className="upload-progress"><i/></div>}
      <input ref={fileInputRef} type="file" hidden accept="image/*,video/mp4,video/webm,image/gif,application/pdf,text/plain" onChange={e=>{chooseFile(e.target.files?.[0]);e.target.value='';}}/>
      <div className="composer-inner"><button type="button" className="composer-tool" title="Attach media (5 MB max)" onClick={()=>fileInputRef.current?.click()}><Paperclip size={19}/></button><textarea ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e); } }} rows={1} placeholder={`Message ${other?.display_name || 'your friend'}…`} maxLength={4000}/><button type="button" className="composer-tool emoji-tool" title="Emoji" onClick={() => setDraft(d => d + ' 😊')}><Smile size={19}/></button><button className="send-button" disabled={(!draft.trim()&&!selectedFile) || sending} title="Send message"><Send size={16}/></button></div><div className="composer-hint"><span>Up to 5 MB · Images, videos, GIFs, PDF, TXT</span><span>{draft.length}/4000</span></div></form>
    {showDetails && <div className="details-popover"><div className="details-banner" style={other?.banner_url ? {backgroundImage:`url(${other.banner_url})`} : {}}/><Avatar profile={other} size="xl"/><h3>{other?.display_name}</h3><span style={{color:other?.username_color || '#A3E6D3'}}>@{other?.username}</span><p>{other?.bio || 'No bio yet.'}</p><button className="text-button" onClick={() => {setShowDetails(false);onOpenProfile();}}>View profile <ArrowUp size={13}/></button></div>}
  </main>;
}

function PublicProfileModal({ profile, onClose }) {
  return <div className="modal-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="public-profile-modal"><button className="icon-button public-close" onClick={onClose}><X size={18}/></button><div className="public-banner" style={profile?.banner_url ? {backgroundImage:`url(${profile.banner_url})`} : {}}/><div className="public-profile-content"><Avatar profile={profile} size="xl"/><h2>{profile?.display_name}</h2><span style={{color:profile?.username_color || '#A3E6D3'}}>@{profile?.username}</span><p>{profile?.bio || 'A Chatter member.'}</p></div></div></div>;
}


function HomeDashboard({ profile, conversations, profiles, onOpenChats, onNewChat, onEditProfile, onCreate }) {
  const recent = conversations.slice(0, 3);
  return <section className="home-dashboard">
    <div className="home-welcome"><div><span className="eyebrow">YOUR SPACE, YOUR PEOPLE</span><h1>Good to see you, <em>{profile?.display_name?.split(' ')[0] || 'friend'}.</em></h1><p>A little hello can make someone's day.</p></div><div className="welcome-orb"><MessageCircle size={31}/><span>✦</span></div></div>
    <div className="home-quick-actions"><button className="quick-action primary" onClick={onNewChat}><span><Plus size={19}/></span><b>New chat</b><small>Say hello to someone</small></button><button className="quick-action" onClick={onOpenChats}><span><MessageSquare size={19}/></span><b>Messages</b><small>Pick up where you left off</small></button><button className="quick-action" onClick={onEditProfile}><span><UserCircle size={19}/></span><b>Your profile</b><small>Make it yours</small></button></div>
    <div className="home-feed-heading"><div><span className="eyebrow">YOUR COMMUNITY</span><h2>Your feed</h2><p>Little updates from the people you care about.</p></div><button className="primary-button" onClick={onCreate}><Plus size={15}/> Create a post</button></div>
    <div className="feed-empty-card"><div className="feed-empty-art"><Sparkles size={24}/></div><div><b>Your feed is ready for good moments.</b><p>When your friends share updates, they’ll show up here. Start by sharing something yourself.</p><button className="text-button" onClick={onCreate}>Share your first update <ArrowRight size={14}/></button></div></div>
    <div className="home-section-heading"><div><span className="eyebrow">KEEP IN TOUCH</span><h2>Recent conversations</h2></div><button className="text-button" onClick={onOpenChats}>View all <ArrowRight size={14}/></button></div>
    {recent.length ? <div className="home-recent-list">{recent.map(c => { const person=profiles[c.other_id] || {}; return <button className="home-recent-row" key={c.id} onClick={onOpenChats}><Avatar profile={person} size="lg"/><span><b>{person.display_name || 'Chatter member'}</b><small>{c.last_message?.content || 'Start a conversation'}</small></span><time>{timeLabel(c.last_message?.created_at || c.updated_at)}</time><ArrowRight size={15}/></button>; })}</div> : <div className="home-empty"><div className="empty-icon"><MessageCircle size={21}/></div><b>Your conversations start here</b><p>Find a friend and start your first Chatter conversation.</p><button className="primary-button" onClick={onNewChat}>Find people <ArrowRight size={15}/></button></div>}
    <div className="home-note"><div className="home-note-icon"><ShieldCheck size={18}/></div><div><b>A calmer corner of the internet.</b><p>Chatter is made for meaningful conversations, without the noise.</p></div></div>
  </section>;
}
function CreateDashboard({ onNewChat }) { return <section className="simple-dashboard"><span className="eyebrow">MAKE SOMETHING HAPPEN</span><h1>Create <em>something.</em></h1><p>Share a moment or start a conversation. More ways to create are coming soon.</p><div className="create-options"><button onClick={onNewChat}><span><MessageSquare size={21}/></span><b>Start a conversation</b><small>Send a message to someone</small><ArrowRight size={16}/></button><button onClick={onNewChat}><span><Image size={21}/></span><b>Share a moment</b><small>Media posts are coming next</small><ArrowRight size={16}/></button></div></section>; }

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [conversations, setConversations] = useState([]);
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
    let cancelled = false;
    if (!profile?.id || !supabase) { setIsAdmin(false); return; }
    supabase.from('chatter_admins').select('user_id').eq('user_id', profile.id).maybeSingle()
      .then(({ data, error }) => { if (!cancelled) setIsAdmin(!error && Boolean(data)); });
    return () => { cancelled = true; };
  }, [profile?.id]);

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
    if (!active?.id) { setMessages([]); return; }
    let alive = true; setLoadingMessages(true);
    (async () => {
      const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', active.id).order('created_at', {ascending:true}).limit(200);
      if (error) { notify(error.message); } else if (alive) {
        const hydrated = await Promise.all((data || []).map(async message => {
          if (!message.attachment_url) return message;
          const { data: signed } = await supabase.storage.from('chat-media').createSignedUrl(message.attachment_url, 3600);
          return { ...message, attachment_url: signed?.signedUrl || null };
        }));
        if (alive) setMessages(hydrated);
      }
      if (alive) setLoadingMessages(false);
      await supabase.from('conversation_members').update({last_read_at:new Date().toISOString()}).eq('conversation_id', active.id).eq('user_id', profile.id);
      loadConversations(profile.id, false);
    })();
    const hydrateRealtimeMessage = async message => {
      if (!message.attachment_url) return message;
      const { data: signed } = await supabase.storage.from('chat-media').createSignedUrl(message.attachment_url, 3600);
      return { ...message, attachment_url: signed?.signedUrl || null };
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
      const { data: existing, error: findErr } = await supabase.from('conversations').select('*').eq('user_one', ids[0]).eq('user_two', ids[1]).maybeSingle();
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
      setActive({...conversation, other_id:person.id}); setShowNewChat(false); setMobileChatOpen(true);
    } catch (e) { notify(e.message || 'Could not start conversation.'); }
  };

  const sendMessage = async content => {
    const { data, error } = await supabase.from('messages').insert({ conversation_id:active.id, sender_id:profile.id, content }).select().single();
    if (error) throw error;
    setMessages(current => current.some(m => m.id === data.id) ? current : [...current, data]);
    loadConversations(profile.id, false);
  };

  const sendAttachment = async (file, caption='') => {
    if(file.size>5*1024*1024) throw new Error('Files must be 5 MB or smaller.');
    const ext=(file.name.split('.').pop()||'bin').toLowerCase();
    const path=`${profile.id}/${active.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const {error:uploadError}=await supabase.storage.from('chat-media').upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});
    if(uploadError) throw uploadError;
    const {data,error}=await supabase.from('messages').insert({
      conversation_id:active.id,sender_id:profile.id,content:caption || file.name,
      attachment_url:path,attachment_name:file.name,attachment_type:file.type,attachment_size:file.size
    }).select().single();
    if(error) throw error;
    const {data:signed}=await supabase.storage.from('chat-media').createSignedUrl(path,3600);
    const localMessage={...data,attachment_url:signed?.signedUrl||null};
    setMessages(current=>current.some(m=>m.id===data.id)?current:[...current,localMessage]);
    loadConversations(profile.id,false);
  };

  const saveProfile = async changes => {
    localStorage.setItem('chatter-compress-media', String(changes.compressMedia));
    let avatarUrl = profile.avatar_url; let bannerUrl = profile.banner_url;
    const upload = async (file, kind) => {
      if (!file) return null;
      if (kind==='avatar' && changes.compressMedia && file.type.startsWith('image/')) file=await compressAvatarImage(file);
      if (file.size>5*1024*1024) throw new Error('Profile images must be 5 MB or smaller.');
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${profile.id}/${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('profile-media').upload(path, file, { contentType:file.type, cacheControl:'3600', upsert:false });
      if (error) throw error;
      return supabase.storage.from('profile-media').getPublicUrl(path).data.publicUrl;
    };
    const [newAvatar,newBanner] = await Promise.all([upload(changes.avatar,'avatar'),upload(changes.banner,'banner')]);
    if (newAvatar) avatarUrl = newAvatar; if (newBanner) bannerUrl = newBanner;
    const username = changes.username.trim().toLowerCase();
    const { data, error } = await supabase.from('profiles').update({ display_name:changes.displayName.trim(), username, bio:changes.bio.trim(), username_color:changes.usernameColor, avatar_url:avatarUrl, banner_url:bannerUrl, updated_at:new Date().toISOString() }).eq('id',profile.id).select().single();
    if (error) throw error;
    setProfile(data); setProfiles(prev => ({...prev,[data.id]:data})); notify('Profile updated.');
  };

  const signOut = async () => { await supabase.auth.signOut(); setShowProfile(false); setActive(null); setMobileChatOpen(false); };

  if (!isSupabaseConfigured) return <div className="setup-screen"><div className="setup-card"><div className="brand-mark"><MessageCircle size={23} fill="currentColor"/><span>chatter</span><i/></div><span className="eyebrow">ALMOST READY</span><h1>Connect your<br/><em>Supabase project.</em></h1><p>This app is ready for a Supabase backend. Add your project URL and publishable key to the environment file to turn on sign-in, profiles, and live messaging.</p><div className="setup-steps"><div><b>01</b><span>Create a Supabase project</span></div><div><b>02</b><span>Run <code>supabase/schema.sql</code></span></div><div><b>03</b><span>Copy values into <code>.env.local</code></span></div></div><div className="setup-note"><Info size={15}/> Never put your Supabase service-role key in this frontend.</div></div></div>;
  if (authLoading) return <div className="loading-screen"><div className="brand-symbol"><MessageCircle size={18} fill="currentColor"/></div><span>Getting your space ready…</span></div>;
  if (!session) return <AuthScreen/>;
  const activeOther = active ? profiles[active.other_id] : null;
  const allProfiles = Object.values(profiles);

  const openNewChat = async () => { const {data,error}=await supabase.from('profiles').select('*').order('display_name').limit(100); if(error) notify(error.message); else {setProfiles(prev=>({...prev,...Object.fromEntries((data||[]).map(p=>[p.id,p]))}));setShowNewChat(true);} };
  const openConversation = c => { setActive(c); setMobileChatOpen(true); setActiveTab('chats'); };
  const tabs = [{id:'home',label:'Home',icon:Home},{id:'chats',label:'Chats',icon:MessageSquare},{id:'create',label:'Create',icon:PlusCircle},{id:'appearance',label:'Appearance',icon:Palette},{id:'profile',label:'Profile',icon:UserCircle},...(isAdmin?[{id:'admin',label:'Admin',icon:Shield}]:[])];
  return <div className={`chatter-app ${lightMode ? 'light-mode' : ''} ${appearance.motion==='off'?'no-motion':''}`}
    data-density={appearance.density} data-wallpaper={appearance.wallpaper} data-bubble-style={appearance.bubbleStyle} data-font={appearance.font}
    style={{'--mint':accent.primary,'--mint2':accent.strong,'--mint-dim':accent.dim}}>
    <header className="app-topbar"><button className="topbar-brand" onClick={()=>{setActiveTab('home');setMobileChatOpen(false);}}><span className="brand-symbol"><MessageCircle size={17} fill="currentColor"/></span><b>chatter</b><i>YOUR SPACE</i></button><div className="topbar-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search conversations and people"/><kbd>⌘ K</kbd></div><div className="topbar-actions"><button className="icon-button" title="Notifications" onClick={()=>notify('You’re all caught up.')}><Bell size={18}/></button><button className="icon-button" title={lightMode?'Switch to dark mode':'Switch to light mode'} onClick={()=>setAppearance(v=>({...v,theme:lightMode?'dark':'light'}))}>{lightMode?<Moon size={18}/>:<Sun size={18}/>}</button><button className="topbar-profile" onClick={()=>setActiveTab('profile')}><Avatar profile={profile} size="sm"/></button></div></header>
    <div className="app-content"><nav className="desktop-nav">{tabs.map(t=><button key={t.id} className={activeTab===t.id?'active':''} onClick={()=>{setActiveTab(t.id);setMobileChatOpen(false);}}><t.icon size={18}/><span>{t.label}</span>{t.id==='chats'&&conversations.some(c=>c.unread_count>0)&&<i/>}</button>)}<div className="desktop-nav-foot"><ShieldCheck size={15}/><span>Private by design</span></div></nav>
      <main className="app-main">
        {activeTab==='home'&&<HomeDashboard profile={profile} conversations={conversations} profiles={profiles} onOpenChats={()=>setActiveTab('chats')} onNewChat={openNewChat} onEditProfile={()=>setActiveTab('profile')} onCreate={()=>setActiveTab('create')}/>}
        {activeTab==='chats'&&<div className={`chat-workspace ${mobileChatOpen?'mobile-open':''}`}><ChatList conversations={conversations} activeId={active?.id} onSelect={openConversation} profiles={profiles} currentProfile={profile} onNewChat={openNewChat} onEditProfile={()=>setActiveTab('profile')} search={search} setSearch={setSearch} loading={loadingChats}/><div className={`main-stage ${mobileChatOpen?'mobile-open':''}`}><ChatPanel conversation={active} other={activeOther} currentProfile={profile} messages={messages} onSend={sendMessage} onSendFile={sendAttachment} loading={loadingMessages} isMobile={mobileChatOpen} onBack={()=>setMobileChatOpen(false)} onOpenProfile={()=>activeOther&&setViewProfile(activeOther)}/></div></div>}
        {activeTab==='create'&&<CreateDashboard onNewChat={openNewChat}/>}
        {activeTab==='appearance'&&<AppearanceDashboard appearance={appearance} onChange={setAppearance} onReset={()=>{setAppearance(DEFAULT_APPEARANCE);notify('Appearance reset for this browser.');}}/>}
        {activeTab==='admin'&&isAdmin&&<AdminDashboard onlineUsers={onlineUsers} currentUserId={profile?.id} onNotify={notify}/>}
        {activeTab==='profile'&&<section className="profile-dashboard"><span className="eyebrow">YOUR ACCOUNT</span><h1>Your <em>profile.</em></h1><div className="profile-dashboard-card"><div className="profile-dashboard-banner" style={profile?.banner_url?{backgroundImage:`url(${profile.banner_url})`}:{}}/><div className="profile-dashboard-info"><Avatar profile={profile} size="xl"/><div><h2>{profile?.display_name}</h2><span style={{color:profile?.username_color || '#A3E6D3'}}>@{profile?.username}</span><p>{profile?.bio||'Add a little about yourself.'}</p></div><button className="primary-button" onClick={()=>setShowProfile(true)}><Settings size={15}/> Edit profile</button></div></div><button className="profile-signout" onClick={signOut}><LogOut size={16}/> Sign out</button></section>}
      </main></div>
    <nav className="mobile-bottom-nav">{tabs.map(t=><button key={t.id} className={activeTab===t.id?'active':''} onClick={()=>{setActiveTab(t.id);setMobileChatOpen(false);}}><t.icon size={20}/><span>{t.label}</span></button>)}</nav>
    {showProfile&&<ProfileModal profile={profile} onClose={()=>setShowProfile(false)} onSave={saveProfile} onSignOut={signOut}/>}
    {showPasswordRecovery&&<PasswordRecoveryModal onClose={()=>setShowPasswordRecovery(false)} onNotify={notify}/>}
    {showNewChat&&<NewChatModal profiles={allProfiles} currentUserId={profile.id} onClose={()=>setShowNewChat(false)} onStart={startConversation}/>}
    {viewProfile&&<PublicProfileModal profile={viewProfile} onClose={()=>setViewProfile(null)}/>}
    {toast&&<div className="toast"><CheckCircle2 size={16}/>{toast}</div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
