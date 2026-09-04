// ============ أدوات الواجهة: الرسم، التنقل، الإشعارات، البحث ============
import { state, NAV_LABELS, NAV_ICONS, ALL_MODULE_KEYS, esc, employeeName, clientName } from './state.js';
import { translateDOM, getLocale } from './i18n.js';
import * as store from './store.js';

/* ---------- الشاشات ---------- */

export function showScreen(name) {
  document.getElementById('landing-screen').style.display = name === 'landing' ? 'block' : 'none';
  document.getElementById('login-screen').style.display = name === 'login' ? 'flex' : 'none';
  document.getElementById('dashboard-screen').style.display = name === 'dashboard' ? 'block' : 'none';
  document.getElementById('public-preferences').style.display = name === 'dashboard' ? 'none' : 'flex';
  document.body.style.overflow = name === 'landing' ? 'hidden' : 'auto';
}

/* ---------- الرسم ---------- */

export function render(html) {
  const main = document.getElementById('main');
  main.classList.remove('page-ready');
  main.innerHTML = html;
  requestAnimationFrame(() => {
    main.classList.add('page-ready');
    decorateActions(main);
    translateDOM(main);
  });
}

const ACTION_ICONS = {
  'add-client': 'fi-rr-user-add', 'add-task': 'fi-rr-plus', 'add-employee': 'fi-rr-user-add',
  'add-content': 'fi-rr-plus', 'edit-task': 'fi-rr-pencil', 'edit-employee': 'fi-rr-pencil',
  'edit-content': 'fi-rr-pencil', 'delete-content': 'fi-rr-trash', 'open-finance': 'fi-rr-pencil',
  'finance-history': 'fi-rr-time-past', 'generate-report': 'fi-rr-document', print: 'fi-rr-print',
  'save-brief': 'fi-rr-disk', 'save-content': 'fi-rr-disk', 'save-finance': 'fi-rr-disk',
  'submit-task': 'fi-rr-check', 'submit-client': 'fi-rr-check', 'submit-employee': 'fi-rr-check',
  'mark-done': 'fi-rr-check-circle', 'view-task': 'fi-rr-eye', 'task-back': 'fi-rr-arrow-right',
  'task-status': 'fi-rr-play', 'open-task-complete': 'fi-rr-check-circle',
  'confirm-task-complete': 'fi-rr-paper-plane', 'request-delete-task': 'fi-rr-trash',
  'confirm-delete-task': 'fi-rr-trash', 'back-to-clients': 'fi-rr-arrow-right',
};

function decorateActions(root) {
  root.querySelectorAll('button[data-action], .back-link[data-action]').forEach((el) => {
    if (el.querySelector('.fi')) return;
    const icon = ACTION_ICONS[el.dataset.action];
    if (!icon) return;
    el.insertAdjacentHTML('afterbegin', `<i class="fi ${icon}" aria-hidden="true"></i>`);
  });
}

// المودالات بتنضاف فوق محتوى الصفحة الحالي بدل ما تمسحه
export function openModal(html) {
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `<div class="modal">${html}</div>`;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeModal(); });
  document.body.appendChild(wrap);
  translateDOM(wrap);
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
  document.querySelectorAll('.nav-item[data-page], .mobile-nav-item[data-page]').forEach((el) => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  const fn = pages[page];
  if (fn) fn();
  else errorState('هاي الصفحة لسا مو جاهزة');
}

export function refresh() { go(state.currentPage); }

export function goHome() {
  if (!state.currentUser) return;
  go(state.currentUser.permissions.includes('home') ? 'home' : state.currentUser.permissions[0]);
}

