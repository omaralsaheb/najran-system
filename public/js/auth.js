// ============ تسجيل الدخول، الإعداد الأول، والخروج ============
import { state } from './state.js';
import { showScreen, buildSidebar, renderNotifPanel, go, toast } from './ui.js';
import * as store from './store.js';

const $ = (id) => document.getElementById(id);

function setLoginError(boxId, msg) {
  const el = $(boxId);
  if (msg) { el.textContent = msg; el.style.display = 'block'; } else { el.style.display = 'none'; }
}

function showForm(which) {
  $('login-form-normal').style.display = which === 'normal' ? 'block' : 'none';
  $('login-form-setup').style.display = which === 'setup' ? 'block' : 'none';
  $('login-form-loading').style.display = which === 'loading' ? 'block' : 'none';
}

// بيقرر يعرض فورم الدخول العادي ولا فورم "أنشئ حساب المدير الأول"
export async function showLogin() {
  showScreen('login');
  showForm('loading');
  $('login-title').textContent = 'تسجيل الدخول';
  $('login-sub').textContent = 'عم نتحقق من حالة النظام...';

  try {
    const fresh = await store.needsSetup();
    if (fresh) {
      $('login-title').textContent = 'إعداد النظام لأول مرة';
      $('login-sub').textContent = 'ما في حسابات بعد — أنشئ حساب المدير الأول';
      showForm('setup');
    } else {
      $('login-title').textContent = 'تسجيل الدخول';
      $('login-sub').textContent = 'بريدك الإلكتروني وكلمة السر يلي أعطاك ياها المدير';
      showForm('normal');
    }
  } catch (err) {
    // لو ما قدرنا نوصل للقاعدة، منعرض الدخول العادي مع سبب واضح بدل شاشة فاضية
    $('login-sub').textContent = 'بريدك الإلكتروني وكلمة السر يلي أعطاك ياها المدير';
    showForm('normal');
    setLoginError('login-err', store.connectionError(err));
  }
}

export async function doFirstSetup(btn) {
  const name = $('setup-name').value.trim();
  const email = $('setup-email').value.trim();
  const password = $('setup-password').value;
  setLoginError('setup-err', '');

  if (!name || !email || password.length < 6) {
    setLoginError('setup-err', 'كل الحقول مطلوبة، وكلمة السر 6 أحرف عالأقل');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'عم ننشئ الحساب...';
  try {
    await store.firstSetup(name, email, password);
    // onAuthStateChanged بيلتقط الجلسة الجديدة ويدخّلنا الداشبورد لحاله
  } catch (err) {
    setLoginError('setup-err', store.humanError(err));
  } finally {
    btn.disabled = false;
    btn.textContent = 'إنشاء حساب المدير';
  }
}

export async function doLogin(btn) {
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  setLoginError('login-err', '');

  if (!email || !password) {
    setLoginError('login-err', 'لازم بريد إلكتروني وكلمة سر');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'عم ندخّلك...';
  try {
    await store.login(email, password);
  } catch (err) {
    setLoginError('login-err', store.humanError(err));
  } finally {
    btn.disabled = false;
    btn.textContent = 'دخول';
  }
}

export async function doResetPassword() {
  const email = $('login-email').value.trim();
  if (!email) {
    setLoginError('login-err', 'اكتب بريدك الإلكتروني بالخانة فوق الأول');
    return;
  }
  try {
    await store.resetPassword(email);
    setLoginError('login-err', '');
    toast('بعتنالك رابط إعادة تعيين كلمة السر عالبريد');
  } catch (err) {
    setLoginError('login-err', store.humanError(err));
  }
}

export async function doLogout() {
  await store.logoutUser().catch(() => {});
  state.currentUser = null;
  state.employees = [];
  state.clients = [];
  state.tasks = [];
  state.content = {};
  state.finance = {};
  showLogin();
}

// بينده لما Firebase يتأكد من الجلسة (سواء دخول جديد أو جلسة محفوظة من قبل)
export async function onSignedIn(user) {
  showScreen('login');
  showForm('loading');
  $('login-title').textContent = 'أهلاً فيك';
  $('login-sub').textContent = 'عم نجهّز لوحتك...';

  try {
    const profile = await store.loadProfile(user.uid);
    if (!profile) {
      await store.logoutUser().catch(() => {});
      showForm('normal');
      $('login-title').textContent = 'تسجيل الدخول';
      setLoginError('login-err', 'حسابك موجود على Firebase بس مو مربوط بموظف — راجع المدير');
      return;
    }
    state.currentUser = profile;
    await store.loadRoles().catch(() => {});
    await store.loadEmployees().catch(() => {});
    await store.loadTasks().catch(() => {});

    showScreen('dashboard');
    buildSidebar();
    renderNotifPanel();
    go(profile.permissions[0]);
  } catch (err) {
    await store.logoutUser().catch(() => {});
    showForm('normal');
    $('login-title').textContent = 'تسجيل الدخول';
    setLoginError('login-err', store.humanError(err));
  }
}
