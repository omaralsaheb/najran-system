// ============ طبقة البيانات — كل قراءة وكتابة على Firebase بتمر من هون ============
// ما في ولا استدعاء لـFirebase بملفات الصفحات؛ هيك لو بدنا نغيّر القاعدة لاحقاً
// (Firestore مثلاً) منغيّر هاد الملف بس.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, sendPasswordResetEmail, updateProfile,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  ref, get, set, update, remove, push, child, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js';

import { auth, db, firebaseConfig } from './firebase.js';
import { state, DEFAULT_ROLES } from './state.js';

/* ---------- مساعدات ---------- */

// RTDB ما بيحب المصفوفات — الصلاحيات محفوظة كـ{overview:true, tasks:true}
const permsToMap = (arr) => (arr || []).reduce((acc, k) => { acc[k] = true; return acc; }, {});
const permsToArr = (map) => Object.keys(map || {}).filter((k) => map[k]);

// بيحوّل {id1:{...}, id2:{...}} لـ[{id:'id1', ...}, ...]
const toList = (snapVal) => Object.entries(snapVal || {}).map(([id, v]) => ({ id, ...v }));

// بيترجم رسائل Firebase لعربي مفهوم بدل الأكواد الإنجليزية
export function humanError(err) {
  const code = err?.code || '';
  const map = {
    'auth/invalid-credential': 'البريد أو كلمة السر غلط',
    'auth/wrong-password': 'كلمة السر غلط',
    'auth/user-not-found': 'ما في حساب بهاد البريد',
    'auth/invalid-email': 'صيغة البريد الإلكتروني مو صحيحة',
    'auth/email-already-in-use': 'في حساب مسجّل بهاد البريد من قبل',
    'auth/weak-password': 'كلمة السر ضعيفة — لازم 6 أحرف عالأقل',
    'auth/too-many-requests': 'محاولات كتير — استنى شوي وجرب من جديد',
    'auth/network-request-failed': 'ما في اتصال بالإنترنت',
    'auth/operation-not-allowed': 'تسجيل الدخول بالبريد وكلمة السر مو مفعّل — فعّله من Firebase Console ← Authentication ← Sign-in method',
    'auth/configuration-not-found': 'خدمة تسجيل الدخول لسا ما انفعّلت بمشروع Firebase — افتح Console ← Authentication ← Get started، وفعّل Email/Password',
    PERMISSION_DENIED: 'ما عندك صلاحية لهاي العملية',
  };
  if (map[code]) return map[code];
  const msg = err?.message || 'صار خطأ غير متوقع';
  if (/permission[ _]denied/i.test(msg)) return map.PERMISSION_DENIED;
  return msg;
}

// نفس الرسالة بس بصياغة أوضح لشاشة الدخول: أول شي بيوقّف الناس هو إنه القواعد
// لسا ما انرفعت على Firebase، فمنقول لهم شو يعملوا بالضبط
export function connectionError(err) {
  if (/permission[ _]denied/i.test(err?.message || '') || err?.code === 'PERMISSION_DENIED') {
    return 'قاعدة البيانات رافضة الاتصال — يعني قواعد الأمان لسا ما انرفعت. شغّل: firebase deploy --only database';
  }
  return humanError(err);
}

/* ---------- الإعداد الأول + تسجيل الدخول ---------- */

// هل النظام لسا فاضي؟ /meta/initialized مقروء بدون تسجيل دخول (بوليان بس)
export async function needsSetup() {
  const snap = await get(ref(db, 'meta/initialized'));
  return snap.val() !== true;
}

// بينشئ حساب المدير الأول + بيزرع الأدوار الأساسية بعملية وحدة
export async function firstSetup(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  await updateProfile(cred.user, { displayName: name });

  const payload = {};
  Object.entries(DEFAULT_ROLES).forEach(([key, r]) => {
    payload[`roles/${key}`] = { label: r.label, permissions: permsToMap(r.permissions) };
  });
  payload[`employees/${uid}`] = {
    name, email, roleKey: 'ceo', active: true, createdAt: serverTimestamp(),
  };
  payload['meta/initialized'] = true;

  await update(ref(db), payload);
  return uid;
}

