import React, { useEffect, useState } from 'react';
import {
  Activity, Check, Copy, Mail, MessageCircle, Moon, Monitor, Palette, PanelsTopLeft,
  RefreshCw, RotateCcw, Search, ShieldCheck, Sun, Trash2, Type, UserPlus, Users
} from 'lucide-react';
import { supabase } from './supabase';
import { EmojiSettings } from './SocialFeatures';

export const DEFAULT_APPEARANCE = {
  theme: 'dark',
  accent: 'mint',
  density: 'comfortable',
  wallpaper: 'glow',
  bubbleStyle: 'soft',
  font: 'dm',
  motion: 'on',
  customAccent: '',
  messageFontSize: 12,
};

export const APPEARANCE_ACCENTS = {
  mint: { label: 'Mint', primary: '#A3E6D3', strong: '#75CFB5', dim: 'rgba(143,222,198,.11)' },
  blue: { label: 'Ocean blue', primary: '#8FCBFF', strong: '#559EE8', dim: 'rgba(111,180,255,.12)' },
  violet: { label: 'Violet', primary: '#C1A8FF', strong: '#9876E8', dim: 'rgba(170,136,255,.13)' },
  rose: { label: 'Rose', primary: '#FFA9C6', strong: '#E879A3', dim: 'rgba(244,128,173,.12)' },
  amber: { label: 'Amber', primary: '#FFD28A', strong: '#E7A84E', dim: 'rgba(245,185,93,.13)' },
};

const initials = (name = '?') => name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('') || '?';
const timeLabel = value => {
  if (!value) return '';
  const d = new Date(value);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};
const fullTime = value => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';

export function AppearanceDashboard({ appearance, onChange, onReset, currentUserId, customEmojis, onCustomEmojisChange }) {
  const update = (key, value) => onChange(current => ({ ...current, [key]: value }));
  const choices = (items, key) => <div className="appearance-options">{items.map(item => <button type="button" key={item.id} className={appearance[key] === item.id ? 'selected' : ''} onClick={() => update(key, item.id)}>{item.icon || null}<span>{item.label}</span>{appearance[key] === item.id && <Check size={14}/>}</button>)}</div>;
  return <section className="appearance-dashboard">
    <div className="appearance-heading"><div><span className="eyebrow">YOUR DEVICE, YOUR STYLE</span><h1>Make Chatter <em>yours.</em></h1><p>These choices are saved in this browser and do not change how Chatter looks for anyone else.</p></div><button className="appearance-reset" onClick={onReset}><RotateCcw size={15}/> Reset</button></div>
    <div className="appearance-layout">
      <div className="appearance-settings">
        <div className="appearance-card"><div className="appearance-card-title"><Moon size={17}/><div><b>Colour mode</b><small>Choose how the interface is lit</small></div></div>{choices([{id:'dark',label:'Dark',icon:<Moon size={15}/>},{id:'light',label:'Light',icon:<Sun size={15}/>},{id:'system',label:'System',icon:<Monitor size={15}/>}], 'theme')}</div>
        <div className="appearance-card"><div className="appearance-card-title"><Palette size={17}/><div><b>Accent colour</b><small>Buttons, highlights and active states</small></div></div><div className="accent-swatches">{Object.entries(APPEARANCE_ACCENTS).map(([id,p])=><button type="button" key={id} className={appearance.accent===id?'selected':''} onClick={()=>update('accent',id)} title={p.label} aria-label={p.label}><i style={{background:p.primary}}/><span>{p.label}</span>{appearance.accent===id&&<Check size={13}/>}</button>)}</div></div>
        <div className="appearance-card"><div className="appearance-card-title"><PanelsTopLeft size={17}/><div><b>Layout density</b><small>Choose the amount of breathing room</small></div></div>{choices([{id:'comfortable',label:'Comfortable'},{id:'compact',label:'Compact'}], 'density')}</div>
        <div className="appearance-card"><div className="appearance-card-title"><MessageCircle size={17}/><div><b>Message shape</b><small>Change the feel of chat bubbles</small></div></div>{choices([{id:'soft',label:'Soft corners'},{id:'rounded',label:'Pill corners'},{id:'sharp',label:'Square corners'}], 'bubbleStyle')}</div>
        <div className="appearance-card"><div className="appearance-card-title"><Activity size={17}/><div><b>Chat background</b><small>Personalise the conversation canvas</small></div></div>{choices([{id:'glow',label:'Aurora glow'},{id:'plain',label:'Plain'},{id:'grid',label:'Subtle grid'}], 'wallpaper')}</div>
        <div className="appearance-card"><div className="appearance-card-title"><Type size={17}/><div><b>Typeface</b><small>Set the text style for this browser</small></div></div>{choices([{id:'dm',label:'DM Sans'},{id:'manrope',label:'Manrope'},{id:'system',label:'System'}], 'font')}</div>
        <div className="appearance-card"><div className="appearance-card-title"><Activity size={17}/><div><b>Motion effects</b><small>Turn screen animations on or off</small></div></div>{choices([{id:'on',label:'On'},{id:'off',label:'Reduced motion'}], 'motion')}</div>
        <div className="appearance-card"><div className="appearance-card-title"><Palette size={17}/><div><b>Custom accent</b><small>Choose any accent colour for the app</small></div></div><div className="appearance-custom-accent"><input type="color" aria-label="Custom app accent colour" value={appearance.customAccent || APPEARANCE_ACCENTS[appearance.accent]?.primary || '#A3E6D3'} onChange={event => update('customAccent', event.target.value)}/><span>{appearance.customAccent || 'Using preset accent'}</span><button type="button" onClick={() => update('customAccent', '')}>Use preset</button></div></div>
        <div className="appearance-card"><div className="appearance-card-title"><Type size={17}/><div><b>Message text size</b><small>Adjust chat readability</small></div></div><div className="appearance-font-size"><input type="range" min="11" max="17" step="1" value={appearance.messageFontSize || 12} onChange={event => update('messageFontSize', Number(event.target.value))}/><b>{appearance.messageFontSize || 12}px</b></div></div>
        <div className="appearance-card"><EmojiSettings currentUserId={currentUserId} customEmojis={customEmojis || []} onChange={onCustomEmojisChange}/></div>
      </div>
      <aside className="appearance-preview-wrap"><span className="eyebrow">LIVE PREVIEW</span><div className="appearance-preview" data-bubble-style={appearance.bubbleStyle} style={{'--mint':appearance.customAccent || APPEARANCE_ACCENTS[appearance.accent]?.primary || APPEARANCE_ACCENTS.mint.primary}}><div className="preview-top"><span className="preview-avatar">S</span><div><b>Sam</b><small>online now</small></div><i/></div><div className="preview-chat"><div className="preview-bubble theirs">Hey! How's your day going?</div><div className="preview-bubble mine">Pretty good. This looks nice!</div></div><div className="preview-input"><span>Write a message…</span><b>↑</b></div></div><p>Preview reflects your accent colour and message shape.</p></aside>
    </div>
  </section>;
}

