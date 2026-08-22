// ============ الفريق — عرض الموظفين، إضافة، تعديل، إيقاف ============
import { state, esc, usernameProblem } from '../state.js';
import { render, openModal, closeModal, loading, errorState, toast } from '../ui.js';
import * as store from '../store.js';

function setErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return !msg;
  if (msg) { el.textContent = msg; el.style.display = 'block'; return false; }
  el.style.display = 'none';
  return true;
}

export async function showTeam() {
  loading('عم نجيب الفريق...');
  try {
    await store.loadRoles();
    await store.loadEmployees();
    await store.loadTasks();
  } catch (err) {
    errorState('تعذر تحميل الفريق', store.humanError(err));
    return;
  }

  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const countFor = (empId, fn) => state.tasks.filter((t) => t.assigneeId === empId && fn(t)).length;
  const tasksToday = (empId) => countFor(empId, (t) => t.status !== 'done');
  const doneToday = (empId) => countFor(empId, (t) => t.status === 'done' && (t.updatedAt || 0) >= startOfToday);

  render(`
    <div class="topbar">
      <div><div class="page-title">الفريق</div><div class="page-sub">${state.employees.length} موظفين</div></div>
      <button class="btn" data-action="add-employee">+ إضافة موظف</button>
    </div>
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
  return new Date(ts).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' });
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
        <div class="profile-task-list">${open.length ? open.slice(0, 8).map((t) => `<article class="profile-task"><span class="prio-dot ${esc(t.priority)}"></span><div><strong>${esc(t.title)}</strong><p>${esc(t.notes || 'بدون ملاحظات')}</p><small>${formatDate(t.deadline)}</small></div><span class="badge">${esc(t.status === 'today' ? 'اليوم' : t.status === 'progress' ? 'قيد التنفيذ' : t.status === 'review' ? 'مراجعة' : 'تعديل')}</span></article>`).join('') : `<div class="soft-empty"><i class="fi fi-rr-check-circle"></i><strong>لا توجد مهام مفتوحة</strong><span>كل المهام منجزة حالياً.</span></div>`}</div>
      </div>
      <aside class="profile-side">
        <div class="profile-info-card"><div class="section-head compact"><div><span class="section-kicker">اليوم</span><h2>الحضور</h2></div><i class="fi fi-rr-fingerprint card-head-icon"></i></div><div class="attendance-times"><div><small>دخول</small><strong>${attendance.checkIn ? new Date(attendance.checkIn).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '—'}</strong></div><div><small>خروج</small><strong>${attendance.checkOut ? new Date(attendance.checkOut).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '—'}</strong></div></div></div>
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
  'open-my-profile': () => showEmployeeProfile(state.currentUser.id),
  'open-employee-profile': (el) => showEmployeeProfile(el.dataset.id),
  'back-to-team': () => showTeam(),
  'add-employee': () => openAddEmployeeModal(),
  'submit-employee': (el) => submitAddEmployee(el),
  'edit-employee': (el) => openEditEmployeeModal(el.dataset.id),
  'save-employee': (el) => saveEmployee(el),
  'deactivate-employee': (el) => deactivateEmployee(el.dataset.id),
};
