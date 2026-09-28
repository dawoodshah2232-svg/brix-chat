<?php

namespace App\Http\Controllers\Workspace;

use App\Support\Api\Activity;
use App\Support\Api\Catalog;
use App\Support\Api\Input;
use App\Support\Api\Json;
use App\Support\Api\Serialize;
use App\Support\Api\Sql;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Websites (properties), their widget config and merged settings/branding. */
class PropertyController extends ApiController
{
    private const BRAND_KEYS = ['brand_name', 'tagline', 'logo_data_url', 'theme', 'accent_color', 'widget_color',
        'widget_position', 'launcher_style', 'language'];

    public function index(): JsonResponse
    {
        $c = $this->need('properties', 'read');
        $rows = Sql::all('SELECT * FROM properties WHERE workspace_id = ? ORDER BY created_at DESC', [$c->wid]);

        return Json::items(array_map([Serialize::class, 'property'], $rows));
    }

    public function store(Request $request): JsonResponse
    {
        $c = $this->need('properties', 'write');
        $b = $this->body($request);
        $name = Input::str(Input::required($b, 'name'), 'name', 255);
        $domain = isset($b['domain']) ? Input::str($b['domain'], 'domain', 255) : '';
        $pid = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        Sql::run(
            'INSERT INTO properties (id, workspace_id, name, domain, public_key, secure_mode, widget_config) VALUES (?, ?, ?, ?, ?, 0, ?)',
            [$pid, $c->wid, $name, $domain, self::newKey(), Json::encode(Catalog::widgetDefaults())],
        );
        Activity::log($c, 'property.created', 'property', $pid, ['name' => $name]);

        return Json::ok(Serialize::property(Sql::one('SELECT * FROM properties WHERE id = ?', [$pid])), 201);
    }

    public function show(string $id): JsonResponse
    {
        $c = $this->need('properties', 'read');

        return Json::ok(Serialize::property(Sql::own('properties', $id, $c->wid)));
    }

    /** Public-key lookup (widget bootstrap). */
    public function byKey(string $key): JsonResponse
    {
        $c = $this->need('properties', 'read');
        $row = Sql::one('SELECT * FROM properties WHERE workspace_id = ? AND public_key = ?', [$c->wid, $key]);
        if ($row === null) {
            Json::fail('not_found', 'Property not found', 404);
        }

        return Json::ok(Serialize::property($row));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $c = $this->need('properties', 'write');
        $p = Sql::own('properties', $id, $c->wid);
        $b = $this->body($request);
        $sets = $params = [];
        foreach (['name', 'domain'] as $field) {
            if (array_key_exists($field, $b)) {
                $sets[] = "$field = ?";
                $params[] = Input::str($b[$field], $field, 255);
            }
        }
        if (array_key_exists('secure_mode', $b)) {
            $sets[] = 'secure_mode = ?';
            $params[] = Input::bool($b['secure_mode']) ? 1 : 0;
        }
        if (!$sets) {
            Json::fail('validation', 'Nothing to update', 422);
        }
        array_push($params, $p['id'], $c->wid);
        Sql::run('UPDATE properties SET '.implode(', ', $sets).' WHERE id = ? AND workspace_id = ?', $params);
        Activity::log($c, 'property.updated', 'property', $p['id']);

        return Json::ok(Serialize::property(Sql::own('properties', $id, $c->wid)));
    }

    public function destroy(string $id): JsonResponse
    {
        $c = $this->need('properties', 'write');
        $p = Sql::own('properties', $id, $c->wid);
        Sql::run('DELETE FROM properties WHERE id = ? AND workspace_id = ?', [$p['id'], $c->wid]);
        Activity::log($c, 'property.deleted', 'property', $p['id']);

        return Json::ok(['deleted' => true]);
    }

    public function regenerateKey(string $id): JsonResponse
    {
        $c = $this->need('properties', 'write');
        $p = Sql::own('properties', $id, $c->wid);
        $key = self::newKey();
        Sql::run('UPDATE properties SET public_key = ? WHERE id = ? AND workspace_id = ?', [$key, $p['id'], $c->wid]);
        Activity::log($c, 'property.key_regenerated', 'property', $p['id']);

        return Json::ok(['public_key' => $key]);
    }

    public function widgetConfig(string $id): JsonResponse
    {
        $c = $this->need('properties', 'read');
        $p = Sql::own('properties', $id, $c->wid);

        return Json::ok(array_merge(Catalog::widgetDefaults(), Json::decode($p['widget_config'] ?? null, [])));
    }

