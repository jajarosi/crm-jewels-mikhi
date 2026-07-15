/* ============================================================
   מיכאל בלוך — CRM  |  manager.js
   Auth (Passkey + Magic Link) · Realtime · WhatsApp · WebP
   ============================================================ */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.105.0';

/* ═══════════════ 1. הגדרות — למלא כאן ═══════════════ */

const CONFIG = {
  SUPABASE_URL:      'https://byyfxmdjqoxncjziubne.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5eWZ4bWRqcW94bmNqeml1Ym5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwOTgxMjYsImV4cCI6MjA5OTY3NDEyNn0.I2KGgR1g4U6S6d0UZUMoEJF2oLpt28VDRVEY6y3mEDQ',
  STORAGE_BUCKET:    'creations',   // דלי ציבורי ב-Supabase Storage
  MAX_IMG:           1200,          // מקסימום רוחב/גובה (px)
  WEBP_QUALITY:      0.8,
};

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    experimental: { passkey: true },   // חובה עבור registerPasskey / signInWithPasskey
  },
});

/* ═══════════════ 2. מילון עברית ═══════════════ */

const STATUSES = [
  { key: 'nouveau',  label: 'חדש' },
  { key: 'en_cours', label: 'בטיפול' },
  { key: 'attente',  label: 'בהמתנה' },
  { key: 'termine',  label: 'הושלם' },
];

const PATHS = {
  custom:     'עיצוב אישי',
  upload:     'תמונת השראה',
  collection: 'מהקולקציה',
};

/* שדות path=custom, מקובצים */
const SPEC_GROUPS = [
  {
    title: null,
    fields: [
      ['jewel',       'תכשיט'],
      ['jewel_color', 'צבע'],
      ['metal_carat', 'קראט מתכת'],
      ['layout',      'סגנון'],
    ],
  },
  {
    title: 'אבן מרכזית',
    fields: [
      ['gem',         'אבן'],
      ['stone_type',  'סוג'],
      ['origin',      'מקור'],
      ['shape',       'צורה'],
      ['stone_carat', 'קראט'],
    ],
  },
  {
    title: 'אבנים היקפיות',
    fields: [
      ['gem_around',         'אבן'],
      ['stone_type_around',  'סוג'],
      ['origin_around',      'מקור'],
      ['shape_around',       'צורה'],
      ['stone_carat_around', 'קראט'],
    ],
  },
  {
    title: 'מידות',
    fields: [
      ['ring_size',     'מידת טבעת'],
      ['bracelet_size', 'מידת צמיד'],
      ['collier_size',  'אורך שרשרת'],
      ['boucles_type',  'סוג עגילים'],
    ],
  },
];

/* ═══════════════ 3. עזרים ═══════════════ */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

let toastTimer;
function toast(msg, kind = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast' + (kind ? ` is-${kind}` : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

function buzz(ms = 12) {
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch {} }
}

