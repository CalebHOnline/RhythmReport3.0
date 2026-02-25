// app.js — Spotify Stats Dashboard

// ── State ─────────────────────────────────────────────────────
let currentTab = 'tracks';
let currentRange = 'short_term';
let nowPlayingInterval = null;
let cachedStatsData = null;
let userMarket = 'US';
// ── Spotify API ───────────────────────────────────────────────

async function spotifyFetch(url, options = {}, _retries = 2) {
  const token = await getValidToken();
  if (!token) { logout(); return null; }

  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });

  if (res.status === 401) { logout(); return null; }
  if (res.status === 204) return null;
  if (res.status === 429) {
    if (_retries <= 0) throw new Error(`Spotify API error: 429`);
    const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
    console.warn(`Rate limited. Retrying after ${retryAfter}s...`);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return spotifyFetch(url, options, _retries - 1);
  }
  if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
  return res.json();
}

async function spotifyPut(url) {
  const token = await getValidToken();
  if (!token) return;
  await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } });
}

async function spotifyPost(url) {
  const token = await getValidToken();
  if (!token) return;
  await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
}

async function getTopTracks(timeRange, limit = 20) {
  const data = await spotifyFetch(
    `https://api.spotify.com/v1/me/top/tracks?limit=${limit}&time_range=${timeRange}`
  );
  return data?.items || [];
}

async function getTopArtists(timeRange, limit = 20) {
  const data = await spotifyFetch(
    `https://api.spotify.com/v1/me/top/artists?limit=${limit}&time_range=${timeRange}`
  );
  return data?.items || [];
}

async function getUserProfile() {
  return await spotifyFetch('https://api.spotify.com/v1/me');
}

// ── Render ────────────────────────────────────────────────────

function renderTracks(tracks) {
  const grid = document.getElementById('grid');
  grid.innerHTML = tracks.map((track, i) => {
    const image = track.album.images[0]?.url || '';
    const artists = track.artists.map(a => a.name).join(', ');
    return `
      <div class="card" style="animation-delay:${i * 0.035}s">
        <div class="card-image-wrap">
          <img src="${image}" alt="${escapeHtml(track.name)}" loading="lazy"/>
          <span class="card-rank">#${i + 1}</span>
        </div>
        <div class="card-body">
          <div class="card-name">${escapeHtml(track.name)}</div>
          <div class="card-sub">${escapeHtml(artists)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderArtists(artists) {
  const grid = document.getElementById('grid');
  grid.innerHTML = artists.map((artist, i) => {
    const image = artist.images[0]?.url || '';
    const genres = (artist.genres || []).slice(0, 2).join(', ') || 'artist';
    return `
      <div class="card" style="animation-delay:${i * 0.035}s">
        <div class="card-image-wrap">
          <img src="${image}" alt="${escapeHtml(artist.name)}" loading="lazy"/>
          <span class="card-rank">#${i + 1}</span>
        </div>
        <div class="card-body">
          <div class="card-name">${escapeHtml(artist.name)}</div>
          <div class="card-sub">${escapeHtml(genres)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Load & Refresh ────────────────────────────────────────────

async function loadData() {
  const loading = document.getElementById('loading');
  const grid = document.getElementById('grid');

  loading.classList.remove('hidden');
  grid.innerHTML = '';

  try {
    if (currentTab === 'tracks') {
      const tracks = await getTopTracks(currentRange);
      renderTracks(tracks);
    } else {
      const artists = await getTopArtists(currentRange);
      renderArtists(artists);
    }
  } catch (err) {
    grid.innerHTML = `<p style="color:#666; grid-column:1/-1;">Something went wrong. Please try again.</p>`;
    console.error(err);
  } finally {
    loading.classList.add('hidden');
  }
}

// ── Controls ──────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    loadData();
  });
});

document.querySelectorAll('.range').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.range').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentRange = btn.dataset.range;
    loadData();
  });
});

// ── Page Navigation (with transitions) ───────────────────────

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active-page'));
  const page = document.getElementById(pageId);
  if (page) {
    // Re-trigger animation
    page.style.animation = 'none';
    page.offsetHeight; // force reflow
    page.style.animation = '';
    page.classList.add('active-page');
  }
}

// ── Init ──────────────────────────────────────────────────────

async function init() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');

  if (code) {
    try {
      await exchangeCodeForToken(code);
      window.history.replaceState({}, document.title, '/');
    } catch (err) {
      console.error('Auth error:', err);
      showLogin();
      return;
    }
  }

  const token = await getValidToken();
  if (token) {
    showDashboard();
  } else {
    showLogin();
  }
}

async function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');

  try {
    const profile = await getUserProfile();
    if (profile) {
      document.getElementById('user-name').textContent = profile.display_name || '';
    }
  } catch (_) {}

  loadData();
  startNowPlaying();
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('dashboard').classList.add('hidden');
}

init();


// ══════════════════════════════════════════════════════════════
// NOW PLAYING
// ══════════════════════════════════════════════════════════════

