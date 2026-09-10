<?php
/**
 * Booking V4 backend — extracted from hello-elementor/functions.php
 *
 * Snapshot of enqueue, distance/route AJAX, checkout submit, emails,
 * Turnstile, flight lookup and rate limiting. Not loaded by the live site.
 *
 * Expected companions (same snapshot):
 *   ../includes/booking-v3-i18n.php
 *   ../includes/ipro-route-distance-helpers.php
 *
 * Required constants / env vars: see booking-v4/.env.example
 */

if (!defined('ABSPATH')) {
  exit;
}

if (!function_exists('ipro_booking_v4_env')) {
  /**
   * Read a config value from a PHP constant first, then the environment.
   */
  function ipro_booking_v4_env(string $key, string $fallback = ''): string
  {
    if (defined($key)) {
      $value = constant($key);
      if (is_string($value) && $value !== '') {
        return $value;
      }
    }
    $from_env = getenv($key);
    if (is_string($from_env) && $from_env !== '') {
      return $from_env;
    }
    return $fallback;
  }
}

function ipro_turnstile_enabled(): bool
{
  if (!defined('IPRO_TURNSTILE_ENABLED')) {
    return true;
  }

  return (bool) IPRO_TURNSTILE_ENABLED;
}

function ipro_get_turnstile_csp_nonce(): string
{
  static $stored = false;
  static $nonce  = '';

  if ($stored) {
    return $nonce;
  }
  $stored = true;

  if (defined('IPRO_TURNSTILE_CSP_NONCE') && is_string(IPRO_TURNSTILE_CSP_NONCE) && IPRO_TURNSTILE_CSP_NONCE !== '') {
    $nonce = IPRO_TURNSTILE_CSP_NONCE;
    return $nonce;
  }

  $nonce = bin2hex(random_bytes(16));
  return $nonce;
}

add_action(
  'send_headers',
  static function (): void {
    if (headers_sent() || (!is_page_template('page-booking-v3.php') && !is_page_template('page-booking-v4.php')) || !ipro_turnstile_enabled()) {
      return;
    }
    header('X-Turnstile-CSP-Nonce: ' . ipro_get_turnstile_csp_nonce(), false);
  },
  99
);

add_filter(
  'script_loader_tag',
  static function ($tag, $handle) {
    if ($handle !== 'ipro-turnstile' || preg_match('/\snonce\s*=/i', $tag)) {
      return $tag;
    }
    $csp_nonce = ipro_get_turnstile_csp_nonce();
    if ($csp_nonce === '') {
      return $tag;
    }
    return (string) preg_replace('/<script(\s+)/i', '<script nonce="' . esc_attr($csp_nonce) . '"$1', $tag, 1);
  },
  10,
  2
);