/** זמן יחסי בעברית */
function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'עכשיו';
  if (diff < 3600)  return `לפני ${Math.floor(diff / 60)} דק׳`;
  if (diff < 86400) return `לפני ${Math.floor(diff / 3600)} שע׳`;
  if (diff < 172800) return 'אתמול';
  if (diff < 604800) return `לפני ${Math.floor(diff / 86400)} ימים`;
  return new Date(iso).toLocaleDateString('he-IL', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/**
 * ניקוי מספר טלפון לפורמט ישראלי בינלאומי עבור wa.me
 * "050-123-4567" → "972501234567"
 * "+972 50 123 4567" → "972501234567"
 * "03-1234567" → "97231234567"
 */
function toIsraeliWa(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return null;

  if (d.startsWith('00972'))     d = d.slice(5);
  else if (d.startsWith('972'))  d = d.slice(3);
  else if (d.startsWith('0'))    d = d.slice(1);

  d = d.replace(/^0+/, '');
  if (d.length < 8 || d.length > 9) return null;   // מספר לא תקין
  return '972' + d;
}

const firstName = (full) => String(full ?? '').trim().split(/\s+/)[0] || '';

function waLink(sub) {
  const num = toIsraeliWa(sub.client_phone);
  if (!num) return null;
  const msg =
    `שלום ${firstName(sub.client_name)}, כאן מיכאל בלוך 💎\n` +
    `קיבלתי את הפנייה שלך ואשמח לחזור אליך עם כל הפרטים.`;
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

/* ═══════════════ 4. מצב האפליקציה ═══════════════ */

const state = {
  submissions: [],
  creations:   [],
  filter:      'all',
  view:        'orders',
  fresh:       new Set(),   // מזהי הזמנות שהגיעו ב-Realtime
};

/* ═══════════════ 5. אימות ═══════════════ */

const PK_FLAG = 'mb_passkey_ready';

function showLogin(msg = '', kind = '') {
  $('#app').hidden = true;
  $('#login-screen').hidden = false;
  const m = $('#login-msg');
  m.textContent = msg;
  m.className = 'login__msg' + (kind ? ` is-${kind}` : '');
  // הצגת כפתור Face ID רק אם נרשם מפתח במכשיר הזה
  $('#btn-passkey-login').hidden = localStorage.getItem(PK_FLAG) !== '1';
}

async function showApp(session) {
  $('#login-screen').hidden = true;
  $('#app').hidden = false;
  $('#settings-email').textContent = session?.user?.email ?? '';
  renderFilters();
  await Promise.all([loadSubmissions(), loadCreations()]);
  subscribeRealtime();
}

/** הודעות שגיאה קריאות בעברית */
function authErrorHe(error) {
  const code = error?.code || '';
  const map = {
    passkey_disabled:            'התחברות עם Face ID אינה מופעלת בפרויקט.',
    webauthn_credential_not_found: 'לא נמצא מפתח במכשיר הזה. יש להתחבר עם קישור למייל.',
    email_not_confirmed:         'יש לאשר את כתובת האימייל תחילה.',
    user_banned:                 'המשתמש חסום.',
    over_email_send_rate_limit:  'נשלחו יותר מדי הודעות. נסו שוב בעוד כמה דקות.',
  };
  return map[code] || error?.message || 'אירעה שגיאה. נסו שוב.';
}

/* — קישור קסם — */
$('#form-magiclink').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#input-email').value.trim();
  const btn = $('#btn-magiclink');
  btn.disabled = true; btn.classList.add('is-busy');

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });

  btn.disabled = false; btn.classList.remove('is-busy');
  if (error) {
    showLogin(authErrorHe(error), 'err');
  } else {
    showLogin('נשלח קישור כניסה לאימייל שלך ✓', 'ok');
  }
});

/* — כניסה עם Passkey (Face ID) — */
async function loginWithPasskey({ silent = false } = {}) {
  const btn = $('#btn-passkey-login');
  btn.disabled = true; btn.classList.add('is-busy');
  try {
    const { data, error } = await supabase.auth.signInWithPasskey();
    if (error) throw error;
    buzz(18);
    await showApp(data.session);
    return true;
  } catch (err) {
    // NotAllowedError = המשתמש ביטל, או שאין הרשאת מחווה (טעינה אוטומטית)
    const cancelled = err?.name === 'NotAllowedError' || err?.name === 'AbortError';
    if (!silent && !cancelled) showLogin(authErrorHe(err), 'err');
    return false;
  } finally {
    btn.disabled = false; btn.classList.remove('is-busy');
  }
}

$('#btn-passkey-login').addEventListener('click', () => loginWithPasskey());

/* — רישום Passkey — */
$('#btn-register-passkey').addEventListener('click', async () => {
  const btn = $('#btn-register-passkey');
  btn.disabled = true;
  try {
    const { error } = await supabase.auth.registerPasskey();
    if (error) throw error;
    localStorage.setItem(PK_FLAG, '1');
    buzz(18);
    toast('Face ID הופעל בהצלחה ✓', 'ok');
    closeSheet();
  } catch (err) {
    if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') {
      toast(authErrorHe(err), 'err');
    }
  } finally {
    btn.disabled = false;
  }
});

/* — התנתקות — */
$('#btn-logout').addEventListener('click', async () => {
  await supabase.auth.signOut();
  closeSheet();
  state.submissions = []; state.creations = [];
  showLogin('התנתקת בהצלחה.');
});

