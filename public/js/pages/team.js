// ============ الفريق — عرض الموظفين، إضافة، تعديل، إيقاف ============
import { state, esc, usernameProblem } from '../state.js';
import { render, openModal, closeModal, loading, errorState, toast } from '../ui.js';
import { getLocale, getDateLocale, BIDI_RE } from '../i18n.js';
import * as store from '../store.js';

function setErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return !msg;
  if (msg) { el.textContent = msg; el.style.display = 'block'; return false; }
  el.style.display = 'none';
  return true;
}



/* ============ سجل الحضور: يومي / أسبوعي / شهري ============ */
// أوقات فعلية — مش متوسطات. بالفترات الأسبوعية والشهرية منعرض
// أسماء يلي سجّلوا حضور بس، متل ما هو مطلوب بالتقرير الورقي.

const PERIODS = { day: 'يومي', week: 'أسبوعي', month: 'شهري' };

function dayKeyOf(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function attendanceDayKey() {
  return state.attendanceDate || dayKeyOf(new Date());
}

// كل أيام الفترة المختارة — أساس القراءة من القاعدة والعرض
function periodDays() {
  const anchor = new Date(`${attendanceDayKey()}T12:00:00`);
  if (state.attendancePeriod === 'week') {
    const first = new Date(anchor);
    first.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(first); d.setDate(d.getDate() + i); return dayKeyOf(d);
    });
  }
  if (state.attendancePeriod === 'month') {
    const y = anchor.getFullYear(); const m = anchor.getMonth();
    const count = new Date(y, m + 1, 0).getDate();
    return Array.from({ length: count }, (_, i) => dayKeyOf(new Date(y, m, i + 1)));
  }
  return [attendanceDayKey()];
}

function periodLabel() {
  const days = periodDays();
  const fmt = (key, opts) => new Date(`${key}T12:00:00`).toLocaleDateString(getDateLocale(), opts).replace(BIDI_RE, '');
  if (state.attendancePeriod === 'week') {
    return `${fmt(days[0], { day: 'numeric', month: 'long' })} — ${fmt(days[6], { day: 'numeric', month: 'long', year: 'numeric' })}`;
  }
  if (state.attendancePeriod === 'month') return fmt(days[0], { month: 'long', year: 'numeric' });
  return fmt(days[0], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function clockTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' }).replace(BIDI_RE, '');
}

function minutesOf(record) {
  if (!record?.checkIn || !record?.checkOut) return 0;
  const m = Math.round((new Date(record.checkOut) - new Date(record.checkIn)) / 60000);
  return Number.isFinite(m) && m > 0 ? m : 0;
}

function spanText(minutes) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const r = minutes % 60;
  return h ? `${h} س ${r} د` : `${r} د`;
}

const teamPeople = () => state.employees.filter((e) => e.active !== false && !e.isAccessAccount);

// صفوف اليوم الواحد: كل الفريق، وبيّن مين ما سجّل
function dayRows() {
  const day = state.attendanceRange?.[attendanceDayKey()] || {};
  return teamPeople().map((employee) => {
    const record = day[employee.id] || null;
    const inAt = clockTime(record?.checkIn);
    const outAt = clockTime(record?.checkOut);
    return {
      employee, inAt, outAt,
      span: spanText(minutesOf(record)),
      status: !inAt ? 'absent' : (outAt ? 'present' : 'open'),
    };
  }).sort((a, b) => {
    const rank = { open: 0, present: 1, absent: 2 };
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return (a.employee.name || '').localeCompare(b.employee.name || '', 'ar');
  });
}

// صفوف الفترة: أسماء يلي سجّلوا حضور بس
function periodRows() {
  const days = periodDays();
  return teamPeople().map((employee) => {
    const present = [];
    let minutes = 0;
    days.forEach((key) => {
      const record = state.attendanceRange?.[key]?.[employee.id];
      if (!record?.checkIn) return;
      present.push(key);
      minutes += minutesOf(record);
    });
    return { employee, present, minutes };
  })
    .filter((row) => row.present.length > 0)
    .sort((a, b) => b.present.length - a.present.length || (a.employee.name || '').localeCompare(b.employee.name || '', 'ar'));
}

function periodSwitch() {
  return `<div class="period-switch">${Object.entries(PERIODS).map(([key, label]) => `
    <button class="${state.attendancePeriod === key ? 'active' : ''}" data-action="attendance-period" data-period="${key}">${label}</button>`).join('')}</div>`;
}