    public function updateWidgetConfig(Request $request, string $id): JsonResponse
    {
        $c = $this->need('properties', 'write');
        $p = Sql::own('properties', $id, $c->wid);
        $merged = array_merge(Json::decode($p['widget_config'] ?? null, []), $this->body($request));
        Sql::run('UPDATE properties SET widget_config = ? WHERE id = ? AND workspace_id = ?', [Json::encode($merged), $p['id'], $c->wid]);
        Activity::log($c, 'widget.updated', 'property', $p['id']);

        return Json::ok(array_merge(Catalog::widgetDefaults(), $merged));
    }

    public function settings(string $id): JsonResponse
    {
        $c = $this->need('property_settings', 'read');

        return Json::ok(self::mergedSettings($c->wid, Sql::own('properties', $id, $c->wid)['id']));
    }

    /** Branding keys go to `branding`; everything else merges into property_settings.settings. */
    public function updateSettings(Request $request, string $id): JsonResponse
    {
        $c = $this->need('property_settings', 'write');
        $pid = Sql::own('properties', $id, $c->wid)['id'];
        $b = $this->body($request);

        $brand = [];
        foreach (self::BRAND_KEYS as $key) {
            if (array_key_exists($key, $b)) {
                $brand[$key === 'logo_data_url' ? 'logo_url' : $key] = $b[$key] === null ? null : Input::str($b[$key], $key);
            }
        }
        if ($brand) {
            if (Sql::one('SELECT id FROM branding WHERE workspace_id = ? AND property_id = ?', [$c->wid, $pid])) {
                $sets = implode(', ', array_map(fn ($col) => "$col = ?", array_keys($brand)));
                Sql::run("UPDATE branding SET $sets WHERE workspace_id = ? AND property_id = ?", [...array_values($brand), $c->wid, $pid]);
            } else {
                $cols = array_keys($brand);
                Sql::run(
                    'INSERT INTO branding (id, workspace_id, property_id, '.implode(', ', $cols).') VALUES (?, ?, ?, '.Sql::marks($cols).')',
                    [Sql::uuid(), $c->wid, $pid, ...array_values($brand)],
                );
            }
        }

        $settings = array_diff_key($b, array_flip(self::BRAND_KEYS));
        if ($settings) {
            $row = Sql::one('SELECT id, settings FROM property_settings WHERE workspace_id = ? AND property_id = ?', [$c->wid, $pid]);
            if ($row) {
                Sql::run('UPDATE property_settings SET settings = ? WHERE id = ?', [Json::encode(array_merge(Json::decode($row['settings'] ?? null, []), $settings)), $row['id']]);
            } else {
                Sql::run('INSERT INTO property_settings (id, workspace_id, property_id, settings) VALUES (?, ?, ?, ?)', [Sql::uuid(), $c->wid, $pid, Json::encode($settings)]);
            }
        }
        Activity::log($c, 'property_settings.updated', 'property', $pid);

        return Json::ok(self::mergedSettings($c->wid, $pid));
    }

    /** defaults <- property_settings.settings <- branding fields, plus the property's departments. */
    private static function mergedSettings(string $wid, string $pid): array
    {
        $out = Catalog::propertySettingsDefaults();
        $settings = Sql::one('SELECT * FROM property_settings WHERE workspace_id = ? AND property_id = ?', [$wid, $pid]);
        if ($settings) {
            $out = array_merge($out, Json::decode($settings['settings'] ?? null, []));
        }
        $brand = Sql::one('SELECT * FROM branding WHERE workspace_id = ? AND property_id = ?', [$wid, $pid]);
        if ($brand) {
            $out['brand_name'] = $brand['brand_name'];
            $out['tagline'] = $brand['tagline'];
            $out['logo_data_url'] = $brand['logo_url'];
            $out['theme'] = $brand['theme'];
            $out['accent_color'] = $brand['accent_color'];
            $out['widget_color'] = $brand['widget_color'];
            $out['widget_position'] = $brand['widget_position'];
            $out['launcher_style'] = $brand['launcher_style'];
            $out['language'] = $brand['language'];
        }
        $out['departments'] = Sql::all('SELECT id, name FROM departments WHERE workspace_id = ? AND property_id = ? ORDER BY name ASC', [$wid, $pid]);
        $out['property_id'] = $pid;

        return $out;
    }

    private static function newKey(): string
    {
        return 'bx_'.bin2hex(random_bytes(9));
    }
}
