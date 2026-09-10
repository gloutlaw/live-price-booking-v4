/**
 * booking-analytics.js — PostHog event tracking for Booking V3
 * Loaded AFTER ipro-booking-steps-v3.js (declared as dependency in enqueue).
 *
 * ipro-booking-steps-v3.js calls window.iproBATrack(event, props).
 * This file wraps any pre-existing iproBATrack (e.g. GTM), maps events to PostHog,
 * mirrors funnel events to WP Booking Analytics REST, and attaches DOM listeners.
 * No PII (email, phone, name, free-text comments).
 */
(function () {
  'use strict';

  var prevBATrack = typeof window.iproBATrack === 'function' ? window.iproBATrack : null;

  var lastMapTarget = null;
  var superPropsRegistered = false;
  var wpEndpoint = (window.iproBATracker && iproBATracker.endpoint) ? iproBATracker.endpoint : '';
  var sessionId = null;
  var trackedFields = {};

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function getSessionId() {
    if (sessionId) return sessionId;

    var sid = null;
    try {
      sid = sessionStorage.getItem('ipro_ba_sid');
    } catch (e) { /* ignore */ }

    if (!sid) {
      var match = document.cookie.match(/(?:^|;\s*)ipro_ba_sid=([^;]+)/);
      if (match) sid = decodeURIComponent(match[1]);
    }

    if (!sid) sid = uuid();

    sessionId = sid;
    try {
      sessionStorage.setItem('ipro_ba_sid', sid);
    } catch (e) { /* ignore */ }
    document.cookie = 'ipro_ba_sid=' + encodeURIComponent(sid) + ';path=/;max-age=86400;SameSite=Lax';

    return sid;
  }

  function getUTM() {
    var params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || ''
    };
  }

  function getDeviceType() {
    var w = window.innerWidth;
    if (w <= 767) return 'mobile';
    if (w <= 1024) return 'tablet';
    return 'desktop';
  }

  function getBrowser() {
    var ua = navigator.userAgent;
    if (ua.indexOf('Firefox') > -1) return 'Firefox';
    if (ua.indexOf('SamsungBrowser') > -1) return 'Samsung';
    if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) return 'Opera';
    if (ua.indexOf('Edg') > -1) return 'Edge';
    if (ua.indexOf('Chrome') > -1) return 'Chrome';
    if (ua.indexOf('Safari') > -1) return 'Safari';
    if (ua.indexOf('Trident') > -1) return 'IE';
    return 'Other';
  }

  var utm = getUTM();
  var commonPayload = {
    session_id: getSessionId(),
    referrer: document.referrer || '',
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
    device_type: getDeviceType(),
    browser: getBrowser(),
    screen_width: window.screen.width || window.innerWidth,
    lang: document.documentElement.getAttribute('data-lang') || navigator.language || '',
    country: ''
  };

  var wpSkipEvents = {
    form_view: true,
    form_submit: true
  };

  function sendToWp(eventType, eventData) {
    if (!wpEndpoint || wpSkipEvents[eventType]) return;

    var payload = Object.assign({}, commonPayload, {
      event_type: eventType,
      event_data: Object.assign({ form_version: 'v3', source: 'client' }, eventData || {})
    });

    var json = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(wpEndpoint, new Blob([json], { type: 'application/json' }));
      return;
    }

    var xhr = new XMLHttpRequest();
    xhr.open('POST', wpEndpoint, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(json);
  }

  function ph(event, props) {
    if (typeof posthog === 'undefined') return;
    if (!superPropsRegistered && posthog.register) {
      posthog.register({ booking_flow: 'v3' });
      superPropsRegistered = true;
    }
    posthog.capture(event, props || {});
  }

  function getServiceType() {
    var btn = document.querySelector('.booking-toggle__btn--active');
    return btn ? (btn.getAttribute('data-service') || 'unknown') : 'unknown';
  }

  function getPriceText() {
    var el = document.querySelector('.booking-summary-price-value--step2-desktop');
    if (!el) el = document.querySelector('.booking-summary-price-value');
    if (!el) el = document.getElementById('booking-sidebar-price');
    return el ? el.textContent.trim() : '--';
  }

  function getSelectedVehicle() {
    var el = document.querySelector('.booking-vehicle--selected');
    if (!el) return {};
    return {
      vehicle_key:   el.getAttribute('data-key') || '',
      vehicle_name:  el.getAttribute('data-vehicle') || ''
    };
  }

  function getStep1Snapshot() {
    var pickup = document.getElementById('booking-pickup');
    var dropoff = document.getElementById('booking-dropoff');
    var stops = 0;
    for (var i = 1; i <= 3; i++) {
      var wrap = document.getElementById('booking-stop-' + i);
      if (wrap && wrap.classList.contains('booking-stop--open')) stops++;
    }
    return {
      pickup_filled:  !!(pickup && pickup.value.trim()),
      dropoff_filled: !!(dropoff && dropoff.value.trim()),
      has_stops:      stops > 0,
      stops_count:    stops
    };
  }

  var VALIDATION_UI_STEP = { 1: 1, 2: 3 };
  var STEP_LABELS = { 1: 'route', 2: 'vehicle', 3: 'checkout', 4: 'confirmation' };
  var firstStepSeen = {};

  window.iproBATrack = function (event, props) {
    props = props || {};

    if (prevBATrack) {
      try {
        prevBATrack(event, props);
      } catch (e) { /* ignore third-party errors */ }
    }

    sendToWp(event, props);

    switch (event) {

      case 'service_toggle':
        ph('booking_service_type_changed', {
          service_type: props.service_type
        });
        break;

      case 'vehicle_select':
        ph('booking_vehicle_selected', {
          vehicle_key:  props.vehicle_key,
          vehicle_name: props.vehicle_name
        });
        break;

      case 'step_change':
        var from = props.from;
        var to   = props.to;

        ph('booking_step_changed', {
          from_step:       from,
          to_step:         to,
          from_step_label: STEP_LABELS[from] || String(from),
          to_step_label:   STEP_LABELS[to]   || String(to),
          service_type:    getServiceType()
        });

        if (to > from) {
          var completedPayload = {
            service_type:    getServiceType(),
            estimated_price: getPriceText(),
            from_step:       from,
            to_step:         to
          };
          var veh = getSelectedVehicle();
          if (veh.vehicle_key) {
            completedPayload.vehicle_key = veh.vehicle_key;
            completedPayload.vehicle_name = veh.vehicle_name;
          }
          if (from === 1) {
            var s1 = getStep1Snapshot();
            completedPayload.pickup_filled = s1.pickup_filled;
            completedPayload.dropoff_filled = s1.dropoff_filled;
            completedPayload.has_stops = s1.has_stops;
            completedPayload.stops_count = s1.stops_count;
          }
          ph('booking_step_' + from + '_completed', completedPayload);
        }

        if (!firstStepSeen[to]) {
          firstStepSeen[to] = true;
          var viewedPayload = {
            service_type:    getServiceType(),
            step_label:      STEP_LABELS[to] || String(to),
            estimated_price: getPriceText()
          };
          var v2 = getSelectedVehicle();
          if (v2.vehicle_key) {
            viewedPayload.vehicle_key = v2.vehicle_key;
            viewedPayload.vehicle_name = v2.vehicle_name;
          }
          ph('booking_step_' + to + '_viewed', viewedPayload);
        }
        break;

      case 'form_error':
        var uiStep = VALIDATION_UI_STEP[props.step] || props.step;
        ph('booking_validation_failed', {
          ui_step:          uiStep,
          validation_group: uiStep === 1 ? 'ride' : 'checkout',
          fields:           props.fields || [],
          fields_count:     (props.fields || []).length,
          service_type:     getServiceType()
        });
        break;

      case 'checkout_attempt':
        ph('booking_checkout_attempted', {
          service_type:    getServiceType(),
          estimated_price: getPriceText()
        });
        break;

      case 'checkout_validated':
        ph('booking_checkout_validated', {
          vehicle_key:      props.vehicle_key,
          service_type:     props.service_type,
          estimated_price:  props.estimated_price,
          has_flight:       props.has_flight,
          addons:           props.addons || [],
          addons_count:     (props.addons || []).length,
          passengers:       props.passengers,
          large_bags:       props.large_bags,
          small_bags:       props.small_bags
        });
        ph('booking_checkout_clicked', {
          vehicle_key:      props.vehicle_key,
          service_type:     props.service_type,
          estimated_price:  getPriceText(),
          has_flight:       props.has_flight,
          addons:           props.addons || [],
          addons_count:     (props.addons || []).length,
          passengers:       props.passengers
        });
        break;

      case 'form_submit':
        ph('booking_submitted_success', {
          vehicle_key:   props.vehicle_key,
          vehicle_name:  props.vehicle,
          service_type:  props.service_type,
          price:         props.price,
          passengers:    props.passengers,
          country:       props.country,
          pickup_city:   props.pickup_city,
          dropoff_city:  props.dropoff_city,
          has_flight:    props.has_flight,
          addons:        props.addons || [],
          addons_count:  props.addons_count != null ? props.addons_count : (props.addons || []).length
        });
        break;

      case 'form_submit_failed':
        ph('booking_submit_failed', {
          reason: props.reason || 'unknown'
        });
        break;
    }
  };

  firstStepSeen[1] = true;

  ph('booking_step_1_started', {
    service_type: getServiceType(),
    page_url:     window.location.pathname
  });

  var addStopBtn = document.getElementById('booking-add-stop');
  if (addStopBtn) {
    addStopBtn.addEventListener('click', function () {
      var visible = 0;
      for (var j = 1; j <= 3; j++) {
        var w = document.getElementById('booking-stop-' + j);
        if (w && w.classList.contains('booking-stop--open')) visible++;
      }
      ph('booking_stop_added', { stop_number: visible + 1, service_type: getServiceType() });
    });
  }

  document.querySelectorAll('.booking-field__pin-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      lastMapTarget = btn.getAttribute('data-target') || 'unknown';
      ph('booking_map_opened', {
        target_field: lastMapTarget,
        service_type: getServiceType()
      });
    });
  });

  var mapConfirm = document.getElementById('booking-map-confirm');
  if (mapConfirm) {
    mapConfirm.addEventListener('click', function () {
      ph('booking_map_confirmed', {
        target_field: lastMapTarget || 'unknown'
      });
    });
  }

  function trackFieldFocus(e) {
    var el = e.target;
    if (!el || !el.id) return;
    if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT' && el.tagName !== 'TEXTAREA') return;
    if (trackedFields[el.id]) return;

    trackedFields[el.id] = 1;

    var step = 1;
    var panel = el.closest('.booking-panel');
    if (panel && panel.id === 'booking-step-2') step = 2;
    if (panel && panel.id === 'booking-step-3') step = 3;

    sendToWp('field_interact', { field_id: el.id, step: step });
  }

  var formContainer = document.querySelector('.booking-content');
  if (formContainer) {
    formContainer.addEventListener('focusin', trackFieldFocus);
  }

}());
