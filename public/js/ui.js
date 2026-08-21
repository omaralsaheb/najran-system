// ============ أدوات الواجهة: الرسم، التنقل، الإشعارات، البحث ============
import { state, NAV_LABELS, esc, employeeName, clientName } from './state.js';

/* ---------- الشاشات ---------- */

export function showScreen(name) {
  document.getElementById('landing-screen').style.display = name === 'landing' ? 'block' : 'none';
  document.getElementById('login-screen').style.display = name === 'login' ? 'flex' : 'none';
  document.getElementById('dashboard-screen').style.display = name === 'dashboard' ? 'block' : 'none';
  document.body.style.overflow = name === 'landing' ? 'hidden' : 'auto';
}

/* ---------- الرسم ---------- */

export function render(html) {
  document.getElementById('main').innerHTML = html;
}

// المودالات بتنضاف فوق محتوى الصفحة الحالي بدل ما تمسحه
export function openModal(html) {
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `<div class="modal">${html}</div>`;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeModal(); });
  document.body.appendChild(wrap);
  const firstInput = wrap.querySelector('input, select, textarea');
  if (firstInput) firstInput.focus();
}

export function closeModal() {
  document.querySelectorAll('body > .overlay').forEach((el) => el.remove());
}

export function loading(title = 'عم نجيب البيانات...') {
  render(`<div class="empty-state"><div class="empty-title">${esc(title)}</div></div>`);
}

export function errorState(title, detail) {
  render(`<div class="empty-state"><div class="empty-title">${esc(title)}</div><div class="empty-sub">${esc(detail || '')}</div></div>`);
}

export function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  if (msg) { el.textContent = msg; el.style.display = 'block'; } else { el.style.display = 'none'; }
}

let toastTimer = null;
export function toast(msg, bad = false) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = `toast${bad ? ' bad' : ''}`;
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3500);
}

/* ---------- التنقل بين الصفحات ---------- */

// main.js بيسجّل الصفحات هون — هيك ما بيصير اعتماد دائري بين ui والصفحات
const pages = {};
export function registerPages(map) { Object.assign(pages, map); }

export function go(page) {
  if (!state.currentUser) return;
  if (!state.currentUser.permissions.includes(page)) {
    toast('ما عندك صلاحية لهاي الصفحة', true);
    return;
  }
  state.currentPage = page;
  closeModal();
  document.querySelectorAll('.nav-item[data-page]').forEach((el) => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  const fn = pages[page];
  if (fn) fn();
  else errorState('هاي الصفحة لسا مو جاهزة');
}

export function refresh() { go(state.currentPage); }

export function goHome() {
  if (!state.currentUser) return;
  go(state.currentUser.permissions[0]);
}

export function buildSidebar() {
  const u = state.currentUser;
  document.getElementById('user-chip').innerHTML = `
    <div class="emp-avatar">${esc((u.name || '؟')[0])}</div>
    <div><div class="user-chip-name">${esc(u.name)}</div><div class="user-chip-role">${esc(u.role)}</div></div>
  `;
  document.getElementById('nav-items').innerHTML = u.permissions.map((k) => `
    <div class="nav-item" data-page="${esc(k)}" data-action="go"><span class="nav-dot"></span> ${esc(NAV_LABELS[k] || k)}</div>
  `).join('');
}

/* ---------- الإشعارات (مبنية من المهام الحقيقية، مو بيانات تجريبية) ---------- */

export function buildNotifications() {
  const now = Date.now();
  const mine = state.tasks.filter((t) => t.assigneeId === state.currentUser.id && t.status !== 'done');
  const list = [];

  mine.forEach((t) => {
    const due = new Date(t.deadline).getTime();
    if (Number.isNaN(due)) return;
    const hours = (due - now) / 3600000;
    if (hours < 0) {
      list.push({ text: `مهمة "${t.title}" متأخرة عن موعدها`, time: relTime(due), unread: true });
    } else if (hours < 24) {
      list.push({ text: `موعد تسليم "${t.title}" خلال ${Math.max(1, Math.round(hours))} ساعة`, time: relTime(due), unread: true });
    }
  });

  state.tasks
    .filter((t) => t.status === 'revision' && t.assigneeId === state.currentUser.id)
    .forEach((t) => list.push({ text: `مطلوب تعديلات على "${t.title}"`, time: '', unread: true }));

  return list.slice(0, 12);
}

function relTime(ts) {
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const d = Math.floor(abs / 86400000);
  const h = Math.floor(abs / 3600000);
  const label = d >= 1 ? `${d} يوم` : `${Math.max(1, h)} ساعة`;
  return diff < 0 ? `متأخرة ${label}` : `باقي ${label}`;
}

export function renderNotifPanel() {
  const list = buildNotifications();
  const unread = list.filter((n) => n.unread).length;
  const badge = document.getElementById('notif-count');
  badge.style.display = unread ? 'inline-block' : 'none';
  badge.textContent = unread;
  document.getElementById('notif-panel').innerHTML = list.length
    ? list.map((n) => `<div class="notif-item ${n.unread ? 'unread' : ''}">${esc(n.text)}<small>${esc(n.time)}</small></div>`).join('')
    : '<div class="notif-item">ما في إشعارات جديدة</div>';
}

export function toggleNotifs() {
  renderNotifPanel();
  document.getElementById('notif-panel').classList.toggle('show');
  document.getElementById('gsearch-results').classList.remove('show');
}

/* ---------- البحث السريع ---------- */

export function onGlobalSearch(q) {
  const box = document.getElementById('gsearch-results');
  document.getElementById('notif-panel').classList.remove('show');
  if (!q || !q.trim()) { box.classList.remove('show'); box.innerHTML = ''; return; }

  const ql = q.trim().toLowerCase();
  const results = [];

  state.clients.forEach((c) => {
    if ((c.name || '').toLowerCase().includes(ql)) {
      results.push({ label: c.name, sub: `عميل · ${c.industry || ''}`, page: 'overview', clientId: c.id });
    }
  });
  state.tasks.forEach((t) => {
    if ((t.title || '').toLowerCase().includes(ql)) {
      results.push({ label: t.title, sub: `مهمة · ${employeeName(t.assigneeId)}${t.clientId ? ' · ' + clientName(t.clientId) : ''}`, page: 'tasks' });
    }
  });
  if (state.currentUser.permissions.includes('team')) {
    state.employees.forEach((e) => {
      if ((e.name || '').toLowerCase().includes(ql)) {
        results.push({ label: e.name, sub: `موظف · ${e.roleLabel}`, page: 'team' });
      }
    });
  }

  const top = results.slice(0, 8);
  box.innerHTML = top.length
    ? top.map((r) => `<div class="gs-item" data-action="gsearch-open" data-page="${esc(r.page)}" data-client="${esc(r.clientId || '')}">${esc(r.label)}<small>${esc(r.sub)}</small></div>`).join('')
    : '<div class="gs-item">ما في نتائج</div>';
  box.classList.add('show');
}

export function closeSearch() {
  document.getElementById('gsearch-results').classList.remove('show');
  document.getElementById('gsearch-input').value = '';
}
