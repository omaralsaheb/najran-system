// بيلفّ تطبيق Express كامل ويشغّله كـ Netlify Function.
// كل نداء على /api/* بيوصل لهون (حسب الـredirect بملف netlify.toml).
const serverless = require('serverless-http');
const app = require('../../backend/app');

const handler = serverless(app);

exports.handler = async (event, context) => {
  // بدون هالسطر بيضل الاتصال بقاعدة البيانات ماسك الفنكشن لحد التايم أوت
  context.callbackWaitsForEmptyEventLoop = false;

  // Netlify بيمرّر المسار أحياناً كـ /.netlify/functions/api/... وأحياناً /api/...
  // منوحّدهم لـ /api/... لأن Express مركّب راوتاته على هالشكل.
  let p = event.path || '/';
  p = p.replace(/^\/\.netlify\/functions\/api/, '');
  if (!p.startsWith('/api')) p = '/api' + (p.startsWith('/') ? p : `/${p}`);

  return handler({ ...event, path: p }, context);
};
