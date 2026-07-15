/* ============================================================
   מיכאל בלוך — CRM  |  manager.js
   Auth (קוד סודי + Passkey) · Realtime · WhatsApp · WebP
   ============================================================ */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.105.0';

/* ═══════════════ 1. הגדרות — למלא כאן ═══════════════ */

const CONFIG = {
  SUPABASE_URL:      'https://byyfxmdjqoxncjziubne.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5eWZ4bWRqcW94bmNqeml1Ym5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwOTgxMjYsImV4cCI6MjA5OTY3NDEyNn0.I2KGgR1g4U6S6d0UZUMoEJF2oLpt28VDRVEY6y3mEDQ',
  STORAGE_BUCKET:    'creations',   // דלי ציבורי ב-Supabase Storage
  MODELS_FOLDER:     '3d_models',   // תיקיית קבצי התלת־ממד בתוך הדלי
  MAX_IMG:           1200,          // מקסימום רוחב/גובה (px)
  WEBP_QUALITY:      0.8,
  MAX_3D_BYTES:      52428800,      // 50MB — התקרה של תוכנית Free ב-Supabase

  /* חשבון הפטרון — האימייל קבוע ומוסתר מהממשק.
     הקוד הסודי שמוקלד במסך הכניסה הוא הסיסמה של החשבון הזה.
     ⚠️ הקובץ הזה ציבורי: האימייל גלוי לכל. הקוד הסודי הוא ההגנה היחידה. */
  PATRON_EMAIL:      'michael@gmail.com',
};

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,        // אין יותר קישורי קסם
    experimental: { passkey: true },  // חובה עבור registerPasskey / signInWithPasskey
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

/* ═══════════════ 3b. מצב יום / לילה ═══════════════ */

const THEME_KEY = 'mb_theme';

const ICON_MOON = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>';
const ICON_SUN  = '<circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.7"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>';

function applyTheme(theme) {
  const dark = theme !== 'light';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';

  $('#btn-theme').setAttribute('aria-checked', String(dark));
  $('#theme-label').textContent = dark ? 'מצב לילה' : 'מצב יום';
  $('#theme-ico').innerHTML = dark ? ICON_MOON : ICON_SUN;

  // צובע את סרגל המצב של iOS באפליקציה המותקנת
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#0a0a0b' : '#f4f4f7';
}

function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

$('#btn-theme').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch {}
  buzz();
});

// הסקריפט ב-<head> כבר החיל את הערך; כאן מסנכרנים את המתג עצמו
applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');

/* ═══════════════ 4. מצב האפליקציה ═══════════════ */

const state = {
  submissions: [],
  creations:   [],
  filter:      'all',
  query:       '',          // טקסט החיפוש
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

async function showApp(session, { offerPasskey = false } = {}) {
  $('#login-screen').hidden = true;
  $('#app').hidden = false;
  $('#settings-status').textContent = 'מחובר ✓';
  $('#input-code').value = '';
  renderFilters();
  await Promise.all([loadSubmissions(), loadCreations()]);
  subscribeRealtime();

  // אחרי כניסה עם קוד: מציעים Face ID, אם עוד לא הופעל במכשיר הזה
  if (offerPasskey && localStorage.getItem(PK_FLAG) !== '1' && passkeySupported()) {
    setTimeout(openOnboard, 500);
  }
}

const passkeySupported = () =>
  typeof window.PublicKeyCredential !== 'undefined';

/** הודעות שגיאה קריאות בעברית */
function authErrorHe(error) {
  const code = error?.code || '';
  const map = {
    invalid_credentials:           'קוד שגוי. נסו שוב.',
    passkey_disabled:              'התחברות עם Face ID אינה מופעלת בפרויקט.',
    webauthn_credential_not_found: 'לא נמצא מפתח במכשיר הזה. הקלידו את הקוד הסודי.',
    user_banned:                   'החשבון חסום.',
    over_request_rate_limit:       'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.',
  };
  return map[code] || error?.message || 'אירעה שגיאה. נסו שוב.';
}

/* — כניסה עם קוד סודי —
   האימייל קבוע ומוסתר; הקוד שמוקלד הוא הסיסמה של חשבון הפטרון. */
$('#form-code').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('#input-code').value;
  if (!code) return;

  const btn = $('#btn-code');
  btn.disabled = true; btn.classList.add('is-busy');

  const { data, error } = await supabase.auth.signInWithPassword({
    email: CONFIG.PATRON_EMAIL,
    password: code,
  });

  btn.disabled = false; btn.classList.remove('is-busy');

  if (error) {
    $('#input-code').value = '';
    buzz(40);
    showLogin(authErrorHe(error), 'err');
    return;
  }

  buzz(18);
  await showApp(data.session, { offerPasskey: true });
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

/* — רישום Passkey (Face ID) — */
async function enablePasskey(btn) {
  if (btn) btn.disabled = true;
  try {
    const { error } = await supabase.auth.registerPasskey();
    if (error) throw error;
    localStorage.setItem(PK_FLAG, '1');
    buzz(18);
    toast('Face ID הופעל בהצלחה ✓', 'ok');
    return true;
  } catch (err) {
    // ביטול של המשתמש אינו שגיאה — לא מציגים הודעה
    if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') {
      toast(authErrorHe(err), 'err');
    }
    return false;
  } finally {
    if (btn) btn.disabled = false;
  }
}

