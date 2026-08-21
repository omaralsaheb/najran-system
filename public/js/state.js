// ============ الحالة المشتركة بين كل صفحات النظام ============

export const NAV_LABELS = {
  overview: 'نظرة عامة', tasks: 'المهام', calendar: 'التقويم', team: 'الفريق',
  finance: 'المالية', reports: 'التقارير الشهرية', settings: 'الإعدادات', 'my-dashboard': 'لوحتي',
};

export const ALL_MODULE_KEYS = ['overview', 'tasks', 'calendar', 'team', 'finance', 'reports', 'settings', 'my-dashboard'];

// نفس الأدوار الأساسية يلي كانت بـschema.sql — بتتزرع أول ما ينعمل حساب المدير
export const DEFAULT_ROLES = {
  ceo:                 { label: 'المدير العام والتنفيذي', permissions: ['overview', 'tasks', 'calendar', 'team', 'finance', 'reports', 'settings'] },
  operational_manager: { label: 'مديرة العمليات',          permissions: ['overview', 'tasks', 'calendar', 'team'] },
  account_manager:     { label: 'مديرة حسابات',            permissions: ['my-dashboard', 'overview', 'tasks', 'calendar'] },
  coordinator:         { label: 'منسقة إدارية',            permissions: ['my-dashboard', 'overview', 'tasks', 'calendar', 'team'] },
  designer:            { label: 'مصممة جرافيك',            permissions: ['my-dashboard', 'tasks', 'calendar'] },
  writer:              { label: 'كاتب محتوى',              permissions: ['my-dashboard', 'tasks', 'calendar'] },
  photographer:        { label: 'مصورة مونتاج',            permissions: ['my-dashboard', 'tasks', 'calendar'] },
  editor:              { label: 'مونتير فيديو',             permissions: ['my-dashboard', 'tasks', 'calendar'] },
};

export const TYPE_LABEL   = { reel: 'ريلز', post: 'بوست', story: 'ستوري' };
export const PRIO_LABEL   = { high: 'عالية', mid: 'متوسطة', low: 'منخفضة' };
export const STATUS_LABEL = { today: 'قائمة اليوم', progress: 'قيد التنفيذ', review: 'بانتظار المراجعة', revision: 'تعديلات مطلوبة', done: 'مكتمل' };
export const TASK_STATUSES = ['today', 'progress', 'review', 'revision', 'done'];

// state.x بدل متغيرات منفصلة — منشان كل الملفات تشوف نفس القيمة بعد التعديل
export const state = {
  currentUser: null,   // { id, name, email, roleKey, role, permissions[] }
  employees: [],       // [{ id, name, email, roleKey, roleLabel, active }]
  roles: [],           // [{ key, label, permissions[] }]
  clients: [],         // [{ id, name, industry, instagram, brief, meta }]
  tasks: [],           // [{ id, title, clientId, assigneeId, priority, status, deadline, notes }]
  content: {},         // { [clientId]: [ {...} ] }
  finance: {},         // { [clientId]: { advancePaid, extraExpenses } }
  currentPage: 'overview',
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
