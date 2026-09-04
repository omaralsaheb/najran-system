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
  return { today: 20, progress: 55, paused: 45, review: 82, revision: 68, done: 100 }[status] || 15;
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
    return `<button class="home-task-row" data-action="view-task" data-id="${esc(task.id)}"><span class="home-task-status ${esc(task.status)}"><i class="fi ${task.status === 'review' ? 'fi-rr-eye' : task.status === 'revision' ? 'fi-rr-refresh' : task.status === 'paused' ? 'fi-rr-pause' : 'fi-rr-list-check'}"></i></span><span class="home-task-copy"><strong>${esc(task.title)}</strong><small>${esc(clientName(task.clientId) || 'بدون عميل')} · ${esc(formatDeadline(task.deadline))}</small><span class="home-task-progress"><i style="width:${progress}%"></i></span></span><span class="home-status-pill">${esc(STATUS_LABEL[task.status] || task.status)}</span></button>`;
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

// نطاق الإحصائيات — متل شرائح الفلترة بلوحات التحكم الحديثة
const RANGES = {
  today: { label: 'اليوم' },
  week: { label: 'هذا الأسبوع' },
  month: { label: 'هذا الشهر' },
};

function rangeStart(key) {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (key === 'today') return midnight;
  if (key === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const weekStart = new Date(midnight);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  return weekStart.getTime();
}


// منحنى صغير لآخر 7 أيام — نفس فكرة الرسوم المصغّرة بلوحات التحكم
function sparkline(values) {
  const max = Math.max(1, ...values);
  const step = 100 / Math.max(1, values.length - 1);
  const points = values.map((value, index) => [index * step, 34 - (value / max) * 30]);
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L100,38 L0,38 Z`;
  const last = points[points.length - 1];
  return `<div class="stat-spark"><svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity=".34"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
    </linearGradient></defs>
    <path class="area" d="${area}"/><path class="line" d="${line}" vector-effect="non-scaling-stroke"/>
  </svg><i class="spark-dot" style="inset-inline-start:${last[0].toFixed(1)}%; top:${((last[1] / 38) * 100).toFixed(1)}%"></i></div>`;
}

// عدد المهام المنجزة بكل يوم من آخر 7 أيام
function lastSevenDays(completed) {
  const today = new Date();
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Array.from({ length: 7 }, (_, index) => {
    const dayStart = midnight - (6 - index) * 86400000;
    return completed.filter((task) => sameDay(task.updatedAt, dayStart)).length;
  });
}


// رسم مساحي بشبكة خلفية — نفس لغة لوحات التداول: منحنى ناعم + نقطة ذروة + تلميح
function performanceCard(series, labels) {
  const total = series.reduce((sum, value) => sum + value, 0);
  // realMax هو الذروة الحقيقية؛ max بيضمن ما نقسم على صفر بس.
  // بدونها: لو كل القيم صفر بترجع max=1 وindexOf(1)=-1 وبينهار الرسم.
  const realMax = Math.max(0, ...series);
  const max = Math.max(1, realMax);
  const half = Math.ceil(series.length / 2);
  const firstHalf = series.slice(0, half).reduce((a, b) => a + b, 0);
  const lastHalf = series.slice(half).reduce((a, b) => a + b, 0);
  const growth = firstHalf === 0 ? (lastHalf > 0 ? 100 : 0) : Math.round(((lastHalf - firstHalf) / firstHalf) * 100);

  const W = 100; const H = 62;
  const step = W / Math.max(1, series.length - 1);
  const pts = series.map((value, index) => [index * step, H - 6 - (value / max) * (H - 16)]);

  // منحنى ناعم بدل خطوط حادة
  let line = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i += 1) {
    const [px, py] = pts[i - 1]; const [x, y] = pts[i];
    const cx = (px + x) / 2;
    line += ` C${cx.toFixed(1)},${py.toFixed(1)} ${cx.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
  }
  const area = `${line} L${W},${H} L0,${H} Z`;

  const peakIndex = realMax > 0 ? series.indexOf(realMax) : -1;
  const peak = peakIndex >= 0 ? pts[peakIndex] : null;
  const tipSide = peak && peak[0] > W / 2 ? 'inset-inline-start:auto; inset-inline-end:6px;' : 'inset-inline-start:6px;';

  return `<section class="perf-card">
    <div class="perf-head">
      <div><h3>أداء الإنجاز</h3><small>آخر ${series.length} أيام</small></div>
      <div class="perf-total">
        <strong>${total}</strong>
        <span class="${growth < 0 ? 'down' : ''}"><i class="fi fi-rr-arrow-small-${growth < 0 ? 'down' : 'up'}"></i> ${growth >= 0 ? '+' : ''}${growth}% مقارنة بالنصف الأول</span>
      </div>
    </div>
    <div class="perf-chart">
      ${peak ? `<div class="perf-tip" style="${tipSide}">${esc(labels[peakIndex] || '')}<b>${realMax} مهمة</b></div>` : ''}
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity=".38"/>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
        </linearGradient></defs>
        <g class="grid">${[0, 1, 2, 3].map((row) => `<line x1="0" y1="${(row * H) / 3}" x2="${W}" y2="${(row * H) / 3}"/>`).join('')}</g>
        <path class="area" d="${area}"/>
        <path class="line" d="${line}" vector-effect="non-scaling-stroke"/>
      </svg>
      ${peak ? `<i class="perf-dot" style="inset-inline-start:${peak[0].toFixed(1)}%; top:${((peak[1] / H) * 100).toFixed(1)}%"></i>` : ''}
      <div class="perf-axis">${labels.map((label) => `<span>${esc(label)}</span>`).join('')}</div>
    </div>
  </section>`;
}

// أسماء آخر 7 أيام مختصرة
function lastSevenLabels() {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today);
    day.setDate(day.getDate() - (6 - index));
    return day.toLocaleDateString(getLocale(), { weekday: 'short' });
  });
}

