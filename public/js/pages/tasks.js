// ============ المهام + لوحة الموظف + التقويم ============
import {
  state, esc, PRIO_LABEL, STATUS_LABEL, TASK_STATUSES, TYPE_LABEL,
  employeeName, clientName, can,
} from '../state.js';
import { render, openModal, closeModal, loading, errorState, toast, renderNotifPanel } from '../ui.js';
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
  renderTasks();
}

function renderTasks() {
  let all = state.tasks;
  if (state.taskFilterEmp !== 'all') all = all.filter((t) => t.assigneeId === state.taskFilterEmp);

  const boardHTML = `
    <div class="board-cols">
      ${TASK_STATUSES.map((st) => {
        const col = all.filter((t) => t.status === st);
        return `
        <div class="board-col">
          <h4>${STATUS_LABEL[st]} (${col.length})</h4>
          ${col.map((t) => `
            <div class="board-card">
              <div class="t-title">${esc(t.title)}</div>
              <div class="t-meta">${esc(clientName(t.clientId)) || 'بدون عميل'} · ${esc(employeeName(t.assigneeId))}<br>${fmtDate(t.deadline)}</div>
              ${t.notes ? `<div class="t-notes">📝 ${esc(t.notes)}</div>` : ''}
              <div style="margin-top:7px; text-align:left;"><button class="icon-btn" data-action="edit-task" data-id="${esc(t.id)}">تعديل</button></div>
            </div>
          `).join('') || '<div class="task-empty">فاضي</div>'}
        </div>`;
      }).join('')}
    </div>
  `;

  const listHTML = all.length === 0
    ? '<div class="empty-state"><div class="empty-title">ما في مهام</div></div>'
    : `
    <table class="content-table">
      <thead><tr><th>المهمة</th><th>العميل</th><th>الموظف المسؤول</th><th>الأولوية</th><th>الموعد</th><th>الحالة</th><th>ملاحظات</th><th></th></tr></thead>
      <tbody>${all.map((t) => `<tr>
        <td>${esc(t.title)}</td>
        <td>${esc(clientName(t.clientId)) || '—'}</td>
        <td>${esc(employeeName(t.assigneeId))}</td>
        <td><span class="prio ${esc(t.priority)}">${PRIO_LABEL[t.priority] || ''}</span></td>
        <td class="mono" style="font-size:12px">${fmtDate(t.deadline)}</td>
        <td>${STATUS_LABEL[t.status] || ''}</td>
        <td style="font-size:12px; color:var(--text-dim)">${esc(t.notes) || '—'}</td>
        <td><button class="icon-btn" data-action="edit-task" data-id="${esc(t.id)}">تعديل</button></td>
      </tr>`).join('')}</tbody>
    </table>
  `;

  render(`
    <div class="topbar">
      <div><div class="page-title">المهام</div><div class="page-sub">كل مهام الوكالة عبر الفريق والعملاء — محفوظة على Firebase</div></div>
      <button class="btn" data-action="add-task">+ إضافة مهمة</button>
    </div>
    <div class="toolbar">
      <select class="filter-select" data-action="filter-task-emp">
        <option value="all">كل الموظفين</option>
        ${state.employees.map((e) => `<option value="${esc(e.id)}" ${state.taskFilterEmp === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}
      </select>
    </div>
    <div class="view-toggle">
      <button class="${state.taskView === 'board' ? 'active' : ''}" data-action="set-task-view" data-view="board">Board</button>
      <button class="${state.taskView === 'list' ? 'active' : ''}" data-action="set-task-view" data-view="list">List</button>
    </div>
    ${state.taskView === 'board' ? boardHTML : listHTML}
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
        ${TASK_STATUSES.map((st) => `<option value="${st}" ${v.status === st ? 'selected' : ''}>${STATUS_LABEL[st]}</option>`).join('')}
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
    if (state.currentPage === 'my-dashboard') showMyDashboard();
    else renderTasks();
  } catch (err) {
    setErr('err-t-submit', store.humanError(err));
  } finally {
    btn.disabled = false;
  }
}

async function markDone(taskId) {
  try {
    await store.setTaskStatus(taskId, 'done');
    toast('تم ✓');
    renderNotifPanel();
    if (state.currentPage === 'my-dashboard') showMyDashboard();
    else renderTasks();
  } catch (err) { toast(store.humanError(err), true); }
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
        <div class="task-item">
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
      ${col('بانتظار المراجعة', review, false)}
      ${col('تعديلات مطلوبة', revision, true)}
    </div>

    <div class="report-card">
      <h4>أنجزتها اليوم (${doneToday.length})</h4>
      ${doneToday.length === 0 ? '<div class="task-empty">لسا ما خلصت شي اليوم</div>' : doneToday.map((t) => `
        <div class="rank-row best">
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

export async function showCalendarPage() {
  loading('عم نجيب التقويم...');
  try {
    await Promise.all([store.loadTasks(), store.loadClients(), store.loadAllContent()]);
    await ensureRefs();
  } catch (err) {
    errorState('تعذر تحميل التقويم', store.humanError(err));
    return;
  }

  const isManager = can('tasks') && can('overview');
  const entries = [];

  Object.entries(state.content).forEach(([cid, items]) => {
    items.forEach((it) => entries.push({
      date: it.date,
      label: `${TYPE_LABEL[it.type] || it.type}: ${it.title}`,
      meta: clientName(cid),
    }));
  });

  const relevant = isManager ? state.tasks : state.tasks.filter((t) => t.assigneeId === state.currentUser.id);
  relevant.forEach((t) => entries.push({
    date: new Date(t.deadline).toLocaleDateString(getLocale()),
    label: `مهمة: ${t.title}`,
    meta: isManager ? `${clientName(t.clientId)} · ${employeeName(t.assigneeId)}` : clientName(t.clientId),
  }));

  const groups = {};
  entries.forEach((e) => { (groups[e.date] = groups[e.date] || []).push(e); });
  const dates = Object.keys(groups);

  render(`
    <div class="topbar"><div>
      <div class="page-title">${isManager ? 'التقويم' : 'تقويمي'}</div>
      <div class="page-sub">${isManager ? 'كل مواعيد المحتوى والمهام عبر العملاء' : 'مواعيدك ومهامك القادمة'}</div>
    </div></div>
    ${dates.length === 0 ? '<div class="empty-state"><div class="empty-title">ما في مواعيد مسجلة بعد</div></div>' : dates.map((d) => `
      <div class="cal-group">
        <div class="cal-date">${esc(d)}</div>
        ${groups[d].map((e) => `<div class="cal-row"><span>${esc(e.label)}</span><span class="cal-meta">${esc(e.meta)}</span></div>`).join('')}
      </div>
    `).join('')}
  `);
}

/* ---------- الأفعال ---------- */

export const actions = {
  'add-task': () => openTaskModal(null),
  'edit-task': (el) => openTaskModal(el.dataset.id),
  'submit-task': (el) => submitTask(el),
  'mark-done': (el) => markDone(el.dataset.id),
  'set-task-view': (el) => { state.taskView = el.dataset.view; renderTasks(); },
  'filter-task-emp': (el) => { state.taskFilterEmp = el.value; renderTasks(); },
};
