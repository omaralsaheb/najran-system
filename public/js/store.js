// ============ طبقة البيانات — كل قراءة وكتابة على Firebase بتمر من هون ============
// ما في ولا استدعاء لـFirebase بملفات الصفحات؛ هيك لو بدنا نغيّر القاعدة لاحقاً
// (Firestore مثلاً) منغيّر هاد الملف بس.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  ref, get, set, update, remove, push, child, serverTimestamp, onValue, onDisconnect,
  query, limitToLast,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js';

import { auth, db, firebaseConfig } from './firebase.js';
import {
  state, DEFAULT_ROLES, ALL_MODULE_KEYS, ACCESS_USERNAME, usernameToEmail,
} from './state.js';
import { t } from './i18n.js';

const ACCESS_EMAIL = usernameToEmail(ACCESS_USERNAME);

// بينفّذ عملية على حساب تاني بدون ما يطلّع المستخدم الحالي من جلسته.
// Firebase بيسجّل دخول أي حساب جديد تلقائياً، فمنشتغل على نسخة منفصلة من
// التطبيق ومنسكرها بعدها — والجلسة الأساسية بتضل متل ما هي.
async function withSecondaryAuth(fn) {
  const secondary = initializeApp(firebaseConfig, `aux-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const secondaryAuth = getAuth(secondary);
  try {
    return await fn(secondaryAuth);
  } finally {
    await signOut(secondaryAuth).catch(() => {});
  }
}

/* ---------- مساعدات ---------- */

// RTDB ما بيحب المصفوفات — الصلاحيات محفوظة كـ{overview:true, tasks:true}
const permsToMap = (arr) => (arr || []).reduce((acc, k) => { acc[k] = true; return acc; }, {});
const permsToArr = (map) => Object.keys(map || {}).filter((k) => map[k]);
const orderPermissions = (items) => [...items].sort((a, b) => {
  const ai = ALL_MODULE_KEYS.indexOf(a); const bi = ALL_MODULE_KEYS.indexOf(b);
  return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
});

// بيحوّل {id1:{...}, id2:{...}} لـ[{id:'id1', ...}, ...]
const toList = (snapVal) => Object.entries(snapVal || {}).map(([id, v]) => ({ id, ...v }));

// بيترجم رسائل Firebase لعربي مفهوم بدل الأكواد الإنجليزية
export function humanError(err) {
  const code = err?.code || '';
  const map = {
    'auth/invalid-credential': 'اسم المستخدم أو كلمة السر غلط',
    'auth/wrong-password': 'كلمة السر غلط',
    'auth/user-not-found': 'ما في حساب بهاد الاسم',
    'auth/invalid-email': 'اسم المستخدم فيه رموز مو مقبولة',
    'auth/email-already-in-use': 'اسم المستخدم هاد مأخوذ — اختار غيره',
    'auth/requires-recent-login': 'لأمان أكتر، سجّل خروج وارجع ادخل قبل ما تغيّر كلمة السر',
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

// بيستنى لحد ما يصير في اتصال فعلي بقاعدة البيانات.
// السبب: get() قبل ما يجهز الاتصال بيرجع من الكاش الفاضي بدل ما يستنى، فبيطلع
// null وكأنه ما في بيانات. `.info/connected` عقدة محلية بالمكتبة — ما إلها
// علاقة بقواعد الأمان وبتشتغل دايماً.
function waitForConnection(timeoutMs = 8000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; unsub(); resolve(v); } };
    const unsub = onValue(ref(db, '.info/connected'), (snap) => {
      if (snap.val() === true) finish(true);
    }, () => finish(false));
    setTimeout(() => finish(false), timeoutMs);
  });
}

// هل النظام لسا فاضي؟ /meta/initialized مقروء بدون تسجيل دخول (بوليان بس).
// بنستنى الاتصال الأول، وبنعيد المحاولة مرة قبل ما نقول "لسا فاضي" — لأنه
// عرض فورم الإعداد الأول على نظام شغال غلط مكلف.
export async function needsSetup() {
  await waitForConnection();
  let snap = await get(ref(db, 'meta/initialized'));
  if (snap.val() !== true) {
    await new Promise((r) => setTimeout(r, 700));
    snap = await get(ref(db, 'meta/initialized'));
  }
  return snap.val() !== true;
}

// بينشئ حساب المدير الأول + حساب الدخول المؤقت + الأدوار الأساسية بعملية وحدة.
// كل هالخطوة بتشتغل مرة وحدة بالعمر — بعدها القواعد بترفض أي محاولة تانية.
export async function firstSetup(name, username, password, accessCode) {
  // 1) حساب الدخول المؤقت أول شي، على نسخة منفصلة حتى ما يسرق الجلسة
  let accessUid = null;
  if (accessCode) {
    accessUid = await withSecondaryAuth(async (aux) => {
      const c = await createUserWithEmailAndPassword(aux, ACCESS_EMAIL, accessCode);
      await updateProfile(c.user, { displayName: 'دخول مؤقت' });
      return c.user.uid;
    });
  }

  // 2) حساب المدير — هاد بيسجّل دخولنا فعلياً، ومنه منكتب على القاعدة
  const adminEmail = usernameToEmail(username);
  const cred = await createUserWithEmailAndPassword(auth, adminEmail, password);
  const uid = cred.user.uid;
  await updateProfile(cred.user, { displayName: name });

  // 3) كتابة وحدة ذرّية: الأدوار + الحسابين + علامة إنه النظام اتجهّز
  const payload = {};
  Object.entries(DEFAULT_ROLES).forEach(([key, r]) => {
    payload[`roles/${key}`] = { label: r.label, permissions: permsToMap(r.permissions) };
  });
  payload[`employees/${uid}`] = {
    name,
    username: username.trim().toLowerCase(),
    email: adminEmail,
    roleKey: 'ceo',
    active: true,
    createdAt: serverTimestamp(),
  };
  if (accessUid) {
    payload[`employees/${accessUid}`] = {
      name: 'دخول مؤقت',
      username: ACCESS_USERNAME,
      email: ACCESS_EMAIL,
      roleKey: 'temp_access',
      active: true,
      isAccessAccount: true,
      createdAt: serverTimestamp(),
    };
  }
  payload['meta/initialized'] = true;

  await update(ref(db), payload);
  return uid;
}

export function login(username, password) {
  return signInWithEmailAndPassword(auth, usernameToEmail(username), password);
}

// الدخول المؤقت: الرمز السري نفسه هو كلمة سر حساب مخصص اسمه "access".
// يعني الرمز ما بينحفظ ولا بينقرأ من أي مكان — Firebase بيتحقق منه متل أي كلمة سر.
export function loginWithAccessCode(code) {
  return signInWithEmailAndPassword(auth, ACCESS_EMAIL, code);
}

export async function logoutUser() {
  await markPresenceOffline().catch(() => {});
  return signOut(auth);
}

// المستخدم بيغيّر كلمة سره بنفسه (لازم يعرف القديمة)
export async function changeOwnPassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error('لازم تكون مسجّل دخول');
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPassword);
}

// تغيير رمز الدخول المؤقت — منسجّل دخول لحساب access على نسخة منفصلة ومنبدّل كلمة سره
export async function changeAccessCode(oldCode, newCode) {
  await withSecondaryAuth(async (aux) => {
    const c = await signInWithEmailAndPassword(aux, ACCESS_EMAIL, oldCode);
    await updatePassword(c.user, newCode);
  });
}

// حساب الدخول المؤقت — لعرض حالته بالإعدادات (بيظهر حتى لو موقوف)
export async function loadAccessAccount() {
  const snap = await get(ref(db, 'employees'));
  const found = Object.entries(snap.val() || {}).find(([, e]) => e.isAccessAccount === true);
  return found ? { id: found[0], ...found[1] } : null;
}

export async function setAccessAccountActive(uid, active) {
  await update(ref(db, `employees/${uid}`), { active });
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

  let roleSnap = await get(ref(db, `roles/${emp.roleKey}`));
  let role = roleSnap.val() || { label: emp.roleKey, permissions: {} };
  let permissions = permsToArr(role.permissions);

  // ترقية غير هدّامة للنسخ القديمة: منضيف وحدات الشركة الجديدة للأدوار الأساسية
  // المناسبة، بدون ما نكتب فوق أي صلاحية عدّلها المدير.
  const defaultRole = DEFAULT_ROLES[emp.roleKey];
  for (const feature of ['home', 'services', 'chat']) {
    const shouldHave = feature === 'home' ? emp.isAccessAccount !== true : defaultRole?.permissions.includes(feature);
    if (shouldHave && !permissions.includes(feature)) {
      let saved = false;
      try { await set(ref(db, `roles/${emp.roleKey}/permissions/${feature}`), true); saved = true; }
      catch (_) { /* المدير يثبّت الصلاحية في الدور إذا لزم */ }
      if (saved || feature === 'home') permissions = [...permissions, feature];
    }
  }
  // أول دخول للمدير يرقّي بقية الأدوار الأساسية دفعة واحدة، حتى يظهر القسم
  // للموظفين من دون ما نطلب تعديل كل دور يدوياً.
  if (permissions.includes('settings')) {
    try {
      const allSnap = await get(ref(db, 'roles'));
      const all = allSnap.val() || {};
      const upgrades = {};
      Object.entries(DEFAULT_ROLES).forEach(([key, def]) => ['home', 'services', 'chat'].forEach((feature) => {
        if (def.permissions.includes(feature) && all[key] && all[key].permissions?.[feature] !== true) upgrades[`roles/${key}/permissions/${feature}`] = true;
      }));
      Object.keys(all).filter((key) => key !== 'temp_access').forEach((key) => {
        if (all[key].permissions?.home !== true) upgrades[`roles/${key}/permissions/home`] = true;
      });
      if (Object.keys(upgrades).length) await update(ref(db), upgrades);
    } catch (_) { /* ما منوقف الدخول إذا تعذرت الترقية */ }
  }

  return {
    id: uid,
    name: emp.name,
    username: emp.username || '',
    email: emp.email,
    roleKey: emp.roleKey,
    role: role.label,
    isAccessAccount: emp.isAccessAccount === true,
    permissions: orderPermissions(permissions.length ? permissions : ['my-dashboard']),
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
    .filter((e) => e.active !== false && e.isAccessAccount !== true)
    .map((e) => ({ ...e, roleLabel: roleMap[e.roleKey] || e.roleKey }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
  return state.employees;
}

// المدير بس يلي بينشئ حسابات الموظفين — ما في تسجيل ذاتي بالنظام أبداً.
// تفرّد اسم المستخدم مضمون من Firebase نفسه: البريد الداخلي ما بيتكرر.
export async function createEmployee({ name, username, password, roleKey }) {
  const uname = username.trim().toLowerCase();
  const email = usernameToEmail(uname);
  return withSecondaryAuth(async (aux) => {
    const cred = await createUserWithEmailAndPassword(aux, email, password);
    await updateProfile(cred.user, { displayName: name });
    // الكتابة بتصير بجلسة المدير (db الأساسي) — فالقواعد بتشوف صلاحية "الفريق"
    await set(ref(db, `employees/${cred.user.uid}`), {
      name, username: uname, email, roleKey, active: true, createdAt: serverTimestamp(),
    });
    return cred.user.uid;
  });
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
  state.clients = toList(snap.val()).map((client) => ({ ...client, active: client.active !== false }))
    .sort((a, b) => Number(b.active) - Number(a.active) || (a.createdAt || 0) - (b.createdAt || 0));
  return state.clients;
}

export async function createClient({ name, industry, instagram }) {
  const newRef = push(child(ref(db), 'clients'));
  await set(newRef, {
    name,
    industry,
    instagram: instagram || '',
    active: true,
    brief: { business: '', audience: '', voice: '', notes: '' },
    createdAt: serverTimestamp(),
    createdBy: state.currentUser?.id || null,
  });
  await loadClients();
  return newRef.key;
}

export async function setClientActive(clientId, active) {
  await update(ref(db, `clients/${clientId}`), { active: !!active, updatedAt: serverTimestamp() });
  return loadClients();
}

export async function deleteClient(clientId) {
  const tasksSnap = await get(ref(db, 'tasks'));
  const changes = {
    [`clients/${clientId}`]: null,
    [`content/${clientId}`]: null,
  };
  Object.entries(tasksSnap.val() || {}).forEach(([taskId, task]) => {
    if (task?.clientId === clientId) changes[`tasks/${taskId}/clientId`] = null;
  });
  await update(ref(db), changes);
  await remove(ref(db, `finance/${clientId}`)).catch(() => {});
  delete state.content[clientId];
  return loadClients();
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
  const completionReset = data.status !== 'done'
    ? { deliveryMethod: null, deliveryLink: null, completedAt: null, completedBy: null }
    : {};
  await update(ref(db, `tasks/${taskId}`), { ...data, ...completionReset, updatedAt: serverTimestamp() });
  await logTaskActivity(taskId, 'updated', data.status || '');
  return loadTasks();
}

export async function setTaskStatus(taskId, status) {
  const completionReset = status !== 'done'
    ? { deliveryMethod: null, deliveryLink: null, completedAt: null, completedBy: null }
    : {};
  await update(ref(db, `tasks/${taskId}`), { status, ...completionReset, updatedAt: serverTimestamp() });
  await logTaskActivity(taskId, 'status_changed', status);
  return loadTasks();
}

export async function completeTask(taskId, deliveryMethod, deliveryLink = '') {
  await update(ref(db, `tasks/${taskId}`), {
    status: 'done',
    deliveryMethod,
    deliveryLink: deliveryMethod === 'drive' ? deliveryLink : null,
    completedAt: serverTimestamp(),
    completedBy: state.currentUser?.id || null,
    updatedAt: serverTimestamp(),
  });
  await logTaskActivity(taskId, 'completed', deliveryMethod);
  return loadTasks();
}

export async function deleteTask(taskId) {
  await logTaskActivity(taskId, 'deleted', '');
  await remove(ref(db, `tasks/${taskId}`));
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

/* ---------- خدمات الشركة ---------- */

export async function loadServiceRequests() {
  const snap = await get(ref(db, 'serviceRequests'));
  state.serviceRequests = toList(snap.val()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return state.serviceRequests;
}

export async function createServiceRequest(type, details) {
  const newRef = push(child(ref(db), 'serviceRequests'));
  await set(newRef, { type, details, status: 'pending', employeeId: state.currentUser.id, createdAt: serverTimestamp() });
  return loadServiceRequests();
}

export async function reviewServiceRequest(id, status) {
  await update(ref(db, `serviceRequests/${id}`), { status, reviewedBy: state.currentUser.id, reviewedAt: serverTimestamp() });
  return loadServiceRequests();
}

export async function loadAnnouncements() {
  const snap = await get(ref(db, 'announcements'));
  state.announcements = toList(snap.val()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return state.announcements;
}

export async function createAnnouncement(title, body) {
  const newRef = push(child(ref(db), 'announcements'));
  await set(newRef, { title, body, authorId: state.currentUser.id, createdAt: serverTimestamp() });
  return loadAnnouncements();
}

function todayKey() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function loadTodayAttendance() {
  const canSeeTeam = state.currentUser.permissions.includes('team');
  const path = canSeeTeam ? `attendance/${todayKey()}` : `attendance/${todayKey()}/${state.currentUser.id}`;
  const snap = await get(ref(db, path));
  state.attendance = canSeeTeam ? (snap.val() || {}) : { [state.currentUser.id]: snap.val() || {} };
  return state.attendance;
}

export async function markAttendance(kind) {
  const path = `attendance/${todayKey()}/${state.currentUser.id}/${kind === 'in' ? 'checkIn' : 'checkOut'}`;
  await set(ref(db, path), serverTimestamp());
  return loadTodayAttendance();
}

/* ---------- حالة اتصال الموظفين ---------- */

let presenceConnectionUnsubscribe = null;
let presenceFeedUnsubscribe = null;
let ownPresenceRef = null;

export function startPresence() {
  if (!state.currentUser || state.currentUser.isAccessAccount) return;
  if (presenceConnectionUnsubscribe) presenceConnectionUnsubscribe();
  ownPresenceRef = ref(db, `presence/${state.currentUser.id}`);
  presenceConnectionUnsubscribe = onValue(ref(db, '.info/connected'), async (snap) => {
    if (snap.val() !== true || !ownPresenceRef) return;
    try {
      await onDisconnect(ownPresenceRef).set({ online: false, lastSeen: serverTimestamp() });
      await set(ownPresenceRef, { online: true, lastSeen: serverTimestamp() });
    } catch (_) { /* قواعد الحضور اللحظي لم تُنشر بعد */ }
  });
}

export async function markPresenceOffline() {
  stopPresenceListener();
  if (presenceConnectionUnsubscribe) presenceConnectionUnsubscribe();
  presenceConnectionUnsubscribe = null;
  if (!ownPresenceRef) return;
  const currentRef = ownPresenceRef;
  ownPresenceRef = null;
  await set(currentRef, { online: false, lastSeen: serverTimestamp() }).catch(() => {});
  await onDisconnect(currentRef).cancel().catch(() => {});
}

export function stopPresenceListener() {
  if (presenceFeedUnsubscribe) presenceFeedUnsubscribe();
  presenceFeedUnsubscribe = null;
}

export function subscribePresence(callback, onError) {
  stopPresenceListener();
  presenceFeedUnsubscribe = onValue(ref(db, 'presence'), (snap) => {
    state.presence = snap.val() || {};
    callback(state.presence);
  }, (err) => { if (onError) onError(err); });
  return presenceFeedUnsubscribe;
}

/* ---------- دردشة الموظفين ---------- */

let chatUnsubscribe = null;
const chatPairKey = (otherId) => [state.currentUser.id, otherId].sort().join('_');

export function stopChatListener() {
  if (chatUnsubscribe) chatUnsubscribe();
  chatUnsubscribe = null;
}

function subscribeMessages(path, callback, onError) {
  stopChatListener();
  chatUnsubscribe = onValue(ref(db, path), (snap) => {
    state.chatMessages = toList(snap.val()).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(state.chatMessages);
  }, (err) => { if (onError) onError(err); });
  return chatUnsubscribe;
}

export function subscribeGeneralChat(callback, onError) {
  return subscribeMessages('generalChat/messages', callback, onError);
}

export function subscribePrivateChat(otherId, callback, onError) {
  return subscribeMessages(`privateChats/${chatPairKey(otherId)}/messages`, callback, onError);
}

export async function sendChatMessage(scope, text, otherId = null) {
  const clean = String(text || '').trim();
  if (!clean) return;
  const base = scope === 'private' && otherId
    ? `privateChats/${chatPairKey(otherId)}/messages`
    : 'generalChat/messages';
  const newRef = push(child(ref(db), base));
  await set(newRef, {
    senderId: state.currentUser.id,
    senderName: state.currentUser.name,
    text: clean.slice(0, 2000),
    createdAt: serverTimestamp(),
  });
}

/* ---------- إشعارات لحظية للمهام والمحادثات والإعلانات ---------- */

let notificationFeedUnsubscribes = [];

export function stopActivityNotifications() {
  notificationFeedUnsubscribes.forEach((unsubscribe) => unsubscribe());
  notificationFeedUnsubscribes = [];
}

function watchNewItems(path, onNewItem, onError) {
  let initialized = false;
  let knownIds = new Set();
  const feed = query(ref(db, path), limitToLast(40));
  const unsubscribe = onValue(feed, (snap) => {
    const items = toList(snap.val()).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const nextIds = new Set(items.map((item) => item.id));
    if (!initialized) {
      initialized = true;
      knownIds = nextIds;
      return;
    }
    items.filter((item) => !knownIds.has(item.id)).forEach(onNewItem);
    knownIds = nextIds;
  }, (err) => { if (onError) onError(err); });
  notificationFeedUnsubscribes.push(unsubscribe);
}

const notificationSnippet = (value) => {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > 85 ? `${clean.slice(0, 82)}...` : clean;
};

export function subscribeActivityNotifications(callback, onError) {
  stopActivityNotifications();
  const me = state.currentUser;
  if (!me || me.isAccessAccount) return () => {};

  if (me.permissions.includes('tasks')) {
    watchNewItems('tasks', (task) => {
      if (task.assigneeId !== me.id || task.createdBy === me.id) return;
      callback({
        id: `task-${task.id}`, type: 'task', sourceId: task.id, page: 'tasks',
        title: t('مهمة جديدة'), text: `${t('تم إسناد مهمة')} «${task.title}» ${t('إليك')}`, createdAt: task.createdAt || Date.now(),
      });
    }, onError);
  }

  if (me.permissions.includes('chat')) {
    watchNewItems('announcements', (announcement) => {
      if (announcement.authorId === me.id) return;
      callback({
        id: `announcement-${announcement.id}`, type: 'announcement', sourceId: announcement.id,
        page: 'chat', chatTab: 'announcements', title: `${t('إعلان جديد')}: ${announcement.title}`,
        text: notificationSnippet(announcement.body), createdAt: announcement.createdAt || Date.now(),
      });
    }, onError);

    watchNewItems('generalChat/messages', (message) => {
      if (message.senderId === me.id) return;
      callback({
        id: `general-${message.id}`, type: 'chat', sourceId: message.id, page: 'chat', chatTab: 'general',
        title: t('رسالة جديدة في الدردشة العامة'), text: `${message.senderName}: ${notificationSnippet(message.text)}`,
        createdAt: message.createdAt || Date.now(),
      });
    }, onError);

    state.employees.filter((employee) => employee.id !== me.id && employee.active !== false && !employee.isAccessAccount)
      .forEach((employee) => {
      const pairKey = [me.id, employee.id].sort().join('_');
      watchNewItems(`privateChats/${pairKey}/messages`, (message) => {
        if (message.senderId === me.id) return;
        callback({
          id: `private-${pairKey}-${message.id}`, type: 'chat', sourceId: message.id,
          page: 'chat', chatTab: 'private', chatUserId: message.senderId,
          title: `${t('رسالة خاصة من')} ${message.senderName}`, text: notificationSnippet(message.text),
          createdAt: message.createdAt || Date.now(),
        });
        }, onError);
      });
  }

  return stopActivityNotifications;
}
