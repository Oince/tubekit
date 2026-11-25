const fs = require('fs');
const path = require('path');

exports.default = async ({ page }) => {
  const build = fs.readFileSync(process.env.TUBEKIT_BUILD || path.join(__dirname, '..', 'tubekit.user.js'), 'utf8');
  await page.addInitScript(`(() => {
const run = () => {
${build}
};
if (document.documentElement) run();
else new MutationObserver((_, observer) => {
  if (!document.documentElement) return;
  observer.disconnect();
  run();
}).observe(document, { childList: true });
})();`);
};