/* ═══════════════ 6. טעינת נתונים ═══════════════ */

async function loadSubmissions() {
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { toast('שגיאה בטעינת ההזמנות', 'err'); return; }
  state.submissions = data ?? [];
  renderOrders();
}

async function loadCreations() {
  const { data, error } = await supabase
    .from('creations')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) { toast('שגיאה בטעינת הקולקציה', 'err'); return; }
  state.creations = data ?? [];
  renderCollection();
}

/* ═══════════════ 7. מסננים ומונים ═══════════════ */

function counts() {
  const c = { all: state.submissions.length };
  for (const s of STATUSES) c[s.key] = 0;
  for (const sub of state.submissions) {
    if (sub.status in c) c[sub.status]++;
  }
  return c;
}

function renderFilters() {
  const c = counts();
  const items = [{ key: 'all', label: 'הכל' }, ...STATUSES];

  $('#filters').innerHTML = items.map((f) => `
    <button class="chip${state.filter === f.key ? ' is-active' : ''}" data-filter="${f.key}">
      ${esc(f.label)}
      <span class="chip__n">${c[f.key] ?? 0}</span>
    </button>
  `).join('');

  const badge = $('#tab-badge');
  badge.textContent = c.nouveau ?? 0;
  badge.hidden = !c.nouveau;
}

$('#filters').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;
  state.filter = btn.dataset.filter;
  buzz();
  renderFilters();
  renderOrders();
});

/* ═══════════════ 8. רינדור כרטיסי הזמנה ═══════════════ */

function specsHtml(sub) {
  let html = '';
  for (const group of SPEC_GROUPS) {
    const cells = group.fields
      .filter(([k]) => sub[k] != null && String(sub[k]).trim() !== '')
      .map(([k, label]) => `
        <div class="spec">
          <span class="spec__k">${esc(label)}</span>
          <span class="spec__v">${esc(sub[k])}</span>
        </div>
      `);

    // הילה מוצגת רק אם true
    if (group.title === 'אבנים היקפיות' && sub.has_halo) {
      cells.unshift(`
        <div class="spec">
          <span class="spec__k">הילה</span>
          <span class="spec__v">כן</span>
        </div>
      `);
    }
    if (!cells.length) continue;
    if (group.title) html += `<div class="specs__group">${esc(group.title)}</div>`;
    html += cells.join('');
  }
  return html ? `<div class="specs">${html}</div>` : '';
}

function mediaHtml(sub) {
  if (sub.path === 'upload' && sub.inspiration_img_url) {
    return `
      <button class="media" data-zoom="${esc(sub.inspiration_img_url)}">
        <img class="media__img" src="${esc(sub.inspiration_img_url)}" alt="תמונת השראה" loading="lazy">
        <span class="media__txt">
          <span class="media__k">תמונת השראה</span>
          <span class="media__v">העלאה של הלקוח</span>
          <span class="media__hint">להגדלה — לחצו</span>
        </span>
      </button>`;
  }

  if (sub.path === 'collection') {
    const cr = state.creations.find((c) => c.id === sub.creation_id);
    const img = cr?.img_url;
    const name = sub.creation_name || cr?.name || 'דגם מהקולקציה';
    return `
      <button class="media"${img ? ` data-zoom="${esc(img)}"` : ''}>
        ${img
          ? `<img class="media__img" src="${esc(img)}" alt="${esc(name)}" loading="lazy">`
          : `<span class="media__img"></span>`}
        <span class="media__txt">
          <span class="media__k">דגם מהקולקציה</span>
          <span class="media__v">${esc(name)}</span>
          ${img ? `<span class="media__hint">להגדלה — לחצו</span>` : ''}
        </span>
      </button>`;
  }

  return '';
}

