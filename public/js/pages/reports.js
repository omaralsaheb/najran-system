// ============ تقارير الحضور وأداء الموظفين ============
import { state, esc } from '../state.js';
import { render, loading, errorState, toast } from '../ui.js';
import { getLocale } from '../i18n.js';
import * as store from '../store.js';

const pad = (value) => String(value).padStart(2, '0');

function dateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromKey(key) {
  const value = new Date(`${key}T12:00:00`);
  return Number.isNaN(value.getTime()) ? new Date() : value;
}

function reportRange(period, anchorKey) {
  const anchor = fromKey(anchorKey);
  const start = new Date(anchor);
  const end = new Date(anchor);
  if (period === 'week') {
    start.setDate(anchor.getDate() - anchor.getDay());
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  } else {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 0);
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end, startKey: dateKey(start), endKey: dateKey(end) };
}

function keysBetween(start, end) {
  const keys = [];
  const cursor = new Date(start);
  cursor.setHours(12, 0, 0, 0);
  while (cursor <= end) {
    keys.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function isWorkday(key) {
  const day = fromKey(key).getDay();
  return day >= 0 && day <= 4; // الأحد إلى الخميس
}

function timestampInRange(value, start, end) {
  const timestamp = Number(value) || new Date(value || 0).getTime();
  return timestamp >= start.getTime() && timestamp <= end.getTime();
}

function durationHours(record) {
  if (!record?.checkIn || !record?.checkOut || record.checkOut <= record.checkIn) return 0;
  return (record.checkOut - record.checkIn) / 3600000;
}

function timeText(timestamp) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' });
}

function averageTime(records) {
  const values = records.map((record) => Number(record?.checkIn)).filter(Boolean);
  if (!values.length) return '—';
  const minutes = values.reduce((sum, timestamp) => {
    const date = new Date(timestamp);
    return sum + date.getHours() * 60 + date.getMinutes();
  }, 0) / values.length;
  const sample = new Date();
  sample.setHours(Math.floor(minutes / 60), Math.round(minutes % 60), 0, 0);
  return timeText(sample.getTime());
}

function buildReportModel() {
  const period = state.reportPeriod || 'month';
  const anchor = state.reportAnchorDate || dateKey();
  const range = reportRange(period, anchor);
  const allDateKeys = keysBetween(range.start, range.end);
  const today = dateKey();
  const trackedWorkdays = allDateKeys.filter((key) => isWorkday(key) && key <= today);
  const employees = state.employees.filter((employee) => employee.active !== false && !employee.isAccessAccount);
  const dueTasks = state.tasks.filter((task) => task.deadline && timestampInRange(task.deadline, range.start, range.end));
  const completedTasks = state.tasks.filter((task) => task.status === 'done'
    && timestampInRange(task.completedAt || task.updatedAt, range.start, range.end));

  const rows = employees.map((employee) => {
    const attendanceRecords = allDateKeys.map((key) => state.attendanceRange[key]?.[employee.id]).filter(Boolean);
    const presentDays = trackedWorkdays.filter((key) => state.attendanceRange[key]?.[employee.id]?.checkIn).length;
    const completeDays = trackedWorkdays.filter((key) => {
      const record = state.attendanceRange[key]?.[employee.id];
      return record?.checkIn && record?.checkOut;
    }).length;
    const incompleteDays = Math.max(0, presentDays - completeDays);
    const absentDays = Math.max(0, trackedWorkdays.length - presentDays);
    const hours = attendanceRecords.reduce((sum, record) => sum + durationHours(record), 0);
    const attendanceRate = trackedWorkdays.length ? Math.round((presentDays / trackedWorkdays.length) * 100) : 100;

    const assigned = dueTasks.filter((task) => task.assigneeId === employee.id);
    const completed = completedTasks.filter((task) => task.assigneeId === employee.id);
    const scopeIds = new Set([...assigned, ...completed].map((task) => task.id));
    const overdue = assigned.filter((task) => task.status !== 'done' && new Date(task.deadline).getTime() < Date.now()).length;
    const onTime = completed.filter((task) => !task.deadline
      || Number(task.completedAt || task.updatedAt) <= new Date(task.deadline).getTime()).length;
    const completionRate = scopeIds.size ? Math.min(100, Math.round((completed.length / scopeIds.size) * 100)) : 0;
    const onTimeRate = completed.length ? Math.round((onTime / completed.length) * 100) : 0;
    const score = scopeIds.size
      ? Math.max(0, Math.min(100, Math.round(completionRate * 0.62 + onTimeRate * 0.23 + attendanceRate * 0.15 - overdue * 3)))
      : null;

    return {
      employee, presentDays, completeDays, incompleteDays, absentDays, hours,
      attendanceRate, averageCheckIn: averageTime(attendanceRecords), assigned: assigned.length,
      completed: completed.length, overdue, onTime, completionRate, onTimeRate, score,
    };
  });

  const ranked = [...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const scored = rows.filter((row) => row.score !== null);
  return {
    period, anchor, range, allDateKeys, trackedWorkdays, rows, ranked,
    totalHours: rows.reduce((sum, row) => sum + row.hours, 0),
    presentEntries: rows.reduce((sum, row) => sum + row.presentDays, 0),
    absentEntries: rows.reduce((sum, row) => sum + row.absentDays, 0),
    completedCount: completedTasks.length,
    overdueCount: rows.reduce((sum, row) => sum + row.overdue, 0),
    averageScore: scored.length ? Math.round(scored.reduce((sum, row) => sum + row.score, 0) / scored.length) : 0,
  };
}

function progressBar(value, kind = '') {
  return `<span class="report-progress ${esc(kind)}"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></span>`;
}

function renderAttendanceCards(rows, expectedDays) {
  return rows.map((row) => `<article class="report-person-card">
    <div class="report-person-head"><span class="report-avatar">${esc((row.employee.name || '؟')[0])}</span><div><strong>${esc(row.employee.name)}</strong><small>${esc(row.employee.roleLabel || '')}</small></div><b>${row.attendanceRate}%</b></div>
    ${progressBar(row.attendanceRate, 'attendance')}
    <div class="report-person-grid"><span><small>حضور</small><strong>${row.presentDays}/${expectedDays}</strong></span><span><small>غياب</small><strong>${row.absentDays}</strong></span><span><small>الساعات</small><strong>${row.hours.toFixed(1)}</strong></span><span><small>متوسط الدخول</small><strong>${row.averageCheckIn}</strong></span></div>
  </article>`).join('');
}

function renderPerformanceCards(rows) {
  return rows.map((row, index) => `<article class="report-person-card performance">
    <div class="report-person-head"><span class="report-rank">${index + 1}</span><span class="report-avatar">${esc((row.employee.name || '؟')[0])}</span><div><strong>${esc(row.employee.name)}</strong><small>${esc(row.employee.roleLabel || '')}</small></div><b class="score ${row.score === null ? 'empty' : ''}">${row.score === null ? '—' : `${row.score}%`}</b></div>
    ${progressBar(row.score || 0, 'performance')}
    <div class="report-person-grid"><span><small>مُسندة</small><strong>${row.assigned}</strong></span><span><small>منجزة</small><strong>${row.completed}</strong></span><span><small>بموعدها</small><strong>${row.onTime}</strong></span><span><small>متأخرة</small><strong>${row.overdue}</strong></span></div>
  </article>`).join('');
}

export function renderReports() {
  const model = buildReportModel();
  const rangeLabel = `${model.range.start.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' })} — ${model.range.end.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const topAttendance = [...model.rows].sort((a, b) => b.attendanceRate - a.attendanceRate).slice(0, 5);

  render(`
    <section class="operations-report-page">
      <header class="reports-hero">
        <div><span class="section-kicker"><i class="fi fi-rr-chart-pie-alt"></i> مركز التقارير</span><h1>الحضور وأداء الفريق</h1><p>قراءة فعلية لبصمة الموظفين وإنجاز المهام خلال الفترة المحددة.</p></div>
        <div class="report-controls">
          <div class="report-period-switch"><button class="${model.period === 'week' ? 'active' : ''}" data-action="set-report-period" data-period="week">أسبوعي</button><button class="${model.period === 'month' ? 'active' : ''}" data-action="set-report-period" data-period="month">شهري</button></div>
          <label class="report-date-control"><i class="fi fi-rr-calendar"></i><input type="date" value="${esc(model.anchor)}" data-action="set-report-anchor"></label>
          <button class="btn ghost report-print" data-action="print-operations-report"><i class="fi fi-rr-print"></i> طباعة / PDF</button>
        </div>
        <div class="report-range-label"><i class="fi fi-rr-calendar-day"></i><span>${esc(rangeLabel)}</span></div>
      </header>

      <div class="report-kpis">
        <article><span class="green"><i class="fi fi-rr-fingerprint"></i></span><div><small>إجمالي الحضور</small><strong>${model.presentEntries}</strong><em>${model.totalHours.toFixed(1)} ساعة عمل</em></div></article>
        <article><span class="amber"><i class="fi fi-rr-user-time"></i></span><div><small>أيام الغياب</small><strong>${model.absentEntries}</strong><em>حتى تاريخ اليوم</em></div></article>
        <article><span class="blue"><i class="fi fi-rr-check-circle"></i></span><div><small>مهام منجزة</small><strong>${model.completedCount}</strong><em>داخل الفترة</em></div></article>
        <article><span class="violet"><i class="fi fi-rr-chart-histogram"></i></span><div><small>متوسط الأداء</small><strong>${model.averageScore}%</strong><em>${model.overdueCount} مهام متأخرة</em></div></article>
      </div>

      <div class="reports-overview-grid">
        <section class="report-panel">
          <div class="report-panel-head"><div><span class="section-kicker">تقرير البصمة</span><h2>الالتزام بالحضور</h2></div><span>${model.trackedWorkdays.length} أيام عمل</span></div>
          <div class="report-visual-list">${topAttendance.length ? topAttendance.map((row) => `<div class="report-visual-row"><span class="report-avatar">${esc((row.employee.name || '؟')[0])}</span><div><strong>${esc(row.employee.name)}</strong>${progressBar(row.attendanceRate, 'attendance')}</div><b>${row.presentDays}/${model.trackedWorkdays.length}</b></div>`).join('') : '<div class="report-empty">لا توجد بيانات حضور في هذه الفترة</div>'}</div>
        </section>
        <section class="report-panel highlight">
          <div class="report-panel-head"><div><span class="section-kicker">تقرير الأداء</span><h2>ترتيب الموظفين</h2></div><span>إنجاز + موعد + حضور</span></div>
          <div class="report-leader-list">${model.ranked.slice(0, 5).map((row, index) => `<div class="report-leader"><span class="report-rank">${index + 1}</span><span class="report-avatar">${esc((row.employee.name || '؟')[0])}</span><div><strong>${esc(row.employee.name)}</strong><small>${row.completed} منجزة · ${row.onTime} بموعدها</small></div><b>${row.score === null ? '—' : `${row.score}%`}</b></div>`).join('')}</div>
        </section>
      </div>

      <section class="report-detail-section">
        <div class="report-panel-head"><div><span class="section-kicker">تفاصيل البصمة</span><h2>الحضور حسب الموظف</h2></div><span>الأحد — الخميس</span></div>
        <div class="report-table-wrap"><table class="report-data-table"><thead><tr><th>الموظف</th><th>الحضور</th><th>الغياب</th><th>ناقص انصراف</th><th>إجمالي الساعات</th><th>متوسط الدخول</th><th>الالتزام</th></tr></thead><tbody>${model.rows.map((row) => `<tr><td><span class="table-employee"><i>${esc((row.employee.name || '؟')[0])}</i><span><strong>${esc(row.employee.name)}</strong><small>${esc(row.employee.roleLabel || '')}</small></span></span></td><td>${row.presentDays}</td><td>${row.absentDays}</td><td>${row.incompleteDays}</td><td>${row.hours.toFixed(1)}</td><td>${row.averageCheckIn}</td><td><span class="table-progress-value">${progressBar(row.attendanceRate, 'attendance')}<b>${row.attendanceRate}%</b></span></td></tr>`).join('')}</tbody></table></div>
        <div class="report-mobile-cards">${renderAttendanceCards(model.rows, model.trackedWorkdays.length)}</div>
      </section>

      <section class="report-detail-section performance-section">
        <div class="report-panel-head"><div><span class="section-kicker">تفاصيل الأداء</span><h2>إنجاز المهام والالتزام</h2></div><span>النتيجة من 100</span></div>
        <div class="report-table-wrap"><table class="report-data-table"><thead><tr><th>الموظف</th><th>المهام المسندة</th><th>منجزة</th><th>بموعدها</th><th>متأخرة</th><th>نسبة الإنجاز</th><th>التقييم</th></tr></thead><tbody>${model.ranked.map((row) => `<tr><td><span class="table-employee"><i>${esc((row.employee.name || '؟')[0])}</i><span><strong>${esc(row.employee.name)}</strong><small>${esc(row.employee.roleLabel || '')}</small></span></span></td><td>${row.assigned}</td><td>${row.completed}</td><td>${row.onTime}</td><td>${row.overdue}</td><td>${row.completionRate}%</td><td><span class="performance-score ${row.score === null ? 'empty' : ''}">${row.score === null ? 'لا مهام' : `${row.score}%`}</span></td></tr>`).join('')}</tbody></table></div>
        <div class="report-mobile-cards">${renderPerformanceCards(model.ranked)}</div>
      </section>
    </section>
  `);
}

async function loadReportData() {
  const range = reportRange(state.reportPeriod || 'month', state.reportAnchorDate || dateKey());
  await store.loadAttendanceRange(keysBetween(range.start, range.end));
  renderReports();
}

export async function showReports() {
  state.reportAnchorDate ||= dateKey();
  loading('جاري تجهيز تقارير الفريق...');
  try {
    await Promise.all([store.loadEmployees(), store.loadTasks()]);
    await loadReportData();
  } catch (error) {
    errorState('تعذر تحميل التقارير', store.humanError(error));
  }
}

async function changePeriod(element) {
  state.reportPeriod = element.dataset.period === 'week' ? 'week' : 'month';
  loading('جاري تحديث التقرير...');
  try { await loadReportData(); } catch (error) { toast(store.humanError(error), true); }
}

async function changeAnchor(element) {
  if (!element.value) return;
  state.reportAnchorDate = element.value;
  loading('جاري تحديث التقرير...');
  try { await loadReportData(); } catch (error) { toast(store.humanError(error), true); }
}

export const actions = {
  'set-report-period': (element) => changePeriod(element),
  'set-report-anchor': (element) => changeAnchor(element),
  'print-operations-report': () => window.print(),
};