export function AdminDashboard({ onlineUsers, currentUserId, onNotify }) {
  const [dashboard, setDashboard] = useState({ users: [], audit: [], stats: { total: 0, verified: 0, joined_last_7_days: 0 } });
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [roleAssignments, setRoleAssignments] = useState([]);
  const [roleName, setRoleName] = useState('');
  const [roleBadge, setRoleBadge] = useState('✦');
  const [roleColor, setRoleColor] = useState('#A3E6D3');
  const [savingRole, setSavingRole] = useState(false);

  const refresh = async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('chatter-admin', { body: { action: 'list_users' } });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setDashboard(data || { users: [], audit: [], stats: { total: 0, verified: 0, joined_last_7_days: 0 } });
      const [roleResult, assignmentResult] = await Promise.all([
        supabase.from('chatter_roles').select('*').order('created_at', { ascending: true }),
        supabase.from('profile_roles').select('user_id,role_id'),
      ]);
      if (roleResult.error) throw roleResult.error;
      if (assignmentResult.error) throw assignmentResult.error;
      setRoles(roleResult.data || []);
      setRoleAssignments(assignmentResult.data || []);
    } catch (e) {
      setError(e?.message || 'Could not load admin data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => refresh(true), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const deleteUser = async user => {
    if (!user || user.is_admin || user.id === currentUserId) return;
    const name = user.display_name || user.email || 'this user';
    if (!window.confirm(`Permanently delete ${name} and their Chatter account, messages and uploaded media? This cannot be undone.`)) return;
    setDeletingId(user.id);
    setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('chatter-admin', { body: { action: 'delete_user', userId: user.id } });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setSelectedUser(null);
      onNotify?.(`Deleted ${name}.`);
      await refresh(true);
    } catch (e) {
      setError(e?.message || 'Could not delete this account.');
    } finally {
      setDeletingId('');
    }
  };

  const createRole = async event => {
    event.preventDefault();
    const name = roleName.trim();
    if (!name) return;
    setSavingRole(true); setError('');
    const { data, error: roleError } = await supabase.from('chatter_roles').insert({ name, badge: roleBadge.trim() || '✦', color: roleColor, created_by: currentUserId }).select().single();
    if (roleError) setError(roleError.code === '23505' ? 'That role name already exists.' : roleError.message);
    else { setRoles(current => [...current, data]); setRoleName(''); onNotify?.('Custom role created.'); }
    setSavingRole(false);
  };

  const setUserRole = async (user, role, checked) => {
    const exists = roleAssignments.some(item => item.user_id === user.id && item.role_id === role.id);
    if (checked === exists) return;
    const result = checked
      ? await supabase.from('profile_roles').insert({ user_id: user.id, role_id: role.id, assigned_by: currentUserId })
      : await supabase.from('profile_roles').delete().eq('user_id', user.id).eq('role_id', role.id);
    if (result.error) { setError(result.error.message); return; }
    setRoleAssignments(items => checked ? [...items, { user_id: user.id, role_id: role.id }] : items.filter(item => !(item.user_id === user.id && item.role_id === role.id)));
    onNotify?.(checked ? `Added ${role.name} badge to ${user.display_name || 'user'}.` : `Removed ${role.name} badge.`);
  };

  const uniqueOnline = [...new Map((onlineUsers || []).filter(u => u?.user_id).map(u => [u.user_id, u])).values()];
  const onlineIds = new Set(uniqueOnline.map(u => u.user_id));
  const users = dashboard.users || [];
  const filteredUsers = users.filter(u => [u.display_name, u.username, u.email, u.id].some(v => String(v || '').toLowerCase().includes(query.toLowerCase())));
  const stats = dashboard.stats || {};

  return <section className="admin-dashboard">
    <div className="admin-heading"><div><span className="eyebrow">RESTRICTED AREA</span><h1>Admin <em>control room.</em></h1><p>Manage Chatter accounts and watch live community activity.</p></div><button className="admin-refresh" onClick={()=>refresh(true)} disabled={refreshing}><RefreshCw size={15} className={refreshing?'spinning':''}/> Refresh</button></div>
    {error && <div className="form-error admin-error">{error}</div>}
    <div className="admin-metrics">
      <div className="admin-metric"><span><Users size={18}/></span><small>Total accounts</small><b>{loading?'—':stats.total ?? users.length}</b><em>Registered users</em></div>
      <div className="admin-metric online"><span><Activity size={18}/></span><small>Online now</small><b>{uniqueOnline.length}</b><em>Live presence connections</em></div>
      <div className="admin-metric"><span><Mail size={18}/></span><small>Email verified</small><b>{loading?'—':stats.verified ?? 0}</b><em>Confirmed accounts</em></div>
      <div className="admin-metric"><span><UserPlus size={18}/></span><small>New this week</small><b>{loading?'—':stats.joined_last_7_days ?? 0}</b><em>Last 7 days</em></div>
    </div>
    <div className="admin-two-col">
      <div className="admin-panel">
        <div className="admin-panel-heading"><div><h2>Live users</h2><p>Online sessions detected by Supabase Realtime</p></div><span className="online-pill"><i/>{uniqueOnline.length} online</span></div>
        {uniqueOnline.length ? <div className="online-user-list">{uniqueOnline.map(u=><div className="online-user" key={u.user_id}><span className="online-avatar">{initials(u.display_name || u.username || '?')}</span><span><b>{u.display_name || u.username || 'Chatter user'}</b><small>@{u.username || 'member'}</small></span><i/></div>)}</div> : <div className="admin-empty">No active sessions are visible right now.</div>}
      </div>
      <div className="admin-panel">
        <div className="admin-panel-heading"><div><h2>Admin activity</h2><p>Recent account management events</p></div><ShieldCheck size={18}/></div>
        {dashboard.audit?.length ? <div className="admin-audit-list">{dashboard.audit.map(log=><div className="admin-audit-row" key={log.id}><span className="audit-mark"><Trash2 size={14}/></span><span><b>{log.action === 'delete_user' ? 'Deleted account' : log.action}</b><small>{log.target_email || 'Account action'} · by {log.actor_email || 'admin'}</small></span><time>{timeLabel(log.created_at)}</time></div>)}</div> : <div className="admin-empty">No admin actions recorded yet.</div>}
      </div>
    </div>
    <div className="admin-panel admin-roles-panel">
      <div className="admin-panel-heading"><div><h2>Custom roles & badges</h2><p>Create a role, then assign or remove it from any member.</p></div><ShieldCheck size={18}/></div>
      <form className="admin-role-create" onSubmit={createRole}>
        <input value={roleName} onChange={event => setRoleName(event.target.value)} placeholder="Role name e.g. Moderator" maxLength={32} required/>
        <input value={roleBadge} onChange={event => setRoleBadge(event.target.value)} placeholder="Badge e.g. ⭐" maxLength={8} aria-label="Badge symbol"/>
        <label className="admin-role-color"><span>Colour</span><input type="color" value={roleColor} onChange={event => setRoleColor(event.target.value)}/></label>
        <button className="primary-button" type="submit" disabled={savingRole || !roleName.trim()}>{savingRole ? 'Creating…' : 'Create role'}</button>
      </form>
      <div className="admin-role-list">{roles.map(role => <span className="admin-role-chip" key={role.id} style={{'--role-color':role.color}}>{role.badge} {role.name}</span>)}{!roles.length && <small>No custom roles created yet.</small>}</div>
    </div>
    <div className="admin-panel admin-directory">
      <div className="admin-panel-heading"><div><h2>User directory</h2><p>Search accounts, inspect details or permanently remove a user</p></div><span className="admin-count">{filteredUsers.length} / {users.length}</span></div>
      <div className="admin-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by name, username, email or user ID"/></div>
      {loading ? <div className="admin-empty">Loading accounts…</div> : filteredUsers.length ? <div className="admin-user-list">{filteredUsers.map(user=>{
        const isOnline = onlineIds.has(user.id);
        return <div className="admin-user-row" key={user.id}>
          <span className="admin-user-avatar">{initials(user.display_name || user.username || user.email || '?')}</span>
          <button className="admin-user-info" onClick={()=>setSelectedUser(selectedUser?.id===user.id?null:user)}><b>{user.display_name || 'New member'} {user.is_admin&&<em>ADMIN</em>}</b><small>{user.email}</small><small className="admin-user-meta">@{user.username || 'no-username'} · joined {timeLabel(user.created_at)}</small></button>
          <div className="admin-user-status"><span className={isOnline?'online-text':'offline-text'}><i/>{isOnline?'Online':'Offline'}</span><small>{user.email_confirmed_at?'Verified':'Unverified'}</small></div>
          <button className="admin-icon-action" title="Copy user ID" onClick={()=>{navigator.clipboard?.writeText(user.id).then(()=>onNotify?.('User ID copied.')).catch(()=>setError('Could not copy the user ID.'));}}><Copy size={15}/></button>
          <button className="admin-delete" title={user.is_admin?'Admin accounts are protected':'Delete user'} disabled={user.is_admin || user.id===currentUserId || deletingId===user.id} onClick={()=>deleteUser(user)}>{deletingId===user.id?<RefreshCw size={15} className="spinning"/>:<Trash2 size={15}/>}<span>{deletingId===user.id?'Deleting':'Delete'}</span></button>
          {selectedUser?.id===user.id&&<div className="admin-user-details"><span><b>User ID</b><code>{user.id}</code></span><span><b>Last sign-in</b><small>{user.last_sign_in_at?fullTime(user.last_sign_in_at):'Never signed in'}</small></span><span><b>Account created</b><small>{fullTime(user.created_at)}</small></span><div className="admin-user-role-controls"><b>Custom role badges</b>{roles.length ? roles.map(role=><label key={role.id}><input type="checkbox" checked={roleAssignments.some(item=>item.user_id===user.id&&item.role_id===role.id)} onChange={event=>setUserRole(user,role,event.target.checked)}/><span style={{'--role-color':role.color}}>{role.badge} {role.name}</span></label>) : <small>Create a role above first.</small>}</div></div>}
        </div>;
      })}</div> : <div className="admin-empty">{query?'No accounts match your search.':'No registered accounts found.'}</div>}
      {dashboard.stats?.list_truncated&&<p className="admin-truncated">Showing the first 10,000 accounts. Pagination can be added for larger communities.</p>}
    </div>
    <div className="admin-footnote"><ShieldCheck size={15}/> Admin access is checked by Supabase on every privileged request. Admin accounts cannot be deleted from this panel.</div>
  </section>;
}