function ipro_enqueue_booking_v4_assets()
{
  if (!is_page_template('page-booking-v4.php')) return;

  $lang = function_exists('pll_current_language') ? pll_current_language() : 'en';

  $ipro_booking_contact_url = home_url('/contact/');
  $ipro_contact_page = get_page_by_path('contact');
  if ($ipro_contact_page) {
    $contact_page_id = $ipro_contact_page->ID;
    if (function_exists('pll_get_post')) {
      $translated_id = pll_get_post($contact_page_id, $lang);
      if ($translated_id) {
        $contact_page_id = (int) $translated_id;
      }
    }
    $ipro_booking_contact_url = get_permalink($contact_page_id);
  }
  if (function_exists('pll_translate_url') && $lang !== 'en') {
    $ipro_booking_contact_url = pll_translate_url($ipro_booking_contact_url, $lang);
  }

  $booking_js_deps = ['jquery', 'ipro-pricing-engine-v4'];

  if (ipro_turnstile_enabled()) {
    wp_enqueue_script(
      'ipro-turnstile',
      'https://challenges.cloudflare.com/turnstile/v0/api.js',
      [],
      null,
      true
    );
    wp_script_add_data('ipro-turnstile', 'strategy', 'defer');
    $booking_js_deps[] = 'ipro-turnstile';
  }

  wp_enqueue_style('flatpickr', 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css', [], '4.6.13');

  wp_enqueue_script(
    'ipro-pricing-data-v4',
    get_template_directory_uri() . '/assets/js/ipro-pricing-data-v4.js',
    [],
    '1.2.3',
    true
  );
  wp_script_add_data('ipro-pricing-data-v4', 'strategy', 'defer');

  wp_enqueue_script(
    'ipro-pricing-engine-v4',
    get_template_directory_uri() . '/assets/js/ipro-pricing-engine-v4.js',
    ['ipro-pricing-data-v4'],
    '1.2.3',
    true
  );
  wp_script_add_data('ipro-pricing-engine-v4', 'strategy', 'defer');

  wp_enqueue_script(
    'ipro-booking-steps-v4',
    get_template_directory_uri() . '/assets/js/ipro-booking-steps-v4.js',
    $booking_js_deps,
    '1.1.1',
    true
  );
  wp_script_add_data('ipro-booking-steps-v4', 'strategy', 'defer');

  wp_localize_script('ipro-booking-steps-v4', 'iproBooking', [
    'ajaxUrl'          => admin_url('admin-ajax.php'),
    'nonce'            => wp_create_nonce('ipro_distance_nonce'),
    'turnstileEnabled' => ipro_turnstile_enabled(),
    'lang'             => $lang,
    'countries'        => ipro_booking_v3_localized_countries(),
    'defaultCountry'   => 'United Kingdom',
    'vehicleNames'     => [
      'sclass'     => __('Mercedes-Benz S-Class', 'hello-elementor'),
      'vclass'     => __('Mercedes-Benz V-Class', 'hello-elementor'),
      'eclass'     => __('Mercedes-Benz E-Class', 'hello-elementor'),
      'rangerover' => __('Range Rover Autobiography', 'hello-elementor'),
      'bmw7'       => __('BMW 7 Series', 'hello-elementor'),
    ],
  ]);

  wp_localize_script('ipro-booking-steps-v4', 'iproBookingL10n', [
    'singleTrip'           => __('One Way', 'hello-elementor'),
    'airportTransfer'      => __('Airport Transfer', 'hello-elementor'),
    'hourly'               => __('Hourly/As directed', 'hello-elementor'),
    'typeOfService'        => __('TYPE OF SERVICE', 'hello-elementor'),
    'pickupLocation'       => __('PICKUP LOCATION', 'hello-elementor'),
    'dropoffLocation'      => __('FINAL DESTINATION', 'hello-elementor'),
    'vehicle'              => __('VEHICLE', 'hello-elementor'),
    'duration'             => __('DURATION', 'hello-elementor'),
    'hours'                => __('hours', 'hello-elementor'),
    'stop'                 => __('STOP', 'hello-elementor'),
    'tripbarPickup'        => __('Pickup location', 'hello-elementor'),
    'tripbarDestination'   => __('destination', 'hello-elementor'),
    'tripbarDatetime'      => __('date & time', 'hello-elementor'),
    'dateTime'             => __('DATE & TIME', 'hello-elementor'),
    'checkout'             => __('CHECKOUT', 'hello-elementor'),
    'errorPickup'          => __('Please enter a pickup location', 'hello-elementor'),
    'errorDropoff'         => __('Please enter a final destination', 'hello-elementor'),
    'errorName'            => __('Please enter your name', 'hello-elementor'),
    'errorFirstName'       => __('Please enter your first name', 'hello-elementor'),
    'errorLastName'        => __('Please enter your last name', 'hello-elementor'),
    'errorEmail'           => __('Please enter your email', 'hello-elementor'),
    'errorEmailInvalid'    => __('Please enter a valid email', 'hello-elementor'),
    'errorPhone'           => __('Please enter your phone number', 'hello-elementor'),
    'errorPhoneMin'        => __('Min 8 characters required', 'hello-elementor'),
    'errorDate'            => __('Please select a date', 'hello-elementor'),
    'errorTime'            => __('Please select a pickup time', 'hello-elementor'),
    'errorTimeMinLead'     => __('Pickup must be at least 3 hours from now (London time)', 'hello-elementor'),
    'errorFillRequired'    => __('Please fill in all required fields before continuing', 'hello-elementor'),
    'errorPassengers'      => __('Please select number of passengers', 'hello-elementor'),
    'errorLargeBags'       => __('Please select number of large suitcases', 'hello-elementor'),
    'errorCaptcha'         => __('Please complete the CAPTCHA', 'hello-elementor'),
    'errorTerms'           => __('Please accept the Terms and conditions', 'hello-elementor'),
    'errorSubmissionFailed'=> __('Submission failed. Please try again.', 'hello-elementor'),
    'errorNetwork'         => __('Network error. Please try again.', 'hello-elementor'),
    'thankYou'             => __('Thank you!', 'hello-elementor'),
    'confirmationMsg'      => __('Your booking request has been submitted. We will contact you shortly.', 'hello-elementor'),
    'checkoutDone'         => __('DONE', 'hello-elementor'),
    'bookingReference'     => __('Booking Reference:', 'hello-elementor'),
    'flightNotFound'       => __('Flight not found — you can still proceed', 'hello-elementor'),
    'addressNotFound'      => __('Address not found', 'hello-elementor'),
    'moveMapToPin'         => __('Move the map to position the pin', 'hello-elementor'),
    'routeDistanceFmt'     => __('%1$s mi (%2$s km)', 'hello-elementor'),
    'routeDurationHFmt'    => __('%1$sh %2$smin', 'hello-elementor'),
    'routeDurationMFmt'    => __('%1$s min', 'hello-elementor'),
    'fromPriceFmt'         => __('From £ %d', 'hello-elementor'),
    'fromPricePerHourFmt'  => __('From £ %d per hour', 'hello-elementor'),
    'vehiclePricePerHourFmt' => __('£ %d/h', 'hello-elementor'),
    'internationalPriceContact' => __('Price on request — contact us', 'hello-elementor'),
    'internationalPriceContactShort' => __('Price on request — contact us', 'hello-elementor'),
    'internationalPriceContactCard' => __('Price on request', 'hello-elementor'),
    'internationalPriceContactPrefix' => __('Price on request —', 'hello-elementor'),
    'internationalPriceContactLink' => __('Contact us', 'hello-elementor'),
    'internationalPriceContactUrl' => $ipro_booking_contact_url,
    'priceSubtotal'        => __('Service', 'hello-elementor'),
    'priceVat'             => __('VAT 20%', 'hello-elementor'),
    'priceTotal'           => __('Total (incl. VAT)', 'hello-elementor'),
    'priceInclVat'         => __('incl. VAT', 'hello-elementor'),
    'estimatedPrice'       => __('Estimated price', 'hello-elementor'),
    'step1FromOneway'      => 55,
    'step1FromHourly'      => 55,
  ]);

  wp_enqueue_script(
    'google-maps-places',
    'https://maps.googleapis.com/maps/api/js?key=' . IPRO_GOOGLE_FRONT_KEY . '&libraries=places,marker&v=weekly&loading=async&language=' . esc_attr($lang),
    [],
    null,
    true
  );
  wp_script_add_data('google-maps-places', 'strategy', 'defer');

  wp_enqueue_script('flatpickr', 'https://cdn.jsdelivr.net/npm/flatpickr', [], '4.6.13', true);
  wp_script_add_data('flatpickr', 'strategy', 'defer');

  $flatpickr_locale_map = [
    'ru' => 'ru',
    'de' => 'de',
    'fr' => 'fr',
    'es' => 'es',
    'it' => 'it',
    'zh' => 'zh',
    'ar' => 'ar',
  ];
  if ($lang !== 'en' && isset($flatpickr_locale_map[$lang])) {
    $fp_locale = $flatpickr_locale_map[$lang];
    wp_enqueue_script(
      'flatpickr-locale-' . $fp_locale,
      'https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/' . $fp_locale . '.js',
      ['flatpickr'],
      '4.6.13',
      true
    );
    wp_script_add_data('flatpickr-locale-' . $fp_locale, 'strategy', 'defer');
  }

  wp_enqueue_style(
    'ipro-booking-v3',
    get_template_directory_uri() . '/assets/css/booking-v3.css',
    [],
    '2.5.2'
  );

  wp_enqueue_style(
    'ipro-booking-steps-v3',
    get_template_directory_uri() . '/assets/css/ipro-booking-steps-v3.css',
    ['ipro-booking-v3'],
    '1.0.0'
  );

  wp_enqueue_style(
    'ipro-booking-v4',
    get_template_directory_uri() . '/assets/css/booking-v4.css',
    ['ipro-booking-v3'],
    '1.1.0'
  );

  wp_enqueue_script(
    'ipro-booking-analytics',
    get_template_directory_uri() . '/assets/js/booking-analytics.js',
    ['ipro-booking-steps-v4'],
    '1.3.0',
    true
  );
  wp_script_add_data('ipro-booking-analytics', 'strategy', 'defer');
  wp_localize_script('ipro-booking-analytics', 'iproBATracker', [
    'endpoint' => rest_url('ipro-analytics/v1/track'),
  ]);
}
add_action('wp_enqueue_scripts', 'ipro_enqueue_booking_v4_assets');

// Distance Matrix AJAX handler for booking price calculation
add_action('wp_ajax_nopriv_ipro_get_distance', 'ipro_get_distance_handler');
add_action('wp_ajax_ipro_get_distance', 'ipro_get_distance_handler');

function ipro_get_distance_handler()
{
  check_ajax_referer('ipro_distance_nonce', 'nonce');
  ipro_ajax_rate_limit('distance', 60);

  $origin      = sanitize_text_field($_POST['origin'] ?? '');
  $destination = sanitize_text_field($_POST['destination'] ?? '');
  if (!$origin || !$destination) {
    wp_send_json_error('Missing params');
  }

  $cache_key = 'ipro_dist_' . md5($origin . '|' . $destination);
  $cached    = get_transient($cache_key);
  if ($cached !== false) {
    $cached['cached'] = true;
    wp_send_json_success($cached);
  }

  $api_key = defined('IPRO_GOOGLE_SERVER_KEY') ? IPRO_GOOGLE_SERVER_KEY : '';
  $url = 'https://maps.googleapis.com/maps/api/distancematrix/json?' . http_build_query([
    'origins'      => $origin,
    'destinations' => $destination,
    'units'        => 'imperial',
    'key'          => $api_key,
  ]);

  $resp = wp_remote_get($url, ['timeout' => 10]);
  if (is_wp_error($resp)) {
    wp_send_json_error('API request failed: ' . $resp->get_error_message());
  }

  $body = json_decode(wp_remote_retrieve_body($resp), true);
  $el   = $body['rows'][0]['elements'][0] ?? null;

  if (!$el || $el['status'] !== 'OK') {
    wp_send_json_error('No route found. Status: ' . ($el['status'] ?? 'unknown'));
  }

  $result = [
    'distance_miles' => round($el['distance']['value'] / 1609.344, 1),
    'duration_text'  => $el['duration']['text'],
    'cached'         => false,
  ];

  set_transient($cache_key, $result, 7 * DAY_IN_SECONDS);
  wp_send_json_success($result);
}

/**
 * Multi-leg Directions API for Booking V4 (Pickup → Stops → Destination).
 * Does not replace ipro_get_distance (v3, Distance Matrix, single leg).
 *
 * Uses the Directions API (not Distance Matrix — it has no alternatives support)
 * with alternatives=true per leg, and picks the SHORTEST route by distance among
 * the alternatives (never the first, never the fastest by duration). This is the
 * fix for report 22.07.2026 bug #3 — Google Maps was choosing an M25 detour
 * instead of the direct route on some London-adjacent legs.
 *
 * IMPORTANT: IPRO_GOOGLE_SERVER_KEY may be restricted (in Google Cloud Console's
 * API restrictions list) to only the Distance Matrix API. If so, every Directions
 * call returns REQUEST_DENIED and this handler transparently falls back to
 * Distance Matrix per leg so pricing keeps working — but the shortest-route fix
 * only takes effect once the Directions API is enabled for that key. Check the
 * server error log for "Directions API unavailable" to see if this is happening.
 */
add_action('wp_ajax_nopriv_ipro_get_route_distance', 'ipro_get_route_distance_handler');
add_action('wp_ajax_ipro_get_route_distance', 'ipro_get_route_distance_handler');

function ipro_get_route_distance_handler()
{
  check_ajax_referer('ipro_distance_nonce', 'nonce');
  ipro_ajax_rate_limit('route_distance', 60);

  $origin      = sanitize_text_field(wp_unslash($_POST['origin'] ?? ''));
  $destination = sanitize_text_field(wp_unslash($_POST['destination'] ?? ''));
  if ($origin === '' || $destination === '') {
    wp_send_json_error(['message' => 'Missing params']);
  }

  $stops = [];
  $stops_raw = trim((string) wp_unslash($_POST['stops'] ?? ''));
  if ($stops_raw !== '') {
    foreach (preg_split('/\s*\|\s*/', $stops_raw) as $stop) {
      $stop = sanitize_text_field(trim($stop));
      if ($stop !== '') {
        $stops[] = $stop;
      }
    }
  }

  $points = array_merge([$origin], $stops, [$destination]);
  $normalized = array_map(static function ($p) {
    return strtolower(preg_replace('/\s+/', ' ', trim($p)));
  }, $points);
  $cache_key = 'ipro_route_dist_' . md5(implode('|', $normalized));
  $cached = get_transient($cache_key);
  if ($cached !== false && is_array($cached)) {
    $cached['cached'] = true;
    wp_send_json_success($cached);
  }

  $api_key = defined('IPRO_GOOGLE_SERVER_KEY') ? IPRO_GOOGLE_SERVER_KEY : '';
  if ($api_key === '') {
    wp_send_json_error(['message' => 'API key missing']);
  }

  $total_meters = 0;
  $total_seconds = 0;
  $leg_count = count($points) - 1;

  // Statuses that indicate the Directions API itself is unusable for this key/quota
  // (as opposed to ZERO_RESULTS/NOT_FOUND, which mean no route genuinely exists —
  // falling back would not help and should surface as a real error instead).
  $directions_unavailable_statuses = [
    'REQUEST_DENIED', 'OVER_QUERY_LIMIT', 'OVER_DAILY_LIMIT', 'INVALID_REQUEST', 'UNKNOWN_ERROR',
  ];

  for ($i = 0; $i < $leg_count; $i++) {
    $leg_origin = $points[$i];
    $leg_dest   = $points[$i + 1];
    $url = 'https://maps.googleapis.com/maps/api/directions/json?' . http_build_query([
      'origin'       => $leg_origin,
      'destination'  => $leg_dest,
      'alternatives' => 'true',
      'units'        => 'imperial',
      'key'          => $api_key,
    ]);

    $resp = wp_remote_get($url, ['timeout' => 10]);
    $body = is_wp_error($resp) ? null : json_decode(wp_remote_retrieve_body($resp), true);
    $status = is_array($body) ? ($body['status'] ?? '') : '';

    $directions_unavailable = is_wp_error($resp)
      || !is_array($body)
      || in_array($status, $directions_unavailable_statuses, true);

    if ($directions_unavailable) {
      error_log(
        '[ipro_get_route_distance] Directions API unavailable (status=' . ($status !== '' ? $status : 'request_failed')
        . ') — falling back to Distance Matrix for this leg. Enable the Directions API for '
        . 'IPRO_GOOGLE_SERVER_KEY in Google Cloud Console to restore the shortest-route fix (report bug #3).'
      );

      $dm_url = 'https://maps.googleapis.com/maps/api/distancematrix/json?' . http_build_query([
        'origins'      => $leg_origin,
        'destinations' => $leg_dest,
        'units'        => 'imperial',
        'key'          => $api_key,
      ]);
      $dm_resp = wp_remote_get($dm_url, ['timeout' => 10]);
      if (is_wp_error($dm_resp)) {
        wp_send_json_error(['message' => 'API request failed: ' . $dm_resp->get_error_message()]);
      }
      $dm_body = json_decode(wp_remote_retrieve_body($dm_resp), true);
      $el = $dm_body['rows'][0]['elements'][0] ?? null;
      if (!$el || ($el['status'] ?? '') !== 'OK') {
        wp_send_json_error([
          'message' => 'No route found',
          'status'  => $el['status'] ?? ($dm_body['status'] ?? 'unknown'),
          'leg'     => $i + 1,
        ]);
      }

      $total_meters  += (int) ($el['distance']['value'] ?? 0);
      $total_seconds += (int) ($el['duration']['value'] ?? 0);
      continue;
    }

    if ($status !== 'OK') {
      wp_send_json_error([
        'message' => 'No route found',
        'status'  => $status !== '' ? $status : 'unknown',
        'leg'     => $i + 1,
      ]);
    }

    $shortest = ipro_select_shortest_directions_route($body);
    if ($shortest === null) {
      wp_send_json_error([
        'message' => 'No route found',
        'status'  => 'ZERO_RESULTS',
        'leg'     => $i + 1,
      ]);
    }

    $total_meters  += $shortest['meters'];
    $total_seconds += ipro_directions_route_duration_seconds($shortest['route']);
  }

  $miles = round($total_meters / 1609.344, 1);
  $duration_text = ipro_format_route_duration($total_seconds);

  $result = [
    'distance_miles' => $miles,
    'duration_text'  => $duration_text,
    'legs'           => $leg_count,
    'cached'         => false,
  ];

  set_transient($cache_key, $result, DAY_IN_SECONDS);
  wp_send_json_success($result);
}

add_action('wp_ajax_nopriv_ipro_submit_booking', 'ipro_submit_booking_handler');
add_action('wp_ajax_ipro_submit_booking', 'ipro_submit_booking_handler');

/**
 * True when any single route point (pickup, dropoff, or one stop) mentions an airport or terminal.
 */
function ipro_booking_route_mentions_airport(array $fields): bool
{
  $addresses = array_filter([
    $fields['pickup'] ?? '',
    $fields['dropoff'] ?? '',
  ], static function ($value) {
    return $value !== '';
  });

  $stops_raw = trim((string) ($fields['stops'] ?? ''));
  if ($stops_raw !== '') {
    foreach (preg_split('/\s*\|\s*/', $stops_raw) as $stop) {
      $stop = trim($stop);
      if ($stop !== '') {
        $addresses[] = $stop;
      }
    }
  }

  if ($addresses === []) {
    return false;
  }

  $pattern = '/airport|terminal|аэропорт|аэровокзал|aeroport|heathrow|gatwick|stansted|luton|london city airport|birmingham airport|manchester airport|edinburgh airport/iu';

  foreach ($addresses as $address) {
    $haystack = function_exists('mb_strtolower')
      ? mb_strtolower($address, 'UTF-8')
      : strtolower($address);
    if (preg_match($pattern, $haystack)) {
      return true;
    }
  }

  return false;
}

function ipro_validate_pickup_datetime(string $date, string $time, int $lead_minutes = 180): bool
{
  if ($date === '' || $time === '') {
    return false;
  }

  $tz = new DateTimeZone('Europe/London');
  $pickup_dt = DateTime::createFromFormat('Y-m-d H:i', $date . ' ' . $time, $tz);
  if (!$pickup_dt) {
    return false;
  }

  $now = new DateTime('now', $tz);
  $min_dt = (clone $now)->modify('+' . $lead_minutes . ' minutes');

  return $pickup_dt >= $min_dt;
}

function ipro_submit_booking_handler()
{
  check_ajax_referer('ipro_distance_nonce', 'nonce');
  ipro_ajax_rate_limit('submit_booking', 10);

  if (ipro_turnstile_enabled()) {
    $turnstile_token = sanitize_text_field(wp_unslash($_POST['turnstileToken'] ?? ''));

    if ($turnstile_token === '') {
      wp_send_json_error(__('Security check failed. Please try again.', 'hello-elementor'));
    }

    $secret = defined('IPRO_TURNSTILE_SECRET') ? IPRO_TURNSTILE_SECRET : '';
    if ($secret === '') {
      wp_send_json_error(__('Security check failed. Please try again.', 'hello-elementor'));
    }
    $verify = wp_remote_post('https://challenges.cloudflare.com/turnstile/v0/siteverify', [
      'body' => [
        'secret'   => $secret,
        'response' => $turnstile_token,
        'remoteip' => $_SERVER['REMOTE_ADDR'] ?? '',
      ],
    ]);
    $verify_body = json_decode(wp_remote_retrieve_body($verify), true);
    if (empty($verify_body['success'])) {
      wp_send_json_error(__('Security check failed. Please try again.', 'hello-elementor'));
    }
  }

  $fields = [
    'serviceType'    => sanitize_text_field($_POST['serviceType'] ?? ''),
    'pickup'         => sanitize_text_field($_POST['pickup'] ?? ''),
    'dropoff'        => sanitize_text_field($_POST['dropoff'] ?? ''),
    'stops'          => sanitize_text_field($_POST['stops'] ?? ''),
    'vehicle'        => sanitize_text_field($_POST['vehicle'] ?? ''),
    'estimatedPrice' => sanitize_text_field($_POST['estimatedPrice'] ?? ''),
    'duration'       => sanitize_text_field($_POST['duration'] ?? ''),
    'name'           => sanitize_text_field($_POST['name'] ?? ''),
    'country'        => sanitize_text_field($_POST['country'] ?? ''),
    'phone'          => sanitize_text_field($_POST['phone'] ?? ''),
    'email'          => sanitize_email($_POST['email'] ?? ''),
    'flightNumber'   => sanitize_text_field($_POST['flightNumber'] ?? ''),
    'addons'         => sanitize_text_field($_POST['addons'] ?? ''),
    'pickupDate'     => sanitize_text_field($_POST['pickupDate'] ?? ''),
    'pickupTime'     => sanitize_text_field($_POST['pickupTime'] ?? ''),
    'passengers'     => sanitize_text_field($_POST['passengers'] ?? ''),
    'smallSuitcases' => sanitize_text_field($_POST['smallSuitcases'] ?? ''),
    'largeSuitcases' => sanitize_text_field($_POST['largeSuitcases'] ?? ''),
    'comments'       => sanitize_textarea_field($_POST['comments'] ?? ''),
    'newsletter'     => sanitize_text_field($_POST['newsletter'] ?? 'no'),
  ];

  if (empty($fields['name']) || empty($fields['phone']) || empty($fields['pickup'])) {
    wp_send_json_error(__('Please fill in all required fields.', 'hello-elementor'));
  }
  if (!empty($fields['email']) && !is_email($fields['email'])) {
    wp_send_json_error(__('Please enter a valid email address.', 'hello-elementor'));
  }

  if (!empty($fields['pickupDate']) && !empty($fields['pickupTime']) && !ipro_validate_pickup_datetime($fields['pickupDate'], $fields['pickupTime'])) {
    wp_send_json_error(__('Pickup must be at least 3 hours from now (London time)', 'hello-elementor'));
  }

  $booking_ref = (int) get_option('ipro_booking_counter', 0) + 1;
  update_option('ipro_booking_counter', $booking_ref);
  $booking_ref_str = '#' . str_pad($booking_ref, 3, '0', STR_PAD_LEFT);

  $is_airport = !empty($fields['flightNumber'])
    || ipro_booking_route_mentions_airport($fields);
  if ($fields['serviceType'] === 'hourly') {
    $service_label = 'Hourly/As directed';
  } elseif ($is_airport) {
    $service_label = 'Airport Transfer';
  } else {
    $service_label = 'Single Trip';
  }

  $lang_to_locale  = [
    'en' => 'en_US', 'ru' => 'ru_RU', 'de' => 'de_DE',
    'fr' => 'fr_FR', 'es' => 'es_ES', 'it' => 'it_IT',
    'zh' => 'zh_CN', 'ar' => 'ar',
  ];
  $customer_lang   = sanitize_text_field($_POST['locale'] ?? 'en');
  $customer_locale = $lang_to_locale[$customer_lang] ?? 'en_US';

  $subject = 'Booking Reference ' . $booking_ref_str . ' — ' . $fields['name'];
  switch_to_locale('en_US');
  $body = ipro_build_booking_email_html($fields, $booking_ref_str, $service_label);
  restore_previous_locale();

  $sent = ipro_send_booking_email($subject, $body, $fields['email'] ?? '', $fields['name'] ?? '');

  if (!empty($fields['email'])) {
    $customer_subject = ipro_customer_email_t('Your booking is confirmed', $customer_locale);
    $customer_body    = ipro_build_customer_confirmation_email_html($fields, $booking_ref_str, $service_label, $customer_locale);
    ipro_send_customer_confirmation_email($fields['email'], $customer_subject, $customer_body);
  }

  if ($sent) {
    $form_version = sanitize_text_field(wp_unslash($_POST['formVersion'] ?? 'v3'));
    if (!in_array($form_version, ['v2', 'v3'], true)) {
      $form_version = 'v3';
    }
    do_action('ipro_booking_submitted', $fields, $booking_ref, $form_version);
    wp_send_json_success([
      'message'    => __('Booking submitted successfully!', 'hello-elementor'),
      'bookingRef' => $booking_ref_str,
    ]);
  } else {
    wp_send_json_error(__('Failed to send booking. Please try again or contact us directly.', 'hello-elementor'));
  }
}

function ipro_send_booking_email($subject, $html_body, $customer_email = '', $customer_name = '')
{
  $to = ipro_booking_v4_env('BOOKING_MAIL_TO', '<BOOKING_MAIL_TO>');

  $headers = [
    'Content-Type: text/html; charset=UTF-8',
  ];

  $bcc = ipro_booking_v4_env('BOOKING_MAIL_BCC', '');
  if ($bcc !== '' && $bcc !== '<BOOKING_MAIL_BCC>' && is_email($bcc)) {
    $headers[] = 'Bcc: ' . $bcc;
  }

  if (is_email($customer_email)) {
    $customer_name = sanitize_text_field($customer_name);
    $headers[] = $customer_name !== ''
      ? 'Reply-To: ' . $customer_name . ' <' . $customer_email . '>'
      : 'Reply-To: ' . $customer_email;
  }

  return wp_mail($to, $subject, $html_body, $headers);
}

function ipro_customer_email_t(string $text, string $locale): string
{
  static $map = null;
  if ($map === null) {
    $map = ipro_booking_v3_i18n_map();
  }
  return $map[$text][$locale] ?? $text;
}

function ipro_send_customer_confirmation_email($to_email, $subject, $html_body)
{
  if (!is_email($to_email)) return false;
  return wp_mail($to_email, $subject, $html_body, ['Content-Type: text/html; charset=UTF-8']);
}

function ipro_build_customer_confirmation_email_html($f, $ref, $service_label, $locale = 'en_US')
{
  $t = function(string $s) use ($locale): string {
    return ipro_customer_email_t($s, $locale);
  };

  $date_str = current_time('F j, Y');
  $time_str = current_time('g:i a');
  $page_url = home_url('/booking/');

  $phone_display = esc_html($f['phone'] ?? '');
  $phone_href    = 'tel:' . preg_replace('/[^+0-9]/', '', $f['phone'] ?? '');

  $translated_service = $t($service_label);

  $flight_row = '';
  if (!empty($f['flightNumber'])) {
    $flight_row = '
        <tr>
          <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">' . esc_html($t('Flight number')) . '</td>
        </tr>
        <tr>
          <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['flightNumber']) . '</td>
        </tr>';
  }

  $dropoff_row = '';
  if (!empty($f['dropoff'])) {
    $dropoff_row = '
        <tr>
          <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">' . esc_html($t('DROP-OFF LOCATION')) . '</td>
        </tr>
        <tr>
          <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['dropoff']) . '</td>
        </tr>';
  }

  $stops_row = '';
  if (!empty($f['stops'])) {
    $stops_row = '
        <tr>
          <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">' . esc_html($t('STOPS')) . '</td>
        </tr>
        <tr>
          <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['stops']) . '</td>
        </tr>';
  }

  $duration_row = '';
  if (!empty($f['duration'])) {
    $duration_row = '
        <tr>
          <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">' . esc_html($t('DURATION')) . '</td>
        </tr>
        <tr>
          <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['duration']) . ' ' . esc_html($t('hours')) . '</td>
        </tr>';
  }

  $comments_row = '';
  if (!empty($f['comments'])) {
    $comments_row = '
        <tr>
          <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">' . esc_html($t('Comments')) . '</td>
        </tr>
        <tr>
          <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['comments']) . '</td>
        </tr>';
  }

  $price_row = '';
  if (!empty($f['estimatedPrice'])) {
    $price_row = '
        <tr>
          <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">' . esc_html($t('ESTIMATED PRICE')) . '</td>
        </tr>
        <tr>
          <td style="padding:0 0 16px;font-size:15px;color:#555;">&#163;' . esc_html($f['estimatedPrice']) . '</td>
        </tr>';
  }

  $addons_row = ipro_booking_addons_email_markup($f['addons'] ?? '', $locale);

  $newsletter_raw  = strtolower(trim((string) ($f['newsletter'] ?? 'no')));
  $newsletter_on   = in_array($newsletter_raw, ['yes', '1', 'true'], true);
  $newsletter_mark = $newsletter_on
    ? '<span style="color:#2e7d32;font-weight:700;font-size:17px;line-height:1.2;" aria-hidden="true">&#10003;</span>'
    : '<span style="color:#b71c1c;font-weight:700;font-size:17px;line-height:1.2;" aria-hidden="true">&#10007;</span>';
  $newsletter_label = $t('I would like to receive news and updates about festivals, racing, football, and other events');
  $newsletter_row   = '
      <tr>
        <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">' . esc_html($t('Newsletter')) . '</td>
      </tr>
      <tr>
        <td style="padding:0 0 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;margin:6px 0 0;">
            <tr>
              <td style="padding:5px 10px 5px 0;width:34px;vertical-align:top;text-align:center;">' . $newsletter_mark . '</td>
              <td style="padding:5px 0;vertical-align:top;font-size:15px;color:#555;">' . esc_html($newsletter_label) . '</td>
            </tr>
          </table>
        </td>
      </tr>';

  return '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta name="viewport" content="width=device-width"/>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:30px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:4px;overflow:hidden;max-width:600px;width:100%;">

  <tr>
    <td style="padding:30px 40px 10px;">
      <h1 style="margin:0;font-size:22px;color:#333;">Booking Reference ' . esc_html($ref) . '</h1>
    </td>
  </tr>
  <tr>
    <td style="padding:0 40px;font-size:13px;color:#999;">Date: ' . esc_html($date_str) . '</td>
  </tr>
  <tr>
    <td style="padding:2px 40px 20px;font-size:13px;color:#999;">Time: ' . esc_html($time_str) . '</td>
  </tr>
  <tr>
    <td style="padding:0 40px;font-size:14px;color:#555;">Hello, ' . esc_html($f['name'] ?? '') . '!<br><br>' . esc_html($t('Your booking has been received. Here are your booking details:')) . '</td>
  </tr>
  <tr>
    <td style="padding:24px 40px 8px;">
      <h2 style="margin:0;font-size:18px;font-weight:bold;color:#333;">' . esc_html($t('BOOKING SUMMARY')) . '</h2>
    </td>
  </tr>

  <tr><td style="padding:0 40px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 0 4px;font-weight:bold;font-size:14px;color:#333;">' . esc_html($t('YOUR NAME')) . '</td>
      </tr>
      <tr>
        <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['name'] ?? '') . '</td>
      </tr>

      <tr>
        <td style="padding:0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="50%" valign="top" style="padding:8px 10px 4px 0;font-weight:bold;font-size:14px;color:#333;">' . esc_html($t('Country')) . '</td>
              <td width="50%" valign="top" style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">' . esc_html($t('Phone Number')) . '</td>
            </tr>
            <tr>
              <td style="padding:0 10px 16px 0;font-size:15px;color:#555;">' . esc_html($f['country'] ?? '') . '</td>
              <td style="padding:0 0 16px;font-size:15px;">
                <a href="' . esc_attr($phone_href) . '" style="color:#2196F3;text-decoration:none;">' . $phone_display . '</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">' . esc_html($t('TYPE OF SERVICE')) . '</td>
      </tr>
      <tr>
        <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($translated_service) . '</td>
      </tr>

      ' . $flight_row . '
      ' . $duration_row . '

      <tr>
        <td style="padding:0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="50%" valign="top" style="padding:8px 10px 4px 0;font-weight:bold;font-size:14px;color:#333;">' . esc_html($t('PICKUP DATE')) . '</td>
              <td width="50%" valign="top" style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">' . esc_html($t('PICKUP TIME')) . '</td>
            </tr>
            <tr>
              <td style="padding:0 10px 16px 0;font-size:15px;color:#555;">' . esc_html($f['pickupDate'] ?? '') . '</td>
              <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['pickupTime'] ?? '') . '</td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">' . esc_html($t('PICKUP LOCATION')) . '</td>
      </tr>
      <tr>
        <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['pickup'] ?? '') . '</td>
      </tr>

      ' . $stops_row . '
      ' . $dropoff_row . '

      <tr>
        <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">' . esc_html($t('CHOOSE VEHICLE')) . '</td>
      </tr>
      <tr>
        <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['vehicle'] ?? '') . '</td>
      </tr>

      <tr>
        <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">' . esc_html($t('NUMBER OF PASSENGERS')) . '</td>
      </tr>
      <tr>
        <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['passengers'] ?: '—') . '</td>
      </tr>

      <tr>
        <td style="padding:0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="50%" valign="top" style="padding:8px 10px 4px 0;font-weight:bold;font-size:14px;color:#333;">' . esc_html($t('SMALL SUITCASES')) . '</td>
              <td width="50%" valign="top" style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">' . esc_html($t('LARGE SUITCASES')) . '</td>
            </tr>
            <tr>
              <td style="padding:0 10px 16px 0;font-size:15px;color:#555;">' . esc_html($f['smallSuitcases'] ?: '—') . '</td>
              <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['largeSuitcases'] ?: '—') . '</td>
            </tr>
          </table>
        </td>
      </tr>

      ' . $price_row . '
      ' . $comments_row . '
      ' . $addons_row . '

      <tr>
        <td style="padding:16px 0 4px;font-size:14px;color:#555;">' . esc_html($t('I accept the Terms and conditions')) . '</td>
      </tr>
      ' . $newsletter_row . '

    </table>
  </td></tr>

  <tr>
    <td style="padding:24px 40px 8px;border-top:1px solid #eee;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:bold;color:#333;">' . esc_html($t('Need help? Contact us anytime:')) . '</p>
    </td>
  </tr>
  <tr>
    <td style="padding:0 40px 6px;font-size:14px;color:#555;">
      &#128222; <a href="tel:+440000000000" style="color:#333;text-decoration:none;">+44 0000 000 000</a>
    </td>
  </tr>
  <tr>
    <td style="padding:0 40px 6px;font-size:14px;color:#555;">
      WhatsApp: <a href="https://wa.me/440000000000" style="color:#333;text-decoration:none;">+44 0000 000 000</a>
    </td>
  </tr>
  <tr>
    <td style="padding:0 40px 6px;font-size:14px;color:#555;">
      Instagram: <a href="https://www.instagram.com/client-booking" style="color:#333;text-decoration:none;">@client-booking</a>
    </td>
  </tr>
  <tr>
    <td style="padding:0 40px 24px;font-size:14px;color:#555;">
      Telegram: <a href="https://telegram.me/client-booking" style="color:#333;text-decoration:none;">@client-booking</a>
    </td>
  </tr>

  <tr>
    <td style="padding:24px 40px 30px;font-size:13px;color:#999;border-top:1px solid #eee;">
      Page: <a href="' . esc_url($page_url) . '" style="color:#2196F3;">' . esc_url($page_url) . '</a>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>';
}

