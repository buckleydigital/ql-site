/* Shared by the 90-day guarantee pages. Each page sets window.GUARANTEE =
   { funnel, niche, source, offer } before this loads.

   A click-through survey: one question at a time, tap an option to answer,
   a quarter-second slide to the next. Steps 1-3 are taps (volume, ad budget,
   where their leads come from), step 4 is the service area, step 5 the
   contact details. An answer marked as not qualifying (for example an ad budget
   under $1.5k a month) stops at a polite screen.

   Sends the enquiry to the same callback-request function the other funnels
   use, and records each step (GA4 'qr_funnel', Meta 'QRFunnel'), with the
   multiple-choice answers only, never personal details. */
(function () {
  var G = window.GUARANTEE || {};
  var SUPABASE_URL = 'https://wjadekgptkstfdootuol.supabase.co';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
  var SLIDE_MS = 250;
  var $ = function (id) { return document.getElementById(id); };

  var sent = {};
  function track(step, extra) {
    if (sent[step]) return; sent[step] = 1;
    var p = { step: step, funnel: G.funnel || 'guarantee' };
    if (extra) for (var k in extra) p[k] = extra[k];
    try { if (window.gtag) gtag('event', 'qr_funnel', p); } catch (e) {}
    try { if (window.fbq) fbq('trackCustom', 'QRFunnel', p); } catch (e) {}
  }

  // Cloudflare's check. The token is needed to send; it's fetched in the
  // background as the page loads.
  var token = '';
  window.onTurnstileReady = function () {
    if (typeof turnstile === 'undefined' || !$('ts') || $('ts').childElementCount) return;
    turnstile.render('#ts', {
      sitekey: '0x4AAAAAABj4xsGpuNPXeW_7', theme: 'dark', size: 'flexible', appearance: 'interaction-only',
      callback: function (t) { token = t; },
      'expired-callback': function () { token = ''; },
      'error-callback': function () { token = ''; }
    });
  };
  if (typeof turnstile !== 'undefined') window.onTurnstileReady();

  function phoneOk(v) {
    var d = v.replace(/[\s()\-.]/g, '').replace(/^\+?61/, '0');
    return /^0[2-478]\d{8}$/.test(d) || /^1[38]00\d{6}$/.test(d) || /^13\d{4}$/.test(d);
  }

  var form = $('gForm'); if (!form) return;
  var steps = Array.prototype.slice.call(form.querySelectorAll('.gs[data-step]'));
  var byStep = {}; steps.forEach(function (el) { byStep[el.getAttribute('data-step')] = el; });
  var TOTAL = 5, current = '1', busy = false, dqFrom = '2';
  var answers = { volume: '', budget: '', lead_source: '' };

  function paintTop(step) {
    var n = parseInt(step, 10);
    var dq = step === 'dq';
    $('gStepLbl').textContent = dq ? '' : 'Question ' + n + ' of ' + TOTAL;
    $('gBar').style.width = (dq ? 40 : (n / TOTAL) * 100) + '%';
    $('gBack').hidden = dq || n <= 1;
  }

  // Slide from the current question to another. dir is 'next' or 'prev'.
  function go(to, dir) {
    if (busy || to === current) return;
    var from = byStep[current], el = byStep[to];
    if (!el) return;
    busy = true;
    from.classList.remove('on', 'in-next', 'in-prev');
    from.classList.add('out-' + dir);
    el.classList.remove('in-next', 'in-prev');
    el.classList.add('on', 'in-' + dir);
    current = to; paintTop(to);
    // Keep the card in view on a phone after a tall step.
    var top = $('gSurvey').getBoundingClientRect().top;
    if (top < 0) window.scrollBy(0, top - 16);
    setTimeout(function () {
      from.classList.remove('out-next', 'out-prev');
      el.classList.remove('in-next', 'in-prev');
      busy = false;
      var first = el.querySelector('input:not([type=checkbox])');
      if (first && window.matchMedia('(min-width:700px)').matches) first.focus({ preventScroll: true });
    }, SLIDE_MS);
  }

  // Tapping an option: mark it, record it, then move on.
  steps.forEach(function (el) {
    var key = el.getAttribute('data-key');
    if (!key) return;
    Array.prototype.forEach.call(el.querySelectorAll('.gopt'), function (opt) {
      opt.addEventListener('click', function () {
        if (busy) return;
        Array.prototype.forEach.call(el.querySelectorAll('.gopt'), function (o) { o.classList.toggle('sel', o === opt); });
        var v = opt.getAttribute('data-v'), n = parseInt(el.getAttribute('data-step'), 10);
        answers[key] = v;
        track(n + '_' + key, { answer: v });
        // An answer that doesn't qualify ends the survey on a polite screen.
        if (opt.hasAttribute('data-dq-h')) {
          dqFrom = el.getAttribute('data-step'); track('disqualified_' + key, { answer: v });
          $('gDqH').innerHTML = opt.getAttribute('data-dq-h');
          $('gDqP').innerHTML = opt.getAttribute('data-dq-p');
          setTimeout(function () { go('dq', 'next'); }, 180);
          return;
        }
        setTimeout(function () { go(String(n + 1), 'next'); }, 180);
      });
    });
  });

  $('gBack').addEventListener('click', function () {
    var n = parseInt(current, 10);
    if (n > 1) go(String(n - 1), 'prev');
  });
  $('gDqBack').addEventListener('click', function () { go(dqFrom, 'prev'); });

  // Step 4: service area.
  function areaNext() {
    var el = $('gArea');
    if (!el.value.trim()) { el.classList.add('err'); el.focus(); return; }
    track('4_area');
    go('5', 'next'); track('reached_details');
  }
  $('gAreaNext').addEventListener('click', areaNext);
  $('gArea').addEventListener('input', function () { this.classList.remove('err'); });
  $('gArea').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); areaNext(); } });

  document.querySelectorAll('[data-apply]').forEach(function (a) {
    a.addEventListener('click', function () { track('cta_click', { where: a.getAttribute('data-apply') }); });
  });

  // Step 5: contact details and send.
  var msg = $('gMsg'), btn = $('gSend');
  var fields = ['gName', 'gCompany', 'gEmail', 'gPhone'];
  fields.forEach(function (id) {
    $(id).addEventListener('input', function () { this.classList.remove('err'); track('details_started'); });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (current !== '5') return;
    track('submit_click');
    var labels = { gName: 'your name', gCompany: 'your business name', gEmail: 'your email', gPhone: 'your phone number' };
    var missing = [];
    fields.forEach(function (id) { var el = $(id); if (!el.value.trim()) { missing.push(labels[id]); el.classList.add('err'); } });
    if (!$('gConsent').checked) missing.push('your consent');
    var say = '';
    if (missing.length) say = 'Add ' + missing.slice(0, -1).join(', ') + (missing.length > 1 ? ' and ' : '') + missing[missing.length - 1] + ' to continue.';
    else if (!EMAIL_RE.test($('gEmail').value.trim())) { say = 'Enter a valid email to continue.'; $('gEmail').classList.add('err'); }
    else if (!phoneOk($('gPhone').value.trim())) { say = 'Enter an Australian phone number to continue.'; $('gPhone').classList.add('err'); }
    else if (!token) say = 'One moment, the security check is still finishing. Try again in a second.';
    if (say) { msg.textContent = say; track('submit_blocked', { reason: say.slice(0, 90) }); return; }

    msg.textContent = ''; btn.disabled = true; btn.textContent = 'Sending...';
    var d = {
      name: $('gName').value.trim(), company: $('gCompany').value.trim(), email: $('gEmail').value.trim(),
      phone: $('gPhone').value.trim(), postcode: $('gArea').value.trim(),
      niche: G.niche || '', goal: 'Guarantee page: ' + (G.offer || ''),
      installs: answers.volume, budget: answers.budget, lead_source: answers.lead_source,
      source: G.source || 'guarantee-page', turnstile_token: token
    };
    fetch(SUPABASE_URL + '/functions/v1/callback-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d)
    }).then(function (r) {
      if (!r.ok) throw new Error('bad response');
      track('submitted');
      form.style.display = 'none';
      $('gSurvey').querySelector('.gs-top').hidden = true;
      $('gSurvey').querySelector('.gs-bar').hidden = true;
      $('gDone').classList.add('on');
      try { if (window.fbq) fbq('track', 'Lead'); if (window.gtag) gtag('event', 'generate_lead'); } catch (e) {}
    }).catch(function () {
      track('submit_error');
      btn.disabled = false; btn.textContent = 'See if you qualify';
      token = ''; try { if (window.turnstile) turnstile.reset('#ts'); } catch (_) {}
      msg.textContent = 'That did not send. Email contact@quoteleads.com.au and we will call you straight back.';
    });
  });

  paintTop('1');
})();
