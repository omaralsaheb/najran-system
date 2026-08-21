// ============ الفريق — عرض الموظفين، إضافة، تعديل، إيقاف ============
import { state, esc } from '../state.js';
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
              </div>
            </div>
            <button class="icon-btn" data-action="edit-employee" data-id="${esc(e.id)}">تعديل</button>
          </div>
          <div class="client-stats">
            <div><div class="cstat-v">${tasksToday(e.id)}</div><div class="cstat-l">مهام مفتوحة</div></div>
            <div><div class="cstat-v" style="color:var(--ok)">${doneToday(e.id)}</div><div class="cstat-l">أنجزها اليوم</div></div>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="disclaimer"><b>ملاحظة:</b> إضافة موظف بتنشئ حساب دخول حقيقي على Firebase Authentication — الموظف بيقدر يسجّل دخول فوراً بالبريد وكلمة السر يلي بتعطيه ياهم.</div>
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
      <label>البريد الإلكتروني *</label>
      <input id="e-email" type="email" placeholder="khaled@najranagency.com"><div class="err" id="err-e-email"></div>
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
  const email = document.getElementById('e-email').value.trim();
  const password = document.getElementById('e-password').value;
  const roleKey = document.getElementById('e-role').value;

  let ok = true;
  ok = setErr('err-e-name', !name && 'لازم تدخل الاسم') && ok;
  ok = setErr('err-e-email', !email.includes('@') && 'لازم بريد إلكتروني صحيح') && ok;
  ok = setErr('err-e-password', password.length < 6 && 'كلمة السر 6 أحرف عالأقل') && ok;
  if (!ok) return;

  btn.disabled = true;
  btn.textContent = 'عم ننشئ الحساب...';
  try {
    await store.createEmployee({ name, email, password, roleKey });
    closeModal();
    toast('تمت إضافة الموظف — يقدر يسجّل دخول هلق');
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
      <label>البريد الإلكتروني</label>
      <input value="${esc(emp.email)}" disabled style="opacity:.6">
      <small style="color:var(--text-dim); font-size:11px;">البريد ما بينعدّل من هون — الموظف بيغيّره من حسابه على Firebase</small>
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
  'add-employee': () => openAddEmployeeModal(),
  'submit-employee': (el) => submitAddEmployee(el),
  'edit-employee': (el) => openEditEmployeeModal(el.dataset.id),
  'save-employee': (el) => saveEmployee(el),
  'deactivate-employee': (el) => deactivateEmployee(el.dataset.id),
};
