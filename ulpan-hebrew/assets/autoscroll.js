/* LAST page of the old GitHub Pages site. Served for every path, by the service worker and by
   404.html, so it must not depend on any relative resource. It sends the visitor to the same page
   on the new origin, and carries the learning data with it: localStorage does not cross origins,
   so the keys travel in the URL fragment to https://ulpan-hebrew.pages.dev/migrate (migrate.html), which copies them. */
(function () {
  var NEW_ORIGIN = 'https://ulpan-hebrew.pages.dev';
  var BASE = '/ulpan-hebrew/';              // "/ulpan-hebrew/"
  var MAX_FRAGMENT = 1500000;

  var p = location.pathname;
  var rel = p.indexOf(BASE) === 0 ? p.slice(BASE.length) : (p + '/' === BASE ? '' : p.replace(/^\//, ''));
  var to = '/' + rel + location.search;

  var data = {};
  try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); data[k] = localStorage.getItem(k); } } catch (e) {}

  var frag = '';
  try {
    var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (b64.length <= MAX_FRAGMENT && Object.keys(data).length) frag = '#d=' + b64;
  } catch (e) {}

  location.replace(NEW_ORIGIN + '/migrate?to=' + encodeURIComponent(to) + frag);
})();