export function buildSidebar() {
  const u = state.currentUser;
  const chip = document.getElementById('user-chip');
  chip.dataset.action = 'open-my-profile';
  chip.title = 'فتح ملفي الوظيفي';
  chip.innerHTML = `
    <div class="emp-avatar">${esc((u.name || '؟')[0])}</div>
    <div><div class="user-chip-name">${esc(u.name)}</div><div class="user-chip-role">${esc(u.role)}</div></div>
    <i class="fi fi-rr-angle-small-left user-chip-arrow"></i>
  `;
  const nav = document.getElementById('nav-items');
  const ordered = [...u.permissions].sort((a, b) => {
    const ai = ALL_MODULE_KEYS.indexOf(a); const bi = ALL_MODULE_KEYS.indexOf(b);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
  nav.innerHTML = ordered.map((k) => `
    <div class="nav-item" data-page="${esc(k)}" data-action="go"><i class="fi ${esc(NAV_ICONS[k] || 'fi-rr-circle')}"></i><span>${esc(NAV_LABELS[k] || k)}</span></div>
  `).join('');
  const bottom = document.getElementById('mobile-bottom-nav');
  if (bottom) {
    const preferred = ['home', 'my-dashboard', 'tasks', 'calendar', 'chat', 'services'];
    const quickPages = preferred.filter((key) => u.permissions.includes(key)).slice(0, 4);
    bottom.innerHTML = `${quickPages.map((key) => `
      <button class="mobile-nav-item" data-page="${esc(key)}" data-action="go"><i class="fi ${esc(NAV_ICONS[key] || 'fi-rr-circle')}"></i><span>${esc(NAV_LABELS[key] || key)}</span></button>
    `).join('')}<button class="mobile-nav-item mobile-more" data-action="toggle-sidebar"><i class="fi fi-rr-apps"></i><span>المزيد</span></button>`;
    translateDOM(bottom);
  }
  translateDOM(document.querySelector('.sidebar'));
}

export function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  const isOpen = sidebar.classList.toggle('open');
  document.body.classList.toggle('sidebar-menu-open', isOpen);
  document.querySelector('.mobile-menu')?.setAttribute('aria-expanded', String(isOpen));
}

export function closeSidebar() {
  document.querySelector('.sidebar')?.classList.remove('open');
  document.body.classList.remove('sidebar-menu-open');
  document.querySelector('.mobile-menu')?.setAttribute('aria-expanded', 'false');
}

export function openQuickMenu() {
  const options = [
    state.currentUser.permissions.includes('tasks') && ['add-task', 'fi-rr-list-check', 'مهمة جديدة'],
    state.currentUser.permissions.includes('overview') && ['add-client', 'fi-rr-user-add', 'عميل جديد'],
    state.currentUser.permissions.includes('services') && ['new-service-request', 'fi-rr-paper-plane', 'طلب داخلي'],
    state.currentUser.permissions.includes('team') && ['add-employee', 'fi-rr-user-add', 'موظف جديد'],
  ].filter(Boolean);
  openModal(`<h3>إجراء سريع</h3><div class="quick-grid">${options.map(([action, icon, label]) => `
    <button class="quick-card" data-action="${action}"><i class="fi ${icon}"></i><span>${label}</span></button>
  `).join('')}</div>`);
}

/* ---------- الإشعارات اللحظية والصوت ---------- */

let notificationAudio = null;

export function unlockNotificationSound() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  if (!notificationAudio) notificationAudio = new AudioContextClass();
  if (notificationAudio.state === 'suspended') notificationAudio.resume().catch(() => {});
}

function playNotificationSound(type) {
  if (!notificationAudio || notificationAudio.state !== 'running') return;
  const frequencies = type === 'announcement' ? [620, 820, 980] : type === 'task' ? [520, 720] : [700, 920];
  const now = notificationAudio.currentTime;
  frequencies.forEach((frequency, index) => {
    const oscillator = notificationAudio.createOscillator();
    const gain = notificationAudio.createGain();
    const start = now + index * 0.11;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    oscillator.connect(gain); gain.connect(notificationAudio.destination);
    oscillator.start(start); oscillator.stop(start + 0.2);
  });
}

function requestBrowserNotificationPermission() {
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  Notification.requestPermission().catch(() => {});
}

function showSystemNotification(item) {
  if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  const notification = new Notification(item.title, { body: item.text, icon: '/favicon.svg', tag: item.id });
  notification.onclick = () => { window.focus(); notification.close(); openLiveNotification({ dataset: { id: item.id } }); };
}

