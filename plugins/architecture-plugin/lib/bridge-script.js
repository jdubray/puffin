/**
 * bridge-script - JavaScript injected into an archify page before it is shown
 * in the Architecture tab's sandboxed iframe.
 *
 * It turns clicks on repository source links into messages for the host
 * (`archlens:open`), sends every other external link out as `archlens:external`,
 * and applies a theme when the host asks (`archlens:theme`). Nothing else in the
 * page is touched.
 */

const BRIDGE_MARKER = 'data-puffin-archlens-bridge'

/**
 * Build the bridge script for a page.
 * @param {Object} options
 * @param {string} [options.repositoryUrl] - `system.repository.url`, used to recognise source links
 * @returns {string} A `<script>` element
 */
function buildBridgeScript({ repositoryUrl } = {}) {
  const repoJson = JSON.stringify(repositoryUrl || '')
  return `<script ${BRIDGE_MARKER}="1">(function () {
  var REPO = ${repoJson};
  function send(msg) { try { window.parent.postMessage(msg, '*'); } catch (e) {} }
  function sourceRef(href) {
    // GitHub-style blob URL: <repo>/blob/<rev>/<path>#L<n>
    var m = href.match(/\\/blob\\/[^/]+\\/([^#?]+)(?:#L(\\d+))?/);
    if (m && (!REPO || href.indexOf(REPO) === 0)) return { path: decodeURIComponent(m[1]), line: m[2] ? parseInt(m[2], 10) : null };
    // Relative repository path (no scheme)
    if (!/^[a-z]+:/i.test(href) && !href.startsWith('#')) {
      var parts = href.split('#');
      var lm = (parts[1] || '').match(/^L(\\d+)/);
      return { path: parts[0], line: lm ? parseInt(lm[1], 10) : null };
    }
    return null;
  }
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    var ref = sourceRef(href);
    ev.preventDefault();
    ev.stopPropagation();
    if (ref) send({ type: 'archlens:open', path: ref.path, line: ref.line, href: href });
    else send({ type: 'archlens:external', url: href });
  }, true);
  window.addEventListener('message', function (ev) {
    var d = ev && ev.data;
    if (!d || d.type !== 'archlens:theme') return;
    var theme = d.theme === 'light' ? 'light' : 'dark';
    try { document.documentElement.setAttribute('data-theme', theme); } catch (e) {}
    try { localStorage.setItem('archify-theme', theme); } catch (e) {}
  });
  send({ type: 'archlens:ready' });
})();</script>`
}

/**
 * Inject the bridge into a page (idempotent).
 * @param {string} html
 * @param {Object} [options] - See {@link buildBridgeScript}
 * @returns {string}
 */
function injectBridge(html, options) {
  const src = String(html || '')
  if (src.includes(BRIDGE_MARKER)) return src
  const script = buildBridgeScript(options)
  const idx = src.lastIndexOf('</body>')
  return idx >= 0 ? src.slice(0, idx) + script + src.slice(idx) : src + script
}

module.exports = { buildBridgeScript, injectBridge, BRIDGE_MARKER }
