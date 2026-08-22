// ============ الرئيسية — ملخص الموظف، التقويم، والفريق المتصل ============
import { state, esc, STATUS_LABEL, clientName } from '../state.js';
import { render, loading, errorState } from '../ui.js';
import { getLanguage, getLocale, t, translateDOM } from '../i18n.js';
import * as store from '../store.js';

const taskDate = (task) => task.deadline ? new Date(task.deadline) : null;
const validDate = (date) => date && !Number.isNaN(date.getTime());

function sameDay(timestamp, start) {
  const value = Number(timestamp || 0);
  return value >= start && value < start + 86400000;
}

function progressFor(status) {
  return { today: 20, progress: 55, review: 82, revision: 68, done: 100 }[status] || 15;
}

function formatDeadline(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(getLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'صباح الخير';
  if (hour < 18) return 'مساء الخير';
  return 'مساء النور';
}

function calendarMarkup(tasks) {
  const now = new Date();
  const year = now.getFullYear(); const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dueDays = new Map();
  tasks.forEach((task) => {
    const date = taskDate(task);
    if (!validDate(date) || date.getFullYear() !== year || date.getMonth() !== month) return;
    const key = date.getDate();
    dueDays.set(key, (dueDays.get(key) || 0) + 1);
  });
  const cells = [];
  for (let i = 0; i < firstDay; i += 1) cells.push('<span class="home-cal-day empty"></span>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const count = dueDays.get(day) || 0;
    cells.push(`<span class="home-cal-day ${day === now.getDate() ? 'today' : ''} ${count ? 'has-task' : ''}"><b>${day}</b>${count ? `<i title="${count}"></i>` : ''}</span>`);
  }
  const names = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
  return `<div class="home-cal-week">${names.map((name) => `<span>${name}</span>`).join('')}</div><div class="home-cal-grid">${cells.join('')}</div>`;
}

function taskList(tasks) {
  if (!tasks.length) return `<div class="home-empty"><i class="fi fi-rr-check-circle"></i><strong>لا توجد مهام جارية</strong><span>كل مهامك الحالية منجزة.</span></div>`;
  return `<div class="home-task-list">${tasks.slice(0, 6).map((task) => {
    const progress = progressFor(task.status);
    return `<button class="home-task-row" data-action="go" data-page="tasks"><span class="home-task-status ${esc(task.status)}"><i class="fi ${task.status === 'review' ? 'fi-rr-eye' : task.status === 'revision' ? 'fi-rr-refresh' : 'fi-rr-list-check'}"></i></span><span class="home-task-copy"><strong>${esc(task.title)}</strong><small>${esc(clientName(task.clientId) || 'بدون عميل')} · ${esc(formatDeadline(task.deadline))}</small><span class="home-task-progress"><i style="width:${progress}%"></i></span></span><span class="home-status-pill">${esc(STATUS_LABEL[task.status] || task.status)}</span></button>`;
  }).join('')}</div>`;
}

function completedList(tasks) {
  if (!tasks.length) return `<div class="home-empty compact"><i class="fi fi-rr-trophy"></i><strong>لا توجد مهام مكتملة بعد</strong></div>`;
  return `<div class="home-completed-list">${tasks.slice(0, 5).map((task) => `<div class="home-completed-row"><span><i class="fi fi-rr-check"></i></span><div><strong>${esc(task.title)}</strong><small>${esc(clientName(task.clientId) || 'بدون عميل')} · ${task.updatedAt ? new Date(task.updatedAt).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' }) : ''}</small></div></div>`).join('')}</div>`;
}

function renderPresence(presence) {
  const box = document.getElementById('home-online-list');
  const badge = document.getElementById('home-online-count');
  if (!box || state.currentPage !== 'home') return;
  const online = state.employees.filter((employee) => presence[employee.id]?.online === true);
  if (badge) badge.textContent = getLanguage() === 'en' ? `${online.length} online now` : `${online.length} متصل الآن`;
  box.innerHTML = online.length ? online.map((employee) => `<div class="home-online-row"><span class="home-online-avatar">${esc((employee.name || '؟')[0])}<i></i></span><div><strong>${esc(employee.name)}</strong><small>${esc(employee.roleLabel || '')}</small></div><span class="home-online-state">متصل</span></div>`).join('') : `<div class="home-empty compact"><i class="fi fi-rr-users-alt"></i><strong>لا يوجد موظفون متصلون حالياً</strong></div>`;
  translateDOM(box);
}

function renderPresenceError() {
  renderPresence({});
}

export function renderHomeDashboard() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStartDate = new Date(todayStart);
  weekStartDate.setDate(weekStartDate.getDate() - ((weekStartDate.getDay() + 6) % 7));
  const weekStart = weekStartDate.getTime();
  const mine = state.tasks.filter((task) => task.assigneeId === state.currentUser.id);
  const ongoing = mine.filter((task) => task.status !== 'done').sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
  const completed = mine.filter((task) => task.status === 'done').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const completedToday = completed.filter((task) => sameDay(task.updatedAt, todayStart)).length;
  const completedWeek = completed.filter((task) => Number(task.updatedAt || 0) >= weekStart).length;
  const completionRate = mine.length ? Math.round((completed.length / mine.length) * 100) : 0;
  const upcoming = ongoing.filter((task) => validDate(taskDate(task)) && taskDate(task).getTime() >= todayStart).slice(0, 4);
  const firstName = (state.currentUser.name || '').split(' ')[0];

  render(`
    <div class="home-hero">
      <div><span class="section-kicker"><i class="fi fi-rr-sparkles"></i> لوحة اليوم</span><h1>${t(greeting())}${getLanguage() === 'en' ? ',' : '،'} ${esc(firstName)} 👋</h1><p>هذا ملخص عملك ومواعيدك وفريقك في مكان واحد.</p></div>
      <div class="home-date-chip"><i class="fi fi-rr-calendar-day"></i><div><span>${now.toLocaleDateString(getLocale(), { weekday: 'long' })}</span><strong>${now.toLocaleDateString(getLocale(), { day: 'numeric', month: 'long', year: 'numeric' })}</strong></div></div>
    </div>

    <div class="home-stats">
      <article><span class="amber"><i class="fi fi-rr-progress-complete"></i></span><div><strong>${ongoing.length}</strong><small>مهام جارية</small></div></article>
      <article><span class="green"><i class="fi fi-rr-check-circle"></i></span><div><strong>${completedToday}</strong><small>أنجزتها اليوم</small></div></article>
      <article><span class="blue"><i class="fi fi-rr-calendar-check"></i></span><div><strong>${completedWeek}</strong><small>مكتملة هذا الأسبوع</small></div></article>
      <article><span class="violet"><i class="fi fi-rr-chart-histogram"></i></span><div><strong>${completionRate}%</strong><small>نسبة إنجازي</small></div></article>
    </div>

    <div class="home-grid">
      <section class="home-card home-tasks-card">
        <div class="home-card-head"><div><span class="section-kicker">مسار العمل</span><h2>المهام الجارية</h2></div><button data-action="go" data-page="tasks">عرض الكل <i class="fi fi-rr-arrow-small-left"></i></button></div>
        ${taskList(ongoing)}
      </section>

      <aside class="home-card home-online-card">
        <div class="home-card-head"><div><span class="section-kicker">الفريق</span><h2>المتصلون الآن</h2></div><span class="home-live-badge" id="home-online-count">0 متصل الآن</span></div>
        <div id="home-online-list"><div class="message-loading"><i class="fi fi-rr-spinner"></i></div></div>
        ${state.currentUser.permissions.includes('team') ? `<button class="home-card-link" data-action="go" data-page="team">عرض كل الفريق <i class="fi fi-rr-arrow-small-left"></i></button>` : ''}
      </aside>

      <section class="home-card home-calendar-card">
        <div class="home-card-head"><div><span class="section-kicker">${now.toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' })}</span><h2>التقويم</h2></div><button data-action="go" data-page="calendar">فتح التقويم <i class="fi fi-rr-arrow-small-left"></i></button></div>
        <div class="home-calendar">${calendarMarkup(mine)}</div>
        <div class="home-agenda">${upcoming.length ? upcoming.map((task) => `<div><span>${new Date(task.deadline).toLocaleDateString(getLocale(), { day: '2-digit', month: 'short' })}</span><strong>${esc(task.title)}</strong></div>`).join('') : `<small>لا توجد مواعيد قادمة</small>`}</div>
      </section>

      <section class="home-card home-completed-card">
        <div class="home-card-head"><div><span class="section-kicker">إنجازاتي</span><h2>آخر المهام المكتملة</h2></div><span class="home-total-done">${completed.length}</span></div>
        ${completedList(completed)}
      </section>
    </div>
  `);

  renderPresence(state.presence);
}

export async function showHome() {
  loading('جاري تجهيز الرئيسية...');
  try {
    await Promise.all([store.loadTasks(), store.loadEmployees()]);
  } catch (err) {
    errorState('تعذر تحميل الرئيسية', store.humanError(err)); return;
  }

  renderHomeDashboard();
  store.subscribePresence(renderPresence, renderPresenceError);
}

export const actions = {};
