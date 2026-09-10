(function () {
  'use strict';

  if (!window.iproBATracker) return;

  var endpoint = iproBATracker.endpoint;
  var sessionKey = 'ipro_ba_sid';
  var fieldsKey = 'ipro_ba_fields';

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function getSessionId() {
    var sid = sessionStorage.getItem(sessionKey);
    if (!sid) {
      sid = uuid();
      sessionStorage.setItem(sessionKey, sid);
    }
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

  var sessionId = getSessionId();
  var utm = getUTM();
  var deviceType = getDeviceType();
  var browser = getBrowser();
  var lang = document.documentElement.getAttribute('data-lang') || navigator.language || '';
  var screenWidth = window.screen.width || window.innerWidth;
  var referrer = document.referrer || '';

  var commonPayload = {
    session_id: sessionId,
    referrer: referrer,
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
    device_type: deviceType,
    browser: browser,
    screen_width: screenWidth,
    lang: lang,
    country: ''
  };

  function send(eventType, eventData) {
    var payload = Object.assign({}, commonPayload, {
      event_type: eventType,
      event_data: Object.assign({ form_version: 'v2', source: 'client' }, eventData || {})
    });

    var json = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([json], { type: 'application/json' }));
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(json);
    }
  }

  // Track form view on page load
  send('form_view', {
    page_url: window.location.href,
    entry_url: document.referrer || ''
  });

  // Track field interactions (first focus only per session)
  var trackedFields = JSON.parse(sessionStorage.getItem(fieldsKey) || '{}');

  function trackFieldFocus(e) {
    var el = e.target;
    if (!el || !el.id) return;
    if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT' && el.tagName !== 'TEXTAREA') return;
    if (trackedFields[el.id]) return;

    trackedFields[el.id] = 1;
    sessionStorage.setItem(fieldsKey, JSON.stringify(trackedFields));

    var step = 1;
    var panel = el.closest('.booking-panel');
    if (panel && panel.id === 'booking-step-2') step = 2;

    send('field_interact', { field_id: el.id, step: step });
  }

  var formContainer = document.querySelector('.booking-content');
  if (formContainer) {
    formContainer.addEventListener('focusin', trackFieldFocus);
  }

  // Expose global tracking function for ipro-booking-steps.js hooks
  window.iproBATrack = function (eventType, eventData) {
    send(eventType, eventData);
  };

})();
