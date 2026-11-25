exports.default = async ({ page }) => {
  await page.addInitScript(() => {
    const mute = (media) => {
      if (!media.muted) media.muted = true;
    };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      mute(this);
      return play.apply(this, args);
    };
    for (const type of ['play', 'playing', 'volumechange']) {
      document.addEventListener(type, (event) => {
        if (event.target instanceof HTMLMediaElement) mute(event.target);
      }, true);
    }
  });
};