/**
 * Addon checklist rows for booking HTML emails (matches V3 form labels).
 *
 * @param string $addons_string Pipe-separated labels from the form (" | ").
 */
function ipro_booking_addons_email_markup($addons_string, $locale = 'en_US')
{
  $catalog = [
    'Booster Seat',
    'Child Seat',
    'Flower Elegant bouquet',
    'Champagne',
    'Pet on board',
  ];

  $selected_keys = [];
  $norm = static function ($s) {
    if (function_exists('mb_strtolower')) {
      return mb_strtolower($s, 'UTF-8');
    }
    return strtolower($s);
  };
  if ($addons_string !== '' && $addons_string !== null) {
    foreach (preg_split('/\s*\|\s*/', trim((string) $addons_string)) as $chunk) {
      $chunk = trim($chunk);
      if ($chunk !== '') {
        $selected_keys[$norm($chunk)] = true;
      }
    }
  }

  $inner = '';
  foreach ($catalog as $label) {
    $on = isset($selected_keys[$norm($label)]);
    $mark = $on
      ? '<span style="color:#2e7d32;font-weight:700;font-size:17px;line-height:1.2;" aria-hidden="true">&#10003;</span>'
      : '<span style="color:#b71c1c;font-weight:700;font-size:17px;line-height:1.2;" aria-hidden="true">&#10007;</span>';
    $translated_label = ipro_customer_email_t($label, $locale);
    $inner .= '
            <tr>
              <td style="padding:5px 10px 5px 0;width:34px;vertical-align:top;text-align:center;">' . $mark . '</td>
              <td style="padding:5px 0;vertical-align:top;font-size:15px;color:#555;">' . esc_html($translated_label) . '</td>
            </tr>';
  }

  $heading = ipro_customer_email_t('Additional services', $locale);

  return '
        <tr>
          <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">' . esc_html($heading) . '</td>
        </tr>
        <tr>
          <td style="padding:0 0 16px;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;margin:6px 0 0;">
' . $inner . '
            </table>
          </td>
        </tr>';
}