export function startLiveNotifications() {
  state.liveNotifications = [];
  store.subscribeActivityNotifications((item) => {
    state.liveNotifications = [{ ...item, unread: true }, ...state.liveNotifications.filter((entry) => entry.id !== item.id)].slice(0, 30);
    renderNotifPanel();
    playNotificationSound(item.type);
    toast(item.title);
    showSystemNotification(item);
  });
}

export function stopLiveNotifications() {
  store.stopActivityNotifications();
  state.liveNotifications = [];
}

export function buildNotifications() {
  const now = Date.now();
  const mine = state.tasks.filter((t) => t.assigneeId === state.currentUser.id && t.status !== 'done');
  const list = [];

  mine.forEach((t) => {
    const due = new Date(t.deadline).getTime();
    if (Number.isNaN(due)) return;
    const hours = (due - now) / 3600000;
    if (hours < 0) {
      list.push({ type: 'reminder', title: 'مهمة متأخرة', text: `مهمة "${t.title}" متأخرة عن موعدها`, time: relTime(due), unread: false });
    } else if (hours < 24) {
      list.push({ type: 'reminder', title: 'موعد تسليم قريب', text: `موعد تسليم "${t.title}" خلال ${Math.max(1, Math.round(hours))} ساعة`, time: relTime(due), unread: false });
    }
  });

  state.tasks
    .filter((t) => t.status === 'revision' && t.assigneeId === state.currentUser.id)
    .forEach((t) => list.push({ type: 'reminder', title: 'تعديلات مطلوبة', text: `مطلوب تعديلات على "${t.title}"`, time: '', unread: false }));

  const live = state.liveNotifications.map((item) => ({
    ...item,
    time: item.createdAt ? new Date(item.createdAt).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' }) : '',
  }));
  return [...live, ...list].slice(0, 20);
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
  const panel = document.getElementById('notif-panel');
  if (!badge || !panel) return;
  badge.style.display = unread ? 'inline-block' : 'none';
  badge.textContent = unread;
  panel.innerHTML = list.length
    ? `<div class="notif-head"><strong>الإشعارات</strong><span>${unread ? `${unread} جديد` : 'محدّثة لحظياً'}</span></div>${list.map((n) => {
      const icon = n.type === 'task' ? 'fi-rr-list-check' : n.type === 'announcement' ? 'fi-rr-megaphone' : n.type === 'chat' ? 'fi-rr-comment-alt' : 'fi-rr-clock';
      const tag = n.id ? 'button' : 'div';
      return `<${tag} class="notif-item ${n.unread ? 'unread' : ''}" ${n.id ? `data-action="open-live-notification" data-id="${esc(n.id)}"` : ''}><span class="notif-icon ${esc(n.type || 'reminder')}"><i class="fi ${icon}"></i></span><span class="notif-copy"><strong>${esc(n.title || '')}</strong><span>${esc(n.text)}</span><small>${esc(n.time)}</small></span></${tag}>`;
    }).join('')}`
    : '<div class="notif-empty"><i class="fi fi-rr-bell-slash"></i><span>ما في إشعارات جديدة</span></div>';
  translateDOM(panel);
}

export function toggleNotifs() {
  unlockNotificationSound();
  requestBrowserNotificationPermission();
  renderNotifPanel();
  const panel = document.getElementById('notif-panel');
  const opening = !panel.classList.contains('show');
  panel.classList.toggle('show');
  document.getElementById('gsearch-results').classList.remove('show');
  if (opening) {
    state.liveNotifications.forEach((item) => { item.unread = false; });
    const badge = document.getElementById('notif-count');
    badge.style.display = 'none'; badge.textContent = '';
  }
}

export function openLiveNotification(el) {
  const item = state.liveNotifications.find((entry) => entry.id === el.dataset.id);
  if (!item) return;
  item.unread = false;
  document.getElementById('notif-panel')?.classList.remove('show');
  if (item.chatTab) {
    state.chatTab = item.chatTab;
    state.activeChatUser = item.chatUserId || null;
  }
  go(item.page || 'home');
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
