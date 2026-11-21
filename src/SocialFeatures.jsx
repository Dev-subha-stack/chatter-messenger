import React, { useEffect, useRef, useState } from 'react';
import { Heart, Repeat2, MessageCircle, CornerDownRight, Send, Smile, Trash2, X, Bell, ImagePlus, Search, Plus, Check, BarChart3, Volume2, BellRing } from 'lucide-react';
import { supabase } from './supabase';
import { compressMediaFile } from './mediaCompressor';
import InlineVideoPlayer from './InlineVideoPlayer';

const WEB_PUSH_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || '';
const base64UrlToUint8Array = value => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binary = window.atob(base64);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
};


const initials = (name = '?') => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || '?';
const mentionIds = (text, profiles, currentUserId) => {
  const handles = [...String(text || '').matchAll(/@([a-z0-9_]+)/gi)].map(match => match[1].toLowerCase());
  return Object.values(profiles || {}).filter(person => person.id !== currentUserId && handles.includes(String(person.username || '').toLowerCase())).map(person => person.id);
};
export function renderRichContent(text, customEmojis = []) {
  const emojiByCode = new Map((customEmojis || []).map(item => [String(item.shortcode || '').toLowerCase(), item]));
  return String(text || '').split(/(@[a-z0-9_]+|:[a-z0-9_]{2,24}:)/gi).map((part, index) => {
    if (/^@[a-z0-9_]+$/i.test(part)) return <span className="mention-token" key={index}>{part}</span>;
    const match = part.match(/^:([a-z0-9_]{2,24}):$/i);
    if (!match) return part;
    const item = emojiByCode.get(match[1].toLowerCase());
    if (!item) return part;
    return item.image_url
      ? <img className="inline-custom-emoji" key={index} src={item.image_url} alt={part} title={part} loading="lazy"/>
      : (item.emoji || part);
  });
}