function cardHtml(sub) {
  const wa  = waLink(sub);
  const isNew = state.fresh.has(sub.id);

  return `
  <article class="card${isNew ? ' is-new' : ''}" data-id="${esc(sub.id)}">
    <div class="card__head">
      <div class="card__client">
        <div class="card__name">${esc(sub.client_name)}</div>
        <div class="card__time">${esc(timeAgo(sub.created_at))}</div>
      </div>
      <span class="pill pill--path">${esc(PATHS[sub.path] ?? sub.path)}</span>
    </div>

    <div class="card__contact">
      <span>${esc(sub.client_phone)}</span>
      ${sub.client_email ? `<a href="mailto:${esc(sub.client_email)}">${esc(sub.client_email)}</a>` : ''}
    </div>

    ${sub.comment ? `<div class="card__comment">${esc(sub.comment)}</div>` : ''}

    ${sub.path === 'custom' ? specsHtml(sub) : mediaHtml(sub)}

    <div class="statuses">
      ${STATUSES.map((s) => `
        <button class="st${sub.status === s.key ? ' is-on' : ''}"
                data-status="${s.key}" data-set="${esc(sub.id)}">${esc(s.label)}</button>
      `).join('')}
    </div>

    <div class="card__actions">
      ${wa
        ? `<a class="act act--wa" href="${esc(wa)}" target="_blank" rel="noopener">
             <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm5.8 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5-4.5-.2-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .7.5l.9 2.1c.1.2.1.4 0 .6l-.4.5-.3.3c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.6 0l.9-1c.2-.2.4-.2.6-.1l2 1c.3.1.5.2.5.4.1.2.1.9-.2 1.5Z"/></svg>
             וואטסאפ
           </a>`
        : `<span class="act act--tel" style="opacity:.5">מספר לא תקין</span>`}
      <a class="act act--tel" href="tel:${esc(String(sub.client_phone).replace(/[^\d+]/g, ''))}">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4h3l2 5-2.5 1.5a12 12 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
        חיוג
      </a>
      <button class="act act--del" data-del="${esc(sub.id)}" aria-label="מחיקת הזמנה">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  </article>`;
}

function renderOrders() {
  const list = state.filter === 'all'
    ? state.submissions
    : state.submissions.filter((s) => s.status === state.filter);

  $('#orders-list').innerHTML = list.map(cardHtml).join('');
  $('#orders-empty').hidden = list.length > 0;
}

/* — שינוי סטטוס (עדכון אופטימי) — */
$('#orders-list').addEventListener('click', async (e) => {
  const zoom = e.target.closest('[data-zoom]');
  if (zoom) { openLightbox(zoom.dataset.zoom); return; }

  const del = e.target.closest('[data-del]');
  if (del) { await deleteSubmission(del.dataset.del); return; }

  const btn = e.target.closest('[data-set]');
  if (!btn) return;

  const id = btn.dataset.set;
  const next = btn.dataset.status;
  const sub = state.submissions.find((s) => s.id === id);
  if (!sub || sub.status === next) return;

  const prev = sub.status;
  sub.status = next;                 // ① עדכון מיידי ב-UI
  buzz();
  renderFilters();
  renderOrders();

  const { error } = await supabase   // ② שליחה לשרת
    .from('submissions')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {                       // ③ שחזור במקרה של כשל
    sub.status = prev;
    renderFilters();
    renderOrders();
    toast('העדכון נכשל. נסו שוב.', 'err');
  }
});

async function deleteSubmission(id) {
  if (!confirm('למחוק את ההזמנה לצמיתות?')) return;
  const idx = state.submissions.findIndex((s) => s.id === id);
  if (idx === -1) return;
  const [removed] = state.submissions.splice(idx, 1);
  renderFilters();
  renderOrders();

  const { error } = await supabase.from('submissions').delete().eq('id', id);
  if (error) {
    state.submissions.splice(idx, 0, removed);
    renderFilters();
    renderOrders();
    toast('המחיקה נכשלה.', 'err');
  } else {
    toast('ההזמנה נמחקה.');
  }
}

/* ═══════════════ 9. Realtime ═══════════════ */

let channel = null;