function ipro_build_booking_email_html($f, $ref, $service_label)
{
  $date_str = current_time('F j, Y');
  $time_str = current_time('g:i a');
  $page_url = home_url('/booking/');

  $phone_display = esc_html($f['phone']);
  $phone_href    = 'tel:' . preg_replace('/[^+0-9]/', '', $f['phone']);

  $flight_row = '';
  if (!empty($f['flightNumber'])) {
    $flight_row = '
        <tr>
          <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">Flight number</td>
        </tr>
        <tr>
          <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['flightNumber']) . '</td>
        </tr>';
  }

  $dropoff_row = '';
  if (!empty($f['dropoff'])) {
    $dropoff_row = '
        <tr>
          <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">DROP-OFF LOCATION</td>
        </tr>
        <tr>
          <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['dropoff']) . '</td>
        </tr>';
  }

  $stops_row = '';
  if (!empty($f['stops'])) {
    $stops_row = '
        <tr>
          <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">STOPS</td>
        </tr>
        <tr>
          <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['stops']) . '</td>
        </tr>';
  }

  $duration_row = '';
  if (!empty($f['duration'])) {
    $duration_row = '
        <tr>
          <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">DURATION</td>
        </tr>
        <tr>
          <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['duration']) . ' hours</td>
        </tr>';
  }

  $email_row = '';
  if (!empty($f['email'])) {
    $email_row = '
        <tr>
          <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">Email</td>
        </tr>
        <tr>
          <td style="padding:0 0 16px;font-size:15px;">
            <a href="mailto:' . esc_attr($f['email']) . '" style="color:#2196F3;text-decoration:none;">' . esc_html($f['email']) . '</a>
          </td>
        </tr>';
  }

  $comments_row = '';
  if (!empty($f['comments'])) {
    $comments_row = '
        <tr>
          <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">Comments</td>
        </tr>
        <tr>
          <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['comments']) . '</td>
        </tr>';
  }

  $addons_row = ipro_booking_addons_email_markup($f['addons'] ?? '');

  $newsletter_raw = strtolower(trim((string) ($f['newsletter'] ?? 'no')));
  $newsletter_on  = in_array($newsletter_raw, ['yes', '1', 'true'], true);
  $newsletter_mark = $newsletter_on
    ? '<span style="color:#2e7d32;font-weight:700;font-size:17px;line-height:1.2;" aria-hidden="true">&#10003;</span>'
    : '<span style="color:#b71c1c;font-weight:700;font-size:17px;line-height:1.2;" aria-hidden="true">&#10007;</span>';
  $newsletter_label = 'I would like to receive news and updates about festivals, racing, football, and other events';
  $newsletter_row   = '
      <tr>
        <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">Newsletter</td>
      </tr>
      <tr>
        <td style="padding:0 0 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;margin:6px 0 0;">
            <tr>
              <td style="padding:5px 10px 5px 0;width:34px;vertical-align:top;text-align:center;">' . $newsletter_mark . '</td>
              <td style="padding:5px 0;vertical-align:top;font-size:15px;color:#555;">' . esc_html($newsletter_label) . '</td>
            </tr>
          </table>
        </td>
      </tr>';

  $price_row = '';
  if (!empty($f['estimatedPrice'])) {
    $price_row = '
        <tr>
          <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">ESTIMATED PRICE</td>
        </tr>
        <tr>
          <td style="padding:0 0 16px;font-size:15px;color:#555;">£' . esc_html($f['estimatedPrice']) . '</td>
        </tr>';
  }

  return '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta name="viewport" content="width=device-width"/>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:30px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:4px;overflow:hidden;max-width:600px;width:100%;">

  <tr>
    <td style="padding:30px 40px 10px;">
      <h1 style="margin:0;font-size:22px;color:#333;">Booking Reference ' . esc_html($ref) . '</h1>
    </td>
  </tr>
  <tr>
    <td style="padding:0 40px;font-size:13px;color:#999;">Date: ' . esc_html($date_str) . '</td>
  </tr>
  <tr>
    <td style="padding:2px 40px 20px;font-size:13px;color:#999;">Time: ' . esc_html($time_str) . '</td>
  </tr>
  <tr>
    <td style="padding:0 40px;font-size:14px;color:#555;">Hello,<br><br>You have received a new form booking. Here are the details:</td>
  </tr>
  <tr>
    <td style="padding:24px 40px 8px;">
      <h2 style="margin:0;font-size:18px;font-weight:bold;color:#333;">GET A PRICE &amp; BOOK</h2>
    </td>
  </tr>

  <tr><td style="padding:0 40px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:12px 0 4px;font-weight:bold;font-size:14px;color:#333;">YOUR NAME</td>
      </tr>
      <tr>
        <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['name']) . '</td>
      </tr>

      <tr>
        <td style="padding:0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="50%" valign="top" style="padding:8px 10px 4px 0;font-weight:bold;font-size:14px;color:#333;">Country</td>
              <td width="50%" valign="top" style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">Phone Number</td>
            </tr>
            <tr>
              <td style="padding:0 10px 16px 0;font-size:15px;color:#555;">' . esc_html($f['country']) . '</td>
              <td style="padding:0 0 16px;font-size:15px;">
                <a href="' . esc_attr($phone_href) . '" style="color:#2196F3;text-decoration:none;">' . $phone_display . '</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      ' . $email_row . '

      <tr>
        <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">TYPE OF SERVICE</td>
      </tr>
      <tr>
        <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($service_label) . '</td>
      </tr>

      ' . $flight_row . '
      ' . $duration_row . '

      <tr>
        <td style="padding:0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="50%" valign="top" style="padding:8px 10px 4px 0;font-weight:bold;font-size:14px;color:#333;">PICKUP DATE</td>
              <td width="50%" valign="top" style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">PICKUP TIME</td>
            </tr>
            <tr>
              <td style="padding:0 10px 16px 0;font-size:15px;color:#555;">' . esc_html($f['pickupDate']) . '</td>
              <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['pickupTime']) . '</td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">PICKUP LOCATION</td>
      </tr>
      <tr>
        <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['pickup']) . '</td>
      </tr>

      ' . $stops_row . '
      ' . $dropoff_row . '

      <tr>
        <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">CHOOSE VEHICLE</td>
      </tr>
      <tr>
        <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['vehicle']) . '</td>
      </tr>

      <tr>
        <td style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">NUMBER OF PASSENGERS</td>
      </tr>
      <tr>
        <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['passengers'] ?: '—') . '</td>
      </tr>

      <tr>
        <td style="padding:0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="50%" valign="top" style="padding:8px 10px 4px 0;font-weight:bold;font-size:14px;color:#333;">SMALL SUITCASES</td>
              <td width="50%" valign="top" style="padding:8px 0 4px;font-weight:bold;font-size:14px;color:#333;">LARGE SUITCASES</td>
            </tr>
            <tr>
              <td style="padding:0 10px 16px 0;font-size:15px;color:#555;">' . esc_html($f['smallSuitcases'] ?: '—') . '</td>
              <td style="padding:0 0 16px;font-size:15px;color:#555;">' . esc_html($f['largeSuitcases'] ?: '—') . '</td>
            </tr>
          </table>
        </td>
      </tr>

      ' . $price_row . '
      ' . $comments_row . '
      ' . $addons_row . '

      <tr>
        <td style="padding:16px 0 4px;font-size:14px;color:#555;">I accept the Terms and conditions</td>
      </tr>
      ' . $newsletter_row . '

    </table>
  </td></tr>

  <tr>
    <td style="padding:24px 40px 30px;font-size:13px;color:#999;border-top:1px solid #eee;margin-top:16px;">
      Page: <a href="' . esc_url($page_url) . '" style="color:#2196F3;">' . esc_url($page_url) . '</a>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>';
}