$('#btn-register-passkey').addEventListener('click', async (e) => {
  const ok = await enablePasskey(e.currentTarget);
  if (ok) closeSheet();
});

/* — הצעת Face ID אחרי הכניסה הראשונה — */
function openOnboard()  { $('#onboard-backdrop').hidden = false; $('#sheet-onboard').hidden = false; }
function closeOnboard() { $('#onboard-backdrop').hidden = true;  $('#sheet-onboard').hidden = true; }

$('#btn-onboard-yes').addEventListener('click', async (e) => {
  const ok = await enablePasskey(e.currentTarget);
  if (ok) closeOnboard();
});
$('#btn-onboard-no').addEventListener('click', closeOnboard);
$('#onboard-backdrop').addEventListener('click', closeOnboard);

/* — התנתקות — */
/* ניקוי המצב והחזרה למסך הכניסה נעשים במאזין onAuthStateChange */
$('#btn-logout').addEventListener('click', async () => {
  closeSheet();
  await supabase.auth.signOut();
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
  // כרטיסי ההזמנות תלויים ב-creations (תמונת הדגם, כפתור התלת־ממד),
  // ושתי הטעינות רצות במקביל — לכן מציירים אותם מחדש כאן.
  renderOrders();
}

/* ═══════════════ 7. חיפוש, מסננים ומונים ═══════════════ */

/** כל הטקסט של הזמנה, לחיפוש חופשי */
function haystack(sub) {
  const cr = state.creations.find((c) => c.id === sub.creation_id);
  return [
    sub.client_name, sub.client_email, sub.comment,
    sub.creation_name, cr?.name, PATHS[sub.path],
    sub.jewel, sub.jewel_color, sub.metal_carat, sub.layout,
    sub.gem, sub.stone_type, sub.origin, sub.shape, sub.stone_carat,
    sub.gem_around, sub.stone_type_around, sub.origin_around,
    sub.shape_around, sub.stone_carat_around,
    sub.ring_size, sub.bracelet_size, sub.collier_size, sub.boucles_type,
  ].filter(Boolean).join(' ').toLowerCase();
}

/**
 * טלפון בשלוש צורות, כדי שכל דרך חיפוש תעבוד:
 *   raw   — כפי שהוקלד, ללא סימנים   "+972 54 987 6543" → "972549876543"
 *   intl  — בינלאומי                              → "972549876543"
 *   local — לאומי, עם 0 בהתחלה                    → "0549876543"
 * בלי הצורה הלאומית, חיפוש "054" לא היה מוצא מספר ששמור כ-+972.
 */
function phoneHaystack(phone) {
  const raw   = String(phone ?? '').replace(/\D/g, '');
  const intl  = toIsraeliWa(phone) ?? '';
  const local = intl ? '0' + intl.slice(3) : '';
  return `${raw} ${intl} ${local}`;
}

/** כל המילים חייבות להימצא (AND), בטקסט או בטלפון */
function matchesQuery(sub, query) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;

  const text  = haystack(sub);
  const phone = phoneHaystack(sub.client_phone);

  return tokens.every((t) => {
    if (text.includes(t)) return true;
    const digits = t.replace(/\D/g, '');
    return digits.length >= 2 && phone.includes(digits);
  });
}