// زر دائري صغير بزاوية البطاقة — نفس لغة لوحات التحكم بالمرجع
function cardTool(page) {
  if (!page) return '';
  return `<button class="card-tool" data-action="go" data-page="${page}" title="فتح الصفحة"><i class="fi fi-rr-arrow-small-left"></i></button>`;
}

export function renderHomeDashboard() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const range = RANGES[state.homeRange] ? state.homeRange : 'week';
  const from = rangeStart(range);

  const mine = state.tasks.filter((task) => task.assigneeId === state.currentUser.id);
  const ongoing = mine.filter((task) => task.status !== 'done').sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
  const completed = mine.filter((task) => task.status === 'done').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const completedToday = completed.filter((task) => sameDay(task.updatedAt, todayStart)).length;
  const completedRange = completed.filter((task) => Number(task.updatedAt || 0) >= from).length;
  const completionRate = mine.length ? Math.round((completed.length / mine.length) * 100) : 0;
  const upcoming = ongoing.filter((task) => validDate(taskDate(task)) && taskDate(task).getTime() >= todayStart).slice(0, 4);
  const overdue = ongoing.filter((task) => validDate(taskDate(task)) && taskDate(task).getTime() < now.getTime()).length;
  const firstName = (state.currentUser.name || '').split(' ')[0];

  // توزيع المهام الجارية حسب الحالة — بيتحوّل لأعمدة صغيرة جوا البطاقة البارزة
  const buckets = ['today', 'progress', 'review', 'revision'].map((status) => ({
    status,
    label: STATUS_LABEL[status] || status,
    count: ongoing.filter((task) => task.status === status).length,
  }));
  const peak = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const weekSeries = lastSevenDays(completed);

  render(`
    <div class="home-topline">
      <div>
        <span class="section-kicker"><i class="fi fi-rr-sparkles"></i> لوحة اليوم</span>
        <h1>${t(greeting())}${getLanguage() === 'en' ? ',' : '،'} ${esc(firstName)} 👋</h1>
        <p>هذا ملخص عملك ومواعيدك وفريقك في مكان واحد.</p>
      </div>
      <div class="home-chips">
        ${Object.entries(RANGES).map(([key, item]) => `
          <button class="range-chip ${range === key ? 'active' : ''}" data-action="home-range" data-range="${key}">
            ${item.label}${range === key ? '<i class="fi fi-rr-cross-small"></i>' : ''}
          </button>`).join('')}
        <button class="range-chip solid" data-action="add-task"><i class="fi fi-rr-plus"></i> مهمة</button>
      </div>
    </div>

    <div class="stat-row">
      <article class="stat-card accent">
        <div class="stat-head"><span>مهام جارية</span>${cardTool('tasks')}</div>
        <strong class="stat-figure">${ongoing.length}</strong>
        <small class="stat-note">${overdue ? `${overdue} منها متأخرة` : 'كلها ضمن الموعد'}</small>
        <div class="stat-bars">
          ${buckets.map((bucket) => `
            <span title="${esc(bucket.label)}: ${bucket.count}">
              <b>${bucket.count}</b>
              <i style="height:${Math.max(6, Math.round((bucket.count / peak) * 100))}%"></i>
            </span>`).join('')}
        </div>
      </article>

      <article class="stat-card">
        <div class="stat-head"><span>أنجزتها اليوم</span></div>
        <strong class="stat-figure">${completedToday}</strong>
        <small class="stat-note">آخر 7 أيام</small>
        ${sparkline(weekSeries)}
      </article>

      <article class="stat-card">
        <div class="stat-head"><span>مكتملة ${RANGES[range].label}</span></div>
        <strong class="stat-figure">${completedRange}</strong>
        <small class="stat-note">من أصل ${mine.length} مهمة</small>
      </article>

      <article class="stat-card ring-card">
        <div class="stat-head"><span>نسبة الإنجاز</span></div>
        <div class="stat-ring" style="--stat:${completionRate}"><b>${completionRate}<i>%</i></b></div>
        <small class="stat-note">إجمالي مهامك</small>
      </article>
      ${performanceCard(weekSeries, lastSevenLabels())}
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

export const actions = {
  'home-range': (el) => { state.homeRange = el.dataset.range; renderHomeDashboard(); },
};
