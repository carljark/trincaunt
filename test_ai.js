const { AppError } = require('./api/dist/utils/AppError.js');
const AiService = require('./api/dist/services/AiService.js').default;

(async () => {
  try {
    await AiService.parseExpenseFromMedia(Buffer.from('dummy'), 'audio/mp4', []);
  } catch (e) {
    console.log("EL ERROR ES:", e.message);
  }
})();