function attendanceLog() {
  const isDay = state.attendancePeriod === 'day';
  const rows = isDay ? dayRows() : periodRows();
  const days = periodDays();

  const summary = isDay
    ? (() => {
      const checkedIn = rows.filter((r) => r.status !== 'absent').length;
      return `
        <article class="in"><strong>${checkedIn}</strong><small>سجّلوا دخول</small></article>
        <article class="out"><strong>${rows.filter((r) => r.status === 'open').length}</strong><small>ما زالوا بالدوام</small></article>
        <article><strong>${rows.filter((r) => r.status === 'present').length}</strong><small>سجّلوا خروج</small></article>
        <article class="absent"><strong>${rows.filter((r) => r.status === 'absent').length}</strong><small>بدون تسجيل</small></article>`;
    })()
    : (() => {
      const totalMinutes = rows.reduce((s, r) => s + r.minutes, 0);
      const totalDays = rows.reduce((s, r) => s + r.present.length, 0);
      return `
        <article class="in"><strong>${rows.length}</strong><small>سجّلوا حضور</small></article>
        <article><strong>${totalDays}</strong><small>إجمالي أيام الحضور</small></article>
        <article class="out"><strong>${Math.round(totalMinutes / 60)}</strong><small>إجمالي الساعات</small></article>
        <article><strong>${days.length}</strong><small>أيام الفترة</small></article>`;
    })();

  const table = isDay
    ? `<table class="attendance-table">
        <thead><tr><th>الموظف</th><th>وقت الدخول</th><th>وقت الخروج</th><th>المدة</th><th>الحالة</th></tr></thead>
        <tbody>${rows.map((row) => `<tr>
          <td><div class="att-person"><span>${esc((row.employee.name || '؟')[0])}</span><div><strong>${esc(row.employee.name)}</strong><small>${esc(row.employee.roleLabel || '')}</small></div></div></td>
          <td>${row.inAt ? `<span class="att-time">${esc(row.inAt)}</span>` : '<span class="att-time none">—</span>'}</td>
          <td>${row.outAt ? `<span class="att-time">${esc(row.outAt)}</span>` : '<span class="att-time none">—</span>'}</td>
          <td>${row.span ? `<span class="att-time">${esc(row.span)}</span>` : '<span class="att-time none">—</span>'}</td>
          <td><span class="att-pill ${row.status}">${row.status === 'present' ? 'أنهى دوامه' : row.status === 'open' ? 'بالدوام' : 'ما سجّل'}</span></td>
        </tr>`).join('')}</tbody>
      </table>`
    : `<table class="attendance-table">
        <thead><tr><th>الموظف</th><th>أيام الحضور</th><th>إجمالي الساعات</th><th>الأيام المسجّلة</th></tr></thead>
        <tbody>${rows.map((row) => `<tr>
          <td><div class="att-person"><span>${esc((row.employee.name || '؟')[0])}</span><div><strong>${esc(row.employee.name)}</strong><small>${esc(row.employee.roleLabel || '')}</small></div></div></td>
          <td><span class="att-pill present">${row.present.length} من ${days.length}</span></td>
          <td>${row.minutes ? `<span class="att-time">${esc(spanText(row.minutes))}</span>` : '<span class="att-time none">—</span>'}</td>
          <td><div class="att-days">${row.present.map((key) => `<i title="${esc(key)}">${Number(key.slice(-2))}</i>`).join('')}</div></td>
        </tr>`).join('')}</tbody>
      </table>`;

  const emptyNote = isDay ? 'ما في موظفين لعرض حضورهم.' : 'ما حدا سجّل حضور بهذه الفترة.';

  return `<section class="attendance-log">
    <header>
      <div><span class="section-kicker"><i class="fi fi-rr-fingerprint"></i> الدوام</span><h2>سجل الحضور — ${esc(periodLabel())}</h2></div>
      <div class="attendance-tools">
        ${periodSwitch()}
        <input class="date-input" type="date" dir="ltr" aria-label="تاريخ السجل" value="${esc(attendanceDayKey())}" data-action="attendance-date">
        <button data-action="attendance-today"><i class="fi fi-rr-calendar-day"></i> اليوم</button>
        <button data-action="attendance-pdf"><i class="fi fi-rr-file-pdf"></i> PDF</button>
      </div>
    </header>

    <div class="attendance-summary">${summary}</div>

    ${rows.length === 0 ? `<div class="attendance-empty">${emptyNote}</div>` : `<div class="attendance-table-wrap">${table}</div>`}
    <div class="disclaimer"><b>ملاحظة:</b> أوقات فعلية مسجّلة من زر الحضور والانصراف بصفحة "خدمات الشركة" — مش متوسطات. بالتقرير الأسبوعي والشهري بتظهر أسماء يلي سجّلوا حضور بس.</div>
  </section>`;
}

