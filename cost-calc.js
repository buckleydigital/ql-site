// "What bad leads cost you now" on the trade pages.
//
// Put <div class="cost-calc" data-rivals="other roofers" data-trade="Roofing"></div>
// where it should appear. data-rivals finishes "Jobs lost to …", data-trade is
// the /get-started trade the button preselects.
//
// The visitor enters their own cost per lead and profit per job; until they
// do, those lines and the total ask for them instead of showing a number we
// made up. Leads a month (30) and share that go nowhere (50%) start filled in
// because they're generic and obviously theirs to change. The three
// assumptions behind time and lost jobs sit under "How we worked this out".
(function(){
  var hosts = document.querySelectorAll('.cost-calc');
  if (!hosts.length) return;
  var aud = function(v){ return '$' + Math.round(v).toLocaleString('en-AU'); };
  var n = 0;
  hosts.forEach(function(host){
    var k = 'cc' + (n++) + '-';
    var rivals = host.dataset.rivals || 'other businesses';
    var trade = host.dataset.trade || '';
    var field = function(id, label, val, ph, unit, side){
      return '<div class="cc-in" data-f="' + id + '"><label for="' + k + id + '">' + label + '</label>' +
        '<div class="cc-box' + (unit ? ' ' + side : '') + '">' + (unit && side === 'pre' ? '<span class="u">' + unit + '</span>' : '') +
        '<input id="' + k + id + '" type="number" inputmode="decimal" min="0" value="' + val + '" placeholder="' + ph + '">' +
        (unit && side === 'suf' ? '<span class="u">' + unit + '</span>' : '') + '</div></div>';
    };
    host.innerHTML =
      '<div class="cc">' +
        '<div class="cc-grid">' +
          field('leads', 'Leads you get a month', '30', '', '', '') +
          field('price', 'What each lead costs you', '', 'e.g. 60', '$', 'pre') +
          field('dead', 'How many go nowhere', '50', '', '%', 'suf') +
          field('profit', 'Profit on an average job', '', 'e.g. 3000', '$', 'pre') +
        '</div>' +
        '<div class="cc-total" aria-live="polite"><small>Bad leads are costing you about</small><b data-o="total">$0</b><span data-o="per">a year</span></div>' +
        '<div class="cc-lines">' +
          '<div class="cc-line"><span>Spent on leads that go nowhere</span><b data-o="waste"></b></div>' +
          '<div class="cc-line"><span>Your time chasing them</span><b data-o="time"></b></div>' +
          '<div class="cc-line"><span>Jobs lost to ' + rivals + '</span><b data-o="lost"></b></div>' +
        '</div>' +
        '<details class="cc-how"><summary>How we worked this out</summary><div class="cc-how-b">' +
          '<p class="f">Leads that go nowhere × what each costs × 12</p>' +
          '<p class="f">Leads that go nowhere × minutes chasing each × your hourly rate × 12</p>' +
          '<p class="f">Real leads × close rate you lose to ' + rivals + ' × profit per job × 12</p>' +
          '<p>The last two use these. Change them to match you:</p>' +
          '<div class="cc-grid">' +
            field('mins', 'Minutes chasing each dead lead', '30', '', '', '') +
            field('rate', 'What an hour of your time is worth', '100', '', '$', 'pre') +
            field('lift', 'Close rate lost to competition', '3', '', '%', 'suf') +
          '</div>' +
          '<p>Close rate lost is the share of real leads that would have become your job if you weren\'t one of several businesses calling. 3 percentage points is a deliberately low starting point. Set it to 0 if you only buy exclusive leads.</p>' +
        '</div></details>' +
        '<div class="cc-foot"><p class="cc-note">An estimate from the numbers you entered, not a promise of what you\'ll get back.</p>' +
          '<a class="btn-mag" href="/get-started' + (trade ? '?trade=' + encodeURIComponent(trade) : '') + '">Book a call <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0L6.6 1.4 12.2 7H0v2h12.2l-5.6 5.6L8 16l8-8z"/></svg></a></div>' +
      '</div>';

    var get = function(id){ var v = parseFloat(host.querySelector('#' + k + id).value); return isFinite(v) && v > 0 ? v : 0; };
    var has = function(id){ return host.querySelector('#' + k + id).value.trim() !== ''; };
    var out = function(o){ return host.querySelector('[data-o="' + o + '"]'); };
    var set = function(o, v, ask){ var el = out(o); if (ask) { el.textContent = ask; el.className = 'dim'; } else { el.textContent = aud(v); el.className = ''; } };
    function calc(){
      var leads = get('leads'), dead = Math.min(get('dead'), 100) / 100;
      var deadLeads = leads * dead, real = leads - deadLeads;
      var hasPrice = has('price'), hasProfit = has('profit');
      var waste = deadLeads * get('price') * 12;
      var time = deadLeads * (get('mins') / 60) * get('rate') * 12;
      var lost = real * (Math.min(get('lift'), 100) / 100) * get('profit') * 12;
      set('waste', waste, hasPrice ? '' : 'Add your cost per lead');
      set('time', time, '');
      set('lost', lost, hasProfit ? '' : 'Add your profit per job');
      host.querySelector('[data-f="price"]').classList.toggle('need', !hasPrice);
      host.querySelector('[data-f="profit"]').classList.toggle('need', !hasProfit);
      var t = out('total'), per = out('per');
      if (!hasPrice || !hasProfit) {
        t.textContent = 'Add your cost per lead and profit per job'; t.className = 'empty';
        per.textContent = hasPrice || hasProfit ? 'So far: ' + aud(waste + time + lost) + ' a year' : '';
      } else { t.textContent = aud(waste + time + lost); t.className = ''; per.textContent = 'a year'; }
    }
    host.querySelectorAll('input').forEach(function(i){ i.addEventListener('input', calc); });
    calc();
  });
})();