function subscribeRealtime() {
  if (channel) return;

  channel = supabase
    .channel('submissions-live')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'submissions' },
      (payload) => {
        const { eventType, new: row, old } = payload;

        if (eventType === 'INSERT') {
          if (state.submissions.some((s) => s.id === row.id)) return;
          state.submissions.unshift(row);
          state.fresh.add(row.id);
          setTimeout(() => state.fresh.delete(row.id), 6000);
          buzz(30);
          toast(`הזמנה חדשה — ${row.client_name} 💎`, 'ok');
        }

        else if (eventType === 'UPDATE') {
          const i = state.submissions.findIndex((s) => s.id === row.id);
          if (i !== -1) state.submissions[i] = row;
          else state.submissions.unshift(row);
        }

        else if (eventType === 'DELETE') {
          state.submissions = state.submissions.filter((s) => s.id !== old.id);
        }

        renderFilters();
        renderOrders();
      })
    .subscribe((status) => {
      $('#live-dot').classList.toggle('is-on', status === 'SUBSCRIBED');
    });
}

/* — סנכרון בחזרה לאפליקציה (נעילת אייפון) — */
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await Promise.all([loadSubmissions(), loadCreations()]);
  if (channel && channel.state !== 'joined') {
    supabase.removeChannel(channel);
    channel = null;
    subscribeRealtime();
  }
});

window.addEventListener('online', () => {
  if (!$('#app').hidden) loadSubmissions();
});

/* ═══════════════ 10. קולקציה ═══════════════ */

function renderCollection() {
  $('#collection-grid').innerHTML = state.creations.map((c) => `
    <figure class="item" data-cid="${c.id}">
      <img class="item__img" src="${esc(c.img_url)}" alt="${esc(c.name)}"
           loading="lazy" data-zoom="${esc(c.img_url)}">
      <figcaption class="item__bar">
        <span class="item__name">${esc(c.name)}</span>
        <button class="item__del" data-del-c="${c.id}" aria-label="מחיקת ${esc(c.name)}">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </figcaption>
    </figure>
  `).join('');
  $('#collection-empty').hidden = state.creations.length > 0;
}

$('#collection-grid').addEventListener('click', async (e) => {
  const del = e.target.closest('[data-del-c]');
  if (del) { await deleteCreation(Number(del.dataset.delC)); return; }
  const zoom = e.target.closest('[data-zoom]');
  if (zoom) openLightbox(zoom.dataset.zoom);
});

async function deleteCreation(id) {
  const cr = state.creations.find((c) => c.id === id);
  if (!cr) return;
  if (!confirm(`להסיר את "${cr.name}" מהקולקציה?`)) return;

  const node = $(`.item[data-cid="${id}"]`);
  node?.classList.add('is-gone');

  const { error } = await supabase.from('creations').delete().eq('id', id);
  if (error) {
    node?.classList.remove('is-gone');
    toast('המחיקה נכשלה.', 'err');
    return;
  }

  // ניקוי הקובץ מה-Storage (אם הועלה דרך האפליקציה)
  const path = storagePathFromUrl(cr.img_url);
  if (path) await supabase.storage.from(CONFIG.STORAGE_BUCKET).remove([path]);

  state.creations = state.creations.filter((c) => c.id !== id);
  renderCollection();
  toast('התכשיט הוסר.');
}