add_action('wp_ajax_nopriv_ipro_validate_flight', 'ipro_validate_flight_handler');
add_action('wp_ajax_ipro_validate_flight', 'ipro_validate_flight_handler');

/**
 * Transient rate limit helper (per IP hash).
 *
 * @return true|void Sends JSON error and exits when limited.
 */
function ipro_ajax_rate_limit(string $bucket, int $max_per_minute = 20)
{
  $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
  $key = 'ipro_rl_' . $bucket . '_' . substr(md5($ip), 0, 16);
  $count = (int) get_transient($key);
  if ($count >= $max_per_minute) {
    wp_send_json_error(__('Too many requests. Please wait a moment.', 'hello-elementor'), 429);
  }
  set_transient($key, $count + 1, 60);
  return true;
}

function ipro_validate_flight_handler()
{
  check_ajax_referer('ipro_distance_nonce', 'nonce');
  ipro_ajax_rate_limit('flight', 20);

  $flight = strtoupper(sanitize_text_field($_POST['flightNumber'] ?? ''));
  $date   = sanitize_text_field($_POST['date'] ?? '');

  if (!$flight || !preg_match('/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/', $flight)) {
    wp_send_json_success(['found' => false]);
  }
  if (!$date || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
    wp_send_json_success(['found' => false]);
  }

  if (!defined('IPRO_AERODATABOX_KEY') || IPRO_AERODATABOX_KEY === '<API_KEY>' || empty(IPRO_AERODATABOX_KEY)) {
    wp_send_json_success(['found' => false]);
  }

  $cache_key = 'ipro_flight_' . $flight . '_' . $date;
  $cached    = get_transient($cache_key);
  if ($cached !== false) {
    wp_send_json_success($cached);
  }

  $url = 'https://aerodatabox.p.rapidapi.com/flights/number/' . rawurlencode($flight) . '/' . rawurlencode($date);

  $response = wp_remote_get($url, [
    'timeout' => 8,
    'headers' => [
      'X-RapidAPI-Key'  => IPRO_AERODATABOX_KEY,
      'X-RapidAPI-Host' => 'aerodatabox.p.rapidapi.com',
    ],
  ]);

  if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
    wp_send_json_success(['found' => false]);
  }

  $body   = json_decode(wp_remote_retrieve_body($response), true);
  $result = ['found' => false];

  if (is_array($body) && !empty($body)) {
    $fl = $body[0];
    $dep = $fl['departure'] ?? [];
    $arr = $fl['arrival'] ?? [];

    $from_name = $dep['airport']['name'] ?? '';
    $from_iata = $dep['airport']['iata'] ?? '';
    $to_name   = $arr['airport']['name'] ?? '';
    $to_iata   = $arr['airport']['iata'] ?? '';

    $dep_time = '';
    if (!empty($dep['scheduledTime']['local'])) {
      $dep_time = substr($dep['scheduledTime']['local'], 0, 5);
    }
    $arr_time = '';
    if (!empty($arr['scheduledTime']['local'])) {
      $arr_time = substr($arr['scheduledTime']['local'], 0, 5);
    }

    $result = [
      'found'        => true,
      'flight'       => $fl['number'] ?? $flight,
      'status'       => $fl['status'] ?? '',
      'from'         => $from_name . ($from_iata ? " ({$from_iata})" : ''),
      'fromTerminal' => $dep['terminal'] ?? '',
      'to'           => $to_name . ($to_iata ? " ({$to_iata})" : ''),
      'departure'    => $dep_time,
      'arrival'      => $arr_time,
    ];
  }

  set_transient($cache_key, $result, DAY_IN_SECONDS);
  wp_send_json_success($result);
}
