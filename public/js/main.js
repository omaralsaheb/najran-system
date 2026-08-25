// ============ نقطة البداية — بتربط كل شي ببعضه ============
import { state } from './state.js';
import { initLanding } from './landing.js';
import {
  showScreen, registerPages, go, goHome, toggleNotifs,
  onGlobalSearch, closeSearch, closeModal, toast, toggleSidebar, closeSidebar, openQuickMenu,
  unlockNotificationSound, openLiveNotification, stopLiveNotifications,
} from './ui.js';
import * as store from './store.js';
import {
  showLogin, doLogin, doLoginWithCode, doFirstSetup, doLogout, onSignedIn,
  showCodeForm, showNormalForm,
} from './auth.js';

import * as clientsPage from './pages/clients.js';
import * as tasksPage from './pages/tasks.js';
import * as teamPage from './pages/team.js';
import * as financePage from './pages/finance.js';
import * as settingsPage from './pages/settings.js';
import * as servicesPage from './pages/services.js';
import * as chatPage from './pages/chat.js';
import * as homePage from './pages/home.js';
import * as preferences from './preferences.js';

/* ---------- الصفحات المرتبطة بالقائمة الجانبية ---------- */

registerPages({
  home: homePage.showHome,
  overview: clientsPage.showOverview,
  reports: clientsPage.showAgencyReport,
  tasks: tasksPage.showTasks,
  'my-dashboard': tasksPage.showMyDashboard,
  calendar: tasksPage.showCalendarPage,
  team: teamPage.showTeam,
  services: servicesPage.showServices,
  chat: chatPage.showChat,
  finance: financePage.showFinance,
  settings: settingsPage.showSettings,
});

/* ---------- كل أفعال الأزرار بمكان واحد ---------- */
// بدل onclick بالـHTML: كل عنصر بيحمل data-action، ومستمع واحد بيوزّع عليهم.
// هيك الـHTML بيضل نظيف والدوال ما بتحتاج تكون globals.

const actions = {
  'show-login': () => showLogin(),
  login: (el) => doLogin(el),
  'login-code': (el) => doLoginWithCode(el),
  'show-code-form': () => showCodeForm(),
  'show-normal-form': () => showNormalForm(),
  'first-setup': (el) => doFirstSetup(el),
  logout: () => doLogout(),
  'go-home': () => { store.stopChatListener(); goHome(); },
  go: (el) => {
    if (el.dataset.page !== 'chat') store.stopChatListener();
    if (el.dataset.page !== 'home') store.stopPresenceListener();
    go(el.dataset.page);
  },
  'toggle-notifs': () => toggleNotifs(),
  'open-live-notification': (el) => openLiveNotification(el),
  'toggle-sidebar': () => toggleSidebar(),
  'quick-menu': () => openQuickMenu(),
  'close-modal': () => closeModal(),
  'gsearch-open': (el) => {
    const page = el.dataset.page;
    closeSearch();
    store.stopChatListener();
    store.stopPresenceListener();
    go(page);
  },
  ...clientsPage.actions,
  ...tasksPage.actions,
  ...teamPage.actions,
  ...financePage.actions,
  ...settingsPage.actions,
  ...servicesPage.actions,
  ...chatPage.actions,
  ...homePage.actions,
  ...preferences.actions,
};

document.addEventListener('click', (e) => {
  unlockNotificationSound();
  const el = e.target.closest('[data-action]');
  if (el && el.tagName !== 'SELECT' && el.tagName !== 'INPUT') {
    const fn = actions[el.dataset.action];
    if (fn) {
      e.preventDefault();
      Promise.resolve(fn(el)).catch((err) => toast(store.humanError(err), true));
      if (!['toggle-notifs', 'open-live-notification'].includes(el.dataset.action)) document.getElementById('notif-panel')?.classList.remove('show');
      if (el.dataset.action !== 'toggle-sidebar') closeSidebar();
      return;
    }
  }
  // سكّر القوائم المنسدلة لما تدوس برّاتها
  if (!e.target.closest('.gsearch-wrap')) document.getElementById('gsearch-results')?.classList.remove('show');
  if (!e.target.closest('.bell-wrap')) document.getElementById('notif-panel')?.classList.remove('show');
});

// القوائم والخانات بدها change/input مش click
document.addEventListener('change', (e) => {
  const el = e.target.closest('select[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) Promise.resolve(fn(el)).catch((err) => toast(store.humanError(err), true));
});

document.addEventListener('input', (e) => {
  const el = e.target.closest('input[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) fn(el);
});

document.addEventListener('keydown', (e) => {
  unlockNotificationSound();
  if (e.key === 'Escape') { closeModal(); closeSidebar(); return; }
  if (e.key !== 'Enter') return;
  if (e.target.id === 'chat-message' && !e.shiftKey) {
    e.preventDefault();
    document.querySelector('[data-action="send-chat-message"]')?.click();
    return;
  }
  // Enter بيسجّل الدخول بدل ما تضطر تدوس الزر
  if (['login-username', 'login-password'].includes(e.target.id)) {
    document.querySelector('[data-action="login"]')?.click();
  } else if (e.target.id === 'login-code') {
    document.querySelector('[data-action="login-code"]')?.click();
  } else if (['setup-name', 'setup-username', 'setup-password', 'setup-code'].includes(e.target.id)) {
    document.querySelector('[data-action="first-setup"]')?.click();
  }
});

document.getElementById('gsearch-input').addEventListener('input', (e) => onGlobalSearch(e.target.value));
document.getElementById('gsearch-input').addEventListener('focus', (e) => onGlobalSearch(e.target.value));

window.addEventListener('resize', () => {
  if (window.innerWidth > 860) closeSidebar();
});

/* ---------- الإقلاع ---------- */

preferences.applyPreferences();
initLanding();
showScreen('landing');

// مؤشر الاتصال بالسايدبار
window.addEventListener('online', () => {
  const el = document.getElementById('sync-state');
  el.textContent = '● متصل بـFirebase';
  el.classList.remove('offline');
});
window.addEventListener('offline', () => {
  const el = document.getElementById('sync-state');
  el.textContent = '● ما في اتصال';
  el.classList.add('offline');
});

// Firebase بيحفظ الجلسة لحاله — لو المستخدم مسجّل دخول من قبل بيفوت مباشرة.
// ملاحظة: onAuthStateChanged بينده أكتر من مرة بـnull وقت الإقلاع، فمنتتبّع
// إذا كان في جلسة فعلاً — مش بس "هاي أول مرة" — وإلا بيقفز عن الصفحة الرئيسية.
let wasSignedIn = false;
store.watchAuth((user) => {
  if (user) {
    wasSignedIn = true;
    onSignedIn(user);
  } else if (wasSignedIn) {
    // خرج من الحساب بعد ما كان داخل
    wasSignedIn = false;
    stopLiveNotifications();
    state.currentUser = null;
    showLogin();
  }
});
