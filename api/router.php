<?php
// Development router for PHP's built-in web server.
// Usage (from the repo root): php -S 127.0.0.1:8099 api/router.php
// (On cPanel/Apache, api/.htaccess rewrites /api/<route> to index.php?route=<route>.)
//
// Translates clean /api/<route> paths into the ?route= query parameter that
// index.php dispatches on. Everything — including direct requests for
// api/config.php — is routed through index.php, so no source or config file
// is ever served raw.
$_SERVER['SCRIPT_NAME'] = '/api/index.php';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
if (!isset($_GET['route']) || $_GET['route'] === '') {
    $prefix = '/api/';
    if (str_starts_with($path, $prefix)) {
        $_GET['route'] = substr($path, strlen($prefix));
        $_REQUEST['route'] = $_GET['route'];
    }
}
require __DIR__ . '/index.php';
