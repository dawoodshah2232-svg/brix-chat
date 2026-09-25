<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class LegacyApiController extends Controller
{
    public function __invoke(Request $request, ?string $route = null): never
    {
        $_GET['route'] = trim((string) ($route ?? ''), '/');
        $_REQUEST['route'] = $_GET['route'];
        $_SERVER['REQUEST_METHOD'] = $request->getMethod();
        $_SERVER['HTTP_AUTHORIZATION'] = $request->header('Authorization', '');
        $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] = $request->header('Authorization', '');

        require base_path('legacy/index.php');
        exit;
    }
}
