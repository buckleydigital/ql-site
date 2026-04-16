/* nav-auth.js – Swap "Sign In" → first name / "Dashboard" for logged-in buyers.
   Reads the Supabase auth token from localStorage synchronously so the nav
   renders in the correct state immediately, with no flash. */
(function () {
  try {
    var raw = localStorage.getItem('sb-wmegoygrancfwxagqskh-auth-token');
    if (!raw) return;
    var data = JSON.parse(raw);
    if (!data || !data.user) return;
    var user = data.user;
    if (!(user.app_metadata && user.app_metadata.account_type === 'lead_buyer')) return;
    var label = (user.user_metadata && user.user_metadata.first_name) || 'Dashboard';
    var btn = document.querySelector('.nav-signin');
    if (btn) { btn.href = '/buyer-dashboard'; btn.textContent = label; }
    var mob = document.getElementById('mobMenu');
    if (mob) {
      var links = mob.querySelectorAll('a[href="/sign-in"]');
      for (var i = 0; i < links.length; i++) {
        links[i].href = '/buyer-dashboard';
        links[i].textContent = label;
      }
    }
  } catch (e) { /* localStorage unavailable or bad token – fall through to Sign In */ }
})();
