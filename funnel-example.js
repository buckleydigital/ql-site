// Scales each 1080x1080 ad creative in a funnel example to fit its box.
(function () {
  function fit() {
    document.querySelectorAll('.fx-ad').forEach(function (box) {
      box.style.setProperty('--fx-s', (box.clientWidth / 1080).toFixed(4));
    });
  }
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('load', fit);
})();