const EMOJI_SEARCH_NAMES = {
  '😀':'grinning smile happy', '😃':'grin happy smile', '😄':'smile eyes happy', '😁':'beaming grin', '😆':'laughing squint', '😅':'sweat laugh', '😂':'laugh tears joy', '🙂':'smile slightly happy', '😉':'wink', '😊':'blush smile', '🥰':'love hearts face', '😍':'heart eyes love', '🤩':'star struck excited', '😘':'kiss', '🥲':'happy tears', '😋':'yum tasty', '😛':'tongue', '🤪':'zany silly', '🤗':'hug', '🤔':'thinking', '😐':'neutral', '🙄':'eye roll', '😏':'smirk', '😔':'sad', '😭':'cry sob tears', '😴':'sleep tired', '🤯':'mind blown', '🥳':'party celebration', '😎':'cool sunglasses', '🤓':'nerd glasses', '👍':'thumbs up like approve', '👎':'thumbs down dislike', '👏':'clap applause', '🙌':'hooray hands', '🫶':'heart hands', '🙏':'please thanks pray', '💪':'strong muscle', '❤️':'red heart love', '💔':'broken heart', '💕':'two hearts', '🔥':'fire hot', '✨':'sparkles shine', '⭐':'star', '⚡':'lightning', '🎉':'party popper celebration', '🎊':'confetti', '🎈':'balloon', '💯':'hundred perfect', '✅':'check mark done', '❌':'cross no', '💀':'skull', '🤡':'clown', '💩':'poop', '👻':'ghost', '🤖':'robot', '🎮':'video game', '🍕':'pizza', '🍔':'burger hamburger', '🍟':'fries', '🍎':'apple', '🍌':'banana', '🍉':'watermelon', '☕':'coffee', '🧋':'bubble tea', '🚀':'rocket', '🚗':'car', '✈️':'airplane', '🌈':'rainbow', '☀️':'sun', '🌙':'moon', '🐱':'cat', '🐶':'dog', '🦊':'fox', '🐼':'panda', '🦄':'unicorn', '🐸':'frog', '🦋':'butterfly', '🌹':'rose', '💐':'flowers', '🎂':'birthday cake', '🎁':'gift present', '💻':'laptop computer', '📱':'phone mobile'
};
const EMOJI_GROUPS = [
  { label: 'Smileys', icons: '😀 😃 😄 😁 😆 😅 😂 🙂 🙃 🫠 😉 😊 😇 🥰 😍 🤩 😘 😗 ☺️ 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🫡 🤭 🫢 🫣 🤫 🤔 🫤 😐 😑 😶 🫥 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐'.split(' ') },
  { label: 'People', icons: '👋 🤚 🖐️ ✋ 🖖 🫱 🫲 🫳 🫴 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🙏 💪 🦾 🖖 🫂 👀 👁️ 👶 🧒 👦 👧 🧑 👨 👩 🧔 👱 🧓 👴 👵'.split(' ') },
  { label: 'Animals', icons: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🦋 🐌 🐞 🐜 🪲 🦗 🕷️ 🦂 🐢 🐍 🦎 🐙 🦑 🦀 🐡 🐠 🐬 🦈 🐳 🐊 🐅 🐆 🦓 🦍 🦧 🐘 🦛 🦏 🐪 🐫 🦒 🦘 🦬 🐄 🐎 🐖 🐑 🐐 🦌 🐕 🐈'.split(' ') },
  { label: 'Food', icons: '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🫒 🥑 🍆 🥔 🥕 🌽 🌶️ 🫑 🥒 🥬 🥦 🧄 🧅 🍄 🥜 🫘 🌰 🍞 🥐 🥖 🫓 🥨 🥯 🥞 🧇 🧀 🍖 🍗 🥩 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🫔 🥙 🧆 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍘 🍥 🥠 🥮 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥛 ☕ 🧋 🧃 🥤 🧊'.split(' ') },
  { label: 'Travel', icons: '🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🛵 🏍️ 🚲 🛴 🛹 🛼 🚏 🛣️ 🛤️ 🚦 🚥 🚧 ⚓ ⛵ 🚤 🛳️ ⛴️ 🚢 ✈️ 🛩️ 🛫 🛬 🪂 💺 🚁 🚟 🚠 🚡 🛰️ 🚀 🛸 🌍 🌎 🌏 🗺️ 🧭 🏔️ ⛰️ 🌋 🗻 🏕️ 🏖️ 🏜️ 🏝️ 🏞️ 🏟️ 🏛️ 🏗️ 🏘️ 🏙️ 🌆 🌇 🌉 🌌'.split(' ') },
  { label: 'Activities', icons: '⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🏋️ 🤼 🤸 ⛹️ 🤺 🏇 🧘 🏄 🏊 🤽 🚣 🧗 🚵 🚴 🏆 🥇 🥈 🥉 🏅 🎖️ 🎗️ 🎟️ 🎫 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🪕 🎻 🎲 ♟️ 🎯 🎳 🎮 🕹️'.split(' ') },
  { label: 'Objects', icons: '⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 🖲️ 💽 💾 💿 📀 📷 📸 📹 🎥 📞 ☎️ 📺 📻 🎙️ 🎚️ 🎛️ 🧭 ⏱️ ⏰ ⌛ 📡 🔋 🪫 🔌 💡 🔦 🕯️ 🪔 🧯 🛢️ 💸 💵 💴 💶 💷 💰 💳 🪙 💎 ⚖️ 🧰 🔧 🔨 ⚒️ 🛠️ ⛏️ 🪚 🔩 ⚙️ 🧱 🪜 🧲 🪟 🪞 🛏️ 🛋️ 🚪 🧴 🧹 🧺 🧻 🚽 🪠 🧼 🪥 🧽 🧯 🛒'.split(' ') },
  { label: 'Symbols', icons: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 🕎 ☯️ ☦️ 🛐 ⛎ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 ⚛️ 🉑 ☢️ ☣️ 📴 📳 🈶 🈚 🈸 🈺 🈷️ ✴️ 🆚 💯 🔥 ✨ ⭐ 🌟 💫 ⚡ ☄️ 💥 🎉 🎊 🎈 🎀 🏳️‍🌈 🏴‍☠️ 🚩'.split(' ') },
];

export function EmojiPicker({ customEmojis = [], onSelect }) {
  const [category, setCategory] = useState('Smileys');
  const [query, setQuery] = useState('');
  const selectedGroup = EMOJI_GROUPS.find(group => group.label === category) || EMOJI_GROUPS[0];
  const allBuiltIn = EMOJI_GROUPS.flatMap(group => group.icons).filter((emoji, index, all) => all.indexOf(emoji) === index);
  const needle = query.trim().toLowerCase();
  const filtered = needle ? allBuiltIn.filter(emoji => emoji.includes(needle) || (EMOJI_SEARCH_NAMES[emoji] || '').includes(needle)) : selectedGroup.icons;
  const visibleCustom = (customEmojis || []).filter(item => !needle || `:${item.shortcode}:`.toLowerCase().includes(needle) || String(item.emoji || '').includes(needle));
  return <div className="emoji-picker-panel" role="dialog" aria-label="Emoji picker">
    <div className="emoji-picker-search"><Search size={14}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search emojis or custom names…"/></div>
    {!query && <div className="emoji-picker-categories">{EMOJI_GROUPS.map(group => <button type="button" key={group.label} className={category === group.label ? 'active' : ''} onClick={() => setCategory(group.label)}>{group.label}</button>)}</div>}
    <div className="emoji-picker-grid">{filtered.map((emoji, index) => <button type="button" key={`${emoji}-${index}`} title={emoji} onClick={() => onSelect?.(emoji)}>{emoji}</button>)}</div>
    {visibleCustom.length > 0 && <><div className="emoji-picker-section-label">Custom emojis</div><div className="emoji-picker-grid custom">{visibleCustom.map(item => <button type="button" key={item.id} title={`:${item.shortcode}:`} onClick={() => onSelect?.(`:${item.shortcode}:`)}>{item.image_url ? <img src={item.image_url} alt={item.shortcode}/> : item.emoji}</button>)}</div></>}
    {query && filtered.length === 0 && visibleCustom.length === 0 && <p className="emoji-picker-empty">No matching emoji found.</p>}
  </div>;
}

export function PollDraftEditor({ value, onChange, disabled = false }) {
  const draft = value || { question: '', options: ['', ''], allowMultiple: false };
  const update = changes => onChange?.({ ...draft, ...changes });
  const updateOption = (index, option) => update({ options: draft.options.map((item, i) => i === index ? option : item) });
  const addOption = () => { if (draft.options.length < 6) update({ options: [...draft.options, ''] }); };
  const removeOption = index => { if (draft.options.length > 2) update({ options: draft.options.filter((_, i) => i !== index) }); };
  return <div className="poll-draft-editor">
    <label>Poll question<input value={draft.question} maxLength={180} onChange={event => update({ question: event.target.value })} placeholder="Ask your community…" disabled={disabled}/></label>
    <div className="poll-draft-options">{draft.options.map((option, index) => <div className="poll-draft-option" key={index}><span>{String.fromCharCode(65 + index)}</span><input value={option} maxLength={100} onChange={event => updateOption(index, event.target.value)} placeholder={`Option ${index + 1}`} disabled={disabled}/>{draft.options.length > 2 && <button type="button" onClick={() => removeOption(index)} disabled={disabled} aria-label={`Remove option ${index + 1}`}><X size={14}/></button>}</div>)}</div>
    <div className="poll-draft-footer"><button type="button" className="poll-add-option" onClick={addOption} disabled={disabled || draft.options.length >= 6}><Plus size={13}/> Add option</button><label className="poll-multiple-toggle"><input type="checkbox" checked={Boolean(draft.allowMultiple)} onChange={event => update({ allowMultiple: event.target.checked })} disabled={disabled}/> Allow multiple choices</label></div>
    <small>2–6 options · One vote per person unless multiple choices are enabled</small>
  </div>;
}

export function PollCard({ poll, currentUserId }) {
  const [votes, setVotes] = useState(poll?.votes || []);
  const [busyOption, setBusyOption] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    setVotes(poll?.votes || []);
    if (!poll?.id) return;
    let alive = true;
    const refresh = async () => {
      const { data, error: queryError } = await supabase.from('chatter_poll_votes').select('poll_id,option_id,user_id').eq('poll_id', poll.id);
      if (alive && !queryError) setVotes(data || []);
    };
    refresh();
    const channel = supabase.channel(`poll-votes:${poll.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chatter_poll_votes', filter: `poll_id=eq.${poll.id}` }, refresh)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [poll?.id]);
  if (!poll) return null;
  const total = votes.length;
  const selected = new Set(votes.filter(vote => vote.user_id === currentUserId).map(vote => vote.option_id));
  const closed = Boolean(poll.closes_at && new Date(poll.closes_at).getTime() <= Date.now());
  const vote = async optionId => {
    if (busyOption || closed) return;
    setBusyOption(optionId); setError('');
    const { error: voteError } = await supabase.rpc('toggle_chatter_poll_vote', { p_poll_id: poll.id, p_option_id: optionId });
    if (voteError) setError(voteError.message || 'Your vote could not be saved.');
    else {
      const { data } = await supabase.from('chatter_poll_votes').select('poll_id,option_id,user_id').eq('poll_id', poll.id);
      setVotes(data || []);
    }
    setBusyOption('');
  };
  return <section className="poll-card">
    <div className="poll-card-heading"><BarChart3 size={16}/><b>{poll.question}</b></div>
    <div className="poll-card-options">{(poll.options || []).map(option => {
      const count = votes.filter(item => item.option_id === option.id).length;
      const percent = total ? Math.round(count / total * 100) : 0;
      return <button type="button" key={option.id} className={`poll-option-result ${selected.has(option.id) ? 'selected' : ''}`} onClick={() => vote(option.id)} disabled={closed || Boolean(busyOption)} aria-pressed={selected.has(option.id)}>
        <span className="poll-option-label"><i>{selected.has(option.id) ? <Check size={11}/> : null}</i>{option.option_text}<b>{percent}%</b></span>
        <span className="poll-option-track"><i style={{ width: `${percent}%` }}/></span>
        <small>{count} vote{count === 1 ? '' : 's'}</small>
      </button>;
    })}</div>
    <div className="poll-card-footer"><span>{total} vote{total === 1 ? '' : 's'} · {poll.allow_multiple ? 'Multiple choices' : 'Choose one'}</span><span>{closed ? 'Poll closed' : 'Tap an option to vote'}</span></div>
    {error && <small className="poll-error">{error}</small>}
  </section>;
}

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
  const [commentLikes, setCommentLikes] = useState([]);
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
    if (!commentResult.error) {
      const nextComments = commentResult.data || [];
      setComments(nextComments);
      if (nextComments.length) {
        const { data: likedComments, error: commentLikesError } = await supabase.from('post_comment_likes').select('comment_id,user_id').in('comment_id', nextComments.map(item => item.id));
        if (!commentLikesError) setCommentLikes(likedComments || []);
      } else setCommentLikes([]);
    }
    if (!likeResult.error) setLikes(likeResult.data || []);
    if (!repostResult.error) setReposts(repostResult.data || []);
  };
  useEffect(() => {
    load();
    const channel = supabase.channel(`comment-likes:${post.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comment_likes' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments', filter: `post_id=eq.${post.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [post.id]);

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
  const toggleCommentLike = async comment => {
    const mine = commentLikes.some(row => row.comment_id === comment.id && row.user_id === currentUserId);
    const result = mine
      ? await supabase.from('post_comment_likes').delete().eq('comment_id', comment.id).eq('user_id', currentUserId)
      : await supabase.from('post_comment_likes').insert({ comment_id: comment.id, user_id: currentUserId });
    if (result.error) { setError(result.error.message); return; }
    setCommentLikes(rows => mine ? rows.filter(row => !(row.comment_id === comment.id && row.user_id === currentUserId)) : [...rows, { comment_id: comment.id, user_id: currentUserId }]);
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
        <div className="post-comment-copy"><b>{comment.author?.display_name || 'Chatter member'}</b><p>{renderRichContent(comment.content, customEmojis)}</p><small>{new Date(comment.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small><div className="post-comment-actions-inline"><button type="button" className={`comment-like-button ${commentLikes.some(row => row.comment_id === comment.id && row.user_id === currentUserId) ? 'liked' : ''}`} onClick={() => toggleCommentLike(comment)} aria-pressed={commentLikes.some(row => row.comment_id === comment.id && row.user_id === currentUserId)} aria-label={commentLikes.some(row => row.comment_id === comment.id && row.user_id === currentUserId) ? 'Unlike comment' : 'Like comment'}><Heart size={13} fill={commentLikes.some(row => row.comment_id === comment.id && row.user_id === currentUserId) ? 'currentColor' : 'none'}/><span>{commentLikes.some(row => row.comment_id === comment.id && row.user_id === currentUserId) ? 'Liked' : 'Like'}</span><b>{commentLikes.filter(row => row.comment_id === comment.id).length}</b></button><button type="button" className="comment-reply-button" onClick={() => { setReplyTo(comment); setShowComments(true); }}><CornerDownRight size={13}/> Reply</button></div></div>
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
    {post.content && <p className="post-content">{renderRichContent(post.content, customEmojis)}</p>}
    {post.poll && <PollCard poll={post.poll} currentUserId={currentUserId}/>}
    {post.media_url && image && <button type="button" className="post-media-open media-open-button" onClick={() => onOpenMedia?.({src:post.media_url,type:'image',name:post.media_name})}><img className="post-media-preview" src={post.media_url} alt={post.media_name || 'Post image'}/></button>}
    {post.media_url && video && <InlineVideoPlayer src={post.media_url} label={post.media_name || 'Community video'} className="post-inline-player"/>}
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
          <div className="emoji-inline"><button type="button" className="comment-emoji-toggle" onClick={() => setEmojiOpen(value => !value)}><Smile size={16}/></button>{emojiOpen && <EmojiPicker customEmojis={customEmojis} onSelect={addEmoji}/>}</div>
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
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const ownedEmojis = customEmojis.filter(item => item.owner_id === currentUserId);
  const chooseImage = file => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Choose a PNG, JPG, WEBP or GIF image.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Choose an image smaller than 5 MB.'); return; }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError('');
  };
  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);
  const addEmoji = async event => {
    event.preventDefault();
    const clean = shortcode.trim().toLowerCase().replace(/^:/, '').replace(/:$/, '');
    if (!/^[a-z0-9_]{2,24}$/.test(clean) || (!emoji.trim() && !imageFile)) {
      setError('Enter a 2–24 character name and choose an emoji or image.'); return;
    }
    setBusy(true); setError('');
    let imagePath = null;
    try {
      if (imageFile) {
        const compressed = await compressMediaFile(imageFile, { maxDimension: 128, quality: .86, targetBytes: 420 * 1024 });
        const chosen = compressed.file;
        if (chosen.size > 512 * 1024) throw new Error('Emoji images must be 512 KB or smaller after compression.');
        const ext = (chosen.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
        imagePath = `${currentUserId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('custom-emojis').upload(imagePath, chosen, {
          contentType: chosen.type, cacheControl: '3600', upsert: false,
        });
        if (uploadError) throw uploadError;
      }
      const { data, error: insertError } = await supabase.from('user_custom_emojis')
        .insert({ owner_id: currentUserId, shortcode: clean, emoji: emoji.trim() || '🖼️', image_path: imagePath })
        .select().single();
      if (insertError) throw insertError;
      const image_url = imagePath ? supabase.storage.from('custom-emojis').getPublicUrl(imagePath).data.publicUrl : null;
      onChange(current => [...current, { ...data, image_url }]);
      setShortcode(''); setEmoji(''); setImageFile(null);
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      setImagePreview('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (caught) {
      if (imagePath) await supabase.storage.from('custom-emojis').remove([imagePath]);
      setError(caught?.code === '23505' ? 'That emoji name already exists.' : (caught?.message || 'Could not add this emoji.'));
    } finally { setBusy(false); }
  };
  const removeEmoji = async item => {
    setError('');
    const { error: removeError } = await supabase.from('user_custom_emojis').delete().eq('id', item.id).eq('owner_id', currentUserId);
    if (removeError) { setError(removeError.message); return; }
    if (item.image_path) {
      const { error: storageError } = await supabase.storage.from('custom-emojis').remove([item.image_path]);
      if (storageError) console.warn('Could not remove the custom emoji image:', storageError.message);
    }
    onChange(current => current.filter(row => row.id !== item.id));
  };
  return <div className="custom-emoji-settings">
    <div className="appearance-card-title"><Smile size={17}/><div><b>Custom emojis</b><small>Upload personal emoji images for chats and comments. Everyone can see them.</small></div></div>
    <form className="custom-emoji-form" onSubmit={addEmoji}>
      <input value={shortcode} onChange={event => setShortcode(event.target.value)} placeholder="name e.g. sloptube" maxLength={24}/>
      <input value={emoji} onChange={event => setEmoji(event.target.value)} placeholder="Fallback emoji (optional with image)" maxLength={12}/>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={event => { chooseImage(event.target.files?.[0]); event.target.value = ''; }}/>
      <button type="button" className="custom-emoji-image-button" onClick={() => fileRef.current?.click()} disabled={busy}><ImagePlus size={15}/>{imageFile ? 'Change image' : 'Choose image'}</button>
      <button type="submit" className="primary-button" disabled={busy || !shortcode.trim() || (!emoji.trim() && !imageFile)}>{busy ? 'Adding…' : 'Add emoji'}</button>
    </form>
    {imagePreview && <div className="custom-emoji-upload-preview"><img src={imagePreview} alt="Custom emoji preview"/><span>{imageFile?.name}</span><button type="button" onClick={() => { URL.revokeObjectURL(imagePreview); setImagePreview(''); setImageFile(null); if (fileRef.current) fileRef.current.value = ''; }}>Remove image</button></div>}
    {error && <p className="form-error">{error}</p>}
    <div className="custom-emoji-list">{ownedEmojis.map(item => <span className="custom-emoji-chip" key={item.id}>{item.image_url ? <img src={item.image_url} alt={item.shortcode}/> : <b>{item.emoji}</b>}<small>:{item.shortcode}:</small><button type="button" aria-label={`Remove ${item.shortcode}`} onClick={() => removeEmoji(item)}><Trash2 size={13}/></button></span>)}</div>
    {!ownedEmojis.length && <p className="custom-emoji-empty">Your custom emoji collection is empty.</p>}
  </div>;
}

export function NotificationCenter({ currentUserId, onOpenNotification }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('chatter-sound-notifications') !== 'false');
  const [systemEnabled, setSystemEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(() => {
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !WEB_PUSH_PUBLIC_KEY) return 'unsupported';
    return Notification.permission;
  });
  const [pushError, setPushError] = useState('');
  const audioContextRef = useRef(null);
  const unread = notifications.filter(item => !item.is_read).length;

  const playNotificationSound = (force = false) => {
    if (!soundEnabled && !force) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const audio = audioContextRef.current || (audioContextRef.current = new AudioContextClass());
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(760, start);
      oscillator.frequency.exponentialRampToValueAtTime(980, start + 0.075);
      oscillator.frequency.exponentialRampToValueAtTime(690, start + 0.17);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.055, start + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.23);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.24);
    } catch (error) {
      console.warn('Notification sound could not play:', error);
    }
  };

  useEffect(() => {
    if (!currentUserId || notificationPermission === 'unsupported' || notificationPermission === 'denied') return;
    let alive = true;
    (async () => {
      try {
        if (Notification.permission !== 'granted') return;
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return;
        const { data, error } = await supabase.from('chatter_push_subscriptions')
          .select('id,endpoint').eq('user_id', currentUserId);
        if (error) throw error;
        if (alive) setSystemEnabled((data || []).some(row => row.endpoint === subscription.endpoint));
      } catch (error) {
        console.warn('Could not restore the push subscription state:', error);
      }
    })();
    return () => { alive = false; };
  }, [currentUserId, notificationPermission]);

  const toggleSystemNotifications = async enabled => {
    setPushError('');
    if (!currentUserId) return;
    if (!WEB_PUSH_PUBLIC_KEY || typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotificationPermission('unsupported');
      setSystemEnabled(false);
      setPushError('Background push is not configured or supported in this browser.');
      return;
    }
    try {
      if (!enabled) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const { error: removeError } = await supabase.from('chatter_push_subscriptions')
            .delete().eq('user_id', currentUserId).eq('endpoint', subscription.endpoint);
          if (removeError) throw removeError;
          await subscription.unsubscribe();
        }
        setSystemEnabled(false);
        return;
      }

      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
      setNotificationPermission(permission);
      if (permission !== 'granted') {
        setSystemEnabled(false);
        if (permission === 'denied') setPushError('Notifications are blocked. Allow them in your browser or Android site settings, then try again.');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(WEB_PUSH_PUBLIC_KEY),
        });
      }
      const details = subscription.toJSON();
      if (!details || !details.endpoint || !details.keys || !details.keys.p256dh || !details.keys.auth) {
        throw new Error('The browser returned an incomplete push subscription. Try reinstalling Chatter as an app and retry.');
      }
      const { error: saveError } = await supabase.from('chatter_push_subscriptions').upsert({
        user_id: currentUserId,
        endpoint: details.endpoint,
        p256dh: details.keys.p256dh,
        auth: details.keys.auth,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,endpoint' });
      if (saveError) throw saveError;
      setSystemEnabled(true);
      setPushError('');
    } catch (error) {
      console.warn('Could not change the push subscription:', error);
      setPushError(error && error.message ? error.message : 'Could not enable background push notifications.');
      setSystemEnabled(false);
    }
  };

  // Unlock Web Audio on the first user gesture; browsers block unsolicited audio until then.
  useEffect(() => {
    const unlock = () => {
      if (!soundEnabled) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      try {
        const audio = audioContextRef.current || (audioContextRef.current = new AudioContextClass());
        if (audio.state === 'suspended') audio.resume().catch(() => {});
      } catch (error) {
        console.warn('Notification audio is unavailable:', error);
      }
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    return () => document.removeEventListener('pointerdown', unlock);
  }, [soundEnabled]);

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
    const channel = supabase.channel('notifications:' + currentUserId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chatter_notifications', filter: 'recipient_user_id=eq.' + currentUserId }, payload => {
        const notice = payload.new;
        if (notice && notice.recipient_user_id === currentUserId && notice.actor_user_id !== currentUserId) playNotificationSound();
        refresh();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chatter_notifications', filter: 'recipient_user_id=eq.' + currentUserId }, refresh)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chatter_notifications', filter: 'recipient_user_id=eq.' + currentUserId }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUserId, soundEnabled]);
  const markRead = async item => {
    if (!item.is_read) {
      const { error } = await supabase.from('chatter_notifications').update({ is_read: true }).eq('id', item.id).eq('recipient_user_id', currentUserId);
      if (error) console.warn('Could not mark notification as read:', error.message);
      else setNotifications(rows => rows.map(row => row.id === item.id ? { ...row, is_read: true } : row));
    }
  };
  const pushHint = pushError
    || (notificationPermission === 'denied'
      ? 'Notifications are blocked. Allow them in your browser site settings to enable push.'
      : notificationPermission === 'unsupported'
        ? 'Background push needs a supported browser and the configured VAPID public key.'
        : systemEnabled
          ? 'Background push is enabled. Reply opens the correct chat with the message composer ready.'
          : 'Enable push to receive messages when Chatter is in the background or closed.');
  return <div className="notification-center">
    <button type="button" className="icon-button notification-trigger" title="Notifications" aria-label="Notifications" onClick={() => { const next = !open; setOpen(next); if (next) refresh(); }}>
      <Bell size={18}/>{unread > 0 && <span className="notification-count">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <div className="notification-popover">
      <div className="notification-popover-head"><b>Notifications</b><span>{unread ? unread + ' unread' : 'All caught up'}</span><button type="button" onClick={() => setOpen(false)} aria-label="Close notifications"><X size={15}/></button></div>
      <label className="notification-sound-setting"><span><Volume2 size={14}/> Sound alerts</span><input type="checkbox" checked={soundEnabled} onChange={event => {
        const enabled = event.target.checked;
        setSoundEnabled(enabled);
        localStorage.setItem('chatter-sound-notifications', String(enabled));
        if (enabled) playNotificationSound(true);
      }}/></label>
      <label className="notification-sound-setting"><span><BellRing size={14}/> Background push + Reply</span><input type="checkbox" checked={systemEnabled} disabled={notificationPermission === 'unsupported' || notificationPermission === 'denied'} onChange={event => toggleSystemNotifications(event.target.checked)}/></label>
      <p className="notification-permission-hint">{pushHint}</p>
      <div className="notification-items">
        {loading && !notifications.length ? <p className="notification-empty">Loading notifications…</p> : notifications.length ? notifications.map(item => <button type="button" className={'notification-item ' + (item.is_read ? '' : 'unread')} key={item.id} onClick={async () => { await markRead(item); setOpen(false); onOpenNotification && onOpenNotification(item); }}>
          <span className="notification-avatar">{item.actor && item.actor.avatar_url ? <img src={item.actor.avatar_url} alt=""/> : initials((item.actor && (item.actor.display_name || item.actor.username)) || 'C')}</span>
          <span className="notification-copy"><b>{item.actor && item.actor.display_name ? item.actor.display_name : 'A Chatter member'}</b><small>{item.body}</small><time>{new Date(item.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></span>
          {!item.is_read && <i/>}
        </button>) : <p className="notification-empty">No notifications yet. Messages, mentions and new followers will show up here.</p>}
      </div>
    </div>}
  </div>;
}
