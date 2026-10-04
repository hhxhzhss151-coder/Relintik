const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const SUPABASE_URL = 'https://mwzcuiujmapiyacgqmvo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fJHLhg3FqZL1YqfPAaknKw_onQ-pnlF';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const upload = multer({ storage: multer.memoryStorage() });

async function ensureAdmin() {
  try {
    const { data: existing } = await supabase.from('users').select('name').eq('name', 'hhxhzhss151').maybeSingle();
    if (!existing) {
      await supabase.from('users').insert({
        name: 'hhxhzhss151', password: '11111112ss', official: true,
        nickname: 'rolintik', emoji: '👑',
        color: 'linear-gradient(135deg,#20a5ff,#7b5cff)',
        bio: 'Официальный аккаунт Rolintik', subscriptions: []
      });
      console.log('✅ Официальный аккаунт создан');
    }
  } catch (e) { console.log('admin error:', e.message); }
}
ensureAdmin();

async function auth(req, res, next) {
  const name = req.headers.authorization?.replace('Bearer ', '');
  if (!name) return res.status(401).json({ error: 'Не авторизован' });
  const { data: user } = await supabase.from('users').select('*').eq('name', name).maybeSingle();
  if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
  req.user = user; req.userName = name; next();
}

function pub(u) {
  return {
    name: u.name, nickname: u.nickname || u.name,
    official: !!u.official, emoji: u.emoji || '😎',
    color: u.color || 'linear-gradient(135deg,#20a5ff,#7b5cff)',
    bio: u.bio || '', avatarImage: u.avatar_image || null
  };
}

app.post('/api/register', async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'Заполни всё' });
  if (name.length < 3) return res.status(400).json({ error: 'Имя мин. 3 символа' });
  if (password.length < 6) return res.status(400).json({ error: 'Пароль мин. 6 символов' });
  const { data: exists } = await supabase.from('users').select('name').eq('name', name).maybeSingle();
  if (exists) return res.status(400).json({ error: 'Имя занято' });
  const { data: newUser, error } = await supabase.from('users').insert({
    name, password, official: false, nickname: name, emoji: '😎',
    color: 'linear-gradient(135deg,#20a5ff,#7b5cff)',
    bio: 'Новый пользователь Rolintik', subscriptions: []
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ token: name, user: pub(newUser) });
});

app.post('/api/login', async (req, res) => {
  const { name, password } = req.body;
  const { data: user } = await supabase.from('users').select('*').eq('name', name).maybeSingle();
  if (!user || user.password !== password) return res.status(400).json({ error: 'Неверное имя или пароль' });
  res.json({ token: name, user: pub(user) });
});

app.get('/api/me', auth, (req, res) => res.json({ user: pub(req.user) }));

app.patch('/api/me', auth, async (req, res) => {
  const { emoji, color, bio, avatarImage, nickname } = req.body;
  const updates = {};
  if (emoji !== undefined) updates.emoji = emoji;
  if (color !== undefined) updates.color = color;
  if (bio !== undefined) updates.bio = bio;
  if (avatarImage !== undefined) updates.avatar_image = avatarImage;
  if (nickname !== undefined && nickname.trim()) updates.nickname = nickname.trim();
  const { data: updated, error } = await supabase.from('users').update(updates).eq('name', req.userName).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ user: pub(updated) });
});

app.get('/api/videos', async (req, res) => {
  const { data: videos, error } = await supabase.from('videos').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const names = [...new Set((videos || []).map(v => v.user_name))];
  const { data: users } = names.length
    ? await supabase.from('users').select('name, nickname, official, emoji, color, avatar_image').in('name', names)
    : { data: [] };
  const userMap = {};
  (users || []).forEach(u => { userMap[u.name] = u; });
  const result = (videos || []).map(v => {
    const u = userMap[v.user_name] || {};
    return {
      id: v.id, user: v.user_name, nickname: u.nickname || v.user_name,
      caption: v.caption,
      song: v.song_title ? { title: v.song_title, artist: v.song_artist } : null,
      src: v.video_url, likes: v.likes || 0, liked: false,
      comments: (v.comments || []).map(c => ({ ...c, nickname: c.nickname || c.user })),
      createdAt: new Date(v.created_at).getTime(),
      verified: !!u.official, official: !!u.official,
      avatarImage: u.avatar_image || null,
      emoji: u.emoji || '😎',
      color: u.color || 'linear-gradient(135deg,#20a5ff,#7b5cff)'
    };
  });
  res.json({ videos: result });
});