function storagePathFromUrl(url) {
  const marker = `/storage/v1/object/public/${CONFIG.STORAGE_BUCKET}/`;
  const i = String(url ?? '').indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

/* ── דחיסה: שינוי גודל ל-1200px + המרה ל-WebP ── */

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

const canvasToBlob = (canvas, type, q) =>
  new Promise((res) => canvas.toBlob(res, type, q));

/**
 * מקטין ל-MAX_IMG ומחזיר WebP באיכות 80%.
 * נסיגה ל-JPEG אם הדפדפן לא מקודד WebP.
 */
async function compressImage(file) {
  const img = await loadImage(file);
  const { naturalWidth: w, naturalHeight: h } = img;

  const scale = Math.min(1, CONFIG.MAX_IMG / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width  = Math.round(w * scale);
  canvas.height = Math.round(h * scale);

  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let blob = await canvasToBlob(canvas, 'image/webp', CONFIG.WEBP_QUALITY);
  let ext  = 'webp';

  if (!blob || blob.type !== 'image/webp') {          // Safari ישן
    blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);
    ext  = 'jpg';
  }
  if (!blob) throw new Error('encode');
  return { blob, ext };
}

$('#btn-add-creation').addEventListener('click', () => $('#file-creation').click());

$('#file-creation').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';                    // מאפשר לבחור שוב את אותו קובץ
  if (!file) return;

  const name = prompt('שם התכשיט:', '')?.trim();
  if (!name) return;

  const btn = $('#btn-add-creation');
  btn.disabled = true;
  const label = btn.querySelector('span');
  label.textContent = 'מעלה…';

  try {
    const { blob, ext } = await compressImage(file);
    label.textContent = `מעלה… (${Math.round(blob.size / 1024)} ק״ב)`;

    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(CONFIG.STORAGE_BUCKET)
      .upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
    if (upErr) throw upErr;

    const { data: { publicUrl } } = supabase.storage
      .from(CONFIG.STORAGE_BUCKET)
      .getPublicUrl(path);

    const maxOrder = state.creations.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0);

    const { data, error } = await supabase
      .from('creations')
      .insert({ name, img_url: publicUrl, active: true, sort_order: maxOrder + 1 })
      .select()
      .single();

    if (error) {
      await supabase.storage.from(CONFIG.STORAGE_BUCKET).remove([path]);  // ניקוי
      throw error;
    }

    state.creations.push(data);
    renderCollection();
    buzz(20);
    toast('התכשיט נוסף לקולקציה ✓', 'ok');

  } catch (err) {
    const dup = err?.code === '23505';
    toast(dup ? 'שם זה כבר קיים בקולקציה.' : 'ההעלאה נכשלה. נסו שוב.', 'err');
    console.error(err);
  } finally {
    btn.disabled = false;
    label.textContent = 'הוספת תכשיט לקולקציה';
  }
});

/* ═══════════════ 11. ניווט, גיליון, תמונה ═══════════════ */

$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const view = tab.dataset.view;
    state.view = view;
    buzz();

    $$('.tab').forEach((t) => {
      const on = t === tab;
      t.classList.toggle('is-active', on);
      if (on) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });

    $('#view-orders').hidden     = view !== 'orders';
    $('#view-collection').hidden = view !== 'collection';
    $('#filters').hidden         = view !== 'orders';
    $('#view-title').textContent = view === 'orders' ? 'הזמנות' : 'קולקציה';
    window.scrollTo({ top: 0 });
  });
});

function openSheet()  { $('#sheet-backdrop').hidden = false; $('#sheet-settings').hidden = false; }
function closeSheet() { $('#sheet-backdrop').hidden = true;  $('#sheet-settings').hidden = true; }

$('#btn-menu').addEventListener('click', openSheet);
$('#sheet-backdrop').addEventListener('click', closeSheet);
$('#btn-refresh').addEventListener('click', async () => {
  closeSheet();
  await Promise.all([loadSubmissions(), loadCreations()]);
  toast('הנתונים עודכנו ✓', 'ok');
});

function openLightbox(src) {
  $('#lightbox-img').src = src;
  $('#lightbox').hidden = false;
}
$('#lightbox').addEventListener('click', () => {
  $('#lightbox').hidden = true;
  $('#lightbox-img').src = '';
});

/* ═══════════════ 12. אתחול ═══════════════ */

(async function init() {
  // 1. יש כבר סשן שמור? כניסה מיידית.
  const { data: { session } } = await supabase.auth.getSession();
  if (session) { await showApp(session); return; }

  // 2. אין סשן — אם נרשם Face ID במכשיר, מנסים אוטומטית.
  showLogin();
  if (localStorage.getItem(PK_FLAG) === '1') {
    // ב-Safari נדרשת מחווה של המשתמש; אם נחסם, הכפתור נשאר זמין.
    await loginWithPasskey({ silent: true });
  }
})();

supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session && $('#app').hidden) {
    // מגיע גם מלחיצה על הקישור במייל
    window.history.replaceState({}, '', window.location.pathname);
    await showApp(session);
  }
  if (event === 'SIGNED_OUT') {
    if (channel) { supabase.removeChannel(channel); channel = null; }
    showLogin();
  }
});

/* — Service Worker — */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}
