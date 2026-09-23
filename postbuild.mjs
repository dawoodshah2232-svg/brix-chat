// Post-build: GitHub Pages SPA fallback.
// Copies dist/index.html -> dist/404.html and injects the redirect script
// (rafrex/spa-github-pages pattern). Clean URLs survive refresh.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

copyFileSync('dist/index.html', 'dist/404.html');

let html = readFileSync('dist/404.html', 'utf8');

const redirect = `<script>
(function () {
  // Keep 1 path segment (/brix-chat) then encode the rest into ?/
  var pathSegmentsToKeep = 1;
  var l = window.location;
  l.replace(
    l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
    l.pathname.split('/').slice(0, 1 + pathSegmentsToKeep).join('/') + '/?/' +
    l.pathname.slice(1).split('/').slice(pathSegmentsToKeep).join('/').replace(/&/g, '~and~') +
    (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
    l.hash
  );
})();
</script>`;

if (!html.includes('spa-github-pages-404')) {
  html = html.replace('</head>', '<!-- spa-github-pages-404 -->' + redirect + '</head>');
}

writeFileSync('dist/404.html', html);
console.log('postbuild: dist/404.html SPA fallback written');
