// ============ الحالة المشتركة بين كل صفحات النظام ============

export const NAV_LABELS = {
  home: 'الرئيسية', overview: 'نظرة عامة', tasks: 'المهام', calendar: 'التقويم', team: 'الفريق',
  services: 'خدمات الشركة', chat: 'التواصل', finance: 'المالية', reports: 'التقارير الشهرية', settings: 'الإعدادات', 'my-dashboard': 'لوحتي',
};

export const NAV_ICONS = {
  home: 'fi-rr-home', overview: 'fi-rr-dashboard', tasks: 'fi-rr-list-check', calendar: 'fi-rr-calendar',
  team: 'fi-rr-users-alt', services: 'fi-rr-briefcase', chat: 'fi-rr-comments', finance: 'fi-rr-wallet',
  reports: 'fi-rr-chart-histogram', settings: 'fi-rr-settings', 'my-dashboard': 'fi-rr-user',
};

export const ALL_MODULE_KEYS = ['home', 'my-dashboard', 'overview', 'tasks', 'calendar', 'team', 'services', 'chat', 'finance', 'reports', 'settings'];

// نفس الأدوار الأساسية يلي كانت بـschema.sql — بتتزرع أول ما ينعمل حساب المدير
export const DEFAULT_ROLES = {
  ceo:                 { label: 'المدير العام والتنفيذي', permissions: ['home', 'overview', 'tasks', 'calendar', 'team', 'services', 'chat', 'finance', 'reports', 'settings'] },
  operational_manager: { label: 'مديرة العمليات',          permissions: ['home', 'overview', 'tasks', 'calendar', 'team', 'services', 'chat'] },
  account_manager:     { label: 'مديرة حسابات',            permissions: ['home', 'my-dashboard', 'overview', 'tasks', 'calendar', 'services', 'chat'] },
  coordinator:         { label: 'منسقة إدارية',            permissions: ['home', 'my-dashboard', 'overview', 'tasks', 'calendar', 'team', 'services', 'chat'] },
  designer:            { label: 'مصممة جرافيك',            permissions: ['home', 'my-dashboard', 'tasks', 'calendar', 'services', 'chat'] },
  writer:              { label: 'كاتب محتوى',              permissions: ['home', 'my-dashboard', 'tasks', 'calendar', 'services', 'chat'] },
  photographer:        { label: 'مصورة مونتاج',            permissions: ['home', 'my-dashboard', 'tasks', 'calendar', 'services', 'chat'] },
  editor:              { label: 'مونتير فيديو',             permissions: ['home', 'my-dashboard', 'tasks', 'calendar', 'services', 'chat'] },
  temp_access:         { label: 'دخول مؤقت',                permissions: ['my-dashboard', 'overview', 'tasks', 'calendar'] },
};

// Firebase Authentication ما بيدعم اسم مستخدم مباشرة — بيدعم بريد بس.
// فمنركّب بريد داخلي من اسم المستخدم: ahmad ← ahmad@najran-system.local
// الموظف ما بيشوف هالبريد أبداً، وFirebase بيضمن إنه ما يتكرر اسم مستخدم.
export const USERNAME_DOMAIN = 'najran-system.local';
export const ACCESS_USERNAME = 'access'; // حساب الدخول المؤقت بالرمز السري

export function usernameToEmail(username) {
  return `${String(username).trim().toLowerCase()}@${USERNAME_DOMAIN}`;
}

// أحرف لاتينية وأرقام و . _ - بس — لأنه بينحط جوا بريد إلكتروني
export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

export function usernameProblem(username) {
  const u = String(username || '').trim().toLowerCase();
  if (!u) return 'لازم تدخل اسم مستخدم';
  if (u.length < 3) return 'اسم المستخدم 3 أحرف عالأقل';
  if (u.length > 30) return 'اسم المستخدم طويل كتير (30 حرف كحد أقصى)';
  if (!USERNAME_RE.test(u)) return 'اسم المستخدم بيقبل أحرف إنجليزية وأرقام و . _ - بس (بدون مسافات ولا عربي)';
  if (u === ACCESS_USERNAME) return 'هاد الاسم محجوز للدخول المؤقت';
  return null;
}

export const TYPE_LABEL   = { reel: 'ريلز', post: 'بوست', story: 'ستوري' };
export const PRIO_LABEL   = { high: 'عالية', mid: 'متوسطة', low: 'منخفضة' };
export const STATUS_LABEL = { today: 'قائمة اليوم', progress: 'قيد التنفيذ', paused: 'متوقفة مؤقتاً', review: 'بانتظار المراجعة', revision: 'تعديلات مطلوبة', done: 'مكتمل' };
export const TASK_STATUSES = ['today', 'progress', 'paused', 'review', 'revision', 'done'];

// state.x بدل متغيرات منفصلة — منشان كل الملفات تشوف نفس القيمة بعد التعديل
export const state = {
  currentUser: null,   // { id, name, email, roleKey, role, permissions[] }
  employees: [],       // [{ id, name, email, roleKey, roleLabel, active }]
  roles: [],           // [{ key, label, permissions[] }]
  clients: [],         // [{ id, name, industry, instagram, brief, meta }]
  tasks: [],           // [{ id, title, clientId, assigneeId, priority, status, deadline, notes, deliveryMethod, deliveryLink }]
  content: {},         // { [clientId]: [ {...} ] }
  finance: {},         // { [clientId]: { advancePaid, extraExpenses } }
  serviceRequests: [], // طلبات إجازة/شراء/صيانة
  announcements: [],  // إعلانات الشركة
  attendance: {},     // حضور اليوم حسب uid
  activeEmployeeId: null,
  chatTab: 'general',
  activeChatUser: null,
  chatMessages: [],
  presence: {},
  currentPage: 'home',
  activeClient: null,
  activeTab: 'overview',
  settingsTab: 'permissions',
  taskView: 'board',
  taskFilterEmp: 'all',
  searchQuery: '',
  filterIndustry: 'all',
};

export function can(moduleKey) {
  return !!state.currentUser && state.currentUser.permissions.includes(moduleKey);
}

export function employeeName(id) {
  const e = state.employees.find((x) => x.id === id);
  return e ? e.name : '—';
}

export function clientName(id) {
  const c = state.clients.find((x) => x.id === id);
  return c ? c.name : '';
}

// كل نص جاي من المستخدم بيمر من هون قبل ما ينحط بالصفحة — يمنع حقن HTML
export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
