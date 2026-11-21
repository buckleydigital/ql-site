// Click-through funnel examples. Any survey mockup marked data-demo="<trade>"
// becomes a working example of that trade's survey: tap an answer and the next
// question slides in, with the same branching as the live funnels (solar is a
// copy of the es-funnels survey). The contact step at the end is locked: it's
// an example, so nothing can be typed in or sent.
//
// Works with both mockup styles on the site: .mk-survey (examples.css) and
// .fx-survey (funnel-example.css). The static markup inside the element is
// the no-JS fallback and is replaced on load.
//
// Pages with a trade switcher call FunnelDemo.set(surveyEl, trade).
(function () {
  'use strict';

  var OWN = { k: 'Your property', h: 'Do you own the property?', dq: 'Renting',
    o: [['Own outright', 'Yes, I own it'], ['Mortgaged', "I'm buying / mortgaged"], ['Renting', 'No, I rent']] };
  function when(k, v) { return function (q) { return function (A) { return A[k] === v && (!q || q(A)); }; }; }
  var hasSolar = when('has_solar', 'Yes')();

  var SOLAR_Q = {
    interest: { k: "Let's get started", h: 'What are you interested in?',
      o: [['Solar', 'Solar panels'], ['Battery', 'Battery storage'], ['Solar + Battery', 'Solar + battery'], ['Not sure', "Not sure yet, I'd like advice"]] },
    has_solar: { k: 'Your current setup', h: 'Do you currently have solar panels?', o: [['Yes', 'Yes, I have solar'], ['No', 'No, not yet']] },
    solar_age: { k: 'Your current setup', h: 'About how old is your solar system?', when: hasSolar,
      o: [['Under 5 years', 'Under 5 years'], ['5 to 10 years', '5 to 10 years'], ['10 to 15 years', '10 to 15 years'], ['Over 15 years', 'Over 15 years'], ['Not sure', 'Not sure']] },
    fit_known: { k: 'Your current setup', h: "Do you know what feed-in tariff you're getting?", help: "It's the rate your retailer pays for power you send to the grid.", when: hasSolar,
      o: [['Yes', 'Yes, I know it'], ['No', 'No / not sure']] },
    fit_rate: { k: 'Your current setup', h: "What's your feed-in tariff?", help: 'Optional. A rough number is fine.', when: when('fit_known', 'Yes')(hasSolar),
      text: { label: 'Feed-in tariff', ph: 'e.g. 5c per kWh' } },
    has_battery: { k: 'Your current setup', h: 'Do you currently have a battery?', o: [['Yes', 'Yes'], ['No', 'No']] },
    bill_range: { k: 'Your power bill', h: "What's your average quarterly electricity bill?",
      o: [['Under $300', 'Under $300', 'under $100/mo'], ['$300 to $600', '$300 to $600', '$100–200/mo'], ['$600 to $1,000', '$600 to $1,000', '$200–330/mo'], ['Over $1,000', 'Over $1,000', 'over $330/mo']] },
    ownership: OWN,
    timeframe: { k: 'Almost done', h: 'When are you looking to go ahead?',
      o: [['ASAP', 'As soon as possible'], ['1 to 3 months', 'Within 1 to 3 months'], ['3 to 6 months', '3 to 6 months'], ['Researching', 'Just researching for now']] }
  };
  var SITE_VISIT = {
    contactH: 'Great news, you qualify for a free site visit. Where should we reach you?',
    cta: 'Book My Free Site Visit', goal: 'your free site visit is next',
    upload: ', can upload their power bill', uploadField: 'Upload your latest bill (optional)',
    renter: 'Free site visits are for homeowners. Renters are screened out here, so they never reach your phone.'
  };
  var QUOTE = {
    contactH: "Great, you're all set for a free quote. Where should we send it?",
    cta: 'Get My Free Quote', goal: 'your quote is next', upload: '', uploadField: '',
    renter: 'Quotes are for homeowners. Renters are screened out here, so they never reach your phone.'
  };
  function ext(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }

  var FUNNELS = {
    solar: ext(SITE_VISIT, { q: SOLAR_Q,
      order: ['interest', 'has_solar', 'solar_age', 'fit_known', 'fit_rate', 'has_battery', 'bill_range', 'ownership', 'timeframe'] }),
    // Battery retrofit: the solar survey without "What are you interested in?"
    battery: ext(SITE_VISIT, { q: SOLAR_Q,
      order: ['has_solar', 'solar_age', 'fit_known', 'fit_rate', 'has_battery', 'bill_range', 'ownership', 'timeframe'] }),
    hvac: ext(QUOTE, {
      order: ['need', 'install', 'zones', 'ductwork', 'ownership', 'timeframe'],
      q: {
        need: { k: "Let's get started", h: 'What do you need?',
          o: [['Split system', 'Split system', 'one or two rooms'], ['Ducted', 'Ducted', 'the whole home'], ['Replace existing', 'Replace existing', 'an old system'], ['Not sure', 'Not sure', "we'll advise"]] },
        install: { k: 'The job', h: 'Is this a new install or replacing an old system?', o: [['New install', 'New install'], ['Replacing', 'Replacing an old system']] },
        zones: { k: 'Your home', h: 'How many rooms or zones?', o: [['1 room', '1 room'], ['2 to 3', '2 to 3 rooms'], ['4 to 5', '4 to 5 rooms'], ['Whole home', 'Whole home (6+)']] },
        ductwork: { k: 'Your home', h: 'Is there existing ductwork?', when: when('need', 'Ducted')(), o: [['Yes', 'Yes'], ['No', 'No'], ['Not sure', 'Not sure']] },
        ownership: OWN,
        timeframe: { k: 'Almost done', h: 'When do you want it installed?',
          o: [['ASAP', 'As soon as possible'], ['Within a month', 'Within a month'], ['1 to 3 months', '1 to 3 months'], ['Researching', 'Just researching for now']] }
      } }),
    bathroom: ext(QUOTE, {
      order: ['what', 'count', 'layout', 'budget', 'ownership', 'timeframe'],
      q: {
        what: { k: "Let's get started", h: 'What are you renovating?',
          o: [['Full bathroom', 'Full bathroom'], ['Ensuite', 'Ensuite'], ['Partial update', 'Partial update'], ['Bathroom + laundry', 'Bathroom + laundry']] },
        count: { k: 'The job', h: 'How many bathrooms?', o: [['1', '1 bathroom'], ['2', '2 bathrooms'], ['3+', '3 or more']] },
        layout: { k: 'The job', h: 'Is the layout changing?',
          o: [['Same layout', 'Keeping the same layout'], ['Moving fixtures', 'Moving the shower, toilet or vanity'], ['Not sure', 'Not sure yet']] },
        budget: { k: 'Your budget', h: "What's your budget?", o: [['Under $15k', 'Under $15k'], ['$15k to $25k', '$15k to $25k'], ['$25k to $40k', '$25k to $40k'], ['$40k+', '$40k+']] },
        ownership: OWN,
        timeframe: { k: 'Almost done', h: 'When do you want to start?',
          o: [['ASAP', 'As soon as possible'], ['1 to 3 months', 'Within 1 to 3 months'], ['3 to 6 months', '3 to 6 months'], ['Researching', 'Just researching for now']] }
      } }),
    roofing: ext(QUOTE, {
      contactH: 'Great, you qualify for a free roof inspection. Where should we reach you?',
      cta: 'Book My Free Inspection', upload: ', can upload photos of the roof', uploadField: 'Upload photos of your roof (optional)',
      order: ['need', 'material', 'leaking', 'age', 'storeys', 'ownership', 'timeframe'],
      q: {
        need: { k: "Let's get started", h: 'What does your roof need?',
          o: [['Leak repair', 'Leak repair', 'fix it fast'], ['Restoration', 'Restoration', 'clean, repair, recoat'], ['Replacement', 'Replacement', 'incl. tile to metal'], ['Not sure', 'Not sure', 'we inspect it free']] },
        material: { k: 'Your roof', h: "What's your roof made of?", o: [['Concrete tile', 'Concrete tile'], ['Terracotta tile', 'Terracotta tile'], ['Metal', 'Metal (Colorbond)'], ['Not sure', 'Not sure']] },
        leaking: { k: 'Your roof', h: 'Is it leaking right now?', o: [['Yes', 'Yes, actively'], ['Heavy rain', 'Only in heavy rain'], ['No', 'No']] },
        age: { k: 'Your roof', h: 'Roughly how old is the roof?', o: [['Under 15 years', 'Under 15 years'], ['15 to 30 years', '15 to 30 years'], ['Over 30 years', 'Over 30 years'], ['Not sure', 'Not sure']] },
        storeys: { k: 'Your home', h: 'How many storeys is the home?', o: [['Single', 'Single storey'], ['Double', 'Double storey'], ['Three+', 'Three or more']] },
        ownership: OWN,
        timeframe: { k: 'Almost done', h: 'When do you want it done?',
          o: [['ASAP', 'As soon as possible'], ['Within 4 weeks', 'Within 4 weeks'], ['1 to 3 months', '1 to 3 months'], ['Researching', 'Just researching for now']] }
      } }),
    reno: ext(QUOTE, {
      order: ['what', 'size', 'layout', 'built', 'budget', 'ownership', 'timeframe'],
      q: {
        what: { k: "Let's get started", h: 'What are you renovating?',
          o: [['Bathroom', 'Bathroom', 'full or partial'], ['Kitchen', 'Kitchen', 'layout or refresh'], ['Laundry', 'Laundry', 'including tiling'], ['Whole home', 'Whole home', 'several rooms']] },
        size: { k: 'The job', h: 'How big is the job?', o: [['Full renovation', 'Full renovation'], ['Partial update', 'Partial update'], ['Not sure', 'Not sure yet']] },
        layout: { k: 'The job', h: 'Is the layout changing?', o: [['Same layout', 'Keeping the layout'], ['Moving things', 'Moving things around'], ['Not sure', 'Not sure']] },
        built: { k: 'Your home', h: 'Roughly when was it built?', o: [['Before 1980', 'Before 1980'], ['1980 to 2000', '1980 to 2000'], ['After 2000', 'After 2000'], ['Not sure', 'Not sure']] },
        budget: { k: 'Your budget', h: "What's your budget?", o: [['Under $20k', 'Under $20k'], ['$20k to $40k', '$20k to $40k'], ['$40k to $80k', '$40k to $80k'], ['$80k+', '$80k+']] },
        ownership: OWN,
        timeframe: { k: 'Almost done', h: 'When do you want to start?',
          o: [['ASAP', 'As soon as possible'], ['1 to 3 months', 'Within 1 to 3 months'], ['3 to 6 months', '3 to 6 months'], ['Researching', 'Just researching for now']] }
      } })
  };
  FUNNELS.renovation = FUNNELS.renovations = FUNNELS.reno;

  // The two mockup styles: class names and option markup.
  var CHECK = '<div class="mk-opt-check"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>';
  var SKINS = {
    mk: { head: 'mk-survey-head', step: 'mk-survey-step', bar: 'mk-survey-bar', fill: 'mk-survey-fill', q: 'mk-survey-q',
      opts: 'mk-survey-opts', opt: 'mk-opt', on: 'selected', cont: 'mk-survey-continue', motive: 'ml-motive',
      optHtml: function (l, s) { return CHECK + '<div class="mk-opt-lbl">' + l + '</div>' + (s ? '<div class="ml-sub">' + s + '</div>' : ''); } },
    fx: { head: 'fx-sv-head', step: 'fx-sv-step', bar: 'fx-sv-bar', fill: 'fx-sv-fill', q: 'fx-sv-q',
      opts: 'fx-opts', opt: 'fx-opt', on: 'on', cont: 'fx-go', motive: 'fx-motive',
      optHtml: function (l, s) { return '<b>' + l + '</b>' + (s ? '<span>' + s + '</span>' : ''); } }
  };
  var ARROW = '<svg viewBox="0 0 16 16" class="fxd-arr"><path d="M2 8h12M9 4l4 4-4 4"/></svg>';

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function Demo(root) {
    var self = this;
    this.root = root;
    this.S = root.classList.contains('fx-survey') ? SKINS.fx : SKINS.mk;
    var S = this.S;
    root.classList.add('fxd');
    root.setAttribute('aria-label', 'Interactive example of the survey funnel. Tap through it.');
    root.innerHTML =
      '<div class="' + S.head + '"><span class="' + S.step + '" data-r="step"></span><button type="button" class="fxd-back" data-r="back" hidden>&larr; Back</button></div>' +
      '<div class="' + S.bar + '"><div class="' + S.fill + '" data-r="fill"></div></div>' +
      '<div class="fxd-body" data-r="body" aria-live="polite"></div>' +
      '<div class="' + S.motive + '" data-r="motive"></div>';
    function r(n) { return root.querySelector('[data-r="' + n + '"]'); }
    this.el = { step: r('step'), back: r('back'), fill: r('fill'), body: r('body'), motive: r('motive') };
    this.lock = false;

    this.el.body.addEventListener('click', function (e) { self.click(e); });
    this.el.body.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.matches('[data-r="text"]')) { e.preventDefault(); var c = self.el.body.querySelector('[data-cont]'); if (c) c.click(); }
    });
    this.el.back.addEventListener('click', function () { self.back(); });

    // Never let the mockup's hero scroll sideways (it clips a wide glow).
    var hero = root.closest('.mk-hero, .fx-hero');
    if (hero) hero.addEventListener('scroll', function () { if (hero.scrollLeft) hero.scrollLeft = 0; });

    this.hint();
    this.set(root.getAttribute('data-demo'));
  }

  Demo.prototype.set = function (trade) {
    this.F = FUNNELS[trade] || FUNNELS.solar;
    this.A = {}; this.hist = []; this.cur = this.F.order[0];
    this.render();
  };
  Demo.prototype.active = function (id) { var q = this.F.q[id]; return !!q && (!q.when || q.when(this.A)); };
  Demo.prototype.path = function () {
    var self = this;
    return this.F.order.filter(function (id) { return self.active(id); }).concat(['contact']);
  };
  Demo.prototype.nextOf = function (id) {
    var q = this.F.q[id];
    if (q && q.dq && this.A[id] === q.dq) return 'renter';
    var o = this.F.order, i = o.indexOf(id) + 1;
    for (; i < o.length; i++) if (this.active(o[i])) return o[i];
    return 'contact';
  };
  Demo.prototype.go = function (to) { this.hist.push(this.cur); this.cur = to; this.render(); };
  Demo.prototype.back = function () { if (this.lock || !this.hist.length) return; this.cur = this.hist.pop(); this.render(); };

  Demo.prototype.click = function (e) {
    var b = e.target.closest('button'), self = this, A = this.A;
    if (!b || this.lock || b.disabled) return;
    if (b.hasAttribute('data-v')) {
      A[this.cur] = b.getAttribute('data-v');
      // Changing an earlier answer drops the follow-ups that no longer apply.
      this.F.order.forEach(function (id) { if (!self.active(id)) delete A[id]; });
      this.el.body.querySelectorAll('.' + this.S.opt).forEach(function (o) {
        var on = o === b; o.classList.toggle(self.S.on, on); o.setAttribute('aria-pressed', on);
      });
      this.lock = true;
      setTimeout(function () { self.lock = false; self.go(self.nextOf(self.cur)); }, 300);
    } else if (b.hasAttribute('data-cont')) {
      var t = this.el.body.querySelector('[data-r="text"]');
      A[this.cur] = t ? t.value.trim().slice(0, 40) : '';
      this.go(this.nextOf(this.cur));
    } else if (b.hasAttribute('data-skip')) {
      A[this.cur] = ''; this.go(this.nextOf(this.cur));
    } else if (b.hasAttribute('data-back')) {
      this.back();
    } else if (b.hasAttribute('data-again')) {
      this.set(this.root.getAttribute('data-demo'));
    }
  };

  Demo.prototype.render = function () {
    var S = this.S, F = this.F, A = this.A, cur = this.cur, el = this.el;
    var p = this.path(), pos = p.indexOf(cur) + 1, total = p.length - 1, q = F.q[cur], h = '';
    var renter = cur === 'renter';
    el.fill.style.width = renter ? '100%' : Math.max(6, Math.round((pos - 1) / p.length * 100)) + '%';
    el.step.textContent = renter ? 'Done' : (cur === 'contact' ? 'Last step' : 'Question ' + pos + ' of ' + total);
    el.back.hidden = this.hist.length === 0;
    var Q = function (t) { return '<div class="' + S.q + '">' + t + '</div>'; };
    var cont = function (attr, label) { return '<button type="button" class="' + S.cont + '" ' + attr + '>' + label + '</button>'; };

    if (q && q.text) {
      h = '<div class="fxd-kick">' + q.k + '</div>' + Q(q.h) + '<div class="fxd-help">' + q.help + '</div>' +
        '<label class="fxd-help fxd-lbl">' + q.text.label + '<input class="fxd-in" data-r="text" type="text" maxlength="40" placeholder="' + q.text.ph + '" value="' + esc(A[cur] || '') + '"></label>' +
        '<div class="fxd-row"><button type="button" class="fxd-skip" data-skip>Skip</button>' + cont('data-cont', 'Continue ' + ARROW) + '</div>';
    } else if (q) {
      h = '<div class="fxd-kick">' + q.k + '</div>' + Q(q.h) + (q.help ? '<div class="fxd-help">' + q.help + '</div>' : '') +
        '<div class="' + S.opts + '">' + q.o.map(function (o) {
          var sel = A[cur] === o[0];
          return '<button type="button" class="' + S.opt + (sel ? ' ' + S.on : '') + '" data-v="' + esc(o[0]) + '" aria-pressed="' + sel + '">' + S.optHtml(o[1], o[2]) + '</button>';
        }).join('') + '</div>';
    } else if (cur === 'contact') {
      h = '<div class="fxd-kick">Last step</div>' + Q(F.contactH) +
        '<div class="fxd-lock"><div class="fxd-fields" aria-hidden="true">' +
          '<span class="fxd-in full">Full name</span><span class="fxd-in">Mobile</span><span class="fxd-in">Email</span>' +
          '<span class="fxd-in">Suburb</span><span class="fxd-in">Postcode</span>' + (F.uploadField ? '<span class="fxd-in full">' + F.uploadField + '</span>' : '') +
        '</div><div class="fxd-note"><b>This is just an example</b><span>On your funnel, this is where the homeowner leaves their name, mobile, email, suburb and postcode' + F.upload + ', and the lead lands with you.</span></div></div>' +
        '<div class="fxd-row">' + cont('disabled aria-disabled="true"', F.cta) + '</div>' +
        '<div class="fxd-center"><button type="button" class="fxd-again" data-again>Start the example again</button></div>';
    } else if (renter) {
      h = '<div class="fxd-end">' + Q('Thanks for your interest!') + '<p>' + F.renter + '</p><button type="button" class="fxd-again" data-back>Picked the wrong option? Go back</button></div>';
    }
    el.body.innerHTML = '<div class="fxd-pane">' + h + '</div>';
    var left = total - pos + 1;
    el.motive.textContent = (cur === F.order[0] && !this.hist.length) ? 'Try it: tap an answer' :
      renter ? 'Example only, nothing is sent' :
      cur === 'contact' ? 'Example only, nothing can be entered or sent' :
      (left <= 1 ? 'Last question · ' : left + ' questions left · ') + F.goal;
  };

  // "Test it out" arrow. Beside the mockup when there's empty space to its
  // left; otherwise a tab on the survey card's top edge.
  Demo.prototype.hint = function () {
    var root = this.root, mock = root.closest('.mk-mockup, .fx-site');
    if (!mock) return;
    var wrap = document.createElement('div');
    wrap.className = 'fxd-wrap';
    mock.parentNode.insertBefore(wrap, mock);
    wrap.appendChild(mock);
    var hint = document.createElement('div');
    hint.className = 'fxd-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.innerHTML = '<span class="fxd-txt">Test it out<small>Tap through the real survey</small></span>' +
      '<svg class="fxd-a-side" viewBox="0 0 56 34"><path d="M3 4c10 18 26 24 46 22"/><path d="M42 19l8 7-9 6"/></svg>' +
      '<svg class="fxd-a-down" viewBox="0 0 12 12"><path d="M6 1v9M2 6.5 6 10.5 10 6.5"/></svg>';
    wrap.appendChild(hint);
    var side = null;
    function emptyLeft(wr) {
      var y = Math.min(Math.max(wr.top + wr.height / 2, 80), innerHeight - 80);
      if (y < wr.top || y > wr.bottom) return null;           // can't tell from here
      for (var x = wr.left - 20; x >= wr.left - 200; x -= 60) {
        var e = document.elementFromPoint(x, y);
        if (e && !e.contains(wrap)) return false;              // other content there
      }
      return true;
    }
    function place() {
      var wr = wrap.getBoundingClientRect(), sv = root.getBoundingClientRect();
      if (!wr.width) return;
      if (wr.left < 230) side = false;
      else { var e = emptyLeft(wr); if (e !== null) side = e; else if (side === null) return; }
      hint.classList.toggle('side', side);
      hint.classList.toggle('tab', !side);
      if (side) { hint.style.left = ''; hint.style.top = (sv.top - wr.top + 28) + 'px'; }
      else { hint.style.left = (sv.left - wr.left + sv.width / 2) + 'px'; hint.style.top = (sv.top - wr.top - hint.offsetHeight / 2) + 'px'; }
      hint.classList.add('on');
    }
    this.place = place;
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { if (es[0].isIntersecting) place(); }, { threshold: [0, 0.25, 0.5, 1] }).observe(wrap);
    if (window.ResizeObserver) new ResizeObserver(place).observe(wrap);
    window.addEventListener('resize', place);
    window.addEventListener('load', place);
    place();
  };

  var demos = [];
  function init() {
    document.querySelectorAll('[data-demo]').forEach(function (el) { if (!el._fxd) { el._fxd = new Demo(el); demos.push(el._fxd); } });
  }
  window.FunnelDemo = {
    set: function (el, trade) {
      if (!el || !el._fxd) return;
      el.setAttribute('data-demo', trade);
      el._fxd.set(trade);
      if (el._fxd.place) el._fxd.place();
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
