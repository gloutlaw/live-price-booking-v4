<?php
/**
 * Pure, WordPress-independent helpers for picking the shortest Google Directions
 * route among alternatives (Booking V4 pricing fix, report 22.07.2026 / bug #3:
 * Google Maps was choosing an M25 detour instead of the direct route).
 *
 * No WP function calls here on purpose — this file is required directly (without
 * bootstrapping WordPress) by tests/ipro-route-distance-helpers.test.php.
 */

if (!defined('ABSPATH') && !defined('IPRO_ROUTE_HELPERS_TEST')) {
  // Loaded outside WP and outside the test harness — refuse silently, this file
  // has no side effects on its own so there is nothing unsafe about continuing,
  // but flagging misuse early is cheaper than a confusing downstream error.
  return;
}

/**
 * Total distance of a single Directions API route, in metres (sum of all legs —
 * a route can have more than one leg when waypoints are present).
 */
function ipro_directions_route_distance_meters(array $route): int
{
  $meters = 0;
  foreach (($route['legs'] ?? []) as $leg) {
    $meters += (int) ($leg['distance']['value'] ?? 0);
  }
  return $meters;
}

/**
 * Total duration of a single Directions API route, in seconds.
 */
function ipro_directions_route_duration_seconds(array $route): int
{
  $seconds = 0;
  foreach (($route['legs'] ?? []) as $leg) {
    $seconds += (int) ($leg['duration']['value'] ?? 0);
  }
  return $seconds;
}

/**
 * Pick the route with the smallest total distance in metres among all alternatives
 * returned by the Directions API — NOT the first route, NOT the fastest by duration
 * (report 22.07.2026: "выбрать кратчайший по расстоянию в милях, не по времени").
 *
 * Ties are broken by keeping the first (lowest-index) route encountered, so the
 * result is deterministic.
 *
 * @param array $directionsResponse Decoded JSON body from the Directions API.
 * @return array{route: array, meters: int}|null Null when the response has no usable route.
 */
function ipro_select_shortest_directions_route(array $directionsResponse): ?array
{
  $routes = $directionsResponse['routes'] ?? [];
  if (!is_array($routes) || count($routes) === 0) {
    return null;
  }

  $best = null;
  $bestMeters = null;
  foreach ($routes as $route) {
    if (!is_array($route)) {
      continue;
    }
    $meters = ipro_directions_route_distance_meters($route);
    if ($bestMeters === null || $meters < $bestMeters) {
      $bestMeters = $meters;
      $best = $route;
    }
  }

  if ($best === null) {
    return null;
  }

  return ['route' => $best, 'meters' => $bestMeters];
}

/**
 * Human-readable duration text for the chosen route (sum across legs), matching
 * the "X hour(s) Y mins" / "Y mins" format already used by the multi-leg handler.
 */
function ipro_format_route_duration(int $totalSeconds): string
{
  $mins = (int) round($totalSeconds / 60);
  $hours = intdiv($mins, 60);
  $rem = $mins % 60;
  if ($hours > 0) {
    return $hours . ' hour' . ($hours > 1 ? 's' : '') . ($rem > 0 ? ' ' . $rem . ' mins' : '');
  }
  return $mins . ' mins';
}