/** ההזמנות שעברו את החיפוש (לפני סינון הסטטוס) */
function searched() {
  const q = state.query.trim();
  return q ? state.submissions.filter((s) => matchesQuery(s, q)) : state.submissions;
}

function counts() {
  const base = searched();
  const c = { all: base.length };
  for (const s of STATUSES) c[s.key] = 0;
  for (const sub of base) {
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

/* — חיפוש — */

function applySearch(value) {
  state.query = value;
  $('#btn-search-clear').hidden = !value;
  renderFilters();   // המונים משקפים את תוצאות החיפוש
  renderOrders();
}

// השהיה קצרה: מונעת ציור מחדש של כל הרשימה בכל הקשה
let searchTimer;
$('#input-search').addEventListener('input', (e) => {
  const value = e.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => applySearch(value), 120);
});

// מקש "חיפוש" במקלדת — סוגר אותה
$('#input-search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
});

$('#btn-search-clear').addEventListener('click', () => {
  $('#input-search').value = '';
  clearTimeout(searchTimer);
  applySearch('');
  buzz();
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

/** כפתור הורדת קובץ התלת־ממד — רק אם לדגם שנבחר מצורף קובץ */
function threeDHtml(sub) {
  if (sub.path !== 'collection') return '';
  const cr  = state.creations.find((c) => c.id === sub.creation_id);
  const url = download3dUrl(cr);
  if (!url) return '';
  return `
    <a class="act act--3d" href="${esc(url)}" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      הורדת קובץ תלת־ממד
    </a>`;
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
    ${threeDHtml(sub)}

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
  const base = searched();
  const list = state.filter === 'all'
    ? base
    : base.filter((s) => s.status === state.filter);

  $('#orders-list').innerHTML = list.map(cardHtml).join('');
  $('#orders-empty').hidden = list.length > 0;

  if (list.length) return;

  // מצב ריק מותאם: אין תוצאות / אין הזמנות בסטטוס / אין הזמנות בכלל
  const q = state.query.trim();
  const statusLabel = STATUSES.find((s) => s.key === state.filter)?.label;

  if (q) {
    $('#empty-title').textContent = 'אין תוצאות';
    $('#empty-text').textContent  = `לא נמצאה הזמנה עבור "${q}".`;
  } else if (statusLabel) {
    $('#empty-title').textContent = `אין הזמנות בסטטוס "${statusLabel}"`;
    $('#empty-text').textContent  = 'בחרו סטטוס אחר או "הכל".';
  } else {
    $('#empty-title').textContent = 'אין הזמנות';
    $('#empty-text').textContent  = 'הזמנות חדשות יופיעו כאן אוטומטית.';
  }
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
      <img class="item__img" src="${esc(c.img_url)}" alt="${esc(c.name)}" loading="lazy">
      <figcaption class="item__bar">
        <span class="item__name">${esc(c.name)}</span>
        ${c.file_3d_url ? '<span class="pill pill--3d" title="קובץ תלת־ממד מצורף">3D</span>' : ''}
        <button class="item__del" data-del-c="${c.id}" aria-label="מחיקת ${esc(c.name)}">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </figcaption>
    </figure>
  `).join('');
  $('#collection-empty').hidden = state.creations.length > 0;
}

/* לחיצה על תכשיט פותחת עריכה; כפתור הפח מוחק */
$('#collection-grid').addEventListener('click', async (e) => {
  const del = e.target.closest('[data-del-c]');
  if (del) { await deleteCreation(Number(del.dataset.delC)); return; }

  const item = e.target.closest('[data-cid]');
  if (!item) return;
  const cr = state.creations.find((c) => c.id === Number(item.dataset.cid));
  if (cr) openProduct(cr);
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

  // ניקוי הקבצים מה-Storage — גם התמונה וגם קובץ התלת־ממד
  await removeStorage([cr.img_url, cr.file_3d_url]);

  state.creations = state.creations.filter((c) => c.id !== id);
  renderCollection();
  toast('התכשיט הוסר.');
}

function storagePathFromUrl(url) {
  const marker = `/storage/v1/object/public/${CONFIG.STORAGE_BUCKET}/`;
  const s = String(url ?? '').split('?')[0];        // מסיר ?download=…
  const i = s.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(s.slice(i + marker.length));
}

/** מוחק קבצים מה-Storage לפי ה-URL הציבורי שלהם. שקט: כישלון אינו קריטי. */
async function removeStorage(urls) {
  const paths = (Array.isArray(urls) ? urls : [urls])
    .map(storagePathFromUrl)
    .filter(Boolean);
  if (!paths.length) return;
  await supabase.storage.from(CONFIG.STORAGE_BUCKET).remove(paths);
}

/** סיומת קובץ מנורמלת ("Ring_v2.3DM" → "3dm") */
function fileExt(name) {
  const m = String(name ?? '').match(/\.([a-z0-9]{1,8})$/i);
  return m ? m[1].toLowerCase() : 'bin';
}

const humanSize = (b) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;

/** URL הורדה שמכריח הורדה (Content-Disposition) עם שם קריא */
function download3dUrl(cr) {
  if (!cr?.file_3d_url) return null;
  const ext  = fileExt(storagePathFromUrl(cr.file_3d_url) ?? '');
  const name = `${cr.name}.${ext}`.replace(/[\\/:*?"<>|]/g, '-');
  return `${cr.file_3d_url}?download=${encodeURIComponent(name)}`;
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

/* ── העלאה ל-Storage ── */

const randomPath = (ext, folder = '') =>
  `${folder ? folder + '/' : ''}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

/** מעלה ומחזיר { path, url }. זורק שגיאה בכישלון. */
async function uploadToStorage(path, body, contentType) {
  const { error } = await supabase.storage
    .from(CONFIG.STORAGE_BUCKET)
    .upload(path, body, { contentType, cacheControl: '31536000' });
  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from(CONFIG.STORAGE_BUCKET)
    .getPublicUrl(path);
  return { path, url: publicUrl };
}

/* ── טופס תכשיט: הוספה ועריכה ── */

const product = {
  editing: null,    // רשומת creations בעריכה; null = תכשיט חדש
  img:     null,    // { blob, ext } — תמונה חדשה שנבחרה
  imgUrl:  null,    // object-URL לתצוגה מקדימה (חובה לשחרר)
  file3d:  null,    // File — קובץ תלת־ממד חדש שנבחר
  clear3d: false,   // בקשה למחוק את הקובץ הקיים
};

function releasePreview() {
  if (product.imgUrl) { URL.revokeObjectURL(product.imgUrl); product.imgUrl = null; }
}

function openProduct(creation = null) {
  releasePreview();
  product.editing = creation;
  product.img = null;
  product.file3d = null;
  product.clear3d = false;

  $('#product-title').textContent = creation ? 'עריכת תכשיט' : 'תכשיט חדש';
  $('#input-name').value = creation?.name ?? '';
  $('#product-progress').hidden = true;
  $('#product-bar').style.width = '0%';

  renderProductForm();
  $('#product-backdrop').hidden = false;
  $('#sheet-product').hidden = false;
}

function closeProduct() {
  releasePreview();
  product.editing = null;
  product.img = null;
  product.file3d = null;
  product.clear3d = false;
  $('#product-backdrop').hidden = true;
  $('#sheet-product').hidden = true;
}

function renderProductForm() {
  // ── תמונה ──
  const previewUrl = product.imgUrl ?? product.editing?.img_url ?? null;
  const prev = $('#pick-img-prev');
  prev.hidden = !previewUrl;
  $('#pick-img-ph').hidden = !!previewUrl;
  if (previewUrl) prev.src = previewUrl;

  $('#pick-img').classList.toggle('picker--empty', !previewUrl);
  $('#pick-img-v').textContent = product.img
    ? `תמונה חדשה (${humanSize(product.img.blob.size)})`
    : previewUrl ? 'החלפת התמונה' : 'בחירת תמונה';

  // ── קובץ תלת־ממד ──
  const existing3d = !product.clear3d ? product.editing?.file_3d_url : null;
  const has3d = !!(product.file3d || existing3d);

  $('#pick-3d').classList.toggle('picker--empty', !has3d);
  $('#btn-3d-clear').hidden = !has3d;

  const v = $('#pick-3d-v'), hint = $('#pick-3d-hint');
  hint.classList.toggle('picker__hint--gold', !!product.file3d);

  if (product.file3d) {
    v.textContent = product.file3d.name;
    hint.textContent = `קובץ חדש · ${humanSize(product.file3d.size)}`;
  } else if (existing3d) {
    v.textContent = `${product.editing.name}.${fileExt(storagePathFromUrl(existing3d) ?? '')}`;
    hint.textContent = 'קובץ קיים — לחצו להחלפה';
  } else {
    v.textContent = 'בחירת קובץ';
    hint.textContent = product.clear3d ? 'הקובץ יימחק בשמירה' : '3dm, stl, obj, step…';
  }
}

/* בחירת קבצים */
$('#btn-add-creation').addEventListener('click', () => openProduct(null));
$('#pick-3d').addEventListener('click', () => $('#file-3d').click());
$('#btn-product-cancel').addEventListener('click', closeProduct);
$('#product-backdrop').addEventListener('click', closeProduct);

/* לחיצה על הכרטיס פותחת את התפריט של iOS (מצלמה / גלריה / קבצים);
   הכפתורים הייעודיים חוסכים את הבחירה הזו. */
$('#pick-img').addEventListener('click',    () => $('#file-img').click());
$('#btn-gallery').addEventListener('click', () => $('#file-img').click());
$('#btn-cam').addEventListener('click',     () => $('#file-img-cam').click());

/**
 * מסלול אחד לכל התמונות — מהמצלמה או מהגלריה:
 * הקטנה ל-1200px ← המרה ל-WebP 80% ← תצוגה מקדימה.
 */
async function handleImageFile(file) {
  const btn = $('#btn-cam');
  btn.disabled = true;
  $('#pick-img-v').textContent = 'מעבד…';
  try {
    const { blob, ext } = await compressImage(file);
    releasePreview();
    product.img = { blob, ext };
    product.imgUrl = URL.createObjectURL(blob);
    buzz();
  } catch {
    // HEIC ישן, קובץ פגום, או תמונה גדולה מדי לזיכרון
    toast('לא ניתן לקרוא את התמונה. נסו שוב.', 'err');
  } finally {
    btn.disabled = false;
    renderProductForm();
  }
}

for (const id of ['#file-img', '#file-img-cam']) {
  $(id).addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';          // מאפשר לצלם שוב את אותה תמונה
    if (file) await handleImageFile(file);
  });
}

$('#file-3d').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;

  if (file.size > CONFIG.MAX_3D_BYTES) {
    toast(`הקובץ גדול מדי (${humanSize(file.size)}). המגבלה היא ${humanSize(CONFIG.MAX_3D_BYTES)}.`, 'err');
    return;
  }
  product.file3d = file;
  product.clear3d = false;
  renderProductForm();
});

