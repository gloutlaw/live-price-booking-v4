<?php

/**
 * Plugin Name: Booking Analytics
 * Description: Tracks form views, funnel steps, devices, traffic sources, vehicles and submissions for Booking V2 and V3
 * Version: 2.1.0
 * Author: Client
 * Text Domain: ipro-booking-analytics
 */

if (!defined('ABSPATH')) {
    exit;
}

class IPro_Booking_Analytics
{

    private const TABLE_LEGACY  = 'ipro_booking_analytics';
    private const TABLE_EVENTS  = 'ipro_ba_events';
    private const DB_VERSION    = '2.1';
    private const OPTION_DB     = 'ipro_ba_db_version';
    private const OPTION_OFF    = 'ipro_ba_disabled';
    private const RATE_TRANSIENT = 'ipro_ba_rate_';
    private const SESSION_COOKIE = 'ipro_ba_sid';

    public function __construct()
    {
        register_activation_hook(__FILE__, [$this, 'activate']);

        add_action('admin_init', [$this, 'maybe_upgrade']);
        add_action('rest_api_init', [$this, 'register_routes']);
        add_action('admin_menu', [$this, 'add_menu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_admin_assets']);

        if (!get_option(self::OPTION_OFF)) {
            add_action('template_redirect', [$this, 'track_view']);
            add_action('ipro_booking_submitted', [$this, 'track_submission'], 10, 3);
            add_action('wp_enqueue_scripts', [$this, 'enqueue_frontend_tracker']);
        }
    }

    /* ── Install / Upgrade ── */

    public function activate()
    {
        $this->create_tables();
    }

    public function maybe_upgrade()
    {
        if (get_option(self::OPTION_DB) !== self::DB_VERSION) {
            $this->create_tables();
        }
    }

    private function create_tables()
    {
        global $wpdb;
        $charset = $wpdb->get_charset_collate();

        $legacy = $wpdb->prefix . self::TABLE_LEGACY;
        $sql_legacy = "CREATE TABLE {$legacy} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            form_slug VARCHAR(50) NOT NULL DEFAULT 'booking-v2',
            event_date DATE NOT NULL,
            views INT UNSIGNED NOT NULL DEFAULT 0,
            submissions INT UNSIGNED NOT NULL DEFAULT 0,
            PRIMARY KEY (id),
            UNIQUE KEY form_date (form_slug, event_date)
        ) {$charset};";