app.post('/api/videos', auth, upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нет файла' });
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${path.extname(req.file.originalname)}`;
  const { error: uploadError } = await supabase.storage.from('videos').upload(fileName, req.file.buffer, {
    contentType: req.file.mimetype, upsert: false
  });
  if (uploadError) return res.status(500).json({ error: 'Ошибка: ' + uploadError.message });
  const { data: urlData } = supabase.storage.from('videos').getPublicUrl(fileName);
  const videoId = 'v' + Date.now() + Math.random().toString(36).slice(2, 6);
  const { error: dbError } = await supabase.from('videos').insert({
    id: videoId, user_name: req.userName,
    caption: req.body.caption || '',
    song_title: req.body.songTitle || null,
    song_artist: req.body.songArtist || null,
    video_url: urlData.publicUrl, likes: 0, comments: []
  });
  if (dbError) return res.status(500).json({ error: dbError.message });
  res.json({ id: videoId });
});

app.delete('/api/videos/:id', auth, async (req, res) => {
  const { data: video } = await supabase.from('videos').select('*').eq('id', req.params.id).maybeSingle();
  if (!video) return res.status(404).json({ error: 'Нет видео' });
  if (video.user_name !== req.userName && !req.user.official) return res.status(403).json({ error: 'Не твоё' });
  try {
    const fileName = video.video_url.split('/').pop();
    await supabase.storage.from('videos').remove([fileName]);
  } catch (e) {}
  await supabase.from('videos').delete().eq('id', req.params.id);
  res.json({ ok: true });
});

app.post('/api/videos/:id/like', auth, async (req, res) => {
  const { data: video } = await supabase.from('videos').select('likes').eq('id', req.params.id).maybeSingle();
  if (!video) return res.status(404).json({ error: 'Нет видео' });
  const newLikes = (video.likes || 0) + 1;
  await supabase.from('videos').update({ likes: newLikes }).eq('id', req.params.id);
  res.json({ liked: true, likes: newLikes });
});

app.post('/api/videos/:id/comments', auth, async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Пустой' });
  const { data: video } = await supabase.from('videos').select('comments').eq('id', req.params.id).maybeSingle();
  if (!video) return res.status(404).json({ error: 'Нет видео' });
  const comments = video.comments || [];
  comments.push({
    id: 'c' + Date.now(), user: req.userName,
    nickname: req.user.nickname || req.userName,
    emoji: req.user.emoji || '😎',
    color: req.user.color || 'linear-gradient(135deg,#20a5ff,#7b5cff)',
    avatarImage: req.user.avatar_image || null,
    text, pinned: false, ts: Date.now()
  });
  await supabase.from('videos').update({ comments }).eq('id', req.params.id);
  res.json({ ok: true });
});

app.post('/api/videos/:vid/comments/:cid/pin', auth, async (req, res) => {
  const { data: video } = await supabase.from('videos').select('*').eq('id', req.params.vid).maybeSingle();
  if (!video) return res.status(404).json({ error: 'Нет видео' });
  if (video.user_name !== req.userName && !req.user.official) return res.status(403).json({ error: 'Нет прав' });
  const comments = (video.comments || []).map(c => ({
    ...c, pinned: c.id === req.params.cid ? !c.pinned : false
  }));
  await supabase.from('videos').update({ comments }).eq('id', req.params.vid);
  res.json({ ok: true });
});

app.delete('/api/videos/:vid/comments/:cid', auth, async (req, res) => {
  const { data: video } = await supabase.from('videos').select('*').eq('id', req.params.vid).maybeSingle();
  if (!video) return res.status(404).json({ error: 'Нет видео' });
  const comments = (video.comments || []).filter(c => c.id !== req.params.cid);
  await supabase.from('videos').update({ comments }).eq('id', req.params.vid);
  res.json({ ok: true });
});

app.post('/api/subscribe/:name', auth, async (req, res) => {
  const target = req.params.name;
  if (target === req.userName) return res.status(400).json({ error: 'Нельзя на себя' });
  const subs = [...(req.user.subscriptions || [])];
  const i = subs.indexOf(target);
  if (i >= 0) subs.splice(i, 1); else subs.push(target);
  await supabase.from('users').update({ subscriptions: subs }).eq('name', req.userName);
  res.json({ subscribed: i < 0 });
});

app.get('/api/users/:name', async (req, res) => {
  const { data: u } = await supabase.from('users').select('*').eq('name', req.params.name).maybeSingle();
  if (!u) return res.status(404).json({ error: 'Нет юзера' });
  const { data: videos } = await supabase.from('videos').select('*').eq('user_name', u.name).order('created_at', { ascending: false });
  const list = (videos || []).map(v => ({
    id: v.id, user: v.user_name, nickname: u.nickname || u.name,
    caption: v.caption,
    song: v.song_title ? { title: v.song_title, artist: v.song_artist } : null,
    src: v.video_url, likes: v.likes || 0,
    createdAt: new Date(v.created_at).getTime(),
    verified: !!u.official, avatarImage: u.avatar_image, emoji: u.emoji, color: u.color
  }));
  res.json({
    user: pub(u), videos: list,
    stats: { subscriptions: (u.subscriptions || []).length, followers: 0, likes: list.reduce((a, v) => a + v.likes, 0) }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 Rolintik на порту ' + PORT));