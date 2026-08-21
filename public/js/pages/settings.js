// ============ الإعدادات — الصلاحيات، المسميات الوظيفية، ربط ميتا ============
import { state, esc, NAV_LABELS, ALL_MODULE_KEYS } from '../state.js';
import { render, openModal, closeModal, loading, errorState, toast } from '../ui.js';
import * as store from '../store.js';

function setErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return !msg;
  if (msg) { el.textContent = msg; el.style.display = 'block'; return false; }
  el.style.display = 'none';
  return true;
}

export async function showSettings() {
  loading('عم نجيب الإعدادات...');
  try {
    await store.loadRoles();
    if (state.clients.length === 0) await store.loadClients().catch(() => {});
  } catch (err) {
    errorState('تعذر تحميل الأدوار', store.humanError(err));
    return;
  }

  const permissionsBody = `
    <div style="overflow-x:auto;">
      <table class="perm-table">
        <thead><tr><th>المسمى الوظيفي</th>${ALL_MODULE_KEYS.map((k) => `<th>${esc(NAV_LABELS[k] || k)}</th>`).join('')}</tr></thead>
        <tbody>
          ${state.roles.map((r) => `<tr>
            <td>${esc(r.label)}</td>
            ${ALL_MODULE_KEYS.map((k) => `<td>${r.permissions.includes(k) ? '<span class="yes">✓</span>' : '<span class="no">—</span>'}</td>`).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:14px; display:flex; justify-content:flex-end;"><button class="btn ghost" data-action="edit-perms">تعديل صلاحيات مسمى</button></div>
    <div class="disclaimer"><b>ملاحظة:</b> هاد الجدول بيجيب صلاحيات كل مسمى وظيفي مباشرة من Firebase — أي تعديل بيظهر لكل الفريق فوراً بعد ما يعيدوا تسجيل الدخول.</div>
  `;

  const rolesBody = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:14px;"><button class="btn" data-action="add-role">+ إضافة مسمى وظيفي جديد</button></div>
    <table class="content-table">
      <thead><tr><th>المسمى</th><th>الصلاحيات</th></tr></thead>
      <tbody>${state.roles.map((r) => `<tr>
        <td>${esc(r.label)}</td>
        <td style="font-size:12px; color:var(--text-dim)">${r.permissions.map((p) => esc(NAV_LABELS[p] || p)).join('، ') || '—'}</td>
      </tr>`).join('')}</tbody>
    </table>
    <div class="disclaimer"><b>ملاحظة:</b> إنت (المدير) بس يلي بتقدر تنشئ مسميات وظيفية جديدة وتحدد صلاحيات كل وحدة منها — القاعدة نفسها بترفض أي محاولة من حساب تاني.</div>
  `;

  const metaBody = state.clients.length === 0 ? `
    <div class="empty-state"><div class="empty-title">ضيف عملاء الأول</div><div class="empty-sub">لازم يكون عندك عملاء قبل ما تربط حساباتهم بميتا</div></div>
  ` : `
    <table class="content-table">
      <thead><tr><th>العميل</th><th>اسم الصفحة على ميتا</th><th>حالة الربط</th><th></th></tr></thead>
      <tbody>
        ${state.clients.map((c) => `<tr>
          <td>${esc(c.name)}</td>
          <td class="mono" style="font-size:12px">${esc(c.meta?.pageName) || '—'}</td>
          <td>${c.meta?.connected ? '<span class="yes">✓ مربوط</span>' : '<span class="no">غير مربوط</span>'}</td>
          <td><button class="icon-btn" data-action="open-meta" data-id="${esc(c.id)}">${c.meta?.connected ? 'تعديل' : 'ربط الحساب'}</button></td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="disclaimer"><b>ملاحظة:</b> هاد الفورم بيحفظ بيانات الربط بس — ما بيسحب أرقام من Meta فعلياً، لأن هاد بده موافقة App Review وربط رسمي من كل عميل (Facebook Business Login).</div>
  `;

  render(`
    <div class="topbar"><div><div class="page-title">الإعدادات</div><div class="page-sub">المسميات الوظيفية، الصلاحيات، وربط حسابات ميتا</div></div></div>
    <div class="tabs">
      <div class="tab ${state.settingsTab === 'permissions' ? 'active' : ''}" data-action="set-settings-tab" data-tab="permissions">مصفوفة الصلاحيات</div>
      <div class="tab ${state.settingsTab === 'roles' ? 'active' : ''}" data-action="set-settings-tab" data-tab="roles">المسميات الوظيفية</div>
      <div class="tab ${state.settingsTab === 'meta' ? 'active' : ''}" data-action="set-settings-tab" data-tab="meta">ربط حسابات ميتا</div>
    </div>
    ${state.settingsTab === 'permissions' ? permissionsBody : state.settingsTab === 'roles' ? rolesBody : metaBody}
  `);
}

/* ---------- مسمى وظيفي جديد ---------- */

function permCheckboxes(selected = []) {
  return ALL_MODULE_KEYS.map((k) => `
    <label style="display:flex; align-items:center; gap:8px; font-size:13px; margin-bottom:8px; font-weight:400;">
      <input type="checkbox" class="r-perm" value="${k}" style="width:auto;" ${selected.includes(k) ? 'checked' : ''}> ${esc(NAV_LABELS[k] || k)}
    </label>
  `).join('');
}

function openAddRoleModal() {
  openModal(`
    <h3>إضافة مسمى وظيفي جديد</h3>
    <div class="field">
      <label>اسم المسمى (يلي بيظهر بالنظام) *</label>
      <input id="r-label" placeholder="مثال: مسؤولة سوشال ميديا"><div class="err" id="err-r-label"></div>
    </div>
    <div class="field">
      <label>الصلاحيات — اختار الصفحات يلي بيشوفها هاد المسمى</label>
      ${permCheckboxes()}
    </div>
    <div class="err" id="err-r-submit"></div>
    <div class="modal-actions">
      <button class="btn ghost" data-action="close-modal">إلغاء</button>
      <button class="btn" data-action="submit-role">إضافة</button>
    </div>
  `);
}

async function submitAddRole(btn) {
  const label = document.getElementById('r-label').value.trim();
  const permissions = [...document.querySelectorAll('.r-perm:checked')].map((el) => el.value);
  if (!setErr('err-r-label', !label && 'لازم تدخل اسم المسمى')) return;

  // مفتاح لاتيني ثابت — أسماء العقد بـFirebase ما بتقبل رموز معينة
  const key = `role_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  btn.disabled = true;
  try {
    await store.createRole(key, label, permissions);
    closeModal();
    toast('انضاف المسمى الوظيفي');
    showSettings();
  } catch (err) {
    setErr('err-r-submit', store.humanError(err));
  } finally { btn.disabled = false; }
}

/* ---------- تعديل صلاحيات مسمى موجود ---------- */

function openEditPermsModal() {
  openModal(`
    <h3>تعديل صلاحيات مسمى</h3>
    <div class="field">
      <label>اختار المسمى</label>
      <select id="p-role" data-action="perm-role-changed">
        ${state.roles.map((r) => `<option value="${esc(r.key)}">${esc(r.label)}</option>`).join('')}
      </select>
    </div>
    <div class="field" id="p-boxes">
      <label>الصلاحيات</label>
      ${permCheckboxes(state.roles[0]?.permissions || [])}
    </div>
    <div class="err" id="err-p-submit"></div>
    <div class="modal-actions">
      <button class="btn ghost" data-action="close-modal">إلغاء</button>
      <button class="btn" data-action="save-perms">حفظ</button>
    </div>
  `);
}

function onPermRoleChanged(el) {
  const role = state.roles.find((r) => r.key === el.value);
  document.getElementById('p-boxes').innerHTML = `<label>الصلاحيات</label>${permCheckboxes(role?.permissions || [])}`;
}

async function savePerms(btn) {
  const key = document.getElementById('p-role').value;
  const permissions = [...document.querySelectorAll('.r-perm:checked')].map((el) => el.value);
  btn.disabled = true;
  try {
    await store.updateRolePermissions(key, permissions);
    closeModal();
    toast('انحفظت الصلاحيات — بتصير فعالة لما يعيد الموظف تسجيل الدخول');
    showSettings();
  } catch (err) {
    setErr('err-p-submit', store.humanError(err));
  } finally { btn.disabled = false; }
}

/* ---------- ربط ميتا ---------- */

function openMetaModal(clientId) {
  const c = state.clients.find((x) => x.id === clientId);
  const m = c.meta || {};
  openModal(`
    <h3>ربط حساب ${esc(c.name)} بميتا</h3>
    <div class="field"><label>اسم الصفحة (Page Name)</label><input id="m-page" value="${esc(m.pageName)}" placeholder="مثال: Albait Alshami"></div>
    <div class="field"><label>Instagram Business Account ID</label><input id="m-igid" value="${esc(m.igId)}" placeholder="رقم الحساب من Meta Business Suite"></div>
    <div class="err" id="err-m-submit"></div>
    <div class="modal-actions">
      <button class="btn ghost" data-action="close-modal">إلغاء</button>
      <button class="btn" data-action="save-meta" data-id="${esc(clientId)}">حفظ وربط</button>
    </div>
    <div class="disclaimer" style="margin-top:14px;"><b>ليش ما في خانة توكن؟</b> التوكن سر — لو انحفظ هون رح يكون مقروء من أي موظف مسجّل دخول. لما يجي وقت الربط الحقيقي، محله Cloud Function بمفاتيح مخفية على السيرفر.</div>
  `);
}

async function saveMeta(btn) {
  const clientId = btn.dataset.id;
  const meta = {
    pageName: document.getElementById('m-page').value.trim(),
    igId: document.getElementById('m-igid').value.trim(),
    connected: true,
  };
  btn.disabled = true;
  try {
    await store.saveClientMeta(clientId, meta);
    closeModal();
    toast('انحفظ الربط');
    showSettings();
  } catch (err) {
    setErr('err-m-submit', store.humanError(err));
  } finally { btn.disabled = false; }
}

export const actions = {
  'set-settings-tab': (el) => { state.settingsTab = el.dataset.tab; showSettings(); },
  'add-role': () => openAddRoleModal(),
  'submit-role': (el) => submitAddRole(el),
  'edit-perms': () => openEditPermsModal(),
  'perm-role-changed': (el) => onPermRoleChanged(el),
  'save-perms': (el) => savePerms(el),
  'open-meta': (el) => openMetaModal(el.dataset.id),
  'save-meta': (el) => saveMeta(el),
};