/* הסרת הקובץ: מבטלת בחירה חדשה, או מסמנת קובץ קיים למחיקה בשמירה */
$('#btn-3d-clear').addEventListener('click', () => {
  if (product.file3d) product.file3d = null;
  else product.clear3d = true;
  buzz();
  renderProductForm();
});

/* ── שמירה ── */

$('#form-product').addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = $('#input-name').value.trim();
  if (!name) return;

  const isEdit = !!product.editing;
  if (!isEdit && !product.img) { toast('יש לבחור תמונה.', 'err'); return; }

  const btn = $('#btn-product-save');
  btn.disabled = true; btn.classList.add('is-busy');
  $('#product-progress').hidden = false;
  $('#product-bar').style.width = '15%';

  const uploaded = [];   // לניקוי אם ה-DB ייכשל

  try {
    // 1. תמונה חדשה
    let imgUrl = product.editing?.img_url ?? null;
    if (product.img) {
      const { blob, ext } = product.img;
      const up = await uploadToStorage(randomPath(ext), blob, blob.type);
      uploaded.push(up.path);
      imgUrl = up.url;
    }
    $('#product-bar').style.width = '45%';

    // 2. קובץ תלת־ממד חדש
    let url3d = isEdit ? product.editing.file_3d_url : null;
    if (product.file3d) {
      const f = product.file3d;
      const up = await uploadToStorage(
        randomPath(fileExt(f.name), CONFIG.MODELS_FOLDER),
        f,
        f.type || 'application/octet-stream',
      );
      uploaded.push(up.path);
      url3d = up.url;
    } else if (product.clear3d) {
      url3d = null;
    }
    $('#product-bar').style.width = '75%';

    // 3. שורת ה-DB
    let row;
    if (isEdit) {
      const { data, error } = await supabase
        .from('creations')
        .update({ name, img_url: imgUrl, file_3d_url: url3d })
        .eq('id', product.editing.id)
        .select()
        .single();
      if (error) throw error;
      row = data;
    } else {
      const maxOrder = state.creations.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0);
      const { data, error } = await supabase
        .from('creations')
        .insert({ name, img_url: imgUrl, file_3d_url: url3d, active: true, sort_order: maxOrder + 1 })
        .select()
        .single();
      if (error) throw error;
      row = data;
    }
    $('#product-bar').style.width = '100%';

    // 4. רק אחרי הצלחת ה-DB: מוחקים את הקבצים הישנים שהוחלפו
    const stale = [];
    if (product.img && product.editing?.img_url) stale.push(product.editing.img_url);
    if ((product.file3d || product.clear3d) && product.editing?.file_3d_url) {
      stale.push(product.editing.file_3d_url);
    }
    await removeStorage(stale);

    // 5. עדכון המצב המקומי
    const i = state.creations.findIndex((c) => c.id === row.id);
    if (i === -1) state.creations.push(row);
    else state.creations[i] = row;

    renderCollection();
    renderOrders();          // כפתור התלת־ממד בכרטיסים עשוי להשתנות
    buzz(20);
    toast(isEdit ? 'התכשיט עודכן ✓' : 'התכשיט נוסף לקולקציה ✓', 'ok');
    closeProduct();

  } catch (err) {
    await removeStorage(                       // ניקוי מה שהספקנו להעלות
      uploaded.map((p) =>
        supabase.storage.from(CONFIG.STORAGE_BUCKET).getPublicUrl(p).data.publicUrl),
    );
    const dup = err?.code === '23505';
    const big = err?.message?.match(/exceeded|too large|maximum/i);
    toast(
      dup ? 'שם זה כבר קיים בקולקציה.'
      : big ? 'הקובץ גדול מהמותר בדלי האחסון.'
      : 'השמירה נכשלה. נסו שוב.',
      'err',
    );
    console.error(err);
  } finally {
    btn.disabled = false; btn.classList.remove('is-busy');
    $('#product-progress').hidden = true;
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
    $('#search-bar').hidden      = view !== 'orders';
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

/* הכניסה עצמה מטופלת ישירות ב-form-code וב-loginWithPasskey,
   ולכן כאן מטפלים רק בניתוק (כולל רענון טוקן שנכשל). */
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    if (channel) { supabase.removeChannel(channel); channel = null; }
    state.submissions = []; state.creations = [];
    showLogin();
  }
});

/* — Service Worker — */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}
