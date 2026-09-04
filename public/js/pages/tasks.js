// ============ المهام + لوحة الموظف + التقويم ============
import {
  state, esc, PRIO_LABEL, STATUS_LABEL, TASK_STATUSES, TYPE_LABEL,
  employeeName, clientName, can,
} from '../state.js';
import { render, openModal, closeModal, loading, errorState, toast, renderNotifPanel, go } from '../ui.js';
import { getLocale } from '../i18n.js';
import * as store from '../store.js';

function setErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return !msg;
  if (msg) { el.textContent = msg; el.style.display = 'block'; return false; }
  el.style.display = 'none';
  return true;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? esc(iso) : d.toLocaleString(getLocale());
}

// بيحوّل ISO لصيغة خانة datetime-local (بالتوقيت المحلي، مش UTC)
function toDatetimeLocal(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateFromKey(key) {
  const date = new Date(`${key}T12:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function shiftedDateKey(key, offset) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + offset);
  return localDateKey(date);
}

const taskDateKey = (task) => localDateKey(task.deadline);

function validDriveLink(value) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !['drive.google.com', 'docs.google.com'].includes(host)) return '';
    return url.href;
  } catch (_) {
    return '';
  }
}

const activityLabel = (action) => ({
  created: 'تم إنشاء المهمة', updated: 'تم تعديل المهمة', status_changed: 'تم تغيير الحالة',
  completed: 'تم إنهاء وتسليم المهمة', deleted: 'تم حذف المهمة',
}[action] || action);

const activityDetail = (detail) => STATUS_LABEL[detail]
  || ({ whatsapp: 'واتساب', drive: 'Google Drive' }[detail]) || detail || '';

let taskReturnPage = 'tasks';

async function ensureRefs() {
  if (state.roles.length === 0) await store.loadRoles().catch(() => {});
  if (state.employees.length === 0) await store.loadEmployees().catch(() => {});
  if (state.clients.length === 0) await store.loadClients().catch(() => {});
}

/* ---------- صفحة المهام ---------- */

export async function showTasks() {
  loading('عم نجيب المهام...');
  try {
    await store.loadTasks();
    await ensureRefs();
  } catch (err) {
    errorState('تعذر تحميل المهام', store.humanError(err));
    return;
  }
  if (!state.taskFilterDate) state.taskFilterDate = localDateKey();
  renderTasks();
}


/* ============ العرض الأسبوعي — شبكة أيام × ساعات ============ */

const DAY_MS = 86400000;

// بداية أسبوع التاريخ المختار (الأحد)
function weekStartOf(dateKey) {
  const date = dateFromKey(dateKey);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

// المهام يلي إلها موعد صالح ضمن الأسبوع، مرتّبة حسب الوقت
function weekBuckets(tasks, start) {
  const days = Array.from({ length: 7 }, () => []);
  tasks.forEach((task) => {
    if (!task.deadline) return;
    const due = new Date(task.deadline);
    if (Number.isNaN(due.getTime())) return;
    const index = Math.floor((due - start) / DAY_MS);
    if (index < 0 || index > 6) return;
    days[index].push({ task, due });
  });
  days.forEach((day) => day.sort((a, b) => a.due - b.due));
  return days;
}

// مهمتين بنفس الساعة لازم ينقسموا العرض بدل ما يتراكبوا.
// مهم: القسمة بتصير لكل **مجموعة متداخلة** لحالها — مش لكل اليوم.
// لو حسبناها لليوم كله، مهمة وحدة بالصبح بتنضغط لأن المساء مزدحم.
function assignLanes(entries) {
  entries.forEach((entry) => {
    const startMin = entry.due.getHours() * 60 + entry.due.getMinutes();
    entry.startMin = startMin;
    entry.endMin = startMin + 55;
  });

  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const lanes = [];
    cluster.forEach((entry) => {
      let lane = lanes.findIndex((end) => end <= entry.startMin);
      if (lane === -1) { lane = lanes.length; lanes.push(entry.endMin); } else { lanes[lane] = entry.endMin; }
      entry.lane = lane;
    });
    const count = Math.max(1, lanes.length);
    cluster.forEach((entry) => { entry.laneCount = count; });
    cluster = [];
    clusterEnd = -1;
  };

  entries.forEach((entry) => {
    if (cluster.length && entry.startMin >= clusterEnd) flush();
    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, entry.endMin);
  });
  flush();
  return entries;
}

function weekView(tasks, selectedDate) {
  const start = weekStartOf(selectedDate === 'all' ? localDateKey() : selectedDate);
  const days = weekBuckets(tasks, start);
  const dated = days.flat();

  // نطاق الساعات: من أبكر مهمة لأمتن وحدة، بحد أدنى 8ص–6م
  const hours = dated.map((entry) => entry.due.getHours());
  const startHour = Math.max(0, Math.min(8, ...(hours.length ? hours : [8])));
  const endHour = Math.min(23, Math.max(18, ...(hours.length ? hours.map((h) => h + 1) : [18])));
  const rows = endHour - startHour;
  const ROW = 62; // ارتفاع الساعة الواحدة بالبكسل

  const todayKey = localDateKey();
  const noDeadline = tasks.filter((task) => {
    if (!task.deadline) return true;
    const due = new Date(task.deadline);
    if (Number.isNaN(due.getTime())) return true;
    const index = Math.floor((due - start) / DAY_MS);
    return index < 0 || index > 6;
  });

  const dayHeads = days.map((_, index) => {
    const date = new Date(start.getTime() + index * DAY_MS);
    const key = localDateKey(date);
    return `<button class="week-day-head ${key === todayKey ? 'today' : ''} ${key === selectedDate ? 'picked' : ''}" data-action="set-task-date" data-date="${key}">
      <small>${date.toLocaleDateString(getLocale(), { weekday: 'short' })}</small>
      <strong>${date.getDate()}</strong>
      ${days[index].length ? `<i>${days[index].length}</i>` : ''}
    </button>`;
  }).join('');

  const columns = days.map((entries, index) => {
    const date = new Date(start.getTime() + index * DAY_MS);
    const key = localDateKey(date);
    assignLanes(entries);
    const cards = entries.map((entry) => {
      const { task, due, startMin, lane, laneCount } = entry;
      const top = ((startMin - startHour * 60) / 60) * ROW;
      const width = 100 / laneCount;
      return `<button class="week-task prio-${esc(task.priority || 'mid')} ${task.status === 'done' ? 'is-done' : ''} ${laneCount >= 3 ? 'dense' : ''}"
        style="top:${Math.max(0, top).toFixed(1)}px; height:${(ROW - 6).toFixed(0)}px; inset-inline-start:${(lane * width).toFixed(2)}%; width:calc(${width.toFixed(2)}% - 4px)"
        data-action="view-task" data-id="${esc(task.id)}" title="${esc(task.title)}">
        <span class="week-task-time">${due.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })}</span>
        <span class="week-task-title">${esc(task.title)}</span>
        <span class="week-task-meta">${esc(employeeName(task.assigneeId))}</span>
      </button>`;
    }).join('');
    return `<div class="week-col ${key === todayKey ? 'today' : ''}" style="height:${rows * ROW}px">
      ${Array.from({ length: rows }, (_, r) => `<span class="week-slot" style="top:${r * ROW}px; height:${ROW}px"></span>`).join('')}
      ${cards}
    </div>`;
  }).join('');

  const hourLabels = Array.from({ length: rows }, (_, r) => {
    const hour = startHour + r;
    const label = new Date(2000, 0, 1, hour).toLocaleTimeString(getLocale(), { hour: 'numeric' });
    return `<span style="height:${ROW}px">${label}</span>`;
  }).join('');

  return `
    <section class="week-board">
      <header class="week-head">
        <div class="week-nav">
          <button data-action="week-shift" data-step="-7" title="الأسبوع السابق"><i class="fi fi-rr-angle-small-right"></i></button>
          <button class="today" data-action="week-today">هذا الأسبوع</button>
          <button data-action="week-shift" data-step="7" title="الأسبوع القادم"><i class="fi fi-rr-angle-small-left"></i></button>
        </div>
        <strong>${start.toLocaleDateString(getLocale(), { day: 'numeric', month: 'long' })} — ${new Date(start.getTime() + 6 * DAY_MS).toLocaleDateString(getLocale(), { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
      </header>

      <div class="week-grid">
        <div class="week-corner"></div>
        <div class="week-days">${dayHeads}</div>
        <div class="week-hours">${hourLabels}</div>
        <div class="week-body">${columns}</div>
      </div>

      ${dated.length === 0 ? '<div class="week-empty"><i class="fi fi-rr-calendar-cross"></i><strong>ما في مهام بهذا الأسبوع</strong><span>تنقّل بين الأسابيع أو أضف مهمة جديدة.</span></div>' : ''}
      ${noDeadline.length ? `<div class="week-unscheduled"><h4>بدون موعد ضمن الأسبوع (${noDeadline.length})</h4><div>${noDeadline.slice(0, 12).map((task) => `<button class="week-chip" data-action="view-task" data-id="${esc(task.id)}">${esc(task.title)}</button>`).join('')}</div></div>` : ''}
    </section>`;
}

export function renderTasks() {
  const selectedDate = state.taskFilterDate || localDateKey();
  let employeeTasks = state.tasks;
  if (state.taskFilterEmp !== 'all') employeeTasks = employeeTasks.filter((task) => task.assigneeId === state.taskFilterEmp);
  const all = selectedDate === 'all' ? employeeTasks : employeeTasks.filter((task) => taskDateKey(task) === selectedDate);
  const railCenter = selectedDate === 'all' ? localDateKey() : selectedDate;
  const railDates = Array.from({ length: 7 }, (_, index) => shiftedDateKey(railCenter, index - 3));
  const selectedLabel = selectedDate === 'all'
    ? 'كل الأيام'
    : dateFromKey(selectedDate).toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
  const openCount = all.filter((task) => task.status !== 'done').length;
  const doneCount = all.filter((task) => task.status === 'done').length;
  const urgentCount = all.filter((task) => task.priority === 'high' && task.status !== 'done').length;

  const visibleStatuses = selectedDate === 'all'
    ? TASK_STATUSES
    : TASK_STATUSES.filter((status) => all.some((task) => task.status === status));
  const boardHTML = all.length === 0
    ? '<div class="empty-state task-date-empty"><i class="fi fi-rr-calendar-cross"></i><div class="empty-title">ما في مهام بهذا اليوم</div><div class="empty-sub">اختر يوماً آخر أو أضف مهمة جديدة.</div><button class="btn" data-action="add-task">إضافة مهمة</button></div>'
    : `<div class="board-cols">
      ${visibleStatuses.map((st) => {
        const col = all.filter((t) => t.status === st);
        return `
        <div class="board-col">
          <h4>${STATUS_LABEL[st]} (${col.length})</h4>
          ${col.map((t) => `
            <div class="board-card task-open-card" data-action="view-task" data-id="${esc(t.id)}" role="button" tabindex="0">
              <div class="t-title">${esc(t.title)}</div>
              <div class="t-meta">${esc(clientName(t.clientId)) || 'بدون عميل'} · ${esc(employeeName(t.assigneeId))}<br>${fmtDate(t.deadline)}</div>
              ${t.notes ? `<div class="t-notes">📝 ${esc(t.notes)}</div>` : ''}
              <div class="task-card-actions"><button class="icon-btn" data-action="view-task" data-id="${esc(t.id)}">التفاصيل</button><button class="icon-btn" data-action="edit-task" data-id="${esc(t.id)}">تعديل</button></div>
            </div>
          `).join('') || '<div class="task-empty">فاضي</div>'}
        </div>`;
      }).join('')}
    </div>`;

  const listHTML = all.length === 0
    ? '<div class="empty-state"><div class="empty-title">ما في مهام</div></div>'
    : `
    <div class="table-scroll"><table class="content-table">
      <thead><tr><th>المهمة</th><th>العميل</th><th>الموظف المسؤول</th><th>الأولوية</th><th>الموعد</th><th>الحالة</th><th>ملاحظات</th><th></th></tr></thead>
      <tbody>${all.map((t) => `<tr class="task-open-row" data-action="view-task" data-id="${esc(t.id)}">
        <td>${esc(t.title)}</td>
        <td>${esc(clientName(t.clientId)) || '—'}</td>
        <td>${esc(employeeName(t.assigneeId))}</td>
        <td><span class="prio ${esc(t.priority)}">${PRIO_LABEL[t.priority] || ''}</span></td>
        <td class="mono" style="font-size:12px">${fmtDate(t.deadline)}</td>
        <td>${STATUS_LABEL[t.status] || ''}</td>
        <td style="font-size:12px; color:var(--text-dim)">${esc(t.notes) || '—'}</td>
        <td><span class="table-task-actions"><button class="icon-btn" data-action="view-task" data-id="${esc(t.id)}">التفاصيل</button><button class="icon-btn" data-action="edit-task" data-id="${esc(t.id)}">تعديل</button></span></td>
      </tr>`).join('')}</tbody>
    </table></div>
  `;

  render(`
    <section class="task-workspace-hero">
      <div><span class="section-kicker"><i class="fi fi-rr-calendar-clock"></i> مساحة العمل اليومية</span><h1>مهام ${esc(selectedLabel)}</h1><p>اختر اليوم مباشرة وشاهد مهامه بدون البحث بين كل الأيام.</p></div>
      <div class="task-hero-summary">
        <article><strong>${all.length}</strong><span>كل المهام</span></article>
        <article><strong>${openCount}</strong><span>مفتوحة</span></article>
        <article class="success"><strong>${doneCount}</strong><span>مكتملة</span></article>
        <article class="danger"><strong>${urgentCount}</strong><span>عاجلة</span></article>
      </div>
      <button class="btn task-add-primary" data-action="add-task"><i class="fi fi-rr-plus"></i> مهمة جديدة</button>
    </section>

    <section class="task-date-navigator">
      <div class="task-date-tools">
        <button class="date-all-chip ${selectedDate === 'all' ? 'active' : ''}" data-action="show-all-task-dates"><i class="fi fi-rr-apps"></i> كل الأيام</button>
        <label class="task-date-picker"><i class="fi fi-rr-calendar"></i><input type="date" value="${selectedDate === 'all' ? railCenter : selectedDate}" data-action="filter-task-date"></label>
        <select class="filter-select" data-action="filter-task-emp">
          <option value="all">كل الموظفين</option>
          ${state.employees.map((e) => `<option value="${esc(e.id)}" ${state.taskFilterEmp === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}
        </select>
      </div>
      <div class="task-date-rail">
        ${railDates.map((key) => {
          const date = dateFromKey(key);
          const count = employeeTasks.filter((task) => taskDateKey(task) === key).length;
          const isToday = key === localDateKey();
          return `<button class="task-date-day ${selectedDate === key ? 'active' : ''} ${isToday ? 'today' : ''}" data-action="set-task-date" data-date="${key}"><span>${date.toLocaleDateString(getLocale(), { weekday: 'short' })}</span><strong>${date.getDate()}</strong><small>${count ? `${count} مهام` : 'فارغ'}</small></button>`;
        }).join('')}
      </div>
    </section>

    <div class="task-view-row">
      <div><strong>${esc(state.taskView === 'week' ? 'العرض الأسبوعي' : selectedLabel)}</strong><span>${state.taskView === 'week' ? 'كل مهام الأسبوع حسب اليوم والساعة' : `${all.length} مهمة مطابقة`}</span></div>
      <div class="view-toggle">
        <button class="${state.taskView === 'board' ? 'active' : ''}" data-action="set-task-view" data-view="board"><i class="fi fi-rr-apps"></i> لوحات</button>
        <button class="${state.taskView === 'list' ? 'active' : ''}" data-action="set-task-view" data-view="list"><i class="fi fi-rr-list"></i> قائمة</button>
        <button class="${state.taskView === 'week' ? 'active' : ''}" data-action="set-task-view" data-view="week"><i class="fi fi-rr-calendar"></i> أسبوعي</button>
      </div>
    </div>
    ${state.taskView === 'week' ? weekView(employeeTasks, selectedDate) : state.taskView === 'board' ? boardHTML : listHTML}
  `);
}

/* ---------- مودال المهمة (إضافة/تعديل بنفس الفورم) ---------- */

async function openTaskModal(taskId) {
  await ensureRefs();
  const t = taskId ? state.tasks.find((x) => x.id === taskId) : null;
  if (taskId && !t) { toast('المهمة مو موجودة', true); return; }

  const v = t || {
    title: '', clientId: '', assigneeId: state.currentUser.id,
    priority: 'mid', status: 'today', deadline: '', notes: '',
  };

  openModal(`
    <h3>${t ? 'تعديل المهمة' : 'إضافة مهمة جديدة'}</h3>
    <div class="field">
      <label>اسم المهمة *</label>
      <input id="t-title" value="${esc(v.title)}" placeholder="مثال: تصميم بوست عرض العيد">
      <div class="err" id="err-t-title"></div>
    </div>
    <div class="field">
      <label>العميل</label>
      <select id="t-client">
        <option value="">— بدون عميل محدد —</option>
        ${state.clients.map((c) => `<option value="${esc(c.id)}" ${v.clientId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>الموظف المسؤول *</label>
      <select id="t-assignee">
        ${state.employees.map((e) => `<option value="${esc(e.id)}" ${v.assigneeId === e.id ? 'selected' : ''}>${esc(e.name)} — ${esc(e.roleLabel)}</option>`).join('')}
      </select>
      <div class="err" id="err-t-assignee"></div>
    </div>
    <div class="field">
      <label>الأولوية</label>
      <select id="t-priority">
        <option value="high" ${v.priority === 'high' ? 'selected' : ''}>عالية</option>
        <option value="mid" ${v.priority === 'mid' ? 'selected' : ''}>متوسطة</option>
        <option value="low" ${v.priority === 'low' ? 'selected' : ''}>منخفضة</option>
      </select>
    </div>
    <div class="field">
      <label>الموعد النهائي *</label>
      <input id="t-deadline" type="datetime-local" value="${v.deadline ? toDatetimeLocal(v.deadline) : ''}">
      <div class="err" id="err-t-deadline"></div>
    </div>
    <div class="field">
      <label>الحالة${t ? ' — تقدر تعدّلها حتى لو "مكتمل"' : ' الابتدائية'}</label>
      <select id="t-status">
        ${TASK_STATUSES.filter((st) => st !== 'done' || v.status === 'done').map((st) => `<option value="${st}" ${v.status === st ? 'selected' : ''}>${STATUS_LABEL[st]}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>ملاحظات</label>
      <input id="t-notes" value="${esc(v.notes)}" placeholder="أي تفاصيل إضافية عن المهمة">
    </div>
    <div class="err" id="err-t-submit"></div>
    <div class="modal-actions">
      <button class="btn ghost" data-action="close-modal">إلغاء</button>
      <button class="btn" data-action="submit-task" data-id="${esc(taskId || '')}">${t ? 'حفظ' : 'إضافة'}</button>
    </div>
  `);
}

async function submitTask(btn) {
  const taskId = btn.dataset.id;
  const title = document.getElementById('t-title').value.trim();
  const assigneeId = document.getElementById('t-assignee').value;
  const deadlineRaw = document.getElementById('t-deadline').value;

  let ok = true;
  ok = setErr('err-t-title', !title && 'لازم تدخل اسم المهمة') && ok;
  ok = setErr('err-t-assignee', !assigneeId && 'لازم تختار موظف مسؤول') && ok;
  ok = setErr('err-t-deadline', !deadlineRaw && 'لازم تدخل الموعد') && ok;
  if (!ok) return;

  const data = {
    title,
    clientId: document.getElementById('t-client').value || null,
    assigneeId,
    priority: document.getElementById('t-priority').value,
    status: document.getElementById('t-status').value,
    deadline: new Date(deadlineRaw).toISOString(),
    notes: document.getElementById('t-notes').value.trim(),
  };

  btn.disabled = true;
  try {
    if (taskId) await store.updateTask(taskId, data);
    else await store.createTask(data);
    closeModal();
    toast(taskId ? 'انحفظت المهمة' : 'تمت إضافة المهمة');
    renderNotifPanel();
    if (state.currentPage === 'tasks') renderTasks();
    else go(state.currentPage);
  } catch (err) {
    setErr('err-t-submit', store.humanError(err));
  } finally {
    btn.disabled = false;
  }
}

/* ---------- صفحة تفاصيل المهمة وإجراءاتها ---------- */

export function renderTaskDetailsView(t, activity = []) {
  const isAssignee = t.assigneeId === state.currentUser.id;
  const canAct = isAssignee || can('overview') || can('settings');
  const canDelete = can('settings') && state.currentUser.isAccessAccount !== true;
  const driveLink = validDriveLink(t.deliveryLink);
  const isDone = t.status === 'done';
  const statusActions = !canAct || isDone ? '' : `
    <div class="task-workflow-actions">
      ${t.status !== 'progress' ? `<button class="task-action start" data-action="task-status" data-id="${esc(t.id)}" data-status="progress"><i class="fi fi-rr-play"></i><span>بدء المهمة</span></button>` : ''}
      ${t.status === 'progress' ? `<button class="task-action pause" data-action="task-status" data-id="${esc(t.id)}" data-status="paused"><i class="fi fi-rr-pause"></i><span>إيقاف مؤقت</span></button>` : ''}
      <button class="task-action complete" data-action="open-task-complete" data-id="${esc(t.id)}"><i class="fi fi-rr-check-circle"></i><span>إنهاء المهمة</span></button>
    </div>`;

  const delivery = isDone ? `
    <article class="task-delivery-card ${esc(t.deliveryMethod || '')}">
      <span class="task-detail-icon"><i class="fi ${t.deliveryMethod === 'drive' ? 'fi-rr-folder-open' : 'fi-rr-comment-alt'}"></i></span>
      <div><small>طريقة التسليم</small><strong>${t.deliveryMethod === 'drive' ? 'Google Drive' : 'واتساب'}</strong>
      ${driveLink ? `<a href="${esc(driveLink)}" target="_blank" rel="noopener">فتح رابط Drive <i class="fi fi-rr-arrow-up-right-from-square"></i></a>` : ''}</div>
    </article>` : '';

  render(`
    <section class="task-detail-page">
      <button class="profile-back" data-action="task-back"><i class="fi fi-rr-arrow-right"></i> رجوع إلى المهام</button>
      <header class="task-detail-hero">
        <div class="task-detail-title">
          <span class="section-kicker">تفاصيل المهمة</span>
          <h1>${esc(t.title)}</h1>
          <p>${esc(clientName(t.clientId) || 'بدون عميل')} · ${esc(employeeName(t.assigneeId))}</p>
        </div>
        <div class="task-detail-badges"><span class="task-state ${esc(t.status)}">${esc(STATUS_LABEL[t.status] || t.status)}</span><span class="prio ${esc(t.priority)}">${esc(PRIO_LABEL[t.priority] || '')}</span></div>
      </header>

      <div class="task-detail-layout">
        <div class="task-detail-main">
          <div class="task-info-grid">
            <article><span class="task-detail-icon"><i class="fi fi-rr-user"></i></span><div><small>الموظف المسؤول</small><strong>${esc(employeeName(t.assigneeId))}</strong></div></article>
            <article><span class="task-detail-icon"><i class="fi fi-rr-calendar-clock"></i></span><div><small>الموعد النهائي</small><strong>${fmtDate(t.deadline)}</strong></div></article>
            <article><span class="task-detail-icon"><i class="fi fi-rr-building"></i></span><div><small>العميل</small><strong>${esc(clientName(t.clientId) || 'بدون عميل')}</strong></div></article>
            <article><span class="task-detail-icon"><i class="fi fi-rr-signal-alt-2"></i></span><div><small>الأولوية</small><strong>${esc(PRIO_LABEL[t.priority] || '—')}</strong></div></article>
          </div>
          <article class="task-notes-card"><div class="section-head compact"><div><span class="section-kicker">وصف العمل</span><h2>ملاحظات المهمة</h2></div></div><p>${esc(t.notes || 'بدون ملاحظات')}</p></article>
          ${delivery}
          <article class="task-history-card">
            <div class="section-head compact"><div><span class="section-kicker">سجل المهمة</span><h2>آخر الإجراءات</h2></div></div>
            <div class="task-history-list">${activity.length ? activity.slice(0, 10).map((item) => `<div class="task-history-row"><span><i class="fi fi-rr-time-past"></i></span><div><strong>${esc(activityLabel(item.action))}${activityDetail(item.detail) ? ` · ${esc(activityDetail(item.detail))}` : ''}</strong><small>${esc(employeeName(item.employeeId))} · ${fmtDate(item.createdAt)}</small></div></div>`).join('') : '<div class="task-empty">لا توجد إجراءات مسجلة بعد</div>'}</div>
          </article>
        </div>

        <aside class="task-detail-side">
          <article class="task-action-panel">
            <span class="section-kicker">إجراء المهمة</span>
            <h2>${isDone ? 'تم إنجاز المهمة' : 'ماذا تريد أن تفعل؟'}</h2>
            <p>${isDone ? 'تم حفظ طريقة التسليم وتاريخ الإنجاز.' : 'حدّث حالة المهمة ليعرف الفريق أين وصل العمل.'}</p>
            ${statusActions || (isDone ? `<div class="task-finished-mark"><i class="fi fi-rr-check"></i><span>مكتملة</span></div>` : '<div class="task-empty compact">الإجراءات متاحة للموظف المسؤول والإدارة.</div>')}
          </article>
          <article class="task-manage-panel">
            <button class="btn ghost" data-action="edit-task" data-id="${esc(t.id)}"><i class="fi fi-rr-pencil"></i> تعديل المهمة</button>
            ${canDelete ? `<button class="btn danger-outline" data-action="request-delete-task" data-id="${esc(t.id)}"><i class="fi fi-rr-trash"></i> حذف المهمة</button>` : ''}
          </article>
        </aside>
      </div>
    </section>
  `);
}

async function showTaskDetails(taskId) {
  if (state.currentPage !== 'tasks') taskReturnPage = state.currentPage;
  else if (!document.querySelector('.task-detail-page')) taskReturnPage = 'tasks';
  if (state.currentPage === 'home') store.stopPresenceListener();
  loading('جاري تحميل تفاصيل المهمة...');
  try {
    if (!state.tasks.some((task) => task.id === taskId)) await store.loadTasks();
    await ensureRefs();
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) { errorState('المهمة غير موجودة', 'ربما تم حذفها أو لم تعد متاحة.'); return; }
    const activity = await store.loadTaskActivity(taskId).catch(() => []);
    state.currentPage = 'tasks';
    document.querySelectorAll('.nav-item[data-page]').forEach((el) => el.classList.toggle('active', el.dataset.page === 'tasks'));
    renderTaskDetailsView(task, activity);
  } catch (err) {
    errorState('تعذر تحميل تفاصيل المهمة', store.humanError(err));
  }
}

function backFromTaskDetails() {
  const target = state.currentUser.permissions.includes(taskReturnPage) ? taskReturnPage : 'tasks';
  go(target);
}

async function changeTaskStatus(btn) {
  btn.disabled = true;
  try {
    await store.setTaskStatus(btn.dataset.id, btn.dataset.status);
    toast(btn.dataset.status === 'paused' ? 'تم إيقاف المهمة مؤقتاً' : 'بدأ تنفيذ المهمة');
    renderNotifPanel();
    await showTaskDetails(btn.dataset.id);
  } catch (err) {
    toast(store.humanError(err), true);
  } finally {
    btn.disabled = false;
  }
}

function openTaskCompletion(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) { toast('المهمة غير موجودة', true); return; }
  openModal(`
    <div class="modal-title-icon"><i class="fi fi-rr-paper-plane"></i></div>
    <h3>إنهاء المهمة وتسليمها</h3>
    <p class="modal-hint">اختر كيف تم تسليم العمل. عند اختيار Drive يجب إضافة رابط الملف.</p>
    <div class="field"><label>طريقة التسليم *</label><select id="task-delivery-method" data-action="toggle-task-delivery"><option value="">اختر طريقة التسليم</option><option value="whatsapp">واتساب</option><option value="drive">Google Drive</option></select><div class="err" id="err-task-delivery"></div></div>
    <div class="field task-drive-field" id="task-drive-field" hidden><label>رابط Google Drive *</label><input id="task-drive-link" type="url" dir="ltr" placeholder="https://drive.google.com/..."><small>يمكن استخدام رابط Drive أو Google Docs.</small><div class="err" id="err-task-drive"></div></div>
    <div class="err" id="err-task-complete"></div>
    <div class="modal-actions"><button class="btn ghost" data-action="close-modal">إلغاء</button><button class="btn" data-action="confirm-task-complete" data-id="${esc(taskId)}">إنهاء وتسليم</button></div>
  `);
}

function toggleTaskDelivery(select) {
  const field = document.getElementById('task-drive-field');
  if (field) field.hidden = select.value !== 'drive';
}

async function submitTaskCompletion(btn) {
  const method = document.getElementById('task-delivery-method')?.value || '';
  const rawLink = document.getElementById('task-drive-link')?.value || '';
  const link = method === 'drive' ? validDriveLink(rawLink) : '';
  let ok = true;
  ok = setErr('err-task-delivery', !method && 'اختر طريقة التسليم') && ok;
  ok = setErr('err-task-drive', method === 'drive' && !link && 'أدخل رابط Google Drive صحيحاً يبدأ بـ https://') && ok;
  if (!ok) return;
  btn.disabled = true;
  try {
    await store.completeTask(btn.dataset.id, method, link);
    closeModal();
    toast('تم إنهاء المهمة وحفظ طريقة التسليم');
    renderNotifPanel();
    await showTaskDetails(btn.dataset.id);
  } catch (err) {
    setErr('err-task-complete', store.humanError(err));
  } finally {
    btn.disabled = false;
  }
}

function requestDeleteTask(taskId) {
  if (!can('settings') || state.currentUser.isAccessAccount === true) { toast('حذف المهمة متاح للإدارة فقط', true); return; }
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) { toast('المهمة غير موجودة', true); return; }
  openModal(`<div class="modal-title-icon danger"><i class="fi fi-rr-trash"></i></div><h3>حذف المهمة</h3><p class="modal-hint">سيتم حذف مهمة «${esc(task.title)}» نهائياً، مع الاحتفاظ بسجل الإجراءات الإداري.</p><div class="modal-actions"><button class="btn ghost" data-action="close-modal">إلغاء</button><button class="btn danger" data-action="confirm-delete-task" data-id="${esc(taskId)}">تأكيد الحذف</button></div>`);
}

async function confirmDeleteTask(btn) {
  btn.disabled = true;
  try {
    await store.deleteTask(btn.dataset.id);
    closeModal();
    toast('تم حذف المهمة');
    renderNotifPanel();
    const target = state.currentUser.permissions.includes(taskReturnPage) ? taskReturnPage : 'tasks';
    go(target);
  } catch (err) {
    toast(store.humanError(err), true);
    btn.disabled = false;
  }
}

/* ---------- لوحة الموظف ---------- */

export async function showMyDashboard() {
  loading('عم نجيب مهامك...');
  try {
    await store.loadTasks();
    await ensureRefs();
  } catch (err) {
    errorState('تعذر تحميل مهامك', store.humanError(err));
    return;
  }

  const mine = state.tasks.filter((t) => t.assigneeId === state.currentUser.id);
  const byStatus = (st) => mine.filter((t) => t.status === st);
  const today = byStatus('today');
  const progress = byStatus('progress');
  const paused = byStatus('paused');
  const review = byStatus('review');
  const revision = byStatus('revision');
  const isToday = (t) => {
    const d = new Date(t.updatedAt || 0);
    return d.toDateString() === new Date().toDateString();
  };
  const doneToday = mine.filter((t) => t.status === 'done' && isToday(t));

  const col = (title, list, showCheck) => `
    <div class="task-col">
      <h4>${title} <b>${list.length}</b></h4>
      ${list.length === 0 ? '<div class="task-empty">ولا مهمة</div>' : list.map((t) => `
        <div class="task-item task-open-card" data-action="view-task" data-id="${esc(t.id)}" role="button" tabindex="0">
          <div class="t-title">${esc(t.title)}</div>
          <div class="t-meta">
            <span>${esc(clientName(t.clientId)) || 'بدون عميل'} · ${fmtDate(t.deadline)}</span>
            <span class="prio ${esc(t.priority)}">${PRIO_LABEL[t.priority] || ''}</span>
          </div>
          ${t.notes ? `<div class="t-notes">📝 ${esc(t.notes)}</div>` : ''}
          <div style="margin-top:8px; display:flex; justify-content:space-between;">
            <button class="icon-btn" data-action="edit-task" data-id="${esc(t.id)}">تعديل</button>
            ${showCheck ? `<button class="done-check" data-action="mark-done" data-id="${esc(t.id)}">✓ إنجاز</button>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  render(`
    <div class="topbar">
      <div>
        <div class="page-title">أهلاً ${esc((state.currentUser.name || '').split(' ')[0])} 👋</div>
        <div class="page-sub">${esc(state.currentUser.role)} — هاد ملخص شغلك اليوم</div>
      </div>
      <button class="btn" data-action="add-task">+ إضافة مهمة</button>
    </div>

    <div class="kpi-row">
      <div class="kpi"><div class="kpi-label">مهام اليوم</div><div class="kpi-value mono">${today.length}</div><div class="kpi-delta">لسا ما بلشت فيها</div></div>
      <div class="kpi"><div class="kpi-label">قيد التنفيذ</div><div class="kpi-value mono">${progress.length}</div><div class="kpi-delta">شغال عليها هلق</div></div>
      <div class="kpi"><div class="kpi-label">بانتظار مراجعة/تعديل</div><div class="kpi-value mono">${review.length + revision.length}</div><div class="kpi-delta">مو بإيدك هلق</div></div>
      <div class="kpi"><div class="kpi-label">أنجزتها اليوم</div><div class="kpi-value mono" style="color:var(--ok)">${doneToday.length}</div><div class="kpi-delta">👏 مبروك</div></div>
    </div>

    <div class="task-cols">
      ${col('مهام اليوم', today, true)}
      ${col('قيد التنفيذ', progress, true)}
      ${col('متوقفة مؤقتاً', paused, true)}
      ${col('بانتظار المراجعة', review, false)}
      ${col('تعديلات مطلوبة', revision, true)}
    </div>

    <div class="report-card">
      <h4>أنجزتها اليوم (${doneToday.length})</h4>
      ${doneToday.length === 0 ? '<div class="task-empty">لسا ما خلصت شي اليوم</div>' : doneToday.map((t) => `
        <div class="rank-row best task-open-row" data-action="view-task" data-id="${esc(t.id)}">
          <span class="rank-title">${esc(t.title)} <span style="color:var(--text-dim); font-size:11px;">— ${esc(clientName(t.clientId))}</span></span>
          <span style="display:flex; align-items:center; gap:10px;">
            <button class="icon-btn" data-action="edit-task" data-id="${esc(t.id)}">تعديل</button>
            <span class="rank-value" style="color:var(--ok)">✓</span>
          </span>
        </div>
      `).join('')}
    </div>

    <div class="disclaimer"><b>ملاحظة:</b> كل مهمة هون محفوظة على Firebase ومرئية للفريق كله ولمديرك — ما بتضيع لما تسكر الصفحة.</div>
  `);
}

/* ---------- التقويم ---------- */

let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calendarSelectedKey = localDateKey();
let calendarEntries = [];
let calendarManager = false;

function parsedCalendarDate(value) {
  const exact = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (exact) return new Date(Number(exact[1]), Number(exact[2]) - 1, Number(exact[3]), 12);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function renderCalendarWorkspace() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthEntries = calendarEntries.filter((entry) => entry.date.getFullYear() === year && entry.date.getMonth() === month);
  const entriesByDay = new Map();
  monthEntries.forEach((entry) => {
    const key = localDateKey(entry.date);
    if (!entriesByDay.has(key)) entriesByDay.set(key, []);
    entriesByDay.get(key).push(entry);
  });

  if (!calendarSelectedKey.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)) {
    calendarSelectedKey = localDateKey(new Date(year, month, 1, 12));
  }

  const selectedDate = dateFromKey(calendarSelectedKey);
  const selectedEntries = entriesByDay.get(calendarSelectedKey) || [];
  const taskCount = monthEntries.filter((entry) => entry.kind === 'task').length;
  const contentCount = monthEntries.length - taskCount;
  const activeDays = entriesByDay.size;
  const todayKey = localDateKey();
  const weekdays = Array.from({ length: 7 }, (_, index) => new Date(2026, 1, 1 + index)
    .toLocaleDateString(getLocale(), { weekday: 'short' }));
  const cells = Array.from({ length: firstDay }, () => '<span class="calendar-day-spacer"></span>');

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = localDateKey(new Date(year, month, day, 12));
    const count = entriesByDay.get(key)?.length || 0;
    cells.push(`<button class="calendar-day-circle ${key === calendarSelectedKey ? 'active' : ''} ${key === todayKey ? 'today' : ''} ${count ? 'has-events' : ''}" data-action="calendar-select-date" data-date="${key}"><span>${day}</span>${count ? `<i>${count}</i>` : ''}</button>`);
  }

  render(`
    <section class="calendar-workspace-page">
      <header class="calendar-workspace-hero">
        <div><span class="section-kicker"><i class="fi fi-rr-calendar"></i> مساحة الجدول</span><h1>${calendarManager ? 'تقويم الفريق' : 'تقويمي'}</h1><p>${calendarManager ? 'كل المهام ومواعيد المحتوى ضمن عرض شهري واحد.' : 'مهامك ومواعيدك ضمن عرض شهري واضح.'}</p></div>
        <div class="calendar-hero-stats">
          <article><span>${monthEntries.length}</span><small>كل المواعيد</small></article>
          <article><span>${taskCount}</span><small>مهام</small></article>
          <article><span>${contentCount}</span><small>محتوى</small></article>
          <article><span>${activeDays}</span><small>أيام نشطة</small></article>
        </div>
      </header>

      <div class="calendar-workspace-grid">
        <article class="calendar-month-panel">
          <div class="calendar-month-head">
            <div><span class="section-kicker">الجدول الشهري</span><h2>${calendarCursor.toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' })}</h2></div>
            <div class="calendar-round-actions">
              <button data-action="calendar-next" aria-label="الشهر التالي"><i class="fi fi-rr-angle-right"></i></button>
              <button class="today" data-action="calendar-today">اليوم</button>
              <button data-action="calendar-prev" aria-label="الشهر السابق"><i class="fi fi-rr-angle-left"></i></button>
            </div>
          </div>
          <div class="calendar-week-circles">${weekdays.map((day) => `<span>${esc(day)}</span>`).join('')}</div>
          <div class="calendar-circle-grid">${cells.join('')}</div>
          <div class="calendar-legend"><span><i class="selected"></i> اليوم المختار</span><span><i class="event"></i> يوجد مهام</span><span><i class="current"></i> اليوم</span></div>
        </article>

        <aside class="calendar-day-agenda">
          <div class="calendar-selected-date"><span>${selectedDate.getDate()}</span><div><small>${selectedDate.toLocaleDateString(getLocale(), { weekday: 'long' })}</small><strong>${selectedDate.toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' })}</strong></div><b>${selectedEntries.length}</b></div>
          <div class="calendar-agenda-head"><div><span class="section-kicker">جدول اليوم</span><h2>المواعيد والمهام</h2></div><button class="calendar-add-circle" data-action="add-task" aria-label="إضافة مهمة"><i class="fi fi-rr-plus"></i></button></div>
          <div class="calendar-agenda-list">
            ${selectedEntries.length ? selectedEntries.map((entry) => `
              <button class="calendar-agenda-item ${entry.kind}" ${entry.taskId ? `data-action="view-task" data-id="${esc(entry.taskId)}"` : ''}>
                <span><i class="fi ${entry.kind === 'task' ? 'fi-rr-list-check' : 'fi-rr-play-alt'}"></i></span>
                <div><strong>${esc(entry.label)}</strong><small>${esc(entry.meta || 'بدون تفاصيل')}</small></div>
                <i class="fi fi-rr-arrow-small-left"></i>
              </button>`).join('') : `<div class="calendar-agenda-empty"><span><i class="fi fi-rr-calendar-check"></i></span><strong>هذا اليوم فارغ</strong><small>لا توجد مهام أو مواعيد مسجلة.</small></div>`}
          </div>
        </aside>
      </div>
    </section>
  `);
}

export async function showCalendarPage() {
  loading('عم نجيب التقويم...');
  try {
    await Promise.all([store.loadTasks(), store.loadClients(), store.loadAllContent()]);
    await ensureRefs();
  } catch (err) {
    errorState('تعذر تحميل التقويم', store.humanError(err));
    return;
  }

  calendarManager = can('tasks') && can('overview');
  calendarEntries = [];

  Object.entries(state.content).forEach(([cid, items]) => {
    items.forEach((it) => {
      const date = parsedCalendarDate(it.date);
      if (date) calendarEntries.push({ date, kind: 'content', label: `${TYPE_LABEL[it.type] || it.type}: ${it.title}`, meta: clientName(cid) });
    });
  });

  const relevant = calendarManager ? state.tasks : state.tasks.filter((t) => t.assigneeId === state.currentUser.id);
  relevant.forEach((task) => {
    const date = parsedCalendarDate(task.deadline);
    if (date) calendarEntries.push({ date, kind: 'task', taskId: task.id, label: task.title, meta: calendarManager ? `${clientName(task.clientId) || 'بدون عميل'} · ${employeeName(task.assigneeId)}` : clientName(task.clientId) || 'بدون عميل' });
  });

  renderCalendarWorkspace();
}

/* ---------- الأفعال ---------- */

export const actions = {
  'add-task': () => openTaskModal(null),
  'edit-task': (el) => openTaskModal(el.dataset.id),
  'submit-task': (el) => submitTask(el),
  'view-task': (el) => showTaskDetails(el.dataset.id),
  'task-back': () => backFromTaskDetails(),
  'task-status': (el) => changeTaskStatus(el),
  'open-task-complete': (el) => openTaskCompletion(el.dataset.id),
  'mark-done': (el) => openTaskCompletion(el.dataset.id),
  'toggle-task-delivery': (el) => toggleTaskDelivery(el),
  'confirm-task-complete': (el) => submitTaskCompletion(el),
  'request-delete-task': (el) => requestDeleteTask(el.dataset.id),
  'confirm-delete-task': (el) => confirmDeleteTask(el),
  'set-task-view': (el) => { state.taskView = el.dataset.view; renderTasks(); },
  'week-shift': (el) => {
    const base = state.taskFilterDate && state.taskFilterDate !== 'all' ? state.taskFilterDate : localDateKey();
    state.taskFilterDate = shiftedDateKey(base, Number(el.dataset.step));
    renderTasks();
  },
  'week-today': () => { state.taskFilterDate = localDateKey(); renderTasks(); },
  'filter-task-emp': (el) => { state.taskFilterEmp = el.value; renderTasks(); },
  'set-task-date': (el) => { state.taskFilterDate = el.dataset.date; renderTasks(); },
  'filter-task-date': (el) => { if (el.value) { state.taskFilterDate = el.value; renderTasks(); } },
  'show-all-task-dates': () => { state.taskFilterDate = 'all'; renderTasks(); },
  'calendar-prev': () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1); renderCalendarWorkspace(); },
  'calendar-next': () => { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1); renderCalendarWorkspace(); },
  'calendar-today': () => { const now = new Date(); calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1); calendarSelectedKey = localDateKey(now); renderCalendarWorkspace(); },
  'calendar-select-date': (el) => { calendarSelectedKey = el.dataset.date; renderCalendarWorkspace(); },
};