        $events = $wpdb->prefix . self::TABLE_EVENTS;
        $sql_events = "CREATE TABLE {$events} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            session_id VARCHAR(36) NOT NULL,
            event_type VARCHAR(30) NOT NULL,
            event_data TEXT,
            referrer VARCHAR(500) DEFAULT '',
            utm_source VARCHAR(100) DEFAULT '',
            utm_medium VARCHAR(100) DEFAULT '',
            utm_campaign VARCHAR(100) DEFAULT '',
            device_type VARCHAR(10) DEFAULT '',
            browser VARCHAR(50) DEFAULT '',
            screen_width SMALLINT UNSIGNED DEFAULT 0,
            lang VARCHAR(10) DEFAULT '',
            country VARCHAR(100) DEFAULT '',
            ip_hash VARCHAR(64) DEFAULT '',
            created_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            KEY idx_session (session_id),
            KEY idx_type (event_type),
            KEY idx_created (created_at),
            KEY idx_type_created (event_type, created_at)
        ) {$charset};";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta($sql_legacy);
        dbDelta($sql_events);
        update_option(self::OPTION_DB, self::DB_VERSION);
    }

    /* ── Legacy Tracking (server-side views/submissions counter) ── */

    public function track_view()
    {
        if (is_admin() || wp_doing_ajax()) {
            return;
        }

        $context = $this->get_form_context();
        if ($context === null) {
            return;
        }

        $this->increment('views', $context['form_slug']);

        if ($context['version'] === 'v3') {
            $session_id = $this->get_or_create_session_id();
            if (!$this->session_has_event($session_id, 'form_view')) {
                $this->insert_event('form_view', [
                    'form_version' => 'v3',
                    'page_url'     => get_permalink() ?: home_url('/booking/'),
                    'source'       => 'server',
                ], $session_id);
            }
        }
    }

    /**
     * @param array<string, mixed> $fields
     */
    public function track_submission($fields = [], $booking_ref = 0, $form_version = 'v3')
    {
        $form_version = ($form_version === 'v2') ? 'v2' : 'v3';
        $form_slug = $form_version === 'v2' ? 'booking-v2' : 'booking-v3';
        $this->increment('submissions', $form_slug);

        if ($form_version === 'v2') {
            return;
        }

        $booking_ref_str = '#' . str_pad((string) max(0, (int) $booking_ref), 3, '0', STR_PAD_LEFT);
        if ($this->submission_exists_by_ref($booking_ref_str)) {
            return;
        }

        if (!is_array($fields)) {
            $fields = [];
        }

        $session_id = $this->get_or_create_session_id();
        if ($session_id === '') {
            $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
            $session_id = substr(hash('sha256', $ip . wp_salt('auth') . $booking_ref_str), 0, 36);
        }

        $this->insert_event('form_submit', $this->build_submission_event_data($fields, $booking_ref_str), $session_id);
    }

    private function increment($column, $form_slug = 'booking-v2')
    {
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_LEGACY;
        $today = current_time('Y-m-d');
        $form_slug = sanitize_key($form_slug);

        $wpdb->query($wpdb->prepare(
            "INSERT INTO {$table} (form_slug, event_date, {$column})
             VALUES (%s, %s, 1)
             ON DUPLICATE KEY UPDATE {$column} = {$column} + 1",
            $form_slug,
            $today
        ));
    }

    /**
     * @return array{version: string, form_slug: string}|null
     */
    private function get_form_context(): ?array
    {
        if (is_page_template('page-booking-v2.php')) {
            return ['version' => 'v2', 'form_slug' => 'booking-v2'];
        }
        if (is_page_template('page-booking-v3.php')) {
            return ['version' => 'v3', 'form_slug' => 'booking-v3'];
        }

        return null;
    }

    private function get_or_create_session_id(): string
    {
        $cookie_name = self::SESSION_COOKIE;
        $session_id = sanitize_text_field($_COOKIE[$cookie_name] ?? '');

        if ($session_id !== '' && preg_match('/^[a-f0-9-]{36}$/i', $session_id)) {
            return substr($session_id, 0, 36);
        }

        $session_id = wp_generate_uuid4();
        if (!headers_sent()) {
            setcookie(
                $cookie_name,
                $session_id,
                [
                    'expires'  => time() + DAY_IN_SECONDS,
                    'path'     => '/',
                    'secure'   => is_ssl(),
                    'httponly' => false,
                    'samesite' => 'Lax',
                ]
            );
        }

        return $session_id;
    }

    private function session_has_event(string $session_id, string $event_type): bool
    {
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_EVENTS;

        $found = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM {$table}
             WHERE session_id = %s AND event_type = %s
             LIMIT 1",
            $session_id,
            $event_type
        ));

        return !empty($found);
    }

    private function submission_exists_by_ref(string $booking_ref): bool
    {
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_EVENTS;

        $found = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM {$table}
             WHERE event_type = 'form_submit'
               AND JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.booking_ref')) = %s
             LIMIT 1",
            $booking_ref
        ));

        return !empty($found);
    }

    /**
     * @param array<string, mixed> $fields
     * @return array<string, mixed>
     */
    private function build_submission_event_data(array $fields, string $booking_ref_str): array
    {
        $service_type = sanitize_text_field($fields['serviceType'] ?? '');
        $addons_raw   = trim((string) ($fields['addons'] ?? ''));
        $addons       = $addons_raw !== ''
            ? array_values(array_filter(array_map('trim', preg_split('/\s*\|\s*/', $addons_raw))))
            : [];

        $pickup_city  = $this->extract_city((string) ($fields['pickup'] ?? ''));
        $dropoff_city = $this->extract_city((string) ($fields['dropoff'] ?? ''));

        return [
            'form_version'  => 'v3',
            'source'        => 'server',
            'booking_ref'   => $booking_ref_str,
            'vehicle'       => sanitize_text_field($fields['vehicle'] ?? ''),
            'vehicle_key'   => sanitize_text_field($fields['vehicle'] ?? ''),
            'service_type'  => $service_type,
            'price'         => sanitize_text_field($fields['estimatedPrice'] ?? ''),
            'country'       => sanitize_text_field($fields['country'] ?? ''),
            'pickup_city'   => $pickup_city,
            'dropoff_city'  => $dropoff_city,
            'pickup_time'   => sanitize_text_field($fields['pickupTime'] ?? ''),
            'passengers'    => sanitize_text_field($fields['passengers'] ?? ''),
            'has_flight'    => !empty($fields['flightNumber']),
            'addons'        => $addons,
            'addons_count'  => count($addons),
        ];
    }

    private function extract_city(string $address): string
    {
        $address = trim($address);
        if ($address === '') {
            return '';
        }

        $parts = array_map('trim', explode(',', $address));

        return $parts[0] ?? '';
    }

    /**
     * @param array<string, mixed> $event_data
     * @param array<string, mixed> $meta
     */
    private function insert_event(string $event_type, array $event_data, string $session_id, array $meta = []): void
    {
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_EVENTS;

        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        $ip_hash = hash('sha256', $ip . wp_salt('auth'));

        $wpdb->insert($table, [
            'session_id'   => substr($session_id, 0, 36),
            'event_type'   => $event_type,
            'event_data'   => wp_json_encode($event_data),
            'referrer'     => esc_url_raw(substr($meta['referrer'] ?? (wp_get_referer() ?: ''), 0, 500)),
            'utm_source'   => sanitize_text_field(substr($meta['utm_source'] ?? '', 0, 100)),
            'utm_medium'   => sanitize_text_field(substr($meta['utm_medium'] ?? '', 0, 100)),
            'utm_campaign' => sanitize_text_field(substr($meta['utm_campaign'] ?? '', 0, 100)),
            'device_type'  => sanitize_text_field(substr($meta['device_type'] ?? '', 0, 10)),
            'browser'      => sanitize_text_field(substr($meta['browser'] ?? '', 0, 50)),
            'screen_width' => absint($meta['screen_width'] ?? 0),
            'lang'         => sanitize_text_field(substr($meta['lang'] ?? '', 0, 10)),
            'country'      => sanitize_text_field(substr($meta['country'] ?? '', 0, 100)),
            'ip_hash'      => $ip_hash,
            'created_at'   => current_time('mysql'),
        ], ['%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%s', '%s', '%s']);
    }

    /* ── Frontend Tracker Enqueue ── */

    public function enqueue_frontend_tracker()
    {
        if (is_admin()) return;
        if (!is_page_template('page-booking-v2.php')) return;

        wp_enqueue_script(
            'ipro-ba-tracker',
            plugins_url('assets/tracker.js', __FILE__),
            [],
            '2.0.0',
            true
        );
        wp_localize_script('ipro-ba-tracker', 'iproBATracker', [
            'endpoint' => rest_url('ipro-analytics/v1/track'),
            'nonce'    => wp_create_nonce('wp_rest'),
        ]);
    }

    /* ── REST API ── */

    public function register_routes()
    {
        // Legacy stats
        register_rest_route('ipro-analytics/v1', '/stats', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_stats'],
            'permission_callback' => function () {
                return current_user_can('manage_options');
            },
            'args' => [
                'period' => ['default' => '1m', 'sanitize_callback' => 'sanitize_text_field'],
                'from'   => ['default' => '',   'sanitize_callback' => 'sanitize_text_field'],
                'to'     => ['default' => '',   'sanitize_callback' => 'sanitize_text_field'],
            ],
        ]);

        // Public event tracking
        register_rest_route('ipro-analytics/v1', '/track', [
            'methods'             => 'POST',
            'callback'            => [$this, 'track_event'],
            'permission_callback' => '__return_true',
        ]);

        // Extended stats v2
        register_rest_route('ipro-analytics/v1', '/stats-v2', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_stats_v2'],
            'permission_callback' => function () {
                return current_user_can('manage_options');
            },
            'args' => [
                'period' => ['default' => '1m', 'sanitize_callback' => 'sanitize_text_field'],
                'from'   => ['default' => '',   'sanitize_callback' => 'sanitize_text_field'],
                'to'     => ['default' => '',   'sanitize_callback' => 'sanitize_text_field'],
            ],
        ]);

        register_rest_route('ipro-analytics/v1', '/reset', [
            'methods'             => 'POST',
            'callback'            => [$this, 'reset_data'],
            'permission_callback' => function () {
                return current_user_can('manage_options');
            },
        ]);

        register_rest_route('ipro-analytics/v1', '/toggle', [
            'methods'             => 'POST',
            'callback'            => [$this, 'toggle_tracking'],
            'permission_callback' => function () {
                return current_user_can('manage_options');
            },
            'args' => [
                'disabled' => ['required' => true, 'sanitize_callback' => 'absint'],
            ],
        ]);
    }

    /* ── Track Event (public endpoint with rate-limiting) ── */

    public function track_event(\WP_REST_Request $request)
    {
        if (get_option(self::OPTION_OFF)) {
            return new \WP_REST_Response(['ok' => false], 200);
        }

        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        $ip_hash = hash('sha256', $ip . wp_salt('auth'));
        $rate_key = self::RATE_TRANSIENT . substr($ip_hash, 0, 16);
        $rate = (int) get_transient($rate_key);

        if ($rate >= 30) {
            return new \WP_REST_Response(['ok' => false, 'reason' => 'rate_limit'], 429);
        }
        set_transient($rate_key, $rate + 1, 60);

        $body = $request->get_json_params();
        if (empty($body) || !is_array($body)) {
            return new \WP_REST_Response(['ok' => false], 400);
        }

        $allowed_types = [
            'form_view',
            'step_change',
            'vehicle_select',
            'service_toggle',
            'field_interact',
            'form_submit',
            'form_error',
            'checkout_attempt',
            'checkout_validated',
        ];
        $event_type = sanitize_text_field($body['event_type'] ?? '');
        if (!in_array($event_type, $allowed_types, true)) {
            return new \WP_REST_Response(['ok' => false], 400);
        }

        $event_data = is_array($body['event_data'] ?? null) ? $body['event_data'] : [];
        if (!isset($event_data['form_version'])) {
            $event_data['form_version'] = 'v3';
        }
        if (!isset($event_data['source'])) {
            $event_data['source'] = 'client';
        }

        if ($event_type === 'form_submit') {
            $booking_ref = sanitize_text_field($event_data['booking_ref'] ?? '');
            if ($booking_ref !== '' && $this->submission_exists_by_ref($booking_ref)) {
                return new \WP_REST_Response(['ok' => true, 'deduped' => true]);
            }
        }

        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_EVENTS;

        $wpdb->insert($table, [
            'session_id'   => sanitize_text_field(substr($body['session_id'] ?? '', 0, 36)),
            'event_type'   => $event_type,
            'event_data'   => wp_json_encode($event_data),
            'referrer'     => esc_url_raw(substr($body['referrer'] ?? '', 0, 500)),
            'utm_source'   => sanitize_text_field(substr($body['utm_source'] ?? '', 0, 100)),
            'utm_medium'   => sanitize_text_field(substr($body['utm_medium'] ?? '', 0, 100)),
            'utm_campaign' => sanitize_text_field(substr($body['utm_campaign'] ?? '', 0, 100)),
            'device_type'  => sanitize_text_field(substr($body['device_type'] ?? '', 0, 10)),
            'browser'      => sanitize_text_field(substr($body['browser'] ?? '', 0, 50)),
            'screen_width' => absint($body['screen_width'] ?? 0),
            'lang'         => sanitize_text_field(substr($body['lang'] ?? '', 0, 10)),
            'country'      => sanitize_text_field(substr($body['country'] ?? '', 0, 100)),
            'ip_hash'      => $ip_hash,
            'created_at'   => current_time('mysql'),
        ], ['%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%s', '%s', '%s']);

        return new \WP_REST_Response(['ok' => true]);
    }

    /* ── Stats V2 (extended analytics) ── */

    public function get_stats_v2(\WP_REST_Request $request)
    {
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_EVENTS;

        [$date_from, $date_to] = $this->resolve_dates($request);

        $from_dt = $date_from . ' 00:00:00';
        $to_dt   = $date_to . ' 23:59:59';

        // Funnel counts
        $funnel = $wpdb->get_row($wpdb->prepare(
            "SELECT
                COUNT(DISTINCT CASE WHEN event_type = 'form_view' THEN session_id END) AS views,
                COUNT(DISTINCT CASE WHEN event_type = 'step_change' AND JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.to')) = '2' THEN session_id END) AS step2,
                COUNT(DISTINCT CASE WHEN event_type = 'form_submit' THEN session_id END) AS submissions
             FROM {$table}
             WHERE created_at BETWEEN %s AND %s",
            $from_dt,
            $to_dt
        ));

        $total_views = (int) ($funnel->views ?? 0);
        $total_step2 = (int) ($funnel->step2 ?? 0);
        $total_subs  = (int) ($funnel->submissions ?? 0);

        // Devices
        $devices = $wpdb->get_results($wpdb->prepare(
            "SELECT device_type, COUNT(DISTINCT session_id) AS cnt
             FROM {$table}
             WHERE event_type = 'form_view' AND created_at BETWEEN %s AND %s
             GROUP BY device_type ORDER BY cnt DESC",
            $from_dt, $to_dt
        ));

        // Browsers
        $browsers = $wpdb->get_results($wpdb->prepare(
            "SELECT browser, COUNT(DISTINCT session_id) AS cnt
             FROM {$table}
             WHERE event_type = 'form_view' AND created_at BETWEEN %s AND %s AND browser != ''
             GROUP BY browser ORDER BY cnt DESC LIMIT 10",
            $from_dt, $to_dt
        ));

        // Traffic sources (referrer domains)
        $sources = $wpdb->get_results($wpdb->prepare(
            "SELECT
                CASE
                    WHEN referrer = '' OR referrer IS NULL THEN 'Direct'
                    ELSE SUBSTRING_INDEX(SUBSTRING_INDEX(REPLACE(REPLACE(referrer, 'https://', ''), 'http://', ''), '/', 1), '?', 1)
                END AS source,
                COUNT(DISTINCT session_id) AS sessions
             FROM {$table}
             WHERE event_type = 'form_view' AND created_at BETWEEN %s AND %s
             GROUP BY source ORDER BY sessions DESC LIMIT 15",
            $from_dt, $to_dt
        ));

        // UTM campaigns
        $campaigns = $wpdb->get_results($wpdb->prepare(
            "SELECT utm_source, utm_medium, utm_campaign, COUNT(DISTINCT session_id) AS sessions
             FROM {$table}
             WHERE event_type = 'form_view' AND created_at BETWEEN %s AND %s
               AND (utm_source != '' OR utm_medium != '' OR utm_campaign != '')
             GROUP BY utm_source, utm_medium, utm_campaign ORDER BY sessions DESC LIMIT 15",
            $from_dt, $to_dt
        ));

        // Vehicle selections
        $vehicles = $wpdb->get_results($wpdb->prepare(
            "SELECT JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.vehicle_key')) AS vkey,
                    JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.vehicle_name')) AS vname,
                    COUNT(*) AS cnt
             FROM {$table}
             WHERE event_type = 'vehicle_select' AND created_at BETWEEN %s AND %s
             GROUP BY vkey, vname ORDER BY cnt DESC",
            $from_dt, $to_dt
        ));

        // Vehicles in submissions
        $vehicles_submitted = $wpdb->get_results($wpdb->prepare(
            "SELECT JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.vehicle')) AS vname,
                    COUNT(*) AS cnt
             FROM {$table}
             WHERE event_type = 'form_submit' AND created_at BETWEEN %s AND %s
             GROUP BY vname ORDER BY cnt DESC",
            $from_dt, $to_dt
        ));

        // Service type
        $service_types = $wpdb->get_results($wpdb->prepare(
            "SELECT JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.service_type')) AS stype,
                    COUNT(*) AS cnt
             FROM {$table}
             WHERE event_type = 'service_toggle' AND created_at BETWEEN %s AND %s
             GROUP BY stype ORDER BY cnt DESC",
            $from_dt, $to_dt
        ));

        // Pickup hours distribution (from form_submit events)
        $pickup_hours = $wpdb->get_results($wpdb->prepare(
            "SELECT JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.pickup_time')) AS ptime,
                    COUNT(*) AS cnt
             FROM {$table}
             WHERE event_type = 'form_submit' AND created_at BETWEEN %s AND %s
               AND JSON_EXTRACT(event_data, '$.pickup_time') IS NOT NULL
             GROUP BY ptime ORDER BY ptime ASC",
            $from_dt, $to_dt
        ));

        $hours_dist = array_fill(0, 24, 0);
        foreach ($pickup_hours as $ph) {
            $hour = (int) explode(':', $ph->ptime)[0];
            if ($hour >= 0 && $hour <= 23) {
                $hours_dist[$hour] += (int) $ph->cnt;
            }
        }

        // Top routes (pickup → dropoff)
        $routes = $wpdb->get_results($wpdb->prepare(
            "SELECT
                JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.pickup_city')) AS pickup_city,
                JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.dropoff_city')) AS dropoff_city,
                COUNT(*) AS cnt
             FROM {$table}
             WHERE event_type = 'form_submit' AND created_at BETWEEN %s AND %s
               AND JSON_EXTRACT(event_data, '$.pickup_city') IS NOT NULL
             GROUP BY pickup_city, dropoff_city ORDER BY cnt DESC LIMIT 10",
            $from_dt, $to_dt
        ));

        // Average time on form (seconds between form_view and form_submit per session)
        $avg_time = $wpdb->get_var($wpdb->prepare(
            "SELECT AVG(TIMESTAMPDIFF(SECOND, v.created_at, s.created_at))
             FROM (SELECT session_id, MIN(created_at) AS created_at FROM {$table} WHERE event_type = 'form_view' AND created_at BETWEEN %s AND %s GROUP BY session_id) v
             JOIN (SELECT session_id, MIN(created_at) AS created_at FROM {$table} WHERE event_type = 'form_submit' AND created_at BETWEEN %s AND %s GROUP BY session_id) s
             ON v.session_id = s.session_id",
            $from_dt, $to_dt, $from_dt, $to_dt
        ));

        // Field interactions (which fields were touched, for drop-off analysis)
        $field_interactions = $wpdb->get_results($wpdb->prepare(
            "SELECT JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.field_id')) AS field_id,
                    COUNT(DISTINCT session_id) AS sessions
             FROM {$table}
             WHERE event_type = 'field_interact' AND created_at BETWEEN %s AND %s
             GROUP BY field_id ORDER BY sessions DESC",
            $from_dt, $to_dt
        ));

        // Daily chart data (from events table)
        $daily_raw = $wpdb->get_results($wpdb->prepare(
            "SELECT DATE(created_at) AS event_date,
                    COUNT(DISTINCT CASE WHEN event_type = 'form_view' THEN session_id END) AS views,
                    COUNT(DISTINCT CASE WHEN event_type = 'form_submit' THEN session_id END) AS submissions,
                    COUNT(DISTINCT CASE WHEN event_type = 'step_change' AND JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.to')) = '2' THEN session_id END) AS step2
             FROM {$table}
             WHERE created_at BETWEEN %s AND %s
             GROUP BY event_date ORDER BY event_date ASC",
            $from_dt, $to_dt
        ));

        $lookup = [];
        foreach ($daily_raw as $r) {
            $lookup[$r->event_date] = $r;
        }

        $daily = [];
        $cursor = new \DateTime($date_from);
        $end = new \DateTime($date_to);
        $end->modify('+1 day');
        while ($cursor < $end) {
            $d = $cursor->format('Y-m-d');
            $daily[] = [
                'date'        => $d,
                'views'       => isset($lookup[$d]) ? (int) $lookup[$d]->views : 0,
                'step2'       => isset($lookup[$d]) ? (int) $lookup[$d]->step2 : 0,
                'submissions' => isset($lookup[$d]) ? (int) $lookup[$d]->submissions : 0,
            ];
            $cursor->modify('+1 day');
        }

        // Languages
        $languages = $wpdb->get_results($wpdb->prepare(
            "SELECT lang, COUNT(DISTINCT session_id) AS cnt
             FROM {$table}
             WHERE event_type = 'form_view' AND created_at BETWEEN %s AND %s AND lang != ''
             GROUP BY lang ORDER BY cnt DESC LIMIT 10",
            $from_dt, $to_dt
        ));

        // Validation errors breakdown
        $validation_errors = $wpdb->get_results($wpdb->prepare(
            "SELECT JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.step')) AS step,
                    COUNT(*) AS cnt
             FROM {$table}
             WHERE event_type = 'form_error' AND created_at BETWEEN %s AND %s
             GROUP BY step ORDER BY cnt DESC",
            $from_dt, $to_dt
        ));

        $conversion = $total_views > 0 ? round(($total_subs / $total_views) * 100, 2) : 0;
        $step2_rate = $total_views > 0 ? round(($total_step2 / $total_views) * 100, 2) : 0;
        $bounce_rate = $total_views > 0 ? round((($total_views - $total_step2) / $total_views) * 100, 2) : 0;

        $form_versions = $wpdb->get_results($wpdb->prepare(
            "SELECT
                COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.form_version')), ''), 'unknown') AS form_version,
                COUNT(DISTINCT CASE WHEN event_type = 'form_view' THEN session_id END) AS views,
                COUNT(DISTINCT CASE WHEN event_type = 'form_submit' THEN session_id END) AS submissions
             FROM {$table}
             WHERE created_at BETWEEN %s AND %s
               AND event_type IN ('form_view', 'form_submit')
             GROUP BY form_version
             ORDER BY form_version ASC",
            $from_dt,
            $to_dt
        ), ARRAY_A);

        $version_lookup = [];
        foreach ($form_versions as $row) {
            $version_lookup[$row['form_version']] = [
                'views'       => (int) ($row['views'] ?? 0),
                'submissions' => (int) ($row['submissions'] ?? 0),
            ];
        }

        return new \WP_REST_Response([
            'funnel' => [
                'views'       => $total_views,
                'step2'       => $total_step2,
                'submissions' => $total_subs,
                'conversion'  => $conversion,
                'step2_rate'  => $step2_rate,
                'bounce_rate' => $bounce_rate,
            ],
            'form_versions' => [
                'v2' => $version_lookup['v2'] ?? ['views' => 0, 'submissions' => 0],
                'v3' => $version_lookup['v3'] ?? ['views' => 0, 'submissions' => 0],
            ],
            'avg_time_seconds' => $avg_time ? round((float) $avg_time) : null,
            'devices'          => $devices,
            'browsers'         => $browsers,
            'sources'          => $sources,
            'campaigns'        => $campaigns,
            'vehicles'         => $vehicles,
            'vehicles_submitted' => $vehicles_submitted,
            'service_types'    => $service_types,
            'pickup_hours'     => $hours_dist,
            'routes'           => $routes,
            'field_interactions' => $field_interactions,
            'languages'        => $languages,
            'validation_errors' => $validation_errors,
            'daily'            => $daily,
            'disabled'         => (bool) get_option(self::OPTION_OFF),
        ]);
    }

    /* ── Legacy Stats (kept for backward compat) ── */

    public function get_stats(\WP_REST_Request $request)
    {
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE_LEGACY;

        [$date_from, $date_to] = $this->resolve_dates($request);

        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT event_date, views, submissions
             FROM {$table}
             WHERE form_slug = 'booking-v2'
               AND event_date BETWEEN %s AND %s
             ORDER BY event_date ASC",
            $date_from,
            $date_to
        ));

        $total_views = 0;
        $total_subs  = 0;
        $daily       = [];

        $cursor = new \DateTime($date_from);
        $end    = new \DateTime($date_to);
        $end->modify('+1 day');
        $lookup = [];
        foreach ($rows as $r) {
            $lookup[$r->event_date] = $r;
        }

        while ($cursor < $end) {
            $d = $cursor->format('Y-m-d');
            $v = isset($lookup[$d]) ? (int) $lookup[$d]->views : 0;
            $s = isset($lookup[$d]) ? (int) $lookup[$d]->submissions : 0;
            $total_views += $v;
            $total_subs  += $s;
            $daily[] = ['date' => $d, 'views' => $v, 'submissions' => $s];
            $cursor->modify('+1 day');
        }

        $conversion = $total_views > 0 ? round(($total_subs / $total_views) * 100, 2) : 0;

        return new \WP_REST_Response([
            'total_views'       => $total_views,
            'total_submissions' => $total_subs,
            'conversion'        => $conversion,
            'daily'             => $daily,
            'disabled'          => (bool) get_option(self::OPTION_OFF),
        ]);
    }

    public function reset_data()
    {
        global $wpdb;
        $wpdb->query("TRUNCATE TABLE " . $wpdb->prefix . self::TABLE_LEGACY);
        $wpdb->query("TRUNCATE TABLE " . $wpdb->prefix . self::TABLE_EVENTS);

        return new \WP_REST_Response(['success' => true]);
    }

    public function toggle_tracking(\WP_REST_Request $request)
    {
        $disabled = (bool) $request->get_param('disabled');
        update_option(self::OPTION_OFF, $disabled ? 1 : 0);

        return new \WP_REST_Response(['disabled' => $disabled]);
    }

    /* ── Helpers ── */

    private function resolve_dates(\WP_REST_Request $request): array
    {
        $period = $request->get_param('period');
        $from   = $request->get_param('from');
        $to     = $request->get_param('to');

        if ($from && $to) {
            return [$from, $to];
        }

        $date_to = current_time('Y-m-d');
        switch ($period) {
            case '1w':
                $date_from = date('Y-m-d', strtotime('-6 days', strtotime($date_to)));
                break;
            case '1y':
                $date_from = date('Y-m-d', strtotime('-1 year', strtotime($date_to)));
                break;
            default:
                $date_from = date('Y-m-d', strtotime('-30 days', strtotime($date_to)));
        }

        return [$date_from, $date_to];
    }

    /* ── Admin ── */

    public function add_menu()
    {
        add_menu_page(
            'Booking Analytics',
            'Booking Analytics',
            'manage_options',
            'ipro-booking-analytics',
            [$this, 'render_page'],
            'dashicons-chart-area',
            30
        );
    }

    public function enqueue_admin_assets($hook)
    {
        if ($hook !== 'toplevel_page_ipro-booking-analytics') return;

        wp_enqueue_style(
            'ipro-ba-css',
            plugins_url('assets/analytics.css', __FILE__),
            [],
            '2.1.0'
        );
        wp_enqueue_script(
            'chart-js',
            'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js',
            [],
            '4.4.0',
            true
        );
        wp_enqueue_script(
            'ipro-ba-js',
            plugins_url('assets/analytics.js', __FILE__),
            ['chart-js', 'jquery'],
            '2.1.0',
            true
        );
        wp_localize_script('ipro-ba-js', 'iproBA', [
            'apiUrl' => rest_url('ipro-analytics/v1/'),
            'nonce'  => wp_create_nonce('wp_rest'),
            'i18n'   => [
                'en' => [
                    'title'              => 'Booking Analytics',
                    'disableAnalytics'   => 'Disable Analytics',
                    'resetAll'           => 'RESET ALL DATA',
                    'resetConfirm'       => 'Are you sure you want to reset ALL analytics data? This cannot be undone.',
                    'formViews'          => 'Form Views',
                    'reachedStep2'       => 'Reached Step 2',
                    'submissions'        => 'Submissions',
                    'conversion'         => 'Conversion',
                    'avgTime'            => 'Avg Time on Form',
                    'bounceRate'         => 'Bounce Rate',
                    'funnel'             => 'Conversion Funnel',
                    'dailyChart'         => 'Daily Views / Step 2 / Submissions',
                    'devices'            => 'Devices',
                    'browsers'           => 'Browsers',
                    'vehicleSelections'  => 'Vehicle Selections',
                    'serviceType'        => 'Service Type',
                    'pickupHours'        => 'Pickup Time Distribution (hours)',
                    'trafficSources'     => 'Traffic Sources',
                    'utmCampaigns'       => 'UTM Campaigns',
                    'topRoutes'          => 'Top Routes',
                    'languages'          => 'Languages',
                    'fieldInteractions'  => 'Field Interactions (drop-off analysis)',
                    'noData'             => 'No data',
                    'source'             => 'Source',
                    'sessions'           => 'Sessions',
                    'campaign'           => 'Campaign (source/medium/campaign)',
                    'pickup'             => 'Pickup',
                    'dropoff'            => 'Drop-off',
                    'count'              => 'Count',
                    'lost'               => 'lost',
                    'views'              => 'Views',
                    'step2Label'         => 'Step 2',
                    'hourly'             => 'Hourly',
                    'singleTrip'         => 'Single Trip',
                    'bookings'           => 'Bookings',
                    'sessionsInteracted' => 'Sessions that interacted',
                    'funnelStepViews'    => 'Form Views',
                    'funnelStep2'        => 'Reached Step 2',
                    'funnelSubmitted'    => 'Submitted',
                    'applyRange'         => 'Apply',
                    'formVersionSplit'   => 'Submissions by Form Version',
                    'formV2'             => 'Booking V2',
                    'formV3'             => 'Booking V3',
                ],
                'ru' => [
                    'title'              => 'Аналитика бронирования',
                    'disableAnalytics'   => 'Отключить аналитику',
                    'resetAll'           => 'СБРОСИТЬ ВСЕ ДАННЫЕ',
                    'resetConfirm'       => 'Вы уверены, что хотите сбросить ВСЕ данные аналитики? Это действие необратимо.',
                    'formViews'          => 'Просмотры формы',
                    'reachedStep2'       => 'Дошли до шага 2',
                    'submissions'        => 'Заявки',
                    'conversion'         => 'Конверсия',
                    'avgTime'            => 'Среднее время на форме',
                    'bounceRate'         => 'Отказы',
                    'funnel'             => 'Воронка конверсии',
                    'dailyChart'         => 'По дням: просмотры / шаг 2 / заявки',
                    'devices'            => 'Устройства',
                    'browsers'           => 'Браузеры',
                    'vehicleSelections'  => 'Выбор автомобиля',
                    'serviceType'        => 'Тип сервиса',
                    'pickupHours'        => 'Распределение по времени подачи (часы)',
                    'trafficSources'     => 'Источники трафика',
                    'utmCampaigns'       => 'UTM-кампании',
                    'topRoutes'          => 'Топ маршрутов',
                    'languages'          => 'Языки',
                    'fieldInteractions'  => 'Взаимодействие с полями (анализ отказов)',
                    'noData'             => 'Нет данных',
                    'source'             => 'Источник',
                    'sessions'           => 'Сессии',
                    'campaign'           => 'Кампания (source/medium/campaign)',
                    'pickup'             => 'Откуда',
                    'dropoff'            => 'Куда',
                    'count'              => 'Кол-во',
                    'lost'               => 'потеряно',
                    'views'              => 'Просмотры',
                    'step2Label'         => 'Шаг 2',
                    'hourly'             => 'Почасово',
                    'singleTrip'         => 'Разовая поездка',
                    'bookings'           => 'Бронирования',
                    'sessionsInteracted' => 'Сессий с взаимодействием',
                    'funnelStepViews'    => 'Просмотры формы',
                    'funnelStep2'        => 'Дошли до шага 2',
                    'funnelSubmitted'    => 'Отправлено',
                    'applyRange'         => 'Применить',
                    'formVersionSplit'   => 'Заявки по версии формы',
                    'formV2'             => 'Booking V2',
                    'formV3'             => 'Booking V3',
                ],
            ],
        ]);
    }

    public function render_page()
    {
        $disabled = get_option(self::OPTION_OFF);
?>
        <div class="wrap ipro-ba-wrap">

            <div class="ipro-ba-header">
                <h1 data-i18n="title">Booking Analytics</h1>
                <div class="ipro-ba-header__actions">
                    <div class="ipro-ba-lang-switcher">
                        <button type="button" class="ipro-ba-lang-btn" data-lang="en">EN</button>
                        <button type="button" class="ipro-ba-lang-btn" data-lang="ru">RU</button>
                    </div>
                    <label class="ipro-ba-toggle-label">
                        <input type="checkbox" id="ipro-ba-disable" <?php checked($disabled); ?>>
                        <span data-i18n="disableAnalytics">Disable Analytics</span>
                    </label>
                </div>
            </div>

            <div class="ipro-ba-periods">
                <button type="button" class="ipro-ba-period" data-period="1w">1W</button>
                <button type="button" class="ipro-ba-period ipro-ba-period--active" data-period="1m">1M</button>
                <button type="button" class="ipro-ba-period" data-period="1y">1Y</button>
                <button type="button" class="ipro-ba-period" data-period="custom">CUSTOM</button>
                <div class="ipro-ba-custom-range" id="ipro-ba-custom-range" style="display:none;">
                    <input type="date" id="ipro-ba-from">
                    <span>&mdash;</span>
                    <input type="date" id="ipro-ba-to">
                    <button type="button" class="button button-small" id="ipro-ba-apply-range" data-i18n="applyRange">Apply</button>
                </div>
            </div>

            <!-- KPI Cards -->
            <div class="ipro-ba-kpis">
                <div class="ipro-ba-kpi">
                    <span class="ipro-ba-kpi__value" id="kpi-views">0</span>
                    <span class="ipro-ba-kpi__label" data-i18n="formViews">Form Views</span>
                </div>
                <div class="ipro-ba-kpi">
                    <span class="ipro-ba-kpi__value" id="kpi-step2">0</span>
                    <span class="ipro-ba-kpi__label" data-i18n="reachedStep2">Reached Step 2</span>
                </div>
                <div class="ipro-ba-kpi">
                    <span class="ipro-ba-kpi__value" id="kpi-submissions">0</span>
                    <span class="ipro-ba-kpi__label" data-i18n="submissions">Submissions</span>
                </div>
                <div class="ipro-ba-kpi">
                    <span class="ipro-ba-kpi__value" id="kpi-conversion">0%</span>
                    <span class="ipro-ba-kpi__label" data-i18n="conversion">Conversion</span>
                </div>
                <div class="ipro-ba-kpi">
                    <span class="ipro-ba-kpi__value" id="kpi-avg-time">&mdash;</span>
                    <span class="ipro-ba-kpi__label" data-i18n="avgTime">Avg Time on Form</span>
                </div>
                <div class="ipro-ba-kpi">
                    <span class="ipro-ba-kpi__value" id="kpi-bounce">0%</span>
                    <span class="ipro-ba-kpi__label" data-i18n="bounceRate">Bounce Rate</span>
                </div>
            </div>

            <div class="ipro-ba-section ipro-ba-section--compact">
                <h2 class="ipro-ba-section__title" data-i18n="formVersionSplit">Submissions by Form Version</h2>
                <div class="ipro-ba-version-split" id="ipro-ba-version-split"></div>
            </div>

            <!-- Funnel -->
            <div class="ipro-ba-section">
                <h2 class="ipro-ba-section__title" data-i18n="funnel">Conversion Funnel</h2>
                <div class="ipro-ba-funnel" id="ipro-ba-funnel"></div>
            </div>

            <!-- Daily Chart -->
            <div class="ipro-ba-section">
                <h2 class="ipro-ba-section__title" data-i18n="dailyChart">Daily Views / Step 2 / Submissions</h2>
                <div class="ipro-ba-chart-wrap">
                    <canvas id="ipro-ba-chart" height="320"></canvas>
                </div>
            </div>

            <!-- Grid: Devices + Browsers -->
            <div class="ipro-ba-grid">
                <div class="ipro-ba-section">
                    <h2 class="ipro-ba-section__title" data-i18n="devices">Devices</h2>
                    <div class="ipro-ba-chart-wrap ipro-ba-chart-wrap--small">
                        <canvas id="ipro-ba-devices-chart" height="260"></canvas>
                    </div>
                </div>
                <div class="ipro-ba-section">
                    <h2 class="ipro-ba-section__title" data-i18n="browsers">Browsers</h2>
                    <div class="ipro-ba-chart-wrap ipro-ba-chart-wrap--small">
                        <canvas id="ipro-ba-browsers-chart" height="260"></canvas>
                    </div>
                </div>
            </div>

            <!-- Grid: Vehicles + Service Type -->
            <div class="ipro-ba-grid">
                <div class="ipro-ba-section">
                    <h2 class="ipro-ba-section__title" data-i18n="vehicleSelections">Vehicle Selections</h2>
                    <div class="ipro-ba-chart-wrap ipro-ba-chart-wrap--small">
                        <canvas id="ipro-ba-vehicles-chart" height="260"></canvas>
                    </div>
                </div>
                <div class="ipro-ba-section">
                    <h2 class="ipro-ba-section__title" data-i18n="serviceType">Service Type</h2>
                    <div class="ipro-ba-chart-wrap ipro-ba-chart-wrap--small">
                        <canvas id="ipro-ba-service-chart" height="260"></canvas>
                    </div>
                </div>
            </div>

            <!-- Pickup Hours -->
            <div class="ipro-ba-section">
                <h2 class="ipro-ba-section__title" data-i18n="pickupHours">Pickup Time Distribution (hours)</h2>
                <div class="ipro-ba-chart-wrap">
                    <canvas id="ipro-ba-hours-chart" height="260"></canvas>
                </div>
            </div>

            <!-- Grid: Traffic Sources + UTM Campaigns -->
            <div class="ipro-ba-grid">
                <div class="ipro-ba-section">
                    <h2 class="ipro-ba-section__title" data-i18n="trafficSources">Traffic Sources</h2>
                    <div class="ipro-ba-table-wrap" id="ipro-ba-sources"></div>
                </div>
                <div class="ipro-ba-section">
                    <h2 class="ipro-ba-section__title" data-i18n="utmCampaigns">UTM Campaigns</h2>
                    <div class="ipro-ba-table-wrap" id="ipro-ba-campaigns"></div>
                </div>
            </div>

            <!-- Grid: Top Routes + Languages -->
            <div class="ipro-ba-grid">
                <div class="ipro-ba-section">
                    <h2 class="ipro-ba-section__title" data-i18n="topRoutes">Top Routes</h2>
                    <div class="ipro-ba-table-wrap" id="ipro-ba-routes"></div>
                </div>
                <div class="ipro-ba-section">
                    <h2 class="ipro-ba-section__title" data-i18n="languages">Languages</h2>
                    <div class="ipro-ba-chart-wrap ipro-ba-chart-wrap--small">
                        <canvas id="ipro-ba-languages-chart" height="260"></canvas>
                    </div>
                </div>
            </div>

            <!-- Field Interactions (drop-off analysis) -->
            <div class="ipro-ba-section">
                <h2 class="ipro-ba-section__title" data-i18n="fieldInteractions">Field Interactions (drop-off analysis)</h2>
                <div class="ipro-ba-chart-wrap">
                    <canvas id="ipro-ba-fields-chart" height="300"></canvas>
                </div>
            </div>

        </div>
<?php
    }
}

new IPro_Booking_Analytics();
