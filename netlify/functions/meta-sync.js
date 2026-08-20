// مهمة مجدولة كل 6 ساعات (الجدولة معرّفة بـ netlify.toml).
// بتضيف سجلات جديدة بجدول analytics_history بس — ما بتمسح ولا سجل قديم.
const { syncAllContent } = require('../../backend/services/metaSync');

exports.handler = async () => {
  try {
    await syncAllContent();
    return { statusCode: 200, body: 'sync ok' };
  } catch (e) {
    console.error('فشلت المزامنة الدورية:', e.message);
    return { statusCode: 500, body: e.message };
  }
};