async function fetchPlaybackState() {
  try {
    const data = await spotifyFetch('https://api.spotify.com/v1/me/player');
    return data;
  } catch {
    return null;
  }
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function updateNowPlaying(state) {
  const bar = document.getElementById('now-playing');

  if (!state || !state.item) {
    bar.classList.add('hidden');
    document.getElementById('dashboard').classList.remove('has-player');
    return;
  }

  bar.classList.remove('hidden');
  document.getElementById('dashboard').classList.add('has-player');

  const track = state.item;
  const img = track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || '';
  const artists = track.artists?.map(a => a.name).join(', ') || '';
  const progress = state.progress_ms || 0;
  const duration = track.duration_ms || 1;
  const pct = (progress / duration) * 100;
  const isPlaying = state.is_playing;
  const device = state.device?.name || '';

  // Bottom bar
  document.getElementById('np-art').src = img;
  document.getElementById('np-track').textContent = track.name;
  document.getElementById('np-artist').textContent = artists;
  document.getElementById('np-progress-fill').style.width = `${pct}%`;
  document.getElementById('np-time-current').textContent = formatTime(progress);
  document.getElementById('np-time-total').textContent = formatTime(duration);
  document.getElementById('np-play-icon').classList.toggle('hidden', isPlaying);
  document.getElementById('np-pause-icon').classList.toggle('hidden', !isPlaying);
  document.getElementById('np-device').textContent = device ? `Playing on ${device}` : '';

  // Also update the player page main display
  const artEl = document.getElementById('player-art');
  if (artEl) {
    const bigImg = track.album?.images?.[0]?.url || img;
    artEl.src = bigImg;
  }
  const noTrack = document.getElementById('player-no-track');
  if (noTrack) noTrack.style.display = 'none';
  const ptName = document.getElementById('player-track-name');
  if (ptName) ptName.textContent = track.name;
  const ptArtist = document.getElementById('player-track-artist');
  if (ptArtist) ptArtist.textContent = artists;
  document.getElementById('pl-play-icon')?.classList.toggle('hidden', isPlaying);
  document.getElementById('pl-pause-icon')?.classList.toggle('hidden', !isPlaying);
  const plFill = document.getElementById('pl-progress-fill');
  if (plFill) plFill.style.width = `${pct}%`;
  const plCur = document.getElementById('pl-time-cur');
  if (plCur) plCur.textContent = formatTime(progress);
  const plTot = document.getElementById('pl-time-tot');
  if (plTot) plTot.textContent = formatTime(duration);
  const devStatus = document.getElementById('player-device-status');
  if (devStatus) devStatus.textContent = device ? `Playing on ${device}` : '';
}

function startNowPlaying() {
  // Poll every 3 seconds
  const poll = async () => {
    const state = await fetchPlaybackState();
    updateNowPlaying(state);
  };
  poll();
  nowPlayingInterval = setInterval(poll, 3000);
}

// Old playback controls removed — SDK handles these now


// ══════════════════════════════════════════════════════════════
// STATS PAGE
// ══════════════════════════════════════════════════════════════

async function getRecentlyPlayed() {
  const data = await spotifyFetch(
    'https://api.spotify.com/v1/me/player/recently-played?limit=50'
  );
  return data?.items || [];
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function renderDecadeBreakdown(tracks) {
  const decades = {};
  tracks.forEach(t => {
    const year = parseInt(t.album.release_date?.substring(0, 4));
    if (!year) return;
    const decade = Math.floor(year / 10) * 10;
    decades[`${decade}s`] = (decades[`${decade}s`] || 0) + 1;
  });

  const sorted = Object.entries(decades).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  if (sorted.length === 0) {
    document.getElementById('decade-breakdown').innerHTML = '<p style="color:var(--muted);font-size:0.85rem">No data available.</p>';
    return;
  }

  const total = sorted.reduce((s, [, c]) => s + c, 0);
  const max = Math.max(...sorted.map(([, c]) => c));

  document.getElementById('decade-breakdown').innerHTML = `
    <div class="decade-chart">
      ${sorted.map(([decade, count]) => `
        <div class="decade-col">
          <div class="decade-bar-wrap">
            <div class="decade-bar" style="height: ${Math.round((count / max) * 100)}%"></div>
          </div>
          <div class="decade-label">${decade}</div>
          <div class="decade-pct">${Math.round((count / total) * 100)}%</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderTopAlbums(tracks) {
  const albumMap = {};
  tracks.forEach(t => {
    const album = t.album;
    if (!albumMap[album.id]) {
      albumMap[album.id] = {
        name: album.name,
        artist: t.artists.map(a => a.name).join(', '),
        img: album.images[1]?.url || album.images[0]?.url || '',
        count: 0
      };
    }
    albumMap[album.id].count++;
  });

  const sorted = Object.values(albumMap).sort((a, b) => b.count - a.count).slice(0, 5);
  if (sorted.length === 0) {
    document.getElementById('top-albums').innerHTML = '<p style="color:var(--muted);font-size:0.85rem">No data available.</p>';
    return;
  }

  document.getElementById('top-albums').innerHTML = sorted.map((album, i) => `
    <div class="album-item" style="animation-delay:${i * 0.04}s">
      <span class="album-rank">${i + 1}</span>
      <img class="album-img" src="${album.img}" alt="${escapeHtml(album.name)}" loading="lazy"/>
      <div class="album-info">
        <div class="album-name">${escapeHtml(album.name)}</div>
        <div class="album-artist">${escapeHtml(album.artist)}</div>
      </div>
      <span class="album-count">${album.count} track${album.count > 1 ? 's' : ''}</span>
    </div>
  `).join('');
}


function renderRecentlyPlayed(items) {
  document.getElementById('recent-list').innerHTML = items.map((item, i) => {
    const track = item.track;
    const img = track.album.images[1]?.url || track.album.images[0]?.url || '';
    const artists = track.artists.map(a => a.name).join(', ');
    return `
      <div class="recent-item" style="animation-delay:${i * 0.02}s">
        <span class="recent-num">${i + 1}</span>
        <img class="recent-img" src="${img}" alt="${escapeHtml(track.name)}" loading="lazy"/>
        <div class="recent-info">
          <div class="recent-name">${escapeHtml(track.name)}</div>
          <div class="recent-artist">${escapeHtml(artists)}</div>
        </div>
        <span class="recent-time">${timeAgo(item.played_at)}</span>
      </div>
    `;
  }).join('');
}

async function loadStatsPage() {
  const loadingMsg = '<p style="color:var(--muted);font-size:0.85rem">Loading...</p>';
  document.getElementById('decade-breakdown').innerHTML = loadingMsg;
  document.getElementById('top-albums').innerHTML = loadingMsg;
  document.getElementById('recent-list').innerHTML = loadingMsg;

  try {
    const [topTracks, topArtists] = await Promise.all([
      getTopTracks('long_term', 50),
      getTopArtists('long_term', 50),
    ]);

    cachedStatsData = { topTracks, topArtists };

    renderDecadeBreakdown(topTracks);
    renderTopAlbums(topTracks);
  } catch (err) {
    console.error('Stats error:', err);
  }

  try {
    const recentItems = await getRecentlyPlayed();
    renderRecentlyPlayed(recentItems);
  } catch (err) {
    document.getElementById('recent-list').innerHTML =
      '<p style="color:var(--muted);font-size:0.85rem">Recently played is unavailable.</p>';
  }
}

// Navigation moved to bottom of file (with player nav)


// ══════════════════════════════════════════════════════════════
// SHAREABLE STATS CARD
// ══════════════════════════════════════════════════════════════

async function generateShareCard() {
  if (!cachedStatsData) return;
  const { topTracks, topArtists } = cachedStatsData;

  const canvas = document.getElementById('share-canvas');
  const ctx = canvas.getContext('2d');

  const W = 800;
  const H = 1000;
  canvas.width = W;
  canvas.height = H;

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0d0d0d');
  grad.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Accent glow
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#1db954';
  ctx.beginPath();
  ctx.arc(650, 150, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8ff47';
  ctx.beginPath();
  ctx.arc(150, 800, 250, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Border
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

  // Header
  ctx.fillStyle = '#e8ff47';
  ctx.font = '600 14px "DM Sans", sans-serif';
  ctx.fillText('◈ RHYTHMREPORT', 40, 52);

  ctx.fillStyle = '#666';
  ctx.font = '300 12px "DM Sans", sans-serif';
  const date = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  ctx.fillText(date, W - ctx.measureText(date).width - 40, 52);

  // Title
  ctx.fillStyle = '#f0f0f0';
  ctx.font = '48px "Bebas Neue", sans-serif';
  ctx.letterSpacing = '0.06em';
  ctx.fillText('YOUR TOP 5', 40, 110);

  // Top 5 tracks
  const top5 = topTracks.slice(0, 5);
  let y = 150;

  for (let i = 0; i < top5.length; i++) {
    const track = top5[i];
    const imgUrl = track.album.images[1]?.url || track.album.images[0]?.url;

    // Try to load album art
    try {
      const img = await loadImage(imgUrl);
      ctx.save();
      roundedRect(ctx, 40, y, 72, 72, 8);
      ctx.clip();
      ctx.drawImage(img, 40, y, 72, 72);
      ctx.restore();
    } catch {
      ctx.fillStyle = '#1a1a1a';
      roundedRect(ctx, 40, y, 72, 72, 8);
      ctx.fill();
    }

    // Rank
    ctx.fillStyle = '#e8ff47';
    ctx.font = '36px "Bebas Neue", sans-serif';
    ctx.fillText(`#${i + 1}`, 130, y + 36);

    // Track name
    ctx.fillStyle = '#f0f0f0';
    ctx.font = '500 18px "DM Sans", sans-serif';
    const name = truncateText(ctx, track.name, W - 240);
    ctx.fillText(name, 190, y + 30);

    // Artist
    ctx.fillStyle = '#666';
    ctx.font = '300 14px "DM Sans", sans-serif';
    const artist = truncateText(ctx, track.artists.map(a => a.name).join(', '), W - 240);
    ctx.fillText(artist, 190, y + 52);

    y += 90;
  }

  // Divider
  y += 20;
  ctx.strokeStyle = '#222';
  ctx.beginPath();
  ctx.moveTo(40, y);
  ctx.lineTo(W - 40, y);
  ctx.stroke();
  y += 30;

  // Stats summary
  ctx.fillStyle = '#f0f0f0';
  ctx.font = '36px "Bebas Neue", sans-serif';
  ctx.fillText('STATS', 40, y + 10);
  y += 40;

  const uniqueAlbums = new Set(topTracks.map(t => t.album.id)).size;
  const stats = [
    { label: 'Top Artists', value: topArtists.length },
    { label: 'Top Tracks', value: topTracks.length },
    { label: 'Unique Albums', value: uniqueAlbums },
  ];

  const colW = (W - 80) / stats.length;
  stats.forEach((stat, i) => {
    const x = 40 + i * colW;
    ctx.fillStyle = '#e8ff47';
    ctx.font = '56px "Bebas Neue", sans-serif';
    ctx.fillText(stat.value.toString(), x, y + 50);
    ctx.fillStyle = '#666';
    ctx.font = '300 13px "DM Sans", sans-serif';
    ctx.fillText(stat.label, x, y + 72);
  });

  y += 100;

  // Decade breakdown
  const decades = {};
  topTracks.forEach(t => {
    const year = parseInt(t.album.release_date?.substring(0, 4));
    if (!year) return;
    const decade = Math.floor(year / 10) * 10;
    decades[`${decade}s`] = (decades[`${decade}s`] || 0) + 1;
  });

  const sortedDecades = Object.entries(decades).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  if (sortedDecades.length > 0) {
    y += 10;
    ctx.fillStyle = '#f0f0f0';
    ctx.font = '36px "Bebas Neue", sans-serif';
    ctx.fillText('DECADES', 40, y + 10);
    y += 30;

    const maxCount = Math.max(...sortedDecades.map(([, c]) => c));
    const total = sortedDecades.reduce((s, [, c]) => s + c, 0);
    const barAreaW = W - 80;
    const barW = Math.min(80, (barAreaW / sortedDecades.length) - 12);

    sortedDecades.forEach(([label, count], i) => {
      const x = 40 + i * (barW + 12);
      const barH = (count / maxCount) * 100;

      ctx.fillStyle = '#1db954';
      roundedRect(ctx, x, y + (100 - barH), barW, barH, 4);
      ctx.fill();

      ctx.fillStyle = '#666';
      ctx.font = '300 11px "DM Sans", sans-serif';
      ctx.fillText(label, x, y + 118);

      ctx.fillStyle = '#f0f0f0';
      ctx.font = '18px "Bebas Neue", sans-serif';
      ctx.fillText(`${Math.round((count / total) * 100)}%`, x, y + 136);
    });
  }

  // Footer
  ctx.fillStyle = '#333';
  ctx.font = '300 11px "DM Sans", sans-serif';
  ctx.fillText('Generated with RhythmReport', 40, H - 30);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  while (text.length > 0 && ctx.measureText(text + '...').width > maxWidth) {
    text = text.slice(0, -1);
  }
  return text + '...';
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Share modal
document.getElementById('share-btn')?.addEventListener('click', async () => {
  const modal = document.getElementById('share-modal');
  modal.classList.remove('hidden');
  await generateShareCard();
});

document.getElementById('share-close')?.addEventListener('click', () => {
  document.getElementById('share-modal').classList.add('hidden');
});

document.querySelector('.share-overlay')?.addEventListener('click', () => {
  document.getElementById('share-modal').classList.add('hidden');
});

document.getElementById('share-download')?.addEventListener('click', () => {
  const canvas = document.getElementById('share-canvas');
  const link = document.createElement('a');
  link.download = 'rhythmreport.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});


// ══════════════════════════════════════════════════════════════
// SPOTIFY WEB PLAYBACK SDK
// ══════════════════════════════════════════════════════════════

let spotifyPlayer = null;
let playerDeviceId = null;
let playerStateInterval = null;
let userQueue = []; // our managed queue

window.onSpotifyWebPlaybackSDKReady = () => {
  console.log('Spotify Web Playback SDK ready');
  initPlayer();
};

async function initPlayer() {
  const token = await getValidToken();
  if (!token) return;

  spotifyPlayer = new Spotify.Player({
    name: 'RhythmReport',
    getOAuthToken: async cb => {
      const t = await getValidToken();
      cb(t);
    },
    volume: 0.5,
  });

  spotifyPlayer.addListener('ready', ({ device_id }) => {
    console.log('Player ready, device_id:', device_id);
    playerDeviceId = device_id;
    document.getElementById('player-device-status').textContent = 'RhythmReport player connected';
  });

  spotifyPlayer.addListener('not_ready', () => {
    console.log('Player not ready');
    playerDeviceId = null;
  });

  spotifyPlayer.addListener('player_state_changed', (state) => {
    if (state) updatePlayerPage(state);
  });

  spotifyPlayer.addListener('initialization_error', ({ message }) => {
    console.error('Init error:', message);
    document.getElementById('player-device-status').textContent = 'Player requires Spotify Premium';
  });

  spotifyPlayer.addListener('authentication_error', ({ message }) => {
    console.error('Auth error:', message);
  });

  spotifyPlayer.connect();

  // Poll player state for progress updates
  playerStateInterval = setInterval(async () => {
    if (!spotifyPlayer) return;
    const state = await spotifyPlayer.getCurrentState();
    if (state) updatePlayerPage(state);
  }, 1000);
}

function updatePlayerPage(state) {
  if (!state || !state.track_window?.current_track) return;

  const track = state.track_window.current_track;
  const img = track.album?.images?.[0]?.url || '';
  const artists = track.artists?.map(a => a.name).join(', ') || '';

  // Player page
  const artEl = document.getElementById('player-art');
  if (artEl) {
    artEl.src = img;
    document.getElementById('player-track-name').textContent = track.name;
    document.getElementById('player-track-artist').textContent = artists;
  }

  // Player page controls
  const isPlaying = !state.paused;
  document.getElementById('pl-play-icon')?.classList.toggle('hidden', isPlaying);
  document.getElementById('pl-pause-icon')?.classList.toggle('hidden', !isPlaying);

  // Player page progress
  const progress = state.position || 0;
  const duration = state.duration || 1;
  const pct = (progress / duration) * 100;
  const fillEl = document.getElementById('pl-progress-fill');
  if (fillEl) fillEl.style.width = `${pct}%`;
  const curEl = document.getElementById('pl-time-cur');
  if (curEl) curEl.textContent = formatTime(progress);
  const totEl = document.getElementById('pl-time-tot');
  if (totEl) totEl.textContent = formatTime(duration);

  // Also update bottom bar
  document.getElementById('now-playing')?.classList.remove('hidden');
  document.getElementById('dashboard')?.classList.add('has-player');
  const npArt = document.getElementById('np-art');
  if (npArt) npArt.src = img;
  const npTrack = document.getElementById('np-track');
  if (npTrack) npTrack.textContent = track.name;
  const npArtist = document.getElementById('np-artist');
  if (npArtist) npArtist.textContent = artists;
  document.getElementById('np-progress-fill').style.width = `${pct}%`;
  document.getElementById('np-time-current').textContent = formatTime(progress);
  document.getElementById('np-time-total').textContent = formatTime(duration);
  document.getElementById('np-play-icon')?.classList.toggle('hidden', isPlaying);
  document.getElementById('np-pause-icon')?.classList.toggle('hidden', !isPlaying);
  document.getElementById('np-device').textContent = 'Playing on RhythmReport';
}

// Play a track (or list of tracks) via SDK
async function playTrack(uri, contextUris = null) {
  if (!playerDeviceId) {
    alert('Player not ready. Make sure you have Spotify Premium.');
    return;
  }
  const token = await getValidToken();
  const body = contextUris
    ? { uris: contextUris, offset: { uri } }
    : { uris: [uri] };

  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${playerDeviceId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Add to queue (uses whatever device is currently active)
async function addToQueue(uri) {
  const token = await getValidToken();
  if (!token) return;
  await fetch(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(uri)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// Transfer playback to RhythmReport player
async function transferToApp() {
  if (!playerDeviceId) {
    alert('Player not ready. Make sure you have Spotify Premium.');
    return;
  }
  const token = await getValidToken();
  await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: [playerDeviceId], play: true }),
  });
}

// Player page controls
document.getElementById('pl-toggle')?.addEventListener('click', () => {
  spotifyPlayer?.togglePlay();
});
document.getElementById('pl-prev')?.addEventListener('click', () => {
  spotifyPlayer?.previousTrack();
});
document.getElementById('pl-next')?.addEventListener('click', () => {
  spotifyPlayer?.nextTrack();
});

// Player page progress seek
document.getElementById('pl-progress-bar')?.addEventListener('click', async (e) => {
  const bar = e.currentTarget;
  const rect = bar.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  const state = await spotifyPlayer?.getCurrentState();
  if (!state) return;
  spotifyPlayer.seek(Math.floor(pct * state.duration));
});

// Bottom bar controls — override to use SDK when available
document.getElementById('np-toggle')?.addEventListener('click', () => {
  if (spotifyPlayer) {
    spotifyPlayer.togglePlay();
  }
});
document.getElementById('np-prev')?.addEventListener('click', () => {
  if (spotifyPlayer) spotifyPlayer.previousTrack();
});
document.getElementById('np-next')?.addEventListener('click', () => {
  if (spotifyPlayer) spotifyPlayer.nextTrack();
});
document.getElementById('np-progress-bar')?.addEventListener('click', async (e) => {
  if (!spotifyPlayer) return;
  const bar = e.currentTarget;
  const rect = bar.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  const state = await spotifyPlayer.getCurrentState();
  if (state) spotifyPlayer.seek(Math.floor(pct * state.duration));
});


// ══════════════════════════════════════════════════════════════
// SEARCH
// ══════════════════════════════════════════════════════════════

async function searchSpotify(query) {
  const data = await spotifyFetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=15`
  );
  return data;
}

function renderSearchResults(data) {
  const el = document.getElementById('search-results');
  if (!data) { el.innerHTML = ''; return; }

  const tracks = data.tracks?.items || [];

  let html = '';

  tracks.forEach(track => {
    const img = track.album?.images?.[2]?.url || track.album?.images?.[0]?.url || '';
    const artists = track.artists.map(a => a.name).join(', ');
    const dur = formatTime(track.duration_ms);
    html += `
      <div class="track-row" onclick="playTrack('${track.uri}')">
        <img class="track-row-img" src="${img}" alt=""/>
        <div class="track-row-info">
          <div class="track-row-name">${escapeHtml(track.name)}</div>
          <div class="track-row-sub">${escapeHtml(artists)}</div>
        </div>
        <span class="track-row-dur">${dur}</span>
        <button class="track-row-action" title="Add to queue" onclick="event.stopPropagation(); addToQueue('${track.uri}'); addToVisualQueue('${escapeHtml(track.name).replace(/'/g, "\\'")}', '${escapeHtml(artists).replace(/'/g, "\\'")}', '${img}', '${track.uri}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        </button>
      </div>
    `;
  });

  el.innerHTML = html || '<p style="color:var(--muted);font-size:0.85rem">No results found.</p>';
}


document.getElementById('search-btn')?.addEventListener('click', async () => {
  const query = document.getElementById('search-input').value.trim();
  if (!query) return;
  document.getElementById('search-results').innerHTML = '<p style="color:var(--muted);font-size:0.85rem">Searching...</p>';
  const data = await searchSpotify(query);
  renderSearchResults(data);
});

document.getElementById('search-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('search-btn').click();
});


// ══════════════════════════════════════════════════════════════
// QUEUE
// ══════════════════════════════════════════════════════════════

function addToVisualQueue(name, artist, img, uri) {
  userQueue.push({ name, artist, img, uri });
  renderQueue();
}

function renderQueue() {
  const el = document.getElementById('queue-list');
  if (userQueue.length === 0) {
    el.innerHTML = '<p style="color:var(--muted);font-size:0.85rem">Queue is empty</p>';
    return;
  }

  el.innerHTML = userQueue.map((item, i) => `
    <div class="track-row">
      <img class="track-row-img" src="${item.img}" alt=""/>
      <div class="track-row-info">
        <div class="track-row-name">${item.name}</div>
        <div class="track-row-sub">${item.artist}</div>
      </div>
      <button class="track-row-action" title="Remove" onclick="removeFromQueue(${i})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
    </div>
  `).join('');
}

function removeFromQueue(index) {
  userQueue.splice(index, 1);
  renderQueue();
}


// ══════════════════════════════════════════════════════════════
// QUICK PLAY (Top Tracks / Top Artists)
// ══════════════════════════════════════════════════════════════

let quickPlayCache = { tracks: null };

async function loadQuickPlay() {
  const el = document.getElementById('quick-play-list');
  el.innerHTML = '<p style="color:var(--muted);font-size:0.85rem">Loading...</p>';

  if (!quickPlayCache.tracks) {
    quickPlayCache.tracks = await getTopTracks('short_term', 20);
  }
  const tracks = quickPlayCache.tracks;
  const allUris = tracks.map(t => t.uri);

  el.innerHTML = tracks.map((track, i) => {
    const img = track.album?.images?.[2]?.url || track.album?.images?.[0]?.url || '';
    const artists = track.artists.map(a => a.name).join(', ');
    return `
      <div class="track-row" onclick="playTrack('${track.uri}', ${JSON.stringify(allUris).replace(/"/g, '&quot;')})">
        <img class="track-row-img" src="${img}" alt=""/>
        <div class="track-row-info">
          <div class="track-row-name">${escapeHtml(track.name)}</div>
          <div class="track-row-sub">${escapeHtml(artists)}</div>
        </div>
        <button class="track-row-action" title="Add to queue" onclick="event.stopPropagation(); addToQueue('${track.uri}'); addToVisualQueue('${escapeHtml(track.name).replace(/'/g, "\\'")}', '${escapeHtml(artists).replace(/'/g, "\\'")}', '${img}', '${track.uri}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        </button>
      </div>
    `;
  }).join('');
}

// Player page navigation
document.getElementById('player-btn')?.addEventListener('click', () => {
  showPage('player-page');
  loadQuickPlay();
});

// Nav: Stats
document.getElementById('stats-btn')?.addEventListener('click', () => {
  showPage('stats-page');
  loadStatsPage();
});

// Nav: Back (stats page)
document.getElementById('back-btn')?.addEventListener('click', () => {
  showPage('main-page');
});

// Nav: Back (player page)
document.getElementById('player-back-btn')?.addEventListener('click', () => {
  showPage('main-page');
});

// Nav: Logo goes home
document.getElementById('logo-home')?.addEventListener('click', () => {
  showPage('main-page');
});

// Nav: Import
document.getElementById('import-btn')?.addEventListener('click', () => {
  showPage('import-page');
});
document.getElementById('import-back-btn')?.addEventListener('click', () => {
  showPage('main-page');
});


// ══════════════════════════════════════════════════════════════
// IMPORT — Spotify Extended Streaming History
// ══════════════════════════════════════════════════════════════

const importState = {
  files: [],        // raw File objects
  rawData: [],      // combined parsed entries
  filtered: [],     // after year filter
  currentFilter: 'all',
  currentYear: null,
};

// ── File Upload / Drag & Drop ────────────────────────────────

const dropArea = document.getElementById('import-drop-area');
const fileInput = document.getElementById('import-file-input');

dropArea?.addEventListener('click', () => fileInput?.click());
fileInput?.addEventListener('change', (e) => handleImportFiles(e.target.files));

dropArea?.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.classList.add('drag-over'); });
dropArea?.addEventListener('dragleave', () => dropArea.classList.remove('drag-over'));
dropArea?.addEventListener('drop', (e) => {
  e.preventDefault();
  dropArea.classList.remove('drag-over');
  handleImportFiles(e.dataTransfer.files);
});

function handleImportFiles(fileList) {
  for (const f of fileList) {
    if (f.type === 'application/json' || f.name.endsWith('.json')) {
      if (!importState.files.find(x => x.name === f.name && x.size === f.size)) {
        importState.files.push(f);
      }
    }
  }
  renderImportFileList();
}

function renderImportFileList() {
  const el = document.getElementById('import-file-list');
  const actions = document.getElementById('import-actions');

  if (importState.files.length === 0) {
    el.innerHTML = '';
    actions.classList.add('hidden');
    return;
  }

  actions.classList.remove('hidden');
  el.innerHTML = importState.files.map((f, i) => `
    <div class="import-file-item" style="animation-delay:${i * 0.05}s">
      <div>
        <div class="import-file-name">${escapeHtml(f.name)}</div>
        <div class="import-file-size">${(f.size / 1024).toFixed(0)} KB</div>
      </div>
      <button class="import-file-remove" onclick="removeImportFile(${i})" title="Remove">✕</button>
    </div>
  `).join('');
}

function removeImportFile(index) {
  importState.files.splice(index, 1);
  renderImportFileList();
}

document.getElementById('import-clear-btn')?.addEventListener('click', () => {
  importState.files = [];
  importState.rawData = [];
  importState.filtered = [];
  renderImportFileList();
  document.getElementById('import-dashboard').classList.add('hidden');
  document.getElementById('import-upload-zone').style.display = '';
});

// ── Parse & Process ──────────────────────────────────────────

document.getElementById('import-process-btn')?.addEventListener('click', processImportData);

async function processImportData() {
  const btn = document.getElementById('import-process-btn');
  btn.textContent = 'Processing…';
  btn.disabled = true;

  try {
    const allEntries = [];
    for (const f of importState.files) {
      const text = await f.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        allEntries.push(...parsed);
      }
    }

    // Filter out podcasts/audiobooks, keep only music with >3s play
    importState.rawData = allEntries.filter(e =>
      e.master_metadata_track_name &&
      e.master_metadata_album_artist_name &&
      e.ms_played > 3000
    ).sort((a, b) => new Date(a.ts) - new Date(b.ts));

    if (importState.rawData.length === 0) {
      alert('No valid music streaming entries found in the uploaded files.');
      btn.textContent = 'Analyze Data';
      btn.disabled = false;
      return;
    }

    // Populate year selector
    populateYearSelect();
    importState.currentFilter = 'all';
    importState.filtered = importState.rawData;

    // Render everything
    document.getElementById('import-upload-zone').style.display = 'none';
    document.getElementById('import-dashboard').classList.remove('hidden');
    renderImportDashboard();
  } catch (err) {
    console.error('Import error:', err);
    alert('Error parsing files: ' + err.message);
  }

  btn.textContent = 'Analyze Data';
  btn.disabled = false;
}

function populateYearSelect() {
  const years = new Set(importState.rawData.map(e => new Date(e.ts).getFullYear()));
  const sel = document.getElementById('imp-year-select');
  sel.innerHTML = [...years].sort().map(y => `<option value="${y}">${y}</option>`).join('');
}

// ── Filter Controls ──────────────────────────────────────────

document.querySelectorAll('.imp-range').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.imp-range').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const range = btn.dataset.impRange;
    const yearSel = document.getElementById('imp-year-select');

    if (range === 'all') {
      yearSel.classList.add('hidden');
      importState.currentFilter = 'all';
      importState.filtered = importState.rawData;
    } else {
      yearSel.classList.remove('hidden');
      importState.currentFilter = 'year';
      const year = parseInt(yearSel.value);
      importState.currentYear = year;
      importState.filtered = importState.rawData.filter(e => new Date(e.ts).getFullYear() === year);
    }
    renderImportDashboard();
  });
});

document.getElementById('imp-year-select')?.addEventListener('change', (e) => {
  const year = parseInt(e.target.value);
  importState.currentYear = year;
  importState.filtered = importState.rawData.filter(e2 => new Date(e2.ts).getFullYear() === year);
  renderImportDashboard();
});

// ── Main Dashboard Render ────────────────────────────────────

function renderImportDashboard() {
  const data = importState.filtered;
  if (data.length === 0) return;

  renderImportOverview(data);
  renderImportTopArtists(data);
  renderImportTopTracks(data);
  renderImportTopAlbums(data);
  renderImportTimeline(data);
  renderImportHourly(data);
  renderImportDayOfWeek(data);
  renderImportSkipStats(data);
  renderImportPlatforms(data);
  renderImportShuffleStats(data);
  renderImportStreaks(data);
}

// ── Overview Stats ───────────────────────────────────────────

function renderImportOverview(data) {
  const totalMs = data.reduce((s, e) => s + e.ms_played, 0);
  const totalHours = totalMs / 3600000;
  const uniqueTracks = new Set(data.map(e => `${e.master_metadata_track_name}|||${e.master_metadata_album_artist_name}`)).size;
  const uniqueArtists = new Set(data.map(e => e.master_metadata_album_artist_name)).size;

  const firstDate = new Date(data[0].ts);
  const lastDate = new Date(data[data.length - 1].ts);
  const daySpan = Math.max(1, Math.ceil((lastDate - firstDate) / 86400000));
  const avgMinsPerDay = Math.round((totalMs / 60000) / daySpan);

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateRange = `${monthNames[firstDate.getMonth()]} ${firstDate.getFullYear()} – ${monthNames[lastDate.getMonth()]} ${lastDate.getFullYear()}`;

  document.getElementById('imp-total-streams').textContent = data.length.toLocaleString();
  document.getElementById('imp-total-time').textContent = totalHours >= 1000 ? `${(totalHours / 1000).toFixed(1)}k hrs` : `${Math.round(totalHours)} hrs`;
  document.getElementById('imp-unique-tracks').textContent = uniqueTracks.toLocaleString();
  document.getElementById('imp-unique-artists').textContent = uniqueArtists.toLocaleString();
  document.getElementById('imp-date-range').textContent = dateRange;
  document.getElementById('imp-avg-daily').textContent = avgMinsPerDay.toLocaleString();
}

// ── Sort state ───────────────────────────────────────────────

const importSortMode = { artists: 'time', tracks: 'time', albums: 'time' };

// ── Top Artists ──────────────────────────────────────────────

function renderImportTopArtists(data, sortBy) {
  if (sortBy) importSortMode.artists = sortBy;
  const mode = importSortMode.artists;

  const map = {};
  data.forEach(e => {
    const name = e.master_metadata_album_artist_name;
    if (!map[name]) map[name] = { ms: 0, count: 0 };
    map[name].ms += e.ms_played;
    map[name].count++;
  });

  const sorted = Object.entries(map)
    .sort((a, b) => mode === 'count' ? b[1].count - a[1].count : b[1].ms - a[1].ms)
    .slice(0, 25);
  const maxVal = sorted[0] ? (mode === 'count' ? sorted[0][1].count : sorted[0][1].ms) : 1;

  document.getElementById('imp-top-artists-sub').textContent = mode === 'count' ? 'By number of listens' : 'By total listening time';

  document.getElementById('imp-top-artists').innerHTML = sorted.map(([name, d], i) => {
    const val = mode === 'count' ? d.count : d.ms;
    const statLabel = mode === 'count' ? `${d.count.toLocaleString()} plays` : formatMsToLabel(d.ms);
    const subLabel = mode === 'count' ? formatMsToLabel(d.ms) : `${d.count.toLocaleString()} streams`;
    return `
    <div class="import-row" style="animation-delay:${i * 0.03}s">
      <div class="import-row-rank ${i < 3 ? 'top3' : ''}">${i + 1}</div>
      <div class="import-row-info">
        <div class="import-row-name">${escapeHtml(name)}</div>
        <div class="import-row-sub">${subLabel}</div>
      </div>
      <div class="import-row-bar-wrap">
        <div class="import-row-bar"><div class="import-row-bar-fill" style="width:${(val / maxVal * 100).toFixed(1)}%"></div></div>
      </div>
      <div class="import-row-stat">${statLabel}</div>
    </div>
  `}).join('');
}

// ── Top Tracks ───────────────────────────────────────────────

function renderImportTopTracks(data, sortBy) {
  if (sortBy) importSortMode.tracks = sortBy;
  const mode = importSortMode.tracks;

  const map = {};
  data.forEach(e => {
    const key = `${e.master_metadata_track_name}|||${e.master_metadata_album_artist_name}`;
    if (!map[key]) map[key] = { track: e.master_metadata_track_name, artist: e.master_metadata_album_artist_name, ms: 0, count: 0 };
    map[key].ms += e.ms_played;
    map[key].count++;
  });

  const sorted = Object.values(map)
    .sort((a, b) => mode === 'count' ? b.count - a.count : b.ms - a.ms)
    .slice(0, 25);
  const maxVal = sorted[0] ? (mode === 'count' ? sorted[0].count : sorted[0].ms) : 1;

  document.getElementById('imp-top-tracks-sub').textContent = mode === 'count' ? 'By number of listens' : 'By total listening time';

  document.getElementById('imp-top-tracks').innerHTML = sorted.map((d, i) => {
    const val = mode === 'count' ? d.count : d.ms;
    const statLabel = mode === 'count' ? `${d.count.toLocaleString()} plays` : formatMsToLabel(d.ms);
    const subLabel = mode === 'count'
      ? `${escapeHtml(d.artist)} · ${formatMsToLabel(d.ms)}`
      : `${escapeHtml(d.artist)} · ${d.count} plays`;
    return `
    <div class="import-row" style="animation-delay:${i * 0.03}s">
      <div class="import-row-rank ${i < 3 ? 'top3' : ''}">${i + 1}</div>
      <div class="import-row-info">
        <div class="import-row-name">${escapeHtml(d.track)}</div>
        <div class="import-row-sub">${subLabel}</div>
      </div>
      <div class="import-row-bar-wrap">
        <div class="import-row-bar"><div class="import-row-bar-fill" style="width:${(val / maxVal * 100).toFixed(1)}%"></div></div>
      </div>
      <div class="import-row-stat">${statLabel}</div>
    </div>
  `}).join('');
}

// ── Top Albums ───────────────────────────────────────────────

function renderImportTopAlbums(data, sortBy) {
  if (sortBy) importSortMode.albums = sortBy;
  const mode = importSortMode.albums;

  const map = {};
  data.forEach(e => {
    const album = e.master_metadata_album_album_name;
    if (!album) return;
    const key = `${album}|||${e.master_metadata_album_artist_name}`;
    if (!map[key]) map[key] = { album, artist: e.master_metadata_album_artist_name, ms: 0, count: 0 };
    map[key].ms += e.ms_played;
    map[key].count++;
  });

  const sorted = Object.values(map)
    .sort((a, b) => mode === 'count' ? b.count - a.count : b.ms - a.ms)
    .slice(0, 15);
  const maxVal = sorted[0] ? (mode === 'count' ? sorted[0].count : sorted[0].ms) : 1;

  document.getElementById('imp-top-albums-sub').textContent = mode === 'count' ? 'By number of listens' : 'By total listening time';

  document.getElementById('imp-top-albums').innerHTML = sorted.map((d, i) => {
    const val = mode === 'count' ? d.count : d.ms;
    const statLabel = mode === 'count' ? `${d.count.toLocaleString()} plays` : formatMsToLabel(d.ms);
    const subLabel = mode === 'count'
      ? `${escapeHtml(d.artist)} · ${formatMsToLabel(d.ms)}`
      : `${escapeHtml(d.artist)} · ${d.count} tracks`;
    return `
    <div class="import-row" style="animation-delay:${i * 0.03}s">
      <div class="import-row-rank ${i < 3 ? 'top3' : ''}">${i + 1}</div>
      <div class="import-row-info">
        <div class="import-row-name">${escapeHtml(d.album)}</div>
        <div class="import-row-sub">${subLabel}</div>
      </div>
      <div class="import-row-bar-wrap">
        <div class="import-row-bar"><div class="import-row-bar-fill" style="width:${(val / maxVal * 100).toFixed(1)}%"></div></div>
      </div>
      <div class="import-row-stat">${statLabel}</div>
    </div>
  `}).join('');
}

// ── Listening Timeline (monthly) ─────────────────────────────

function renderImportTimeline(data) {
  const months = {};
  data.forEach(e => {
    const d = new Date(e.ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months[key] = (months[key] || 0) + e.ms_played;
  });

  const sorted = Object.entries(months).sort((a, b) => a[0].localeCompare(b[0]));
  const maxMs = Math.max(...sorted.map(([, ms]) => ms)) || 1;
  const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  document.getElementById('imp-timeline-chart').innerHTML = `
    <div class="import-bar-chart" style="min-width:${Math.max(sorted.length * 36, 300)}px">
      ${sorted.map(([key, ms]) => {
        const [y, m] = key.split('-');
        const hrs = (ms / 3600000).toFixed(0);
        return `
          <div class="import-bar-col">
            <div class="import-bar-value">${hrs}h</div>
            <div class="import-bar-wrap">
              <div class="import-bar" style="height:${(ms / maxMs * 100).toFixed(1)}%" title="${hrs} hours"></div>
            </div>
            <div class="import-bar-label">${monthLabels[parseInt(m) - 1]}<br>${y.slice(2)}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ── Hourly Chart ─────────────────────────────────────────────

function renderImportHourly(data) {
  const hours = new Array(24).fill(0);
  const dayCounts = new Array(24).fill(0);
  const daySet = new Set();

  data.forEach(e => {
    const d = new Date(e.ts);
    hours[d.getHours()] += e.ms_played;
    const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!daySet.has(dayKey)) {
      daySet.add(dayKey);
    }
    dayCounts[d.getHours()]++;
  });

  const totalDays = new Set(data.map(e => { const d = new Date(e.ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; })).size || 1;
  const avgMins = hours.map(ms => (ms / 60000) / totalDays);
  const maxAvg = Math.max(...avgMins) || 1;

  document.getElementById('imp-hourly-chart').innerHTML = `
    <div class="import-bar-chart">
      ${avgMins.map((avg, h) => `
        <div class="import-bar-col">
          <div class="import-bar-value">${avg.toFixed(0)}m</div>
          <div class="import-bar-wrap">
            <div class="import-bar" style="height:${(avg / maxAvg * 100).toFixed(1)}%;background:${h >= 6 && h < 12 ? '#ffb347' : h >= 12 && h < 18 ? '#ff6b35' : h >= 18 && h < 23 ? '#c44dff' : '#4d9dff'}" title="${avg.toFixed(1)} avg mins"></div>
          </div>
          <div class="import-bar-label">${h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : (h - 12) + 'p'}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ── Day of Week Chart ────────────────────────────────────────

function renderImportDayOfWeek(data) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dayMs = new Array(7).fill(0);
  const dayCount = new Array(7).fill(0);
  const weekSet = new Set();

  data.forEach(e => {
    const d = new Date(e.ts);
    dayMs[d.getDay()] += e.ms_played;
    const weekKey = `${d.getFullYear()}-W${Math.ceil((d.getDate() + 6 - d.getDay()) / 7)}`;
    if (!weekSet.has(`${weekKey}-${d.getDay()}`)) {
      weekSet.add(`${weekKey}-${d.getDay()}`);
      dayCount[d.getDay()]++;
    }
  });

  const avgMins = dayMs.map((ms, i) => dayCount[i] > 0 ? (ms / 60000) / dayCount[i] : 0);
  const maxAvg = Math.max(...avgMins) || 1;

  document.getElementById('imp-dow-chart').innerHTML = `
    <div class="import-bar-chart" style="max-width:500px">
      ${avgMins.map((avg, i) => `
        <div class="import-bar-col">
          <div class="import-bar-value">${avg.toFixed(0)}m</div>
          <div class="import-bar-wrap">
            <div class="import-bar" style="height:${(avg / maxAvg * 100).toFixed(1)}%;background:${i === 0 || i === 6 ? '#ff6b35' : '#ff8c5a'}" title="${avg.toFixed(1)} avg mins"></div>
          </div>
          <div class="import-bar-label">${days[i]}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ── Skip Stats ───────────────────────────────────────────────

function renderImportSkipStats(data) {
  const total = data.length;
  // Consider skipped if played less than 30 seconds, or if skipped field is true
  const skipped = data.filter(e => e.skipped === true || e.ms_played < 30000).length;
  const completed = data.filter(e => e.reason_end === 'trackdone').length;
  const other = total - skipped - completed;

  const items = [
    { label: 'Completed', count: completed, color: 'var(--green)' },
    { label: 'Skipped', count: skipped, color: '#ff4444' },
    { label: 'Other', count: other, color: 'var(--muted)' },
  ];

  document.getElementById('imp-skip-stats').innerHTML = items.map(item => `
    <div class="import-pct-row">
      <div class="import-pct-label">${item.label}</div>
      <div class="import-pct-bar-wrap">
        <div class="import-pct-bar"><div class="import-pct-bar-fill" style="width:${(item.count / total * 100).toFixed(1)}%;background:${item.color}"></div></div>
      </div>
      <div class="import-pct-value">${(item.count / total * 100).toFixed(0)}%</div>
    </div>
  `).join('');
}

// ── Platforms ─────────────────────────────────────────────────

function renderImportPlatforms(data) {
  const map = {};
  data.forEach(e => {
    let plat = e.platform || 'Unknown';
    // Simplify platform strings
    if (plat.includes('iOS')) plat = 'iOS';
    else if (plat.includes('Android')) plat = 'Android';
    else if (plat.includes('Windows')) plat = 'Windows';
    else if (plat.includes('OS X') || plat.includes('macOS')) plat = 'Mac';
    else if (plat.includes('Linux')) plat = 'Linux';
    else if (plat.includes('Web')) plat = 'Web Player';
    map[plat] = (map[plat] || 0) + 1;
  });

  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const total = data.length;

  document.getElementById('imp-platforms').innerHTML = sorted.map(([name, count]) => `
    <div class="import-pct-row">
      <div class="import-pct-label">${escapeHtml(name)}</div>
      <div class="import-pct-bar-wrap">
        <div class="import-pct-bar"><div class="import-pct-bar-fill" style="width:${(count / total * 100).toFixed(1)}%;background:#4d9dff"></div></div>
      </div>
      <div class="import-pct-value">${(count / total * 100).toFixed(0)}%</div>
    </div>
  `).join('');
}

// ── Shuffle Stats ────────────────────────────────────────────

function renderImportShuffleStats(data) {
  const shuffleOn = data.filter(e => e.shuffle === true).length;
  const shuffleOff = data.length - shuffleOn;
  const total = data.length;

  const offlineOn = data.filter(e => e.offline === true).length;

  document.getElementById('imp-shuffle-stats').innerHTML = `
    <div class="import-pct-row">
      <div class="import-pct-label">Shuffle On</div>
      <div class="import-pct-bar-wrap">
        <div class="import-pct-bar"><div class="import-pct-bar-fill" style="width:${(shuffleOn / total * 100).toFixed(1)}%;background:var(--green)"></div></div>
      </div>
      <div class="import-pct-value">${(shuffleOn / total * 100).toFixed(0)}%</div>
    </div>
    <div class="import-pct-row">
      <div class="import-pct-label">Shuffle Off</div>
      <div class="import-pct-bar-wrap">
        <div class="import-pct-bar"><div class="import-pct-bar-fill" style="width:${(shuffleOff / total * 100).toFixed(1)}%;background:var(--muted)"></div></div>
      </div>
      <div class="import-pct-value">${(shuffleOff / total * 100).toFixed(0)}%</div>
    </div>
    <div class="import-pct-row">
      <div class="import-pct-label">Offline Plays</div>
      <div class="import-pct-bar-wrap">
        <div class="import-pct-bar"><div class="import-pct-bar-fill" style="width:${(offlineOn / total * 100).toFixed(1)}%;background:#ffb347"></div></div>
      </div>
      <div class="import-pct-value">${(offlineOn / total * 100).toFixed(0)}%</div>
    </div>
  `;
}

// ── Listening Streaks ────────────────────────────────────────

function renderImportStreaks(data) {
  // Find consecutive days with listening
  const daySet = new Set(data.map(e => {
    const d = new Date(e.ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }));

  const sortedDays = [...daySet].sort();
  let maxStreak = 0, currentStreak = 0, maxStreakEnd = '';
  let prevDate = null;

  for (const dayStr of sortedDays) {
    const d = new Date(dayStr + 'T00:00:00');
    if (prevDate) {
      const diff = (d - prevDate) / 86400000;
      if (diff === 1) {
        currentStreak++;
      } else {
        if (currentStreak > maxStreak) { maxStreak = currentStreak; maxStreakEnd = dayStr; }
        currentStreak = 1;
      }
    } else {
      currentStreak = 1;
    }
    prevDate = d;
  }
  if (currentStreak > maxStreak) { maxStreak = currentStreak; maxStreakEnd = sortedDays[sortedDays.length - 1]; }

  // Busiest single day
  const dayMsMap = {};
  data.forEach(e => {
    const d = new Date(e.ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dayMsMap[key] = (dayMsMap[key] || 0) + e.ms_played;
  });
  const busiestDay = Object.entries(dayMsMap).sort((a, b) => b[1] - a[1])[0];
  const busiestLabel = busiestDay ? new Date(busiestDay[0] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const busiestHrs = busiestDay ? (busiestDay[1] / 3600000).toFixed(1) : '0';

  document.getElementById('imp-streaks').innerHTML = `
    <div class="import-pct-row">
      <div class="import-pct-label">Longest Streak</div>
      <div class="import-pct-value" style="color:#ff6b35">${maxStreak} days</div>
    </div>
    <div class="import-pct-row">
      <div class="import-pct-label">Total Active Days</div>
      <div class="import-pct-value">${sortedDays.length}</div>
    </div>
    <div class="import-pct-row">
      <div class="import-pct-label">Busiest Day</div>
      <div class="import-pct-value" style="font-size:0.95rem">${busiestLabel}<br><span style="font-size:0.75rem;color:var(--muted)">${busiestHrs} hrs</span></div>
    </div>
  `;
}

// ── Helpers ──────────────────────────────────────────────────

function formatMsToLabel(ms) {
  const hrs = ms / 3600000;
  if (hrs >= 1) return `${hrs.toFixed(1)} hrs`;
  return `${Math.round(ms / 60000)} min`;
}

// ── Sort Toggle Buttons ──────────────────────────────────────

document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target; // 'artists', 'tracks', or 'albums'
    const sort = btn.dataset.sort;     // 'time' or 'count'

    // Update active state within the same toggle group
    btn.parentElement.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const data = importState.filtered;
    if (!data || data.length === 0) return;

    if (target === 'artists') renderImportTopArtists(data, sort);
    else if (target === 'tracks') renderImportTopTracks(data, sort);
    else if (target === 'albums') renderImportTopAlbums(data, sort);
  });
});


// ══════════════════════════════════════════════════════════════
// ARTIST DISCOVERY TIMELINE
// ══════════════════════════════════════════════════════════════

function renderArtistDiscovery(data, limit = 20) {
  // Find first listen date + first track for every artist
  const artistFirst = {};
  data.forEach(e => {
    const artist = e.master_metadata_album_artist_name;
    const ts = e.ts;
    if (!artistFirst[artist] || ts < artistFirst[artist].ts) {
      artistFirst[artist] = {
        ts,
        firstTrack: e.master_metadata_track_name,
      };
    }
  });

  // Also compute total ms per artist so we can rank by significance
  const artistMs = {};
  data.forEach(e => {
    const a = e.master_metadata_album_artist_name;
    artistMs[a] = (artistMs[a] || 0) + e.ms_played;
  });

  // Sort by first listen date
  let entries = Object.entries(artistFirst)
    .map(([name, info]) => ({
      name,
      firstDate: new Date(info.ts),
      firstTrack: info.firstTrack,
      totalMs: artistMs[name] || 0,
    }))
    .sort((a, b) => a.firstDate - b.firstDate);

  // If limit is a number, keep only top N by totalMs but preserve chronological order
  const actualLimit = limit === 'all' ? entries.length : parseInt(limit);
  if (actualLimit < entries.length) {
    const topByMs = new Set(
      [...entries].sort((a, b) => b.totalMs - a.totalMs).slice(0, actualLimit).map(e => e.name)
    );
    entries = entries.filter(e => topByMs.has(e.name));
  }

  // Group by month
  const groups = {};
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  entries.forEach(e => {
    const key = `${e.firstDate.getFullYear()}-${String(e.firstDate.getMonth() + 1).padStart(2, '0')}`;
    const label = `${monthNames[e.firstDate.getMonth()]} ${e.firstDate.getFullYear()}`;
    if (!groups[key]) groups[key] = { label, artists: [] };
    groups[key].artists.push(e);
  });

  const sortedGroups = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));

  if (sortedGroups.length === 0) {
    document.getElementById('imp-discovery-timeline').innerHTML = '<p style="color:var(--muted);font-size:0.85rem;padding:20px;">No data available.</p>';
    return;
  }

  let html = '<div class="discovery-timeline"><div class="discovery-line"></div>';
  let idx = 0;

  sortedGroups.forEach(([, group]) => {
    html += `<div class="discovery-month-group">`;
    html += `<div class="discovery-month-label">${group.label}</div>`;
    group.artists.forEach(a => {
      html += `
        <div class="discovery-artist-row" style="animation-delay:${idx * 0.02}s">
          <span class="discovery-artist-name">${escapeHtml(a.name)}</span>
          <span class="discovery-first-track">♪ ${escapeHtml(a.firstTrack)}</span>
          <span class="discovery-artist-meta">${formatMsToLabel(a.totalMs)} total</span>
        </div>
      `;
      idx++;
    });
    html += `</div>`;
  });

  html += '</div>';
  document.getElementById('imp-discovery-timeline').innerHTML = html;
}

document.getElementById('imp-discovery-count')?.addEventListener('change', (e) => {
  renderArtistDiscovery(importState.filtered, e.target.value);
});


// ══════════════════════════════════════════════════════════════
// ON THIS DAY
// ══════════════════════════════════════════════════════════════

function initOnThisDay() {
  const input = document.getElementById('imp-otd-date');
  if (!input) return;
  // Default to today
  const now = new Date();
  input.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  renderOnThisDay();
}

function renderOnThisDay() {
  const input = document.getElementById('imp-otd-date');
  if (!input || !input.value) return;

  const [, month, day] = input.value.split('-').map(Number);
  const data = importState.rawData; // Use ALL data, not filtered
  const container = document.getElementById('imp-on-this-day');

  // Group entries by year where month and day match
  const yearGroups = {};
  data.forEach(e => {
    const d = new Date(e.ts);
    if (d.getMonth() + 1 === month && d.getDate() === day) {
      const yr = d.getFullYear();
      if (!yearGroups[yr]) yearGroups[yr] = [];
      yearGroups[yr].push(e);
    }
  });

  const years = Object.keys(yearGroups).sort((a, b) => b - a);

  if (years.length === 0) {
    container.innerHTML = `<div class="otd-empty">No listening data found for this date. Try a different day!</div>`;
    return;
  }

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  let html = '';
  years.forEach(yr => {
    const entries = yearGroups[yr].sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const totalMs = entries.reduce((s, e) => s + e.ms_played, 0);
    const uniqueTracks = new Set(entries.map(e => e.master_metadata_track_name)).size;
    const uniqueArtists = new Set(entries.map(e => e.master_metadata_album_artist_name)).size;

    html += `<div class="otd-year-group">`;
    html += `<div class="otd-year-label">${monthNames[month - 1]} ${day}, ${yr}</div>`;
    html += `<div class="otd-year-sub">${uniqueTracks} tracks · ${uniqueArtists} artists · ${formatMsToLabel(totalMs)} of listening</div>`;

    // Show up to 20 tracks
    const shown = entries.slice(0, 20);
    shown.forEach(e => {
      const d = new Date(e.ts);
      const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      html += `
        <div class="otd-track-row">
          <span class="otd-track-time">${timeStr}</span>
          <div class="otd-track-info">
            <div class="otd-track-name">${escapeHtml(e.master_metadata_track_name)}</div>
            <div class="otd-track-artist">${escapeHtml(e.master_metadata_album_artist_name)}${e.master_metadata_album_album_name ? ' · ' + escapeHtml(e.master_metadata_album_album_name) : ''}</div>
          </div>
          <span class="otd-track-dur">${formatTime(e.ms_played)}</span>
        </div>
      `;
    });

    if (entries.length > 20) {
      html += `<div style="padding:8px 10px;font-size:0.78rem;color:var(--muted);">+ ${entries.length - 20} more tracks</div>`;
    }

    html += `</div>`;
  });

  container.innerHTML = html;
}

document.getElementById('imp-otd-date')?.addEventListener('change', renderOnThisDay);


// ══════════════════════════════════════════════════════════════
// SPOTIFY WRAPPED — Multi-card carousel
// ══════════════════════════════════════════════════════════════

let wrappedCanvases = [];
let wrappedCurrentSlide = 0;

function populateWrappedYearSelect() {
  const years = [...new Set(importState.rawData.map(e => new Date(e.ts).getFullYear()))].sort();
  const sel = document.getElementById('imp-wrapped-year');
  if (!sel) return;
  sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
  if (years.length) sel.value = years[years.length - 1];
}

document.getElementById('imp-wrapped-generate')?.addEventListener('click', generateWrapped);

async function generateWrapped() {
  const yearSel = document.getElementById('imp-wrapped-year');
  if (!yearSel) return;
  const year = parseInt(yearSel.value);
  const yearData = importState.rawData.filter(e => new Date(e.ts).getFullYear() === year);
  if (yearData.length === 0) { alert('No data for ' + year); return; }

  const btn = document.getElementById('imp-wrapped-generate');
  btn.textContent = 'Generating…';
  btn.disabled = true;

  // Gather all stats
  const stats = computeWrappedStats(yearData, year);

  // Generate cards
  wrappedCanvases = [];
  wrappedCurrentSlide = 0;

  const cardContainer = document.getElementById('wrapped-cards');
  cardContainer.innerHTML = '';

  const cardFns = [
    () => drawWrappedOverview(stats),
    () => drawWrappedTopArtists(stats),
    () => drawWrappedTopTracks(stats),
    () => drawWrappedTopAlbums(stats),
    () => drawWrappedListeningHabits(stats),
    () => drawWrappedFunFacts(stats),
  ];

  for (const fn of cardFns) {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1100;
    const slot = document.createElement('div');
    slot.className = 'wrapped-card-slot';
    slot.appendChild(canvas);
    cardContainer.appendChild(slot);
    wrappedCanvases.push(canvas);
    await fn()(canvas);
  }

  // Setup dots
  const dotsEl = document.getElementById('wrapped-dots');
  dotsEl.innerHTML = wrappedCanvases.map((_, i) =>
    `<div class="wrapped-dot ${i === 0 ? 'active' : ''}" data-slide="${i}"></div>`
  ).join('');
  dotsEl.querySelectorAll('.wrapped-dot').forEach(dot => {
    dot.addEventListener('click', () => goToWrappedSlide(parseInt(dot.dataset.slide)));
  });

  goToWrappedSlide(0);
  document.getElementById('imp-wrapped-container').classList.remove('hidden');

  btn.textContent = 'Generate';
  btn.disabled = false;
}

function goToWrappedSlide(index) {
  wrappedCurrentSlide = Math.max(0, Math.min(index, wrappedCanvases.length - 1));
  const cards = document.getElementById('wrapped-cards');
  cards.style.transform = `translateX(-${wrappedCurrentSlide * 100}%)`;
  document.querySelectorAll('.wrapped-dot').forEach((d, i) => {
    d.classList.toggle('active', i === wrappedCurrentSlide);
  });
}

document.getElementById('wrapped-prev')?.addEventListener('click', () => goToWrappedSlide(wrappedCurrentSlide - 1));
document.getElementById('wrapped-next')?.addEventListener('click', () => goToWrappedSlide(wrappedCurrentSlide + 1));

document.getElementById('imp-wrapped-download-current')?.addEventListener('click', () => {
  if (!wrappedCanvases.length) return;
  const canvas = wrappedCanvases[wrappedCurrentSlide];
  const year = document.getElementById('imp-wrapped-year')?.value || 'wrapped';
  const link = document.createElement('a');
  link.download = `rhythmreport-wrapped-${year}-card${wrappedCurrentSlide + 1}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
});

document.getElementById('imp-wrapped-download-all')?.addEventListener('click', () => {
  if (!wrappedCanvases.length) return;
  const year = document.getElementById('imp-wrapped-year')?.value || 'wrapped';
  wrappedCanvases.forEach((canvas, i) => {
    setTimeout(() => {
      const link = document.createElement('a');
      link.download = `rhythmreport-wrapped-${year}-card${i + 1}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }, i * 300);
  });
});

// ── Compute stats ────────────────────────────────────────────

function computeWrappedStats(data, year) {
  const totalMs = data.reduce((s, e) => s + e.ms_played, 0);
  const totalHours = Math.round(totalMs / 3600000);

  const uniqueTracks = new Set(data.map(e => `${e.master_metadata_track_name}|||${e.master_metadata_album_artist_name}`)).size;
  const uniqueArtists = new Set(data.map(e => e.master_metadata_album_artist_name)).size;

  // Top artists
  const artistMap = {};
  data.forEach(e => {
    const a = e.master_metadata_album_artist_name;
    if (!artistMap[a]) artistMap[a] = { ms: 0, count: 0 };
    artistMap[a].ms += e.ms_played;
    artistMap[a].count++;
  });
  const topArtists = Object.entries(artistMap).sort((a, b) => b[1].ms - a[1].ms).slice(0, 5);

  // Top tracks
  const trackMap = {};
  data.forEach(e => {
    const key = `${e.master_metadata_track_name}|||${e.master_metadata_album_artist_name}`;
    if (!trackMap[key]) trackMap[key] = { track: e.master_metadata_track_name, artist: e.master_metadata_album_artist_name, ms: 0, count: 0 };
    trackMap[key].ms += e.ms_played;
    trackMap[key].count++;
  });
  const topTracks = Object.values(trackMap).sort((a, b) => b.ms - a.ms).slice(0, 5);

  // Top albums
  const albumMap = {};
  data.forEach(e => {
    const alb = e.master_metadata_album_album_name;
    if (!alb) return;
    const key = `${alb}|||${e.master_metadata_album_artist_name}`;
    if (!albumMap[key]) albumMap[key] = { album: alb, artist: e.master_metadata_album_artist_name, ms: 0, count: 0 };
    albumMap[key].ms += e.ms_played;
    albumMap[key].count++;
  });
  const topAlbums = Object.values(albumMap).sort((a, b) => b.ms - a.ms).slice(0, 5);

  // Monthly hours
  const monthMs = new Array(12).fill(0);
  data.forEach(e => { monthMs[new Date(e.ts).getMonth()] += e.ms_played; });

  // Peak hour
  const hourMs = new Array(24).fill(0);
  data.forEach(e => { hourMs[new Date(e.ts).getHours()] += e.ms_played; });
  const peakHour = hourMs.indexOf(Math.max(...hourMs));
  const peakHourLabel = peakHour === 0 ? '12 AM' : peakHour < 12 ? `${peakHour} AM` : peakHour === 12 ? '12 PM' : `${peakHour - 12} PM`;

  // Day of week
  const dowNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dowMs = new Array(7).fill(0);
  data.forEach(e => { dowMs[new Date(e.ts).getDay()] += e.ms_played; });
  const topDow = dowNames[dowMs.indexOf(Math.max(...dowMs))];

  // New artists discovered this year
  const allArtistFirst = {};
  importState.rawData.forEach(e => {
    const a = e.master_metadata_album_artist_name;
    if (!allArtistFirst[a] || e.ts < allArtistFirst[a]) allArtistFirst[a] = e.ts;
  });
  const newArtists = Object.entries(allArtistFirst).filter(([, ts]) => new Date(ts).getFullYear() === year).length;

  // Shuffle %
  const shufflePct = Math.round(data.filter(e => e.shuffle).length / data.length * 100);

  // Longest streak
  const daySet = new Set(data.map(e => {
    const d = new Date(e.ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }));
  const sortedDays = [...daySet].sort();
  let maxStreak = 0, curStreak = 0, prevDate = null;
  for (const dayStr of sortedDays) {
    const d = new Date(dayStr + 'T00:00:00');
    if (prevDate && (d - prevDate) / 86400000 === 1) curStreak++;
    else { if (curStreak > maxStreak) maxStreak = curStreak; curStreak = 1; }
    prevDate = d;
  }
  if (curStreak > maxStreak) maxStreak = curStreak;

  return {
    year, totalMs, totalHours, totalStreams: data.length,
    uniqueTracks, uniqueArtists, topArtists, topTracks, topAlbums,
    monthMs, peakHourLabel, topDow, newArtists, shufflePct,
    longestStreak: maxStreak, activeDays: sortedDays.length,
  };
}

// ── Card drawing helpers ─────────────────────────────────────

function wrappedCardBg(ctx, W, H, hue1, hue2) {
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, hue1);
  grad.addColorStop(1, hue2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Glow circles
  ctx.save();
  ctx.globalAlpha = 0.07;
  const rg1 = ctx.createRadialGradient(W * 0.8, H * 0.15, 0, W * 0.8, H * 0.15, 350);
  rg1.addColorStop(0, '#fff');
  rg1.addColorStop(1, 'transparent');
  ctx.fillStyle = rg1;
  ctx.fillRect(0, 0, W, H);
  const rg2 = ctx.createRadialGradient(W * 0.1, H * 0.85, 0, W * 0.1, H * 0.85, 300);
  rg2.addColorStop(0, '#fff');
  rg2.addColorStop(1, 'transparent');
  ctx.fillStyle = rg2;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function wrappedHeader(ctx, stats, subtitle) {
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '300 12px "DM Sans", sans-serif';
  ctx.fillText('RHYTHMREPORT', 48, 48);

  ctx.fillStyle = '#fff';
  ctx.font = '72px "Bebas Neue", sans-serif';
  ctx.fillText(`YOUR ${stats.year}`, 48, 115);

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '300 14px "DM Sans", sans-serif';
  ctx.fillText(subtitle, 48, 142);

  return 175;
}

function wrappedFooter(ctx, W, H) {
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font = '300 11px "DM Sans", sans-serif';
  ctx.fillText('Generated with RhythmReport', 48, H - 32);
  ctx.textAlign = 'right';
  ctx.fillText('rhythmreport.app', W - 48, H - 32);
  ctx.textAlign = 'left';
}

// ── Card 1: Overview ─────────────────────────────────────────

function drawWrappedOverview(stats) {
  return async (canvas) => {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    wrappedCardBg(ctx, W, H, '#1a0800', '#0d0215');
    let y = wrappedHeader(ctx, stats, 'YEAR IN REVIEW');

    // Big number
    ctx.fillStyle = '#ff6b35';
    ctx.font = '160px "Bebas Neue", sans-serif';
    ctx.fillText(stats.totalHours.toLocaleString(), 48, y + 140);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '300 18px "DM Sans", sans-serif';
    ctx.fillText('hours of music', 48, y + 168);
    y += 210;

    // Stats grid
    const items = [
      { val: stats.totalStreams.toLocaleString(), label: 'Streams' },
      { val: stats.uniqueArtists.toLocaleString(), label: 'Artists' },
      { val: stats.uniqueTracks.toLocaleString(), label: 'Unique Tracks' },
      { val: stats.activeDays.toLocaleString(), label: 'Active Days' },
    ];

    const colW = (W - 96) / 2;
    items.forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 48 + col * colW;
      const iy = y + row * 90;
      ctx.fillStyle = '#fff';
      ctx.font = '56px "Bebas Neue", sans-serif';
      ctx.fillText(item.val, x, iy + 48);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '300 13px "DM Sans", sans-serif';
      ctx.fillText(item.label, x, iy + 68);
    });
    y += 210;

    // Monthly mini chart
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '24px "Bebas Neue", sans-serif';
    ctx.fillText('MONTHLY LISTENING', 48, y);
    y += 16;

    const maxM = Math.max(...stats.monthMs) || 1;
    const barW = (W - 96 - 11 * 6) / 12;
    const monthL = ['J','F','M','A','M','J','J','A','S','O','N','D'];
    stats.monthMs.forEach((ms, i) => {
      const bx = 48 + i * (barW + 6);
      const bh = Math.max(2, (ms / maxM) * 80);
      ctx.fillStyle = 'rgba(255,107,53,0.2)';
      roundedRect(ctx, bx, y, barW, 80, 3); ctx.fill();
      ctx.fillStyle = '#ff6b35';
      roundedRect(ctx, bx, y + (80 - bh), barW, bh, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '300 10px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(monthL[i], bx + barW / 2, y + 96);
      ctx.textAlign = 'left';
    });

    wrappedFooter(ctx, W, H);
  };
}

// ── Card 2: Top Artists ──────────────────────────────────────

function drawWrappedTopArtists(stats) {
  return async (canvas) => {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    wrappedCardBg(ctx, W, H, '#001a0d', '#0a0015');
    let y = wrappedHeader(ctx, stats, 'TOP ARTISTS');

    // #1 artist big
    if (stats.topArtists[0]) {
      const [name, data] = stats.topArtists[0];
      ctx.fillStyle = '#1db954';
      ctx.font = '22px "Bebas Neue", sans-serif';
      ctx.fillText('#1 ARTIST', 48, y + 10);
      ctx.fillStyle = '#fff';
      ctx.font = '500 42px "DM Sans", sans-serif';
      ctx.fillText(truncateText(ctx, name, W - 96), 48, y + 60);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '300 15px "DM Sans", sans-serif';
      ctx.fillText(`${(data.ms / 3600000).toFixed(0)} hours · ${data.count.toLocaleString()} streams`, 48, y + 86);
      y += 120;
    }

    // Rest
    stats.topArtists.slice(1).forEach(([name, data], i) => {
      const rank = i + 2;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '36px "Bebas Neue", sans-serif';
      ctx.fillText(`${rank}`, 48, y + 34);

      ctx.fillStyle = '#fff';
      ctx.font = '500 22px "DM Sans", sans-serif';
      ctx.fillText(truncateText(ctx, name, 440), 100, y + 28);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '300 13px "DM Sans", sans-serif';
      ctx.fillText(`${(data.ms / 3600000).toFixed(1)} hrs · ${data.count.toLocaleString()} plays`, 100, y + 48);

      // Bar
      const barX = 100, barMaxW = W - 148;
      ctx.fillStyle = 'rgba(29,185,84,0.15)';
      roundedRect(ctx, barX, y + 56, barMaxW, 6, 3); ctx.fill();
      ctx.fillStyle = '#1db954';
      roundedRect(ctx, barX, y + 56, (data.ms / stats.topArtists[0][1].ms) * barMaxW, 6, 3); ctx.fill();

      y += 88;
    });

    wrappedFooter(ctx, W, H);
  };
}

// ── Card 3: Top Tracks ───────────────────────────────────────

function drawWrappedTopTracks(stats) {
  return async (canvas) => {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    wrappedCardBg(ctx, W, H, '#0d001a', '#1a0800');
    let y = wrappedHeader(ctx, stats, 'TOP TRACKS');

    // #1 track big
    if (stats.topTracks[0]) {
      const t = stats.topTracks[0];
      ctx.fillStyle = '#c44dff';
      ctx.font = '22px "Bebas Neue", sans-serif';
      ctx.fillText('#1 TRACK', 48, y + 10);
      ctx.fillStyle = '#fff';
      ctx.font = '500 36px "DM Sans", sans-serif';
      ctx.fillText(truncateText(ctx, t.track, W - 96), 48, y + 54);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '300 15px "DM Sans", sans-serif';
      ctx.fillText(`${t.artist} · ${(t.ms / 3600000).toFixed(1)} hrs · ${t.count} plays`, 48, y + 80);
      y += 115;
    }

    stats.topTracks.slice(1).forEach((t, i) => {
      const rank = i + 2;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '36px "Bebas Neue", sans-serif';
      ctx.fillText(`${rank}`, 48, y + 30);

      ctx.fillStyle = '#fff';
      ctx.font = '500 18px "DM Sans", sans-serif';
      ctx.fillText(truncateText(ctx, t.track, 380), 100, y + 24);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '300 12px "DM Sans", sans-serif';
      ctx.fillText(truncateText(ctx, `${t.artist} · ${t.count} plays`, 380), 100, y + 44);

      const barX = 100, barMaxW = W - 148;
      ctx.fillStyle = 'rgba(196,77,255,0.15)';
      roundedRect(ctx, barX, y + 52, barMaxW, 5, 3); ctx.fill();
      ctx.fillStyle = '#c44dff';
      roundedRect(ctx, barX, y + 52, (t.ms / stats.topTracks[0].ms) * barMaxW, 5, 3); ctx.fill();

      y += 80;
    });

    wrappedFooter(ctx, W, H);
  };
}

// ── Card 4: Top Albums ───────────────────────────────────────

function drawWrappedTopAlbums(stats) {
  return async (canvas) => {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    wrappedCardBg(ctx, W, H, '#0a1a00', '#00101a');
    let y = wrappedHeader(ctx, stats, 'TOP ALBUMS');

    if (stats.topAlbums[0]) {
      const a = stats.topAlbums[0];
      ctx.fillStyle = '#ffb347';
      ctx.font = '22px "Bebas Neue", sans-serif';
      ctx.fillText('#1 ALBUM', 48, y + 10);
      ctx.fillStyle = '#fff';
      ctx.font = '500 34px "DM Sans", sans-serif';
      ctx.fillText(truncateText(ctx, a.album, W - 96), 48, y + 52);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '300 15px "DM Sans", sans-serif';
      ctx.fillText(`${a.artist} · ${(a.ms / 3600000).toFixed(1)} hrs · ${a.count} plays`, 48, y + 78);
      y += 115;
    }

    stats.topAlbums.slice(1).forEach((a, i) => {
      const rank = i + 2;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '36px "Bebas Neue", sans-serif';
      ctx.fillText(`${rank}`, 48, y + 30);

      ctx.fillStyle = '#fff';
      ctx.font = '500 18px "DM Sans", sans-serif';
      ctx.fillText(truncateText(ctx, a.album, 380), 100, y + 24);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '300 12px "DM Sans", sans-serif';
      ctx.fillText(truncateText(ctx, `${a.artist} · ${a.count} plays`, 380), 100, y + 44);

      const barX = 100, barMaxW = W - 148;
      ctx.fillStyle = 'rgba(255,179,71,0.15)';
      roundedRect(ctx, barX, y + 52, barMaxW, 5, 3); ctx.fill();
      ctx.fillStyle = '#ffb347';
      roundedRect(ctx, barX, y + 52, (a.ms / stats.topAlbums[0].ms) * barMaxW, 5, 3); ctx.fill();

      y += 80;
    });

    wrappedFooter(ctx, W, H);
  };
}

// ── Card 5: Listening Habits ─────────────────────────────────

function drawWrappedListeningHabits(stats) {
  return async (canvas) => {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    wrappedCardBg(ctx, W, H, '#1a0a15', '#000d1a');
    let y = wrappedHeader(ctx, stats, 'LISTENING HABITS');

    const habits = [
      { label: 'Peak Listening Hour', value: stats.peakHourLabel, color: '#ff6b35' },
      { label: 'Favorite Day', value: stats.topDow, color: '#c44dff' },
      { label: 'Longest Streak', value: `${stats.longestStreak} days`, color: '#1db954' },
      { label: 'New Artists Discovered', value: stats.newArtists.toLocaleString(), color: '#ffb347' },
      { label: 'Shuffle Mode', value: `${stats.shufflePct}% of the time`, color: '#4d9dff' },
      { label: 'Minutes Per Day', value: Math.round(stats.totalMs / 60000 / Math.max(1, stats.activeDays)).toLocaleString(), color: '#ff6b35' },
    ];

    habits.forEach((h, i) => {
      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '300 14px "DM Sans", sans-serif';
      ctx.fillText(h.label, 48, y + 20);

      // Value
      ctx.fillStyle = h.color;
      ctx.font = '56px "Bebas Neue", sans-serif';
      ctx.fillText(h.value, 48, y + 76);

      // Divider
      if (i < habits.length - 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(48, y + 90, W - 96, 1);
      }
      y += 110;
    });

    wrappedFooter(ctx, W, H);
  };
}

// ── Card 6: Fun Facts ────────────────────────────────────────

function drawWrappedFunFacts(stats) {
  return async (canvas) => {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    wrappedCardBg(ctx, W, H, '#0d0d0d', '#1a0a00');
    let y = wrappedHeader(ctx, stats, 'FUN FACTS');

    const totalMins = Math.round(stats.totalMs / 60000);
    const topArtistName = stats.topArtists[0]?.[0] || 'Unknown';
    const topTrackName = stats.topTracks[0]?.track || 'Unknown';
    const topAlbumName = stats.topAlbums[0]?.album || 'Unknown';

    const facts = [
      { icon: '🎧', text: `You spent ${stats.totalHours.toLocaleString()} hours listening — that's ${Math.round(stats.totalHours / 24)} full days of music` },
      { icon: '🔥', text: `${topArtistName} was your #1 artist with ${(stats.topArtists[0]?.[1].ms / 3600000).toFixed(0)} hours` },
      { icon: '🎵', text: `"${topTrackName}" was your most-played track` },
      { icon: '💿', text: `"${topAlbumName}" was your top album` },
      { icon: '🌅', text: `Your peak listening hour was ${stats.peakHourLabel}` },
      { icon: '📅', text: `You listened on ${stats.activeDays} different days` },
      { icon: '⚡', text: `Your longest streak was ${stats.longestStreak} consecutive days` },
      { icon: '🔀', text: `You had shuffle on ${stats.shufflePct}% of the time` },
      { icon: '🆕', text: `You discovered ${stats.newArtists} new artists this year` },
      { icon: '⏱️', text: `That's about ${Math.round(totalMins / stats.activeDays)} minutes per active day` },
    ];

    facts.forEach((f, i) => {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      roundedRect(ctx, 48, y, W - 96, 64, 12);
      ctx.fill();

      ctx.font = '24px sans-serif';
      ctx.fillText(f.icon, 64, y + 40);

      ctx.fillStyle = '#fff';
      ctx.font = '400 14px "DM Sans", sans-serif';
      const display = truncateText(ctx, f.text, W - 170);
      ctx.fillText(display, 104, y + 38);

      y += 76;
    });

    wrappedFooter(ctx, W, H);
  };
}


// ══════════════════════════════════════════════════════════════
// MOST SKIPPED
// ══════════════════════════════════════════════════════════════

let mostSkippedTab = 'tracks';

function renderMostSkipped(data, tab) {
  if (tab) mostSkippedTab = tab;
  const mode = mostSkippedTab;

  // A track is considered "skipped" if skipped===true OR ms_played < 30000
  const skippedEntries = data.filter(e => e.skipped === true || e.ms_played < 30000);

  const el = document.getElementById('imp-most-skipped');

  if (mode === 'tracks') {
    const map = {};
    // Count skips per track, and also total plays for context
    const totalPlays = {};
    data.forEach(e => {
      const key = `${e.master_metadata_track_name}|||${e.master_metadata_album_artist_name}`;
      totalPlays[key] = (totalPlays[key] || 0) + 1;
    });
    skippedEntries.forEach(e => {
      const key = `${e.master_metadata_track_name}|||${e.master_metadata_album_artist_name}`;
      if (!map[key]) map[key] = { track: e.master_metadata_track_name, artist: e.master_metadata_album_artist_name, skips: 0 };
      map[key].skips++;
    });

    // Only show tracks with 3+ skips (to filter noise)
    const sorted = Object.values(map).filter(d => d.skips >= 3).sort((a, b) => b.skips - a.skips).slice(0, 25);
    const maxSkips = sorted[0]?.skips || 1;

    if (sorted.length === 0) {
      el.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;padding:16px 0;">Not enough skip data — you listen to everything!</p>';
      return;
    }

    el.innerHTML = sorted.map((d, i) => {
      const key = `${d.track}|||${d.artist}`;
      const total = totalPlays[key] || d.skips;
      const skipPct = Math.round((d.skips / total) * 100);
      return `
      <div class="import-row" style="animation-delay:${i * 0.03}s">
        <div class="import-row-rank ${i < 3 ? 'top3' : ''}" style="${i < 3 ? 'color:#ff4444' : ''}">${i + 1}</div>
        <div class="import-row-info">
          <div class="import-row-name">${escapeHtml(d.track)}</div>
          <div class="import-row-sub">${escapeHtml(d.artist)} · ${total} plays</div>
        </div>
        <div class="import-row-bar-wrap">
          <div class="import-row-bar"><div class="import-row-bar-fill skip-bar" style="width:${(d.skips / maxSkips * 100).toFixed(1)}%"></div></div>
        </div>
        <div class="import-row-stat">${d.skips} skips <span style="color:var(--muted);font-size:0.68rem;">(${skipPct}%)</span></div>
      </div>
    `}).join('');
  } else {
    // Artists mode
    const map = {};
    const totalPlays = {};
    data.forEach(e => {
      const a = e.master_metadata_album_artist_name;
      totalPlays[a] = (totalPlays[a] || 0) + 1;
    });
    skippedEntries.forEach(e => {
      const a = e.master_metadata_album_artist_name;
      map[a] = (map[a] || 0) + 1;
    });

    const sorted = Object.entries(map).filter(([, s]) => s >= 3).sort((a, b) => b[1] - a[1]).slice(0, 25);
    const maxSkips = sorted[0]?.[1] || 1;

    if (sorted.length === 0) {
      el.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;padding:16px 0;">Not enough skip data available.</p>';
      return;
    }

    el.innerHTML = sorted.map(([name, skips], i) => {
      const total = totalPlays[name] || skips;
      const skipPct = Math.round((skips / total) * 100);
      return `
      <div class="import-row" style="animation-delay:${i * 0.03}s">
        <div class="import-row-rank ${i < 3 ? 'top3' : ''}" style="${i < 3 ? 'color:#ff4444' : ''}">${i + 1}</div>
        <div class="import-row-info">
          <div class="import-row-name">${escapeHtml(name)}</div>
          <div class="import-row-sub">${total} total plays</div>
        </div>
        <div class="import-row-bar-wrap">
          <div class="import-row-bar"><div class="import-row-bar-fill skip-bar" style="width:${(skips / maxSkips * 100).toFixed(1)}%"></div></div>
        </div>
        <div class="import-row-stat">${skips} skips <span style="color:var(--muted);font-size:0.68rem;">(${skipPct}%)</span></div>
      </div>
    `}).join('');
  }
}

// Skip tab toggle
document.querySelectorAll('.skip-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.parentElement.querySelectorAll('.skip-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderMostSkipped(importState.filtered, btn.dataset.skipTab);
  });
});


// ══════════════════════════════════════════════════════════════
// HOOK NEW FEATURES INTO MAIN RENDER
// ══════════════════════════════════════════════════════════════

// Override renderImportDashboard to also call new features
const _originalRenderImportDashboard = renderImportDashboard;
renderImportDashboard = function() {
  _originalRenderImportDashboard();
  renderArtistDiscovery(importState.filtered, document.getElementById('imp-discovery-count')?.value || 20);
  initOnThisDay();
  populateWrappedYearSelect();
  renderMostSkipped(importState.filtered);
};