/* ============ سجل المهام المنجزة اليومي ============ */
// كل الفريق بيوم واحد: اسم المهمة + اسم العميل + مين أنجزها.

function completionTime(task) {
  return Number(task.completedAt) || Number(task.updatedAt) || 0;
}

function doneTasksOfDay(key) {
  const start = new Date(`${key}T00:00:00`).getTime();
  const end = start + 86400000;
  return state.tasks
    .filter((task) => task.status === 'done')
    .filter((task) => { const ts = completionTime(task); return ts >= start && ts < end; });
}

// مهام كل موظف تحت بعضها — مش قائمة وحدة مرتّبة بالوقت.
// الموظف الأكثر إنجازاً بيطلع أول، ومهامه مرتّبة بوقت الإنجاز.
function doneByEmployee(key) {
  const groups = new Map();
  doneTasksOfDay(key).forEach((task) => {
    const id = task.completedBy || task.assigneeId;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(task);
  });
  return [...groups.entries()]
    .map(([id, tasks]) => ({
      id,
      name: employeeLabel(id),
      role: (state.employees.find((e) => e.id === id) || {}).roleLabel || '',
      tasks: tasks.sort((a, b) => completionTime(a) - completionTime(b)),
    }))
    .sort((a, b) => b.tasks.length - a.tasks.length || a.name.localeCompare(b.name, 'ar'));
}