export function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function logoutUser() {
  return signOut(auth);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

// بيجيب بيانات الموظف + صلاحيات دوره ويبنيها كـcurrentUser
export async function loadProfile(uid) {
  const empSnap = await get(ref(db, `employees/${uid}`));
  if (!empSnap.exists()) return null;
  const emp = empSnap.val();
  if (emp.active === false) throw new Error('حسابك موقوف — راجع المدير');

  const roleSnap = await get(ref(db, `roles/${emp.roleKey}`));
  const role = roleSnap.val() || { label: emp.roleKey, permissions: {} };
  const permissions = permsToArr(role.permissions);

  return {
    id: uid,
    name: emp.name,
    email: emp.email,
    roleKey: emp.roleKey,
    role: role.label,
    permissions: permissions.length ? permissions : ['my-dashboard'],
  };
}

/* ---------- الأدوار ---------- */

export async function loadRoles() {
  const snap = await get(ref(db, 'roles'));
  state.roles = Object.entries(snap.val() || {}).map(([key, r]) => ({
    key, label: r.label, permissions: permsToArr(r.permissions),
  }));
  return state.roles;
}

export async function createRole(key, label, permissions) {
  await set(ref(db, `roles/${key}`), { label, permissions: permsToMap(permissions) });
  return loadRoles();
}

export async function updateRolePermissions(key, permissions) {
  await update(ref(db, `roles/${key}`), { permissions: permsToMap(permissions) });
  return loadRoles();
}

/* ---------- الموظفين ---------- */

export async function loadEmployees() {
  const snap = await get(ref(db, 'employees'));
  const roleMap = {};
  state.roles.forEach((r) => { roleMap[r.key] = r.label; });
  state.employees = toList(snap.val())
    .filter((e) => e.active !== false)
    .map((e) => ({ ...e, roleLabel: roleMap[e.roleKey] || e.roleKey }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  return state.employees;
}

// إنشاء حساب موظف جديد بدون ما يطلّع المدير من جلسته:
// Firebase بيسجّل دخول أي حساب جديد تلقائياً، فمنعمل نسخة تانية من التطبيق
// مخصصة للإنشاء بس، ومنسكرها بعدها — وجلسة المدير بتضل متل ما هي.
export async function createEmployee({ name, email, password, roleKey }) {
  const secondary = initializeApp(firebaseConfig, `emp-create-${Date.now()}`);
  const secondaryAuth = getAuth(secondary);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await updateProfile(cred.user, { displayName: name });
    // الكتابة بتصير بجلسة المدير (db الأساسي) — فالقواعد بتشوف صلاحية "الفريق"
    await set(ref(db, `employees/${cred.user.uid}`), {
      name, email, roleKey, active: true, createdAt: serverTimestamp(),
    });
    return cred.user.uid;
  } finally {
    await signOut(secondaryAuth).catch(() => {});
  }
}

export async function updateEmployee(id, { name, roleKey }) {
  await update(ref(db, `employees/${id}`), { name, roleKey });
  return loadEmployees();
}

// ما منحذف حسابات — منوقفها، حتى تضل مهامها القديمة مربوطة باسم
export async function deactivateEmployee(id) {
  await update(ref(db, `employees/${id}`), { active: false });
  return loadEmployees();
}

/* ---------- العملاء ---------- */

export async function loadClients() {
  const snap = await get(ref(db, 'clients'));
  state.clients = toList(snap.val()).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return state.clients;
}

export async function createClient({ name, industry, instagram }) {
  const newRef = push(child(ref(db), 'clients'));
  await set(newRef, {
    name,
    industry,
    instagram: instagram || '',
    brief: { business: '', audience: '', voice: '', notes: '' },
    createdAt: serverTimestamp(),
    createdBy: state.currentUser?.id || null,
  });
  await loadClients();
  return newRef.key;
}

export async function saveClientBrief(clientId, brief) {
  await update(ref(db, `clients/${clientId}/brief`), brief);
  return loadClients();
}

export async function saveClientMeta(clientId, meta) {
  await set(ref(db, `clients/${clientId}/meta`), meta);
  return loadClients();
}

/* ---------- المحتوى ---------- */

export async function loadContent(clientId) {
  const snap = await get(ref(db, `content/${clientId}`));
  state.content[clientId] = toList(snap.val()).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return state.content[clientId];
}

export async function loadAllContent() {
  const snap = await get(ref(db, 'content'));
  const all = snap.val() || {};
  state.content = {};
  Object.keys(all).forEach((cid) => {
    state.content[cid] = toList(all[cid]).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  });
  return state.content;
}

export async function addContent(clientId, data) {
  const newRef = push(child(ref(db), `content/${clientId}`));
  await set(newRef, { ...data, createdAt: serverTimestamp() });
  return loadContent(clientId);
}

export async function updateContent(clientId, contentId, data) {
  await update(ref(db, `content/${clientId}/${contentId}`), data);
  return loadContent(clientId);
}

export async function deleteContent(clientId, contentId) {
  await remove(ref(db, `content/${clientId}/${contentId}`));
  return loadContent(clientId);
}

/* ---------- المهام ---------- */

export async function loadTasks() {
  const snap = await get(ref(db, 'tasks'));
  state.tasks = toList(snap.val()).sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
  return state.tasks;
}

// سجل دائم لكل تغيير — ما بينحذف أبداً، متل جدول task_activity القديم
async function logTaskActivity(taskId, action, detail) {
  const newRef = push(child(ref(db), `taskActivity/${taskId}`));
  await set(newRef, {
    employeeId: state.currentUser?.id || null,
    action,
    detail: detail || '',
    createdAt: serverTimestamp(),
  }).catch(() => {}); // السجل مو حرج — ما منوقف العملية لو فشل
}

export async function createTask(data) {
  const newRef = push(child(ref(db), 'tasks'));
  await set(newRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: state.currentUser?.id || null,
  });
  await logTaskActivity(newRef.key, 'created', data.title);
  return loadTasks();
}

export async function updateTask(taskId, data) {
  await update(ref(db, `tasks/${taskId}`), { ...data, updatedAt: serverTimestamp() });
  await logTaskActivity(taskId, 'updated', data.status || '');
  return loadTasks();
}

export async function setTaskStatus(taskId, status) {
  await update(ref(db, `tasks/${taskId}`), { status, updatedAt: serverTimestamp() });
  await logTaskActivity(taskId, 'status_changed', status);
  return loadTasks();
}

export async function loadTaskActivity(taskId) {
  const snap = await get(ref(db, `taskActivity/${taskId}`));
  return toList(snap.val()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/* ---------- المالية ---------- */

export async function loadFinance() {
  const snap = await get(ref(db, 'finance'));
  state.finance = snap.val() || {};
  return state.finance;
}

export async function saveFinance(clientId, advancePaid, extraExpenses) {
  await set(ref(db, `finance/${clientId}`), {
    advancePaid, extraExpenses, updatedAt: serverTimestamp(),
  });
  // نفس منطق finance_activity: كل حفظة بتنسجل كسجل دائم — مين عدّل وشو كانت الأرقام
  const actRef = push(child(ref(db), `financeActivity/${clientId}`));
  await set(actRef, {
    employeeId: state.currentUser?.id || null,
    advancePaid, extraExpenses, createdAt: serverTimestamp(),
  }).catch(() => {});
  return loadFinance();
}

export async function loadFinanceHistory(clientId) {
  const snap = await get(ref(db, `financeActivity/${clientId}`));
  return toList(snap.val()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