function completedLog() {
  const key = attendanceDayKey();
  const groups = doneByEmployee(key);
  const total = groups.reduce((s, g) => s + g.tasks.length, 0);
  const label = new Date(`${key}T12:00:00`).toLocaleDateString(getDateLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(BIDI_RE, '');
  const clients = new Set(doneTasksOfDay(key).map((x) => x.clientId).filter(Boolean));

  return `<section class="done-log">
    <header>
      <div><span class="section-kicker"><i class="fi fi-rr-check-circle"></i> الإنجاز</span><h2>المهام المنجزة — ${esc(label)}</h2></div>
      <div class="attendance-tools">
        <button data-action="done-log-pdf"><i class="fi fi-rr-file-pdf"></i> PDF</button>
      </div>
    </header>

    <div class="attendance-summary">
      <article class="in"><strong>${total}</strong><small>مهمة منجزة</small></article>
      <article><strong>${groups.length}</strong><small>موظف أنجز</small></article>
      <article class="out"><strong>${clients.size}</strong><small>عميل مستفيد</small></article>
      <article><strong>${groups[0] ? esc((groups[0].name || '').split(' ')[0]) : '—'}</strong><small>الأكثر إنجازاً</small></article>
    </div>

    ${groups.length === 0 ? '<div class="attendance-empty">ما في مهام منجزة بهذا اليوم.</div>' : `
      <div class="done-groups">
        ${groups.map((group) => `
          <article class="done-group">
            <header>
              <span class="done-avatar">${esc((group.name || '؟')[0])}</span>
              <div><strong>${esc(group.name)}</strong><small>${esc(group.role)}</small></div>
              <span class="done-count">${group.tasks.length} مهمة</span>
            </header>
            <ol class="done-items">
              ${group.tasks.map((task) => `<li>
                <span class="done-item-title">${esc(task.title)}</span>
                <span class="done-item-client">${task.clientId ? esc(clientLabel(task.clientId)) : 'بدون عميل'}</span>
                <span class="att-time">${esc(clockTime(completionTime(task)) || '—')}</span>
              </li>`).join('')}
            </ol>
          </article>`).join('')}
      </div>`}
  </section>`;
}

function employeeLabel(id) {
  const e = state.employees.find((x) => x.id === id);
  return e ? e.name : '—';
}

function clientLabel(id) {
  const c = state.clients.find((x) => x.id === id);
  return c ? c.name : '—';
}

/* ---------- تصدير PDF ---------- */

function companyLetterhead(title, subtitle) {
  return `<header class="company-print-letterhead">
    <div class="company-letterhead-logo"><img src="assets/najran-letterhead.png" alt="Najran Agency"></div>
    <div class="company-letterhead-copy"><span>NAJRAN AGENCY</span><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>
  </header>`;
}

function printSheet() {
  document.body.classList.add('printing-team-report');
  const cleanup = () => document.body.classList.remove('printing-team-report');
  window.addEventListener('afterprint', cleanup, { once: true });
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

function openAttendancePdf() {
  const isDay = state.attendancePeriod === 'day';
  const days = periodDays();
  const rows = isDay ? dayRows().filter((r) => r.status !== 'absent') : periodRows();
  const issued = new Date().toLocaleDateString(getDateLocale(), { day: '2-digit', month: 'long', year: 'numeric' }).replace(BIDI_RE, '');

  openModal(`
    <div class="print-report">
      ${companyLetterhead(`سجل الحضور ${PERIODS[state.attendancePeriod]}`, `${periodLabel()} · تاريخ الإصدار ${issued}`)}
      <div class="client-report-summary">
        <article><small>سجّلوا حضور</small><strong>${rows.length}</strong></article>
        <article><small>أيام الفترة</small><strong>${days.length}</strong></article>
        <article><small>إجمالي أيام الحضور</small><strong>${isDay ? rows.length : rows.reduce((s, r) => s + r.present.length, 0)}</strong></article>
        <article><small>إجمالي الساعات</small><strong>${isDay ? '—' : Math.round(rows.reduce((s, r) => s + r.minutes, 0) / 60)}</strong></article>
      </div>
      <section class="client-print-section content-details">
        <h2>أسماء الموظفين الحاضرين</h2>
        ${rows.length === 0 ? '<div class="client-report-empty">ما حدا سجّل حضور بهذه الفترة.</div>' : `
        <div class="client-print-table-wrap"><table class="print-content-table">
          <thead><tr><th>#</th><th>الموظف</th><th>المسمى</th>${isDay
            ? '<th>وقت الدخول</th><th>وقت الخروج</th><th>المدة</th>'
            : '<th>أيام الحضور</th><th>إجمالي الساعات</th><th>الأيام</th>'}</tr></thead>
          <tbody>${rows.map((row, i) => `<tr>
            <td>${i + 1}</td>
            <td>${esc(row.employee.name)}</td>
            <td>${esc(row.employee.roleLabel || '')}</td>
            ${isDay
              ? `<td>${esc(row.inAt || '—')}</td><td>${esc(row.outAt || '—')}</td><td>${esc(row.span || '—')}</td>`
              : `<td>${row.present.length} / ${days.length}</td><td>${esc(spanText(row.minutes) || '—')}</td><td>${row.present.map((k) => Number(k.slice(-2))).join('، ')}</td>`}
          </tr>`).join('')}</tbody>
        </table></div>`}
      </section>
      <div class="modal-actions" style="margin-top:18px;">
        <button class="btn ghost" data-action="close-modal">إغلاق</button>
        <button class="btn" data-action="print-team-sheet"><i class="fi fi-rr-print"></i> حفظ PDF</button>
      </div>
    </div>`);
}

function openDonePdf() {
  const key = attendanceDayKey();
  const groups = doneByEmployee(key);
  const total = groups.reduce((s, g) => s + g.tasks.length, 0);
  const all = doneTasksOfDay(key);
  const label = new Date(`${key}T12:00:00`).toLocaleDateString(getDateLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(BIDI_RE, '');
  const issued = new Date().toLocaleDateString(getDateLocale(), { day: '2-digit', month: 'long', year: 'numeric' }).replace(BIDI_RE, '');

  openModal(`
    <div class="print-report">
      ${companyLetterhead('سجل المهام المنجزة اليومي', `${label} · تاريخ الإصدار ${issued}`)}
      <div class="client-report-summary">
        <article><small>مهمة منجزة</small><strong>${total}</strong></article>
        <article><small>موظف أنجز</small><strong>${groups.length}</strong></article>
        <article><small>عميل مستفيد</small><strong>${new Set(all.map((x) => x.clientId).filter(Boolean)).size}</strong></article>
        <article><small>بدون عميل</small><strong>${all.filter((x) => !x.clientId).length}</strong></article>
      </div>

      ${groups.length === 0 ? '<section class="client-print-section"><div class="client-report-empty">ما في مهام منجزة بهذا اليوم.</div></section>' : groups.map((group) => `
        <section class="client-print-section content-details done-print-group">
          <h2>${esc(group.name)} ${group.role ? `— ${esc(group.role)}` : ''} · ${group.tasks.length} مهمة</h2>
          <div class="client-print-table-wrap"><table class="print-content-table">
            <thead><tr><th>#</th><th>المهمة</th><th>العميل</th><th>وقت الإنجاز</th></tr></thead>
            <tbody>${group.tasks.map((task, i) => `<tr>
              <td>${i + 1}</td>
              <td>${esc(task.title)}</td>
              <td>${task.clientId ? esc(clientLabel(task.clientId)) : '—'}</td>
              <td>${esc(clockTime(completionTime(task)) || '—')}</td>
            </tr>`).join('')}</tbody>
          </table></div>
        </section>`).join('')}

      <div class="modal-actions" style="margin-top:18px;">
        <button class="btn ghost" data-action="close-modal">إغلاق</button>
        <button class="btn" data-action="print-team-sheet"><i class="fi fi-rr-print"></i> حفظ PDF</button>
      </div>
    </div>`);
}

/* ============ رسم توزيع مهام الفريق ============ */
// أعمدة أفقية لكل موظف: مفتوحة مقابل منجزة. الأرقام من نفس مصدر البطاقات.
function teamChart(employees, tasksOf) {
  const rows = employees
    .map((employee) => {
      const stats = tasksOf(employee.id);
      return { employee, ...stats, total: stats.open + stats.done };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);

  if (!rows.length) {
    return `<section class="team-chart empty">
      <header><div><span class="section-kicker"><i class="fi fi-rr-chart-histogram"></i> التوزيع</span><h2>حِمل المهام</h2></div></header>
      <div class="team-chart-empty"><i class="fi fi-rr-inbox"></i><strong>ما في مهام موزّعة بعد</strong><span>أول ما تسند مهام للفريق رح يظهر التوزيع هون.</span></div>
    </section>`;
  }

  const peak = Math.max(...rows.map((row) => row.total));
  const totals = rows.reduce((acc, row) => ({ open: acc.open + row.open, done: acc.done + row.done }), { open: 0, done: 0 });

  return `<section class="team-chart">
    <header>
      <div><span class="section-kicker"><i class="fi fi-rr-chart-histogram"></i> التوزيع</span><h2>حِمل المهام على الفريق</h2></div>
      <div class="team-chart-legend">
        <span><i class="open"></i> مفتوحة ${totals.open}</span>
        <span><i class="done"></i> منجزة ${totals.done}</span>
      </div>
    </header>
    <div class="team-bars">
      ${rows.map((row) => `
        <div class="team-bar-row">
          <span class="team-bar-name" title="${esc(row.employee.name)}">${esc(row.employee.name)}</span>
          <span class="team-bar-track">
            <i class="open" style="width:${((row.open / peak) * 100).toFixed(1)}%" title="مفتوحة: ${row.open}"></i>
            <i class="done" style="width:${((row.done / peak) * 100).toFixed(1)}%" title="منجزة: ${row.done}"></i>
          </span>
          <span class="team-bar-total">${row.total}</span>
        </div>`).join('')}
    </div>
  </section>`;
}

export async function showTeam() {
  loading('عم نجيب الفريق...');
  try {
    await store.loadRoles();
    await store.loadEmployees();
    await store.loadTasks();
    if (state.currentUser.permissions.includes('team')) {
      await store.loadAttendanceRange(periodDays()).catch(() => {});
      if (state.clients.length === 0) await store.loadClients().catch(() => {});
    }
  } catch (err) {
    errorState('تعذر تحميل الفريق', store.humanError(err));
    return;
  }

  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const countFor = (empId, fn) => state.tasks.filter((t) => t.assigneeId === empId && fn(t)).length;
  const tasksToday = (empId) => countFor(empId, (t) => t.status !== 'done');
  const doneToday = (empId) => countFor(empId, (t) => t.status === 'done' && (t.updatedAt || 0) >= startOfToday);

  const loadOf = (empId) => ({
    open: state.tasks.filter((t) => t.assigneeId === empId && t.status !== 'done').length,
    done: state.tasks.filter((t) => t.assigneeId === empId && t.status === 'done').length,
  });

  render(`
    <div class="topbar">
      <div><div class="page-title">الفريق</div><div class="page-sub">${state.employees.length} موظفين</div></div>
      <div class="topbar-actions">${state.currentUser.permissions.includes('reports') ? `<button class="btn ghost" data-action="go" data-page="reports"><i class="fi fi-rr-chart-histogram"></i> تقارير الأداء</button>` : ''}<button class="btn" data-action="add-employee">+ إضافة موظف</button></div>
    </div>
    ${state.currentUser.permissions.includes('team') ? attendanceLog() : ''}
    ${state.currentUser.permissions.includes('team') ? completedLog() : ''}
    ${teamChart(state.employees, loadOf)}

    <div class="clients-grid">
      ${state.employees.map((e) => `
        <div class="client-card" style="cursor:default;">
          <div class="client-top">
            <div style="display:flex; align-items:center; gap:10px;">
              <div class="avatar">${esc((e.name || '؟')[0])}</div>
              <div>
                <div class="client-name">${esc(e.name)}</div>
                <div class="client-industry">${esc(e.roleLabel)}</div>
                <div class="client-industry mono" style="font-size:10px;">@${esc(e.username || '—')}</div>
              </div>
            </div>
            <div class="row-actions">
              <button class="icon-btn" data-action="open-employee-profile" data-id="${esc(e.id)}">عرض الملف</button>
              <button class="icon-btn" data-action="edit-employee" data-id="${esc(e.id)}">تعديل</button>
            </div>
          </div>
          <div class="client-stats">
            <div><div class="cstat-v">${tasksToday(e.id)}</div><div class="cstat-l">مهام مفتوحة</div></div>
            <div><div class="cstat-v" style="color:var(--ok)">${doneToday(e.id)}</div><div class="cstat-l">أنجزها اليوم</div></div>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="disclaimer"><b>ملاحظة:</b> إنت بس يلي بتنشئ الحسابات — ما في تسجيل ذاتي بالنظام. كل موظف بتضيفه بيقدر يسجّل دخول فوراً باسم المستخدم وكلمة السر يلي بتعطيه ياهم.</div>
  `);
}

/* ---------- الملف الوظيفي ---------- */

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(getLocale(), { dateStyle: 'medium', timeStyle: 'short' });
}

export async function showEmployeeProfile(employeeId = state.currentUser.id) {
  state.activeEmployeeId = employeeId;
  state.currentPage = 'employee-profile';
  loading('جاري تجهيز الملف الوظيفي...');
  try {
    await Promise.all([
      state.roles.length ? Promise.resolve() : store.loadRoles(),
      state.employees.length ? Promise.resolve() : store.loadEmployees(),
      store.loadTasks(), store.loadServiceRequests(), store.loadTodayAttendance(),
    ]);
  } catch (err) {
    errorState('تعذر تحميل الملف الوظيفي', store.humanError(err));
    return;
  }

  const emp = state.employees.find((e) => e.id === employeeId)
    || (employeeId === state.currentUser.id ? {
      id: state.currentUser.id, name: state.currentUser.name, username: state.currentUser.username,
      roleLabel: state.currentUser.role, roleKey: state.currentUser.roleKey,
    } : null);
  if (!emp) { errorState('الموظف غير موجود', 'قد يكون الحساب موقوفاً أو حُذف من القائمة.'); return; }

  const mine = state.tasks.filter((t) => t.assigneeId === employeeId);
  const open = mine.filter((t) => t.status !== 'done');
  const done = mine.filter((t) => t.status === 'done');
  const late = open.filter((t) => t.deadline && new Date(t.deadline).getTime() < Date.now());
  const rate = mine.length ? Math.round((done.length / mine.length) * 100) : 0;
  const requests = state.serviceRequests.filter((r) => r.employeeId === employeeId).slice(0, 5);
  const attendance = state.attendance[employeeId] || {};
  const canManage = state.currentUser.permissions.includes('team');
  const isMe = employeeId === state.currentUser.id;

  render(`
    <div class="profile-back" data-action="${canManage && !isMe ? 'back-to-team' : 'go-home'}"><i class="fi fi-rr-arrow-right"></i> رجوع</div>
    <section class="employee-profile-hero">
      <div class="profile-identity"><div class="profile-avatar">${esc((emp.name || '؟')[0])}</div><div><span class="section-kicker">الملف الوظيفي</span><h1>${esc(emp.name)}</h1><p>${esc(emp.roleLabel || state.currentUser.role)} · <span class="mono">@${esc(emp.username || '—')}</span></p></div></div>
      <div class="profile-actions">${isMe ? `<button class="btn ghost" data-action="change-password"><i class="fi fi-rr-lock"></i> تغيير كلمة السر</button>` : ''}${canManage ? `<button class="btn" data-action="edit-employee" data-id="${esc(employeeId)}"><i class="fi fi-rr-pencil"></i> تعديل الموظف</button>` : ''}</div>
    </section>
    <div class="profile-stats">
      <div class="profile-stat"><span><i class="fi fi-rr-list-check"></i></span><div><strong>${open.length}</strong><small>مهام مفتوحة</small></div></div>
      <div class="profile-stat"><span class="green"><i class="fi fi-rr-check-circle"></i></span><div><strong>${done.length}</strong><small>مهام مكتملة</small></div></div>
      <div class="profile-stat"><span class="red"><i class="fi fi-rr-exclamation"></i></span><div><strong>${late.length}</strong><small>مهام متأخرة</small></div></div>
      <div class="profile-stat"><span class="blue"><i class="fi fi-rr-chart-histogram"></i></span><div><strong>${rate}%</strong><small>نسبة الإنجاز</small></div></div>
    </div>
    <div class="profile-layout">
      <div class="profile-main-card">
        <div class="section-head"><div><span class="section-kicker">مسار العمل</span><h2>المهام الحالية</h2></div>${canManage ? `<button class="icon-round" data-action="add-task"><i class="fi fi-rr-plus"></i></button>` : ''}</div>
        <div class="profile-task-list">${open.length ? open.slice(0, 8).map((t) => `<article class="profile-task task-open-card" data-action="view-task" data-id="${esc(t.id)}"><span class="prio-dot ${esc(t.priority)}"></span><div><strong>${esc(t.title)}</strong><p>${esc(t.notes || 'بدون ملاحظات')}</p><small>${formatDate(t.deadline)}</small></div><span class="badge">${esc(t.status === 'today' ? 'اليوم' : t.status === 'progress' ? 'قيد التنفيذ' : t.status === 'paused' ? 'متوقفة مؤقتاً' : t.status === 'review' ? 'مراجعة' : 'تعديل')}</span></article>`).join('') : `<div class="soft-empty"><i class="fi fi-rr-check-circle"></i><strong>لا توجد مهام مفتوحة</strong><span>كل المهام منجزة حالياً.</span></div>`}</div>
      </div>
      <aside class="profile-side">
        <div class="profile-info-card"><div class="section-head compact"><div><span class="section-kicker">اليوم</span><h2>الحضور</h2></div><i class="fi fi-rr-fingerprint card-head-icon"></i></div><div class="attendance-times"><div><small>وقت الدخول</small><strong>${attendance.checkIn ? new Date(attendance.checkIn).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' }).replace(BIDI_RE, '') : '—'}</strong></div><div><small>وقت الخروج</small><strong>${attendance.checkOut ? new Date(attendance.checkOut).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' }).replace(BIDI_RE, '') : '—'}</strong></div></div></div>
        <div class="profile-info-card"><div class="section-head compact"><div><span class="section-kicker">الخدمات</span><h2>آخر الطلبات</h2></div><i class="fi fi-rr-document-signed card-head-icon"></i></div>${requests.length ? requests.map((r) => `<div class="mini-request"><span>${esc(r.type === 'leave' ? 'إجازة' : r.type === 'purchase' ? 'مشتريات' : r.type === 'maintenance' ? 'صيانة' : 'طلب')}</span><b class="${esc(r.status)}">${esc(r.status === 'approved' ? 'موافق' : r.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة')}</b></div>`).join('') : `<div class="soft-empty small"><span>لا توجد طلبات</span></div>`}</div>
      </aside>
    </div>
  `);
}

function openAddEmployeeModal() {
  openModal(`
    <h3>إضافة موظف جديد</h3>
    <div class="field">
      <label>الاسم *</label>
      <input id="e-name" placeholder="مثال: خالد عمر"><div class="err" id="err-e-name"></div>
    </div>
    <div class="field">
      <label>اسم المستخدم *</label>
      <input id="e-username" class="ltr-field" autocomplete="off" placeholder="khaled">
      <small style="color:var(--text-dim); font-size:11px;">أحرف إنجليزية وأرقام و . _ - بس — هاد يلي بيسجّل فيه دخول</small>
      <div class="err" id="err-e-username"></div>
    </div>
    <div class="field">
      <label>كلمة السر المبدئية *</label>
      <input id="e-password" type="password" autocomplete="new-password" placeholder="أعطيه إياها ليغيّرها لاحقاً"><div class="err" id="err-e-password"></div>
    </div>
    <div class="field">
      <label>الدور *</label>
      <select id="e-role">${state.roles.map((r) => `<option value="${esc(r.key)}">${esc(r.label)}</option>`).join('')}</select>
    </div>
    <div class="err" id="err-e-submit"></div>
    <div class="modal-actions">
      <button class="btn ghost" data-action="close-modal">إلغاء</button>
      <button class="btn" data-action="submit-employee">إضافة</button>
    </div>
  `);
}

async function submitAddEmployee(btn) {
  const name = document.getElementById('e-name').value.trim();
  const username = document.getElementById('e-username').value.trim().toLowerCase();
  const password = document.getElementById('e-password').value;
  const roleKey = document.getElementById('e-role').value;

  let ok = true;
  ok = setErr('err-e-name', !name && 'لازم تدخل الاسم') && ok;
  ok = setErr('err-e-username', usernameProblem(username)) && ok;
  ok = setErr('err-e-password', password.length < 6 && 'كلمة السر 6 أحرف عالأقل') && ok;
  if (!ok) return;

  btn.disabled = true;
  btn.textContent = 'عم ننشئ الحساب...';
  try {
    await store.createEmployee({ name, username, password, roleKey });
    closeModal();
    toast(`تمت إضافة ${name} — يقدر يسجّل دخول باسم "${username}"`);
    showTeam();
  } catch (err) {
    setErr('err-e-submit', store.humanError(err));
  } finally {
    btn.disabled = false;
    btn.textContent = 'إضافة';
  }
}

function openEditEmployeeModal(id) {
  const emp = state.employees.find((e) => e.id === id);
  if (!emp) return;
  openModal(`
    <h3>تعديل ${esc(emp.name)}</h3>
    <div class="field">
      <label>الاسم *</label>
      <input id="e-edit-name" value="${esc(emp.name)}"><div class="err" id="err-e-edit-name"></div>
    </div>
    <div class="field">
      <label>المسمى الوظيفي *</label>
      <select id="e-edit-role">${state.roles.map((r) => `<option value="${esc(r.key)}" ${r.key === emp.roleKey ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select>
    </div>
    <div class="field">
      <label>اسم المستخدم</label>
      <input class="ltr-field" value="${esc(emp.username || '')}" disabled style="opacity:.6">
      <small style="color:var(--text-dim); font-size:11px;">اسم المستخدم ثابت ما بينعدّل — لو لازم يتغيّر، أوقف الحساب وأنشئ واحد جديد</small>
    </div>
    <div class="err" id="err-e-edit-submit"></div>
    <div class="modal-actions">
      <button class="btn ghost" data-action="close-modal">إلغاء</button>
      <button class="btn" data-action="save-employee" data-id="${esc(id)}">حفظ</button>
    </div>
    ${id === state.currentUser.id ? '' : `<div style="margin-top:14px; text-align:center;">
      <span class="reset-link" style="color:var(--danger); font-size:12px;" data-action="deactivate-employee" data-id="${esc(id)}">إيقاف حساب هاد الموظف</span>
    </div>`}
  `);
}

async function saveEmployee(btn) {
  const id = btn.dataset.id;
  const name = document.getElementById('e-edit-name').value.trim();
  const roleKey = document.getElementById('e-edit-role').value;
  if (!setErr('err-e-edit-name', !name && 'لازم تدخل الاسم')) return;

  btn.disabled = true;
  try {
    await store.updateEmployee(id, { name, roleKey });
    closeModal();
    toast('انحفظت التعديلات');
    showTeam();
  } catch (err) {
    setErr('err-e-edit-submit', store.humanError(err));
  } finally { btn.disabled = false; }
}

async function deactivateEmployee(id) {
  const emp = state.employees.find((e) => e.id === id);
  if (!confirm(`إيقاف حساب ${emp ? emp.name : 'هاد الموظف'}؟ ما رح يقدر يسجّل دخول، بس مهامه القديمة بتضل محفوظة.`)) return;
  try {
    await store.deactivateEmployee(id);
    closeModal();
    toast('انوقف الحساب');
    showTeam();
  } catch (err) { toast(store.humanError(err), true); }
}

export const actions = {
  'attendance-date': (el) => { if (el.value) { state.attendanceDate = el.value; showTeam(); } },
  'attendance-period': (el) => { state.attendancePeriod = el.dataset.period; showTeam(); },
  'attendance-pdf': () => openAttendancePdf(),
  'done-log-pdf': () => openDonePdf(),
  'print-team-sheet': () => printSheet(),
  'attendance-today': () => { state.attendanceDate = ''; showTeam(); },
  'open-my-profile': () => showEmployeeProfile(state.currentUser.id),
  'open-employee-profile': (el) => showEmployeeProfile(el.dataset.id),
  'back-to-team': () => showTeam(),
  'add-employee': () => openAddEmployeeModal(),
  'submit-employee': (el) => submitAddEmployee(el),
  'edit-employee': (el) => openEditEmployeeModal(el.dataset.id),
  'save-employee': (el) => saveEmployee(el),
  'deactivate-employee': (el) => deactivateEmployee(el.dataset.id),
};
