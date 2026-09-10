/**
 * Client booking wizard — Booking wizard controller (V4)
 * Depends on: jQuery, ipro-pricing-engine-v4.js, Google Maps Places API
 */
(function ($) {
  'use strict';

  var P = window.IPRO_PRICING_V4 || window.IPRO_PRICING;
  var Engine = window.IproPricingEngineV4 || window.IproPricingEngine;

  if (!P || !Engine) {
    return;
  }

  if (typeof iproBooking !== 'undefined' && iproBooking.vehicleNames) {
    P.vehicleNames = Object.assign({}, P.vehicleNames, iproBooking.vehicleNames);
  }


  /* ─── Session persistence (localStorage) ─── */
  var STORAGE_KEY = 'ipro_booking_v4_state_v1';
  var STORAGE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
  var saveTimer = null;
  var topnavForwardRaf = null;

  function safeJsonParse(str) {
    try { return JSON.parse(str); } catch (e) { return null; }
  }

  function pickPersistedState(s) {
    return {
      v: 2,
      ts: Date.now(),
      currentStep: (s.currentStep > 3) ? 3 : s.currentStep,
      serviceType: s.serviceType,
      pickup: s.pickup,
      dropoff: s.dropoff,
      stops: s.stops,
      stopsVisible: s.stopsVisible,
      vehicle: s.vehicle,
      vehicleKey: s.vehicleKey,
      duration: s.duration,
      pickupDate: s.pickupDate,
      pickupTimeHours: s.pickupTimeHours,
      pickupTimeMinutes: s.pickupTimeMinutes,
      pickupIsAirport: s.pickupIsAirport,
      dropoffIsAirport: s.dropoffIsAirport,
      flightNumber: s.flightNumber
    };
  }

  function collectStep3DomSnapshot() {
    return {
      firstName: dom.firstName ? dom.firstName.value : '',
      lastName: dom.lastName ? dom.lastName.value : '',
      country: dom.country ? dom.country.value : '',
      phoneCode: dom.phoneCode ? dom.phoneCode.value : '',
      phoneNumberLocal: dom.phoneNumber ? dom.phoneNumber.value : '',
      email: dom.email ? dom.email.value : '',
      comments: dom.comments ? dom.comments.value : '',
      passengers: dom.passengers ? dom.passengers.value : '',
      largeBags: dom.largeBags ? dom.largeBags.value : '',
      smallBags: dom.smallBags ? dom.smallBags.value : '',
      addonBooster: !!(dom.addonBooster && dom.addonBooster.checked),
      addonChildseat: !!(dom.addonChildseat && dom.addonChildseat.checked),
      addonFlowers: !!(dom.addonFlowers && dom.addonFlowers.checked),
      addonChampagne: !!(dom.addonChampagne && dom.addonChampagne.checked),
      addonPet: !!(dom.addonPet && dom.addonPet.checked),
      termsAccepted: !!(dom.terms && dom.terms.checked),
      newsletterOptIn: !!(dom.newsletter && dom.newsletter.checked)
    };
  }

  function scheduleSaveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveStateNow, 250);
    scheduleTopnavForwardUpdate();
  }

  function saveStateNow() {
    try {
      var payload = pickPersistedState(state);
      payload.step3 = collectStep3DomSnapshot();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {}
  }

  function clearSavedState() {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function loadSavedState() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = safeJsonParse(raw);
      if (!parsed || (parsed.v !== 1 && parsed.v !== 2) || !parsed.ts) return null;
      if (Date.now() - parsed.ts > STORAGE_TTL_MS) {
        clearSavedState();
        return null;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }

  /* ─── State ─── */
  var state = {
    currentStep: 1,
    serviceType: 'single',
    pickup: { address: '', placeId: '', lat: null, lng: null, countryCode: '' },
    dropoff: { address: '', placeId: '', lat: null, lng: null, countryCode: '' },
    stops: [
      { address: '', placeId: '' },
      { address: '', placeId: '' },
      { address: '', placeId: '' }
    ],
    stopsVisible: 0,
    vehicle: '1',
    vehicleKey: 'sclass',
    duration: 3,
    estimatedPrice: null,
    priceResult: null,
    step1MinPriceResult: null,
    vehiclePriceById: {},
    name: '',
    country: 'United Kingdom',
    phoneCode: '+44',
    phone: '',
    pickupDate: '',
    pickupTimeHours: '',
    pickupTimeMinutes: '',
    passengers: '',
    smallSuitcases: '',
    largeSuitcases: '',
    comments: '',
    email: '',
    flightNumber: '',
    addons: '',
    pickupIsAirport: false,
    dropoffIsAirport: false,
    termsAccepted: false,
    newsletterOptIn: false,
    turnstileToken: '',
    turnstileFallback: false,
    _turnstileFallbackTimer: null
  };

  /* ─── Shared Map Styles ─── */
  var mapStyles = [
    { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#555555' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#f0f0f0' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#d0d0d0' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#c0c0c0' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
    { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#c8c8c8' }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#b8b8b8' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] }
  ];

  /* ─── DOM References ─── */
  var dom = {};
  var mobileVehicleSliderLayoutSync = null;
  var mobileVehicleSliderAbort = null;
  var mobileVehicleSliderDebounceTimer = null;
  var countriesListPopulated = false;

  /* ─── Debug Logging (localhost only) ─── */
  function logEvent(name, payload) {
    try {
      var h = typeof window !== 'undefined' && window.location ? window.location.hostname : '';
      if (h !== 'localhost' && h !== '127.0.0.1') return;
      // eslint-disable-next-line no-console
      console.log('[booking-v3]', name, payload || {});
    } catch (e) {}
  }

  function cacheDom() {
    dom.step1 = document.getElementById('booking-step-1');
    dom.step2 = document.getElementById('booking-step-2');
    dom.step3 = document.getElementById('booking-step-3');
    dom.step4 = document.getElementById('booking-step-4');
    dom.step4Intro = document.getElementById('booking-step-4-intro');
    dom.step4Placeholder = document.getElementById('booking-step-4-placeholder');
    dom.step4Message = document.getElementById('booking-step-4-message');
    dom.step4Actions = document.getElementById('booking-step-4-actions');
    dom.step4BackBtn = document.getElementById('booking-step4-back-btn');
    dom.pickup = document.getElementById('booking-pickup');
    dom.dropoff = document.getElementById('booking-dropoff');
    dom.dropoffWrap = document.getElementById('booking-dropoff-wrap');
    dom.durationWrap = document.getElementById('booking-duration-wrap');
    dom.duration = document.getElementById('booking-duration');
    dom.addStopBtn = document.getElementById('booking-add-stop');
    dom.nextBtn = document.getElementById('booking-next-btn');
    dom.mobileNextBtn = document.getElementById('booking-mobile-next-btn');
    dom.tripBarEditBtn = document.getElementById('booking-edit-btn');
    dom.summaryEditBtn = document.getElementById('booking-summary-edit-btn');
    dom.step2BackBtn = document.getElementById('booking-step2-back-btn');
    dom.step2BackTopBtn = document.getElementById('booking-step2-back-top-btn');
    dom.step3BackTopBtn = document.getElementById('booking-step3-back-top-btn');
    dom.step3BackBtn = document.getElementById('booking-step3-back-btn');
    dom.topnavBackBtn = document.getElementById('booking-topnav-back-btn');
    dom.topnavMobileTitle = document.getElementById('booking-topnav-mobile-title');
    dom.topnavForwardBtn = document.getElementById('booking-topnav-forward-btn');
    dom.topnavForwardSlot = document.querySelector('.booking-topnav__mobile-slot--end');
    dom.topnavStepsContainer = document.querySelector('.booking-topnav__inner .booking-container__inner');
    dom.step2NextBtn = document.getElementById('booking-step2-next-btn');
    dom.checkoutBtn = document.getElementById('booking-checkout-btn');
    dom.form = document.getElementById('booking-form');
    dom.summaryRows = document.getElementById('booking-summary-rows');
    dom.sidebarPrice = document.getElementById('booking-sidebar-price');
    dom.mobilePriceAmount = document.getElementById('booking-mobile-price-amount');
    dom.mobilePriceLabel = document.getElementById('booking-mobile-price-label');
    dom.mobilePrice = document.getElementById('booking-mobile-price');
    dom.mobilePriceBreakdown = document.getElementById('booking-mobile-price-breakdown');
    dom.step1PriceHint = document.getElementById('booking-step1-price-hint');
    dom.firstName = document.getElementById('booking-first-name');
    dom.lastName = document.getElementById('booking-last-name');
    dom.country = document.getElementById('booking-country');
    dom.countryDisplay = document.getElementById('booking-country-display');
    dom.phoneCode = document.getElementById('booking-phone-code');
    dom.phoneFlag = document.getElementById('booking-phone-flag');
    dom.phoneNumber = document.getElementById('booking-phone-number');
    dom.date = document.getElementById('booking-date');
    dom.hours = document.getElementById('booking-hours');
    dom.minutes = document.getElementById('booking-minutes');
    dom.hoursDisplay = document.getElementById('booking-hours-display');
    dom.minutesDisplay = document.getElementById('booking-minutes-display');
    dom.passengers = document.getElementById('booking-passengers');
    dom.smallBags = document.getElementById('booking-small-bags');
    dom.largeBags = document.getElementById('booking-large-bags');
    dom.comments = document.getElementById('booking-comments');
    dom.email = document.getElementById('booking-email');
    dom.flight = document.getElementById('booking-flight');
    dom.flightWrap = document.getElementById('booking-flight-wrap');
    dom.contactRow = document.getElementById('booking-contact-row');
    dom.addonBooster = document.getElementById('booking-addon-booster');
    dom.addonChildseat = document.getElementById('booking-addon-childseat');
    dom.addonFlowers = document.getElementById('booking-addon-flowers');
    dom.addonChampagne = document.getElementById('booking-addon-champagne');
    dom.addonPet = document.getElementById('booking-addon-pet');
    dom.terms = document.getElementById('booking-terms');
    dom.newsletter = document.getElementById('booking-newsletter');
    dom.turnstile = document.getElementById('cf-turnstile');
    dom.mapModal = document.getElementById('booking-map-modal');
    dom.mapCanvas = document.getElementById('booking-map-canvas');
    dom.mapAddr = document.getElementById('booking-map-addr');
    dom.mapConfirm = document.getElementById('booking-map-confirm');
    dom.mapSearch = document.getElementById('booking-map-search');
    dom.routeWrap = document.getElementById('booking-route-wrap');
    dom.routeMap = document.getElementById('booking-route-map');
    dom.routeInfo = document.getElementById('booking-route-info');

    dom.tripbarItems = document.getElementById('booking-tripbar-items');
  }

  /* ─── Service Type Toggle ─── */

  function initServiceToggle() {
    var btns = document.querySelectorAll('.booking-toggle__btn');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b) { b.classList.remove('booking-toggle__btn--active'); });
        btn.classList.add('booking-toggle__btn--active');
        state.serviceType = btn.getAttribute('data-service');

        if (typeof window.iproBATrack === 'function') {
          window.iproBATrack('service_toggle', { service_type: state.serviceType });
        }

        handleServiceTypeChange();
        scheduleSaveState();
      });
    });
  }

  function formatStep1FromPrice() {
    var L10n = (typeof iproBookingL10n !== 'undefined') ? iproBookingL10n : {};
    var oneway = L10n.step1FromOneway != null ? L10n.step1FromOneway : 55;
    var hourly = L10n.step1FromHourly != null ? L10n.step1FromHourly : 55;
    if (state.serviceType === 'hourly') {
      var fmt = L10n.fromPricePerHourFmt || 'From £ %d per hour';
      return fmt.replace('%d', String(hourly));
    }
    var fmtOw = L10n.fromPriceFmt || 'From £ %d';
    return fmtOw.replace('%d', String(oneway));
  }

  function formatStep1RouteFromPrice(price) {
    var L10n = (typeof iproBookingL10n !== 'undefined') ? iproBookingL10n : {};
    var fmt = L10n.fromPriceFmt || 'From £ %d';
    var n = Math.round(Number(price) * 100) / 100;
    var display = (Math.abs(n - Math.round(n)) < 0.001) ? String(Math.round(n)) : n.toFixed(2);
    return fmt.replace('%d', display);
  }

  function clearVehiclePriceCache() {
    state.vehiclePriceById = {};
  }

  function storeVehiclePriceCache(vehicleIds, results) {
    var byId = {};
    for (var i = 0; i < vehicleIds.length; i++) {
      if (results[i]) byId[vehicleIds[i]] = results[i];
    }
    state.vehiclePriceById = byId;
  }

  function getCachedVehiclePrice(vehicleId) {
    if (!vehicleId || !state.vehiclePriceById) return null;
    return state.vehiclePriceById[String(vehicleId)] || null;
  }

  function hasVehiclePriceCache() {
    return !!(state.vehiclePriceById && Object.keys(state.vehiclePriceById).length);
  }

  function applyVehiclePriceResultToCard(vehicleId, result) {
    if (!vehicleId || !result) return;
    if (result.contactRequired) {
      setVehicleCardsPrice(vehicleId, getInternationalContactCardMessage(), true);
      return;
    }
    if (result.price == null && result.priceDisplay == null) return;
    var display = result.priceDisplay != null ? result.priceDisplay : result.price;
    setVehicleCardsPrice(vehicleId, formatVehiclePriceText(display, result.method), false);
  }

  function applyCachedVehiclePrices() {
    if (!hasVehiclePriceCache()) return false;
    var ids = Object.keys(state.vehiclePriceById);
    for (var i = 0; i < ids.length; i++) {
      applyVehiclePriceResultToCard(ids[i], state.vehiclePriceById[ids[i]]);
    }
    return true;
  }

  function fetchMinRoutePrice(svcType, pickup, dropoff, duration, routeMeta) {
    var vehicleIds = ['1', '2', '3', '4', '5'];
    return Promise.all(vehicleIds.map(function (vid) {
      return Engine.getPrice(svcType, vid, pickup, dropoff, duration, routeMeta);
    })).then(function (results) {
      storeVehiclePriceCache(vehicleIds, results);
      // Warm step-2 cards while still on step 1 (panel is hidden)
      applyCachedVehiclePrices();

      var minResult = null;
      var sawContact = false;
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        if (!r) continue;
        if (r.contactRequired) {
          sawContact = true;
          continue;
        }
        if (r.price == null) continue;
        if (!minResult || r.price < minResult.price) {
          minResult = r;
        }
      }
      if (minResult) {
        minResult = Object.assign({}, minResult, { isRouteMinimum: true });
        return minResult;
      }
      if (sawContact) {
        return { contactRequired: true, method: 'international' };
      }
      return null;
    });
  }

  function formatStep1PriceDisplay() {
    if (isInternationalPriceActive(state.priceResult)) {
      return getInternationalContactMessage();
    }
    return formatStep1FromPrice();
  }

  function setMobilePriceLabelVisible(visible) {
    if (!dom.mobilePriceLabel) return;
    dom.mobilePriceLabel.hidden = !visible;
  }

  function setMobilePriceLabelText(text) {
    if (!dom.mobilePriceLabel || text == null) return;
    dom.mobilePriceLabel.textContent = text;
  }

  function applyMobilePriceStep1Label() {
    setMobilePriceLabelVisible(false);
  }

  function applyMobilePriceEstimatedLabel() {
    var L10n = (typeof iproBookingL10n !== 'undefined') ? iproBookingL10n : {};
    setMobilePriceLabelText(L10n.estimatedPrice || 'Estimated price');
    setMobilePriceLabelVisible(true);
  }

  function updateStep1FromPrice() {
    if (state.step1MinPriceResult && state.step1MinPriceResult.price != null && !state.step1MinPriceResult.contactRequired) {
      if (state.currentStep === 1) {
        updatePriceDisplay(state.step1MinPriceResult);
      }
      return;
    }

    var isContact = isInternationalPriceActive(state.priceResult);
    var plainText = formatStep1FromPrice();

    if (dom.step1PriceHint) {
      setInternationalPriceElement(dom.step1PriceHint, isContact, plainText);
      dom.step1PriceHint.classList.toggle('booking-step1-hint--contact', isContact);
    }
    if (state.currentStep === 1) {
      if (dom.mobilePriceAmount) {
        setInternationalPriceElement(dom.mobilePriceAmount, isContact, plainText);
        dom.mobilePriceAmount.classList.toggle('booking-mobile-price__amount--contact', isContact);
      }
      applyMobilePriceStep1Label();
      if (dom.mobilePrice) dom.mobilePrice.classList.add('booking-mobile-price--step1');
      renderPriceBreakdown(null);
    }
  }

  function handleServiceTypeChange() {
    var isHourly = state.serviceType === 'hourly';
    var extras = document.getElementById('booking-hourly-extras');
    if (extras) {
      extras.classList.toggle('is-open', isHourly);
    }
    if (dom.dropoffWrap) dom.dropoffWrap.style.display = '';
    if (dom.durationWrap) {
      dom.durationWrap.style.display = '';
      var durationSelect = document.getElementById('booking-duration');
      if (durationSelect) durationSelect.disabled = !isHourly;
    }
    state.step1MinPriceResult = null;
    clearVehiclePriceCache();
    updateTripbar();
    logEvent('serviceTypeChange', { serviceType: state.serviceType });
    // Keep current hint until new calc arrives — avoid flashing default From £ 55
    if (!getEffectivePickupAddress() || !getEffectiveDropoffAddress()) {
      updateStep1FromPrice();
    }
    updateStep1NextEnabled();
    triggerPriceOnly();
    refreshSummaryIfPresent();
    scheduleSaveState();
  }

  /* ─── Vehicle Selection ─── */

  function formatTripbarDatetime() {
    if (!state.pickupDate) return '\u2014';

    var h = (dom.hours && dom.hours.value !== '') ? dom.hours.value : state.pickupTimeHours;
    var m = (dom.minutes && dom.minutes.value !== '') ? dom.minutes.value : state.pickupTimeMinutes;

    var parts = state.pickupDate.split('-');
    if (parts.length !== 3) return '\u2014';

    var y = parseInt(parts[0], 10);
    var mo = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    if (!y || !mo || !d) return '\u2014';

    var dateForWeekday = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
    var dateStr = '';
    try {
      dateStr = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }).format(dateForWeekday);
    } catch (e) {
      dateStr = y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }

    if (h === '' || h == null || m === '' || m == null) {
      return dateStr + ', \u2014';
    }

    return dateStr + ', ' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  function renderTripbarSeparator(type) {
    var sep = document.createElement('span');
    sep.className = 'booking-tripbar__sep' + (type === 'pipe' ? ' booking-tripbar__sep--pipe' : '');
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = type === 'pipe' ? '|' : '>';
    return sep;
  }

  function renderTripbarItem(config) {
    var item = document.createElement('div');
    item.className = 'booking-tripbar__item' + (config.className ? ' ' + config.className : '');

    var icon = document.createElement('img');
    icon.className = 'booking-tripbar__icon';
    icon.src = config.icon;
    icon.alt = '';
    icon.width = 24;
    icon.height = 24;
    icon.decoding = 'async';
    icon.setAttribute('aria-hidden', 'true');

    var text = document.createElement('div');
    text.className = 'booking-tripbar__text';

    var k = document.createElement('span');
    k.className = 'booking-tripbar__k';
    k.textContent = config.label || '';

    var v = document.createElement('span');
    v.className = 'booking-tripbar__v';
    var valueText = config.value || '\u2014';
    v.textContent = valueText;
    if (valueText && valueText !== '\u2014') {
      v.title = valueText;
    }

    text.appendChild(k);
    text.appendChild(v);
    item.appendChild(icon);
    item.appendChild(text);
    return item;
  }

  function updateTripbar() {
    var L10n = (typeof iproBookingL10n !== 'undefined') ? iproBookingL10n : {};
    var pickupText = (state.pickup && state.pickup.address) ? state.pickup.address : (dom.pickup ? dom.pickup.value.trim() : '');
    var destText = (state.dropoff && state.dropoff.address) ? state.dropoff.address : (dom.dropoff ? dom.dropoff.value.trim() : '');
    var dtText = formatTripbarDatetime();
    var stopShort = [];
    var baseIconPath = '/wp-content/themes/hello-elementor/assets/icons/booking-summary';
    var segments = [];

    segments.push({
      className: 'booking-tripbar__item--pickup',
      label: L10n.tripbarPickup || 'Pickup location',
      value: pickupText || '\u2014',
      icon: baseIconPath + '/location.svg'
    });

    (state.stops || []).forEach(function (s, idx) {
      var addr = (s && s.address) ? s.address.trim() : '';
      if (!addr) return;
      var shortAddr = (addr.split(',')[0] || addr).trim();
      stopShort.push(shortAddr);
      segments.push({
        className: 'booking-tripbar__item--stop',
        label: (L10n.stop || 'STOP') + ' ' + (idx + 1),
        value: shortAddr,
        icon: baseIconPath + '/location.svg'
      });
    });

    segments.push({
      className: 'booking-tripbar__item--destination',
      label: L10n.tripbarDestination || 'destination',
      value: destText || '\u2014',
      icon: baseIconPath + '/location.svg'
    });

    segments.push({
      className: 'booking-tripbar__item--datetime',
      label: L10n.tripbarDatetime || 'date & time',
      value: dtText,
      icon: baseIconPath + '/datetime.svg'
    });

    if (dom.tripbarItems) {
      while (dom.tripbarItems.firstChild) {
        dom.tripbarItems.removeChild(dom.tripbarItems.firstChild);
      }

      segments.forEach(function (segment, index) {
        if (index > 0) {
          var sepType = segment.className === 'booking-tripbar__item--datetime' ? 'pipe' : 'arrow';
          dom.tripbarItems.appendChild(renderTripbarSeparator(sepType));
        }
        dom.tripbarItems.appendChild(renderTripbarItem(segment));
      });
    }

    logEvent('updateTripbar', {
      step: state.currentStep,
      serviceType: state.serviceType,
      pickup: pickupText || '\u2014',
      destination: destText || '\u2014',
      datetime: dtText,
      stops: stopShort
    });
  }

  function refreshSummaryIfPresent() {
    if (!dom.summaryRows) return;
    updateSummary();
  }

  function selectVehicleById(vehicleId, vehicleKey) {
    var prevVehicle = state.vehicle;

    document.querySelectorAll('.booking-vehicle').forEach(function (c) {
      c.classList.toggle('booking-vehicle--selected', c.getAttribute('data-vehicle') === vehicleId);
    });
    state.vehicle    = vehicleId;
    state.vehicleKey = vehicleKey;

    if (typeof window.iproBATrack === 'function') {
      window.iproBATrack('vehicle_select', {
        vehicle_key: vehicleKey,
        vehicle_name: (P.vehicleNames && P.vehicleNames[vehicleKey]) || vehicleKey
      });
    }

    if (prevVehicle !== vehicleId) {
      resetStep2Dependents();
    }

    refreshSummaryIfPresent();

    if (state.currentStep === 2) {
      syncSelectedVehiclePriceFromCard(vehicleId);
      scheduleSaveState();
      return;
    }

    triggerPriceUpdate();
    scheduleSaveState();
  }

  function initVehicleSelection() {
    var container = document.querySelector('.booking-vehicles');
    if (!container) return;
    container.addEventListener('click', function (e) {
      var card = e.target.closest('.booking-vehicle');
      if (!card) return;
      selectVehicleById(card.getAttribute('data-vehicle'), card.getAttribute('data-key'));
    });
  }

  /* ─── Mobile Vehicle Slider (infinite loop + left snap + peek) ─── */

  function scheduleMobileVehicleSliderLayoutSync() {
    if (!mobileVehicleSliderLayoutSync || !window.matchMedia('(max-width: 1024px)').matches) return;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        mobileVehicleSliderLayoutSync();
      });
    });
  }

  function destroyMobileVehicleSlider() {
    if (mobileVehicleSliderAbort) {
      mobileVehicleSliderAbort.abort();
      mobileVehicleSliderAbort = null;
    }
    if (mobileVehicleSliderDebounceTimer) {
      clearTimeout(mobileVehicleSliderDebounceTimer);
      mobileVehicleSliderDebounceTimer = null;
    }
    mobileVehicleSliderLayoutSync = null;

    var track = document.getElementById('booking-vehicles-step2') || document.querySelector('.booking-vehicles');
    if (!track) return;

    track.querySelectorAll('.booking-vehicle[aria-hidden="true"]').forEach(function (clone) {
      clone.remove();
    });

    track.style.scrollSnapType = '';
    track.scrollLeft = 0;
    track.removeAttribute('data-booking-slider-inited');

    track.querySelectorAll('.booking-vehicle').forEach(function (c) {
      c.classList.toggle('booking-vehicle--selected', c.getAttribute('data-vehicle') === String(state.vehicle));
    });
  }

  function syncMobileVehicleSliderForViewport() {
    if (window.matchMedia('(max-width: 1024px)').matches) {
      initMobileVehicleSlider();
    } else {
      destroyMobileVehicleSlider();
    }
  }

  function initMobileVehicleSlider() {
    if (!window.matchMedia('(max-width: 1024px)').matches) return;

    var track = document.getElementById('booking-vehicles-step2') || document.querySelector('.booking-vehicles');
    if (!track) return;

    if (track.getAttribute('data-booking-slider-inited') === '1') {
      return;
    }

    var originals = Array.from(track.querySelectorAll('.booking-vehicle'));
    var n = originals.length;
    if (n < 2) return;

    mobileVehicleSliderAbort = new AbortController();
    var sliderSignal = mobileVehicleSliderAbort.signal;

    originals.slice().reverse().forEach(function (card) {
      var clone = card.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('tabindex', '-1');
      track.insertBefore(clone, track.firstChild);
    });
    originals.forEach(function (card) {
      var clone = card.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('tabindex', '-1');
      track.appendChild(clone);
    });

    function physicalForReal(r) {
      return n + r;
    }

    function realFromPhysical(p) {
      if (p >= n && p < 2 * n) return p - n;
      if (p < n) return p;
      return p - 2 * n;
    }

    function getSnapPaddingStart() {
      var st = window.getComputedStyle(track);
      var v = parseFloat(st.scrollPaddingInlineStart);
      if (!isFinite(v) || v < 0) v = parseFloat(st.scrollPaddingLeft) || 0;
      return isFinite(v) ? v : 0;
    }

    function scrollLeftForPhysical(physicalIdx) {
      var list = track.querySelectorAll('.booking-vehicle');
      var card = list[physicalIdx];
      if (!card) return 0;
      var pad = getSnapPaddingStart();
      return Math.max(0, card.offsetLeft - pad);
    }

    function setTrackScrollLeftInstant(x) {
      try {
        track.scrollTo({ left: x, behavior: 'instant' });
      } catch (e1) {
        try {
          track.scrollTo({ left: x, behavior: 'auto' });
        } catch (e2) {
          track.scrollLeft = x;
        }
      }
    }

    function jumpTo(physicalIdx, onDone) {
      var target = scrollLeftForPhysical(physicalIdx);
      track.style.scrollSnapType = 'none';
      setTrackScrollLeftInstant(target);
      void track.offsetHeight;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          track.style.scrollSnapType = '';
          requestAnimationFrame(function () {
            if (typeof onDone === 'function') onDone();
          });
        });
      });
    }

    function getPhysicalFromScroll() {
      var pad = getSnapPaddingStart();
      var sl = track.scrollLeft;
      var list = track.querySelectorAll('.booking-vehicle');
      var chosen = 0;
      var best = Infinity;
      for (var i = 0; i < list.length; i++) {
        var ideal = Math.max(0, list[i].offsetLeft - pad);
        var d = Math.abs(sl - ideal);
        if (d < best) {
          best = d;
          chosen = i;
        }
      }
      return chosen;
    }

    function getRealFromScroll() {
      return realFromPhysical(getPhysicalFromScroll());
    }

    var currentIdx = 0;
    var isJumping = false;

    function syncVehicleToIdx(realIdx) {
      var card = originals[realIdx];
      if (!card) return;
      var vid  = card.getAttribute('data-vehicle');
      var vkey = card.getAttribute('data-key');
      if (vid !== state.vehicle) selectVehicleById(vid, vkey);
    }

    function updateState(realIdx) {
      currentIdx = realIdx;
      syncVehicleToIdx(realIdx);
    }

    var programmaticScroll = false;

    function restoreScrollSnapSoon(cb) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          track.style.scrollSnapType = '';
          requestAnimationFrame(function () {
            if (typeof cb === 'function') cb();
          });
        });
      });
    }

    function restoreScrollSnap() {
      track.style.scrollSnapType = '';
    }

    function endProgrammaticScroll() {
      if (!programmaticScroll) return;
      programmaticScroll = false;
      restoreScrollSnap();
    }

    function scrollToReal(realIdx, smooth) {
      realIdx = ((realIdx % n) + n) % n;
      var physical = physicalForReal(realIdx);
      var target = scrollLeftForPhysical(physical);
      track.style.scrollSnapType = 'none';
      if (smooth) {
        programmaticScroll = true;
        track.scrollTo({ left: target, behavior: 'smooth' });
        currentIdx = realIdx;
        syncVehicleToIdx(realIdx);
      } else {
        programmaticScroll = false;
        setTrackScrollLeftInstant(target);
        void track.offsetHeight;
        restoreScrollSnapSoon(function () {
          updateState(realIdx);
        });
      }
    }

    function onScrollSettled() {
      if (isJumping) return;
      if (programmaticScroll) endProgrammaticScroll();
      var p = getPhysicalFromScroll();
      if (p < n) {
        isJumping = true;
        jumpTo(p + n, function () {
          isJumping = false;
          updateState(p);
        });
        return;
      }
      if (p >= 2 * n) {
        isJumping = true;
        jumpTo(p - n, function () {
          isJumping = false;
          updateState(p - 2 * n);
        });
        return;
      }
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          updateState(p - n);
        });
      });
    }

    track.querySelectorAll('.booking-vehicle').forEach(function (card) {
      card.addEventListener('click', function (e) {
        e.stopPropagation();
        var vid = card.getAttribute('data-vehicle');
        var realIdx = originals.findIndex(function (o) {
          return o.getAttribute('data-vehicle') === vid;
        });
        if (realIdx < 0) return;
        scrollToReal(realIdx, true);
      }, { signal: sliderSignal });
    });

    var hasScrollEnd = 'onscrollend' in window;

    function onTrackScroll() {
      if (!hasScrollEnd) {
        clearTimeout(mobileVehicleSliderDebounceTimer);
        mobileVehicleSliderDebounceTimer = setTimeout(onScrollSettled, 150);
      }
    }

    track.addEventListener('scroll', onTrackScroll, { passive: true, signal: sliderSignal });

    if (hasScrollEnd) {
      track.addEventListener('scrollend', onScrollSettled, { passive: true, signal: sliderSignal });
    }

    function syncLayoutToVehicle() {
      if (track.clientWidth <= 0) return;
      var initIdx = 0;
      originals.forEach(function (card, i) {
        if (card.getAttribute('data-vehicle') === String(state.vehicle)) initIdx = i;
      });
      scrollToReal(initIdx, false);
    }

    mobileVehicleSliderLayoutSync = syncLayoutToVehicle;

    track.setAttribute('data-booking-slider-inited', '1');

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var initIdx = 0;
        originals.forEach(function (card, i) {
          if (card.getAttribute('data-vehicle') === String(state.vehicle)) initIdx = i;
        });
        jumpTo(physicalForReal(initIdx), function () {
          updateState(initIdx);
        });
      });
    });

    scheduleMobileVehicleSliderLayoutSync();
  }

  function resetStep2Dependents() {
    if (dom.passengers) dom.passengers.value = '';
    if (dom.smallBags) dom.smallBags.value = '';
    if (dom.largeBags) dom.largeBags.value = '';
    updatePassengerOptions();
    updateSuitcaseOptions();
  }

  /* ─── Add/Remove Stops ─── */

  var BOOKING_STOP_ANIM_MS = 480;

  function bookingStopInner(el) {
    return el && el.querySelector ? el.querySelector('.booking-stop__inner') : null;
  }

  function isStopRowOpen(el) {
    return !!(el && el.classList.contains('booking-stop--open'));
  }

  function syncStopRowOpenClass(el, open) {
    if (!el) return;
    el.classList.toggle('booking-stop--open', !!open);
  }

  function setStopRowsInstant(applyFn) {
    var r;
    for (var i = 1; i <= 3; i++) {
      r = document.getElementById('booking-stop-' + i);
      if (r) r.classList.add('booking-stop--instant');
    }
    applyFn();
    requestAnimationFrame(function () {
      for (var j = 1; j <= 3; j++) {
        r = document.getElementById('booking-stop-' + j);
        if (r) r.classList.remove('booking-stop--instant');
      }
    });
  }

  function runAfterStopCollapse(el, callback) {
    var inner = bookingStopInner(el);
    if (!el || !inner || !isStopRowOpen(el)) {
      if (callback) callback();
      return;
    }
    var finished = false;
    function done() {
      if (finished) return;
      finished = true;
      inner.removeEventListener('transitionend', onEnd);
      clearTimeout(timer);
      if (callback) callback();
    }
    function onEnd(e) {
      if (e.target !== inner) return;
      if (e.propertyName !== 'max-height') return;
      done();
    }
    inner.addEventListener('transitionend', onEnd);
    var timer = setTimeout(done, BOOKING_STOP_ANIM_MS);
    el.classList.remove('booking-stop--open');
  }

  function initStops() {
    dom.addStopBtn.addEventListener('click', function () {
      if (state.stopsVisible < 3) {
        state.stopsVisible++;
        var stopRow = document.getElementById('booking-stop-' + state.stopsVisible);
        syncStopRowOpenClass(stopRow, true);
        if (state.stopsVisible >= 3 && dom.addStopBtn) dom.addStopBtn.style.display = 'none';
        initAutocomplete();
        var stopInput = document.getElementById('booking-stop-' + state.stopsVisible + '-input');
        if (stopInput) {
          try { stopInput.focus(); } catch (e) {}
        }
        updateTripbar();
        refreshSummaryIfPresent();
        scheduleSaveState();
      }
    });

    document.querySelectorAll('.booking-stop__remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-stop'), 10);
        removeStop(idx);
      });
    });
  }

  function removeStop(idx) {
    var el = document.getElementById('booking-stop-' + idx);
    var input = document.getElementById('booking-stop-' + idx + '-input');
    function finalize() {
      if (input) input.value = '';
      state.stops[idx - 1] = { address: '', placeId: '' };
      shiftStopsDown(idx);
      if (dom.addStopBtn) dom.addStopBtn.style.display = '';
      updateTripbar();
      refreshSummaryIfPresent();
      triggerPriceUpdate();
      scheduleSaveState();
    }
    runAfterStopCollapse(el, finalize);
  }

  function shiftStopsDown(removedIdx) {
    var visible = [];
    for (var i = 1; i <= 3; i++) {
      var elRow = document.getElementById('booking-stop-' + i);
      if (isStopRowOpen(elRow) && i !== removedIdx) {
        visible.push({
          address: document.getElementById('booking-stop-' + i + '-input').value,
          placeId: state.stops[i - 1].placeId
        });
      }
    }

    setStopRowsInstant(function () {
      for (var j = 1; j <= 3; j++) {
        var stopEl = document.getElementById('booking-stop-' + j);
        var stopInput = document.getElementById('booking-stop-' + j + '-input');
        if (j <= visible.length) {
          syncStopRowOpenClass(stopEl, true);
          stopInput.value = visible[j - 1].address;
          state.stops[j - 1] = visible[j - 1];
        } else {
          syncStopRowOpenClass(stopEl, false);
          stopInput.value = '';
          state.stops[j - 1] = { address: '', placeId: '' };
        }
      }
      state.stopsVisible = visible.length;

      for (var k = 1; k <= 3; k++) {
        var ac = autocompletes['stop' + k];
        if (!ac) continue;
        if (k <= visible.length && ac.input.value) {
          closeDropdown(ac);
        } else {
          ac.input.value = '';
        }
      }
    });
  }

  /* ─── Google Maps Library Management ─── */

  var mapsReady = false;
  var mapsLoadingPromise = null;

  function loadGoogleMaps() {
    if (mapsReady) {
      return Promise.resolve();
    }
    if (!mapsLoadingPromise) {
      mapsLoadingPromise = (async function () {
        while (typeof google === 'undefined' || !google.maps || !google.maps.importLibrary) {
          await new Promise(function (r) { setTimeout(r, 50); });
        }
        await Promise.all([
          google.maps.importLibrary('core'),
          google.maps.importLibrary('maps'),
          google.maps.importLibrary('places'),
          google.maps.importLibrary('marker'),
          google.maps.importLibrary('geocoding'),
          google.maps.importLibrary('routes')
        ]);
        mapsReady = true;
      })().catch(function (err) {
        mapsLoadingPromise = null;
        throw err;
      });
    }
    return mapsLoadingPromise;
  }

  /* ─── Google Places Autocomplete ─── */

  var SERVICE_REGION_CODES = ['GB', 'FR', 'NL', 'BE', 'DE', 'CH', 'AT', 'IT', 'MC', 'ES', 'PT', 'DK'];

  var autocompletes = {};
  var acSessionToken = null;
  var AC_DEBOUNCE_MS = 300;

  async function initAutocomplete() {
    await loadGoogleMaps();
    acSessionToken = new google.maps.places.AutocompleteSessionToken();

    setupAutocomplete(dom.pickup, 'pickup');
    setupAutocomplete(dom.dropoff, 'dropoff');

    for (var i = 1; i <= 3; i++) {
      var input = document.getElementById('booking-stop-' + i + '-input');
      if (input) setupAutocomplete(input, 'stop' + i);
    }

  }

  function setupAutocomplete(input, stateKey) {
    if (!input || autocompletes[stateKey]) return;

    var dropdown = document.createElement('ul');
    dropdown.className = 'ipro-ac-dropdown';
    input.parentNode.style.position = 'relative';
    input.parentNode.appendChild(dropdown);

    var timer = null;
    var activeIdx = -1;

    var acObj = { input: input, dropdown: dropdown };
    autocompletes[stateKey] = acObj;

    input.addEventListener('input', function () {
      clearTimeout(timer);
      setLocationState(stateKey, '', '', null, null);
      if (stateKey === 'pickup') {
        state.pickupIsAirport = false;
      } else if (stateKey === 'dropoff') {
        state.dropoffIsAirport = false;
      }
      syncAirportRouteUi();
      var q = input.value.trim();
      if (q.length < 2) { closeDropdown(acObj); return; }
      timer = setTimeout(function () { fetchSuggestions(q, acObj, stateKey); }, AC_DEBOUNCE_MS);
    });

    input.addEventListener('keydown', function (e) {
      var items = dropdown.querySelectorAll('.ipro-ac-item');
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, items.length - 1);
        highlightItem(items, activeIdx);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        highlightItem(items, activeIdx);
      } else if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault();
        items[activeIdx].click();
      } else if (e.key === 'Escape') {
        closeDropdown(acObj);
      }
    });

    input.addEventListener('focus', function () {
      if (dropdown.children.length > 0) dropdown.style.display = 'block';
    });

    input.addEventListener('blur', function () {
      setTimeout(function () { closeDropdown(acObj); }, 200);
      syncAirportRouteUi();
      if (stateKey === 'pickup' || stateKey === 'dropoff') triggerPriceUpdate();
    });
  }

  async function fetchSuggestions(query, acObj, stateKey) {
    try {
      var request = {
        input: query,
        includedRegionCodes: SERVICE_REGION_CODES,
        includedPrimaryTypes: ['geocode', 'establishment'],
        sessionToken: acSessionToken
      };
      var result = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
      renderDropdown(acObj, result.suggestions || [], stateKey);
    } catch (e) {
      closeDropdown(acObj);
    }
  }

  function renderDropdown(acObj, suggestions, stateKey) {
    var dropdown = acObj.dropdown;
    while (dropdown.firstChild) dropdown.removeChild(dropdown.firstChild);
    if (!suggestions.length) { dropdown.style.display = 'none'; return; }

    for (var i = 0; i < suggestions.length; i++) {
      (function (suggestion) {
        var pred = suggestion.placePrediction;
        if (!pred) return;
        var li = document.createElement('li');
        li.className = 'ipro-ac-item';
        var main = document.createElement('span');
        main.className = 'ipro-ac-main';
        main.textContent = pred.mainText ? pred.mainText.toString() : '';
        var secondary = document.createElement('span');
        secondary.className = 'ipro-ac-secondary';
        secondary.textContent = pred.secondaryText ? pred.secondaryText.toString() : '';
        li.appendChild(main);
        li.appendChild(secondary);

        li.addEventListener('mousedown', function (e) {
          e.preventDefault();
          selectSuggestion(suggestion, acObj, stateKey);
        });
        dropdown.appendChild(li);
      })(suggestions[i]);
    }
    dropdown.style.display = 'block';
  }

  async function selectSuggestion(suggestion, acObj, stateKey) {
    var pred = suggestion.placePrediction;
    if (!pred) return;

    try {
      var place = pred.toPlace();
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'types', 'addressComponents'] });

      var hasOwnName = place.displayName && place.displayName !== place.formattedAddress;
      var addr = hasOwnName
        ? place.displayName + (pred.secondaryText ? ', ' + pred.secondaryText.toString() : '')
        : (place.formattedAddress || pred.text.toString());
      var lat = place.location ? place.location.lat() : null;
      var lng = place.location ? place.location.lng() : null;
      var placeId = place.id || '';
      var countryCode = extractCountryCodeFromComponents(place.addressComponents);

      acObj.input.value = addr;
      setLocationState(stateKey, addr, placeId, lat, lng, countryCode);

      if (stateKey === 'pickup' || stateKey === 'dropoff') {
        var isAirport = checkIsAirport(place.types || [], addr);
        if (stateKey === 'pickup') state.pickupIsAirport = isAirport;
        if (stateKey === 'dropoff') state.dropoffIsAirport = isAirport;
      }
      syncAirportRouteUi();

      acSessionToken = new google.maps.places.AutocompleteSessionToken();
      triggerPriceUpdate();
    } catch (e) {
      acObj.input.value = pred.text.toString();
    }
    closeDropdown(acObj);
  }

  function highlightItem(items, idx) {
    for (var i = 0; i < items.length; i++) items[i].classList.remove('ipro-ac-item--active');
    if (items[idx]) items[idx].classList.add('ipro-ac-item--active');
  }

  function closeDropdown(acObj) {
    if (acObj && acObj.dropdown) acObj.dropdown.style.display = 'none';
  }

  function closeAllAutocompleteDropdowns() {
    Object.keys(autocompletes).forEach(function (key) {
      closeDropdown(autocompletes[key]);
    });
  }

  function showConfirmedOverlay(stateKey, address) {
    var ac = autocompletes[stateKey];
    if (!ac) return;
    ac.input.value = address;
  }

  function extractCountryCodeFromComponents(components) {
    if (!components || !components.length) return '';
    for (var i = 0; i < components.length; i++) {
      var c = components[i];
      var types = c.types || [];
      if (types.indexOf('country') !== -1) {
        return c.shortText || c.short_name || c.longText || c.long_name || '';
      }
    }
    return '';
  }

  function extractCountryCodeFromGeocoderResult(result) {
    if (!result || !result.address_components) return '';
    for (var i = 0; i < result.address_components.length; i++) {
      var c = result.address_components[i];
      if (c.types && c.types.indexOf('country') !== -1) {
        return c.short_name || c.long_name || '';
      }
    }
    return '';
  }

  function getRouteMeta() {
    var stops = [];
    for (var i = 0; i < (state.stopsVisible || 0); i++) {
      var addr = state.stops[i] && state.stops[i].address ? state.stops[i].address.trim() : '';
      if (addr) stops.push(addr);
    }
    var timeH = (dom.hours && dom.hours.value !== '') ? dom.hours.value : state.pickupTimeHours;
    var timeM = (dom.minutes && dom.minutes.value !== '') ? dom.minutes.value : state.pickupTimeMinutes;
    var pickupDateTime = '';
    if (state.pickupDate && timeH !== '' && timeM !== '') {
      pickupDateTime = state.pickupDate + ' ' + timeH + ':' + timeM;
    } else if (timeH !== '' && timeM !== '') {
      pickupDateTime = timeH + ':' + timeM;
    }
    return {
      pickupCountryCode: (state.pickup && state.pickup.countryCode) || '',
      dropoffCountryCode: (state.dropoff && state.dropoff.countryCode) || '',
      stops: stops,
      pickupDateTime: pickupDateTime,
      pickupTime: (timeH !== '' && timeM !== '') ? (timeH + ':' + timeM) : '',
      serviceType: state.serviceType
    };
  }

  function updateStep1NextEnabled() {
    var pickup = getEffectivePickupAddress();
    var dropoff = getEffectiveDropoffAddress();
    var ok = !!(pickup && dropoff);
    if (dom.nextBtn) dom.nextBtn.disabled = !ok;
    if (dom.mobileNextBtn) dom.mobileNextBtn.disabled = !ok;
  }

  function getEffectivePickupAddress() {
    return (state.pickup && state.pickup.address) || (dom.pickup ? dom.pickup.value.trim() : '');
  }

  function getEffectiveDropoffAddress() {
    return (state.dropoff && state.dropoff.address) || (dom.dropoff ? dom.dropoff.value.trim() : '');
  }

  function getInternationalContactUrl() {
    var L10n = (typeof iproBookingL10n !== 'undefined') ? iproBookingL10n : {};
    return L10n.internationalPriceContactUrl || '/contact/';
  }

  function getInternationalContactMessage() {
    var L10n = (typeof iproBookingL10n !== 'undefined') ? iproBookingL10n : {};
    return L10n.internationalPriceContactShort || L10n.internationalPriceContact || 'Price on request — contact us';
  }

  function getInternationalContactCardMessage() {
    var L10n = (typeof iproBookingL10n !== 'undefined') ? iproBookingL10n : {};
    return L10n.internationalPriceContactCard || 'Price on request';
  }

  function buildInternationalContactHtml() {
    var L10n = (typeof iproBookingL10n !== 'undefined') ? iproBookingL10n : {};
    var prefix = L10n.internationalPriceContactPrefix || 'Price on request —';
    var linkLabel = L10n.internationalPriceContactLink || 'Contact us';
    var url = getInternationalContactUrl();
    return escapeHtml(prefix) + ' <a href="' + escapeHtml(url) + '" class="booking-intl-price-link">' + escapeHtml(linkLabel) + '</a>';
  }

  function setInternationalPriceElement(el, isContact, plainFallback) {
    if (!el) return;
    if (isContact) {
      el.innerHTML = buildInternationalContactHtml();
    } else {
      el.textContent = plainFallback || '';
    }
  }

  function isInternationalPriceActive(result) {
    return isInternationalRouteActive() || !!(result && result.contactRequired);
  }

  function isInternationalRouteActive() {
    var pickup = getEffectivePickupAddress();
    var dropoff = getEffectiveDropoffAddress();
    if (!pickup || !dropoff) return false;
    var meta = getRouteMeta();
    return Engine.isInternationalLondonRoute && Engine.isInternationalLondonRoute(pickup, dropoff, meta);
  }

  function setLocationState(key, address, placeId, lat, lng, countryCode) {
    var obj = {
      address: address,
      placeId: placeId || '',
      lat: lat,
      lng: lng,
      countryCode: countryCode || ''
    };
    if (key === 'pickup') state.pickup = obj;
    else if (key === 'dropoff') state.dropoff = obj;
    else if (key.startsWith('stop')) {
      var idx = parseInt(key.replace('stop', ''), 10) - 1;
      state.stops[idx] = { address: address, placeId: placeId || '' };
    }

    if (key === 'pickup' || key === 'dropoff' || key.startsWith('stop')) {
      logEvent('setLocationState', { key: key, address: address || '', placeId: placeId || '' });
      state.step1MinPriceResult = null;
      clearVehiclePriceCache();
      updateTripbar();
      refreshSummaryIfPresent();
      scheduleSaveState();
      updateStep1NextEnabled();
      if (key === 'pickup' || key === 'dropoff') {
        updateStep1FromPrice();
      }
    }
  }

  var AIRPORT_KEYWORDS = /airport|terminal|аэропорт|аэровокзал|aeroport|heathrow|gatwick|stansted|luton|london city airport|birmingham airport|manchester airport|edinburgh airport/i;

  function checkIsAirport(placeTypes, address) {
    if (placeTypes && placeTypes.indexOf('airport') !== -1) return true;
    return AIRPORT_KEYWORDS.test(address || '');
  }

  function getRouteAddressTexts() {
    var texts = [];
    var pickup = (state.pickup && state.pickup.address) || (dom.pickup ? dom.pickup.value.trim() : '');
    var dropoff = (state.dropoff && state.dropoff.address) || (dom.dropoff ? dom.dropoff.value.trim() : '');
    if (pickup) texts.push(pickup);
    if (dropoff) texts.push(dropoff);
    for (var i = 0; i < (state.stops || []).length; i++) {
      var stopAddr = (state.stops[i] && state.stops[i].address) ? state.stops[i].address.trim() : '';
      if (!stopAddr) {
        var stopInput = document.getElementById('booking-stop-' + (i + 1) + '-input');
        if (stopInput) stopAddr = stopInput.value.trim();
      }
      if (stopAddr) texts.push(stopAddr);
    }
    return texts;
  }

  function routeMentionsAirport() {
    var texts = getRouteAddressTexts();
    for (var i = 0; i < texts.length; i++) {
      if (checkIsAirport([], texts[i])) return true;
    }
    return false;
  }

  function syncAirportRouteUi() {
    toggleFlightField(routeMentionsAirport());
    refreshSummaryIfPresent();
  }

  function toggleFlightField(show) {
    if (!dom.flightWrap) return;
    dom.flightWrap.style.display = show ? '' : 'none';
    if (dom.contactRow) {
      dom.contactRow.classList.toggle('booking-form__row--contact--with-flight', !!show);
      dom.contactRow.classList.toggle('booking-form__row--contact--no-flight', !show);
    }
    if (!show && dom.flight) {
      dom.flight.value = '';
      setFlightStatus('');
    }
    scheduleSaveState();
  }

  /* ─── Flight Validation (AeroDataBox) ─── */

  var flightCheckTimer = null;
  var flightCheckXhr   = null;

  function initFlightValidation() {
    if (!dom.flight) return;
    dom.flight.addEventListener('input', function () {
      clearTimeout(flightCheckTimer);
      if (flightCheckXhr) flightCheckXhr.abort();

      var val = dom.flight.value.trim().toUpperCase();
      if (val.length < 4 || !state.pickupDate) {
        setFlightStatus('');
        return;
      }

      setFlightStatus('loading');
      flightCheckTimer = setTimeout(function () { validateFlight(val); }, 800);
    });
  }

  function validateFlight(flightNum) {
    var dateVal = state.pickupDate;
    if (!dateVal) { setFlightStatus(''); return; }

    var parts = dateVal.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    var isoDate = parts ? parts[3] + '-' + parts[2] + '-' + parts[1] : dateVal;

    flightCheckXhr = $.post(iproBooking.ajaxUrl, {
      action: 'ipro_validate_flight',
      nonce: iproBooking.nonce,
      flightNumber: flightNum,
      date: isoDate
    })
    .done(function (res) {
      if (res.success && res.data && res.data.found) {
        var d = res.data;
        var info = d.flight + ': ' + d.from;
        if (d.fromTerminal) info += ' (T' + d.fromTerminal + ')';
        info += ' → ' + d.to;
        if (d.departure) info += ', dep. ' + d.departure;
        setFlightStatus('found', info);
      } else {
        setFlightStatus('notfound');
      }
    })
    .fail(function (xhr, status) {
      if (status !== 'abort') setFlightStatus('');
    });
  }

  function setFlightStatus(type, message) {
    var el = document.getElementById('booking-flight-status');
    if (!el) return;

    el.className = 'booking-field__flight-status';
    if (type === 'loading') {
      el.className += ' booking-field__flight-status--loading';
      el.textContent = '';
    } else if (type === 'found') {
      el.className += ' booking-field__flight-status--found';
      el.textContent = message || '';
    } else if (type === 'notfound') {
      el.className += ' booking-field__flight-status--notfound';
      el.textContent = (typeof iproBookingL10n !== 'undefined' && iproBookingL10n.flightNotFound) ? iproBookingL10n.flightNotFound : 'Flight not found — you can still proceed';
    } else {
      el.textContent = '';
    }
  }

  /* ─── Map Picker ─── */

  var mapInstance = null;
  var mapMarker = null;
  var mapGeocoder = null;
  var mapTargetInput = null;
  var mapTargetKey = null;
  var mapPinnedAddress = '';
  var mapGeocodedCountryCode = '';

  function initMapPicker() {
    document.querySelectorAll('.booking-field__pin-btn').forEach(function (btn) {
      var warmMaps = function () {
        loadGoogleMaps().catch(function () {});
      };
      btn.addEventListener('touchstart', warmMaps, { passive: true });
      btn.addEventListener('mouseenter', warmMaps);
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-target');
        var input = document.getElementById(targetId);
        var stopKey = btn.getAttribute('data-stop-key');
        var key = stopKey ? stopKey : (targetId === 'booking-pickup' ? 'pickup' : 'dropoff');
        openMapPicker(input, key);
      });
    });

    dom.mapModal.querySelector('.booking-map-modal__overlay').addEventListener('click', closeMapModal);
    dom.mapModal.querySelector('.booking-map-modal__close').addEventListener('click', closeMapModal);
    dom.mapConfirm.addEventListener('click', confirmMapLocation);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMapModal();
    });
  }

  function openMapPicker(input, key) {
    mapTargetInput = input;
    mapTargetKey = key;
    mapPinnedAddress = '';
    mapGeocodedCountryCode = '';
    dom.mapModal.classList.add('booking-map-modal--open');
    var scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + scrollY + 'px';
    document.body.style.width = '100%';
    document.body.dataset.scrollY = scrollY;

    if (dom.mapSearch) dom.mapSearch.value = input.value || '';
    if (dom.mapAddr) {
      var moveMsg = (typeof iproBookingL10n !== 'undefined' && iproBookingL10n.moveMapToPin) ? iproBookingL10n.moveMapToPin : 'Move the map to position the pin';
      dom.mapAddr.textContent = moveMsg;
      dom.mapAddr.dataset.addrState = 'empty';
    }

    function finishOpenMapPicker() {
      if (!mapsReady) return;
      if (!acSessionToken && typeof google !== 'undefined' && google.maps && google.maps.places) {
        try {
          acSessionToken = new google.maps.places.AutocompleteSessionToken();
        } catch (e) {}
      }

      var isMobile = window.matchMedia('(max-width: 1024px)').matches;

      if (!mapInstance) {
        mapGeocoder = new google.maps.Geocoder();
        mapInstance = new google.maps.Map(dom.mapCanvas, {
          mapId: '34c0ddf9b2d8fd598ca3a19e',
          center: { lat: 51.5074, lng: -0.1278 },
          zoom: 12,
          mapTypeId: 'roadmap',
          disableDefaultUI: true,
          gestureHandling: isMobile ? 'greedy' : 'cooperative'
        });
        dom.mapCanvas.style.filter = 'grayscale(100%)';

        var crosshair = dom.mapModal.querySelector('.booking-map-modal__crosshair');
        if (crosshair) crosshair.style.display = 'block';

        mapInstance.addListener('dragstart', function () {
          dom.mapModal.classList.add('booking-map-modal--dragging');
          mapPinnedAddress = '';
          dom.mapAddr.dataset.addrState = 'empty';
        });

        mapInstance.addListener('idle', function () {
          dom.mapModal.classList.remove('booking-map-modal--dragging');
          if (mapPinnedAddress) return;
          geocodePosition(mapInstance.getCenter());
        });

        var zoomWrap = document.createElement('div');
        zoomWrap.className = 'booking-map-zoom';
        var zoomIn = document.createElement('button');
        zoomIn.type = 'button';
        zoomIn.className = 'booking-map-zoom__btn';
        zoomIn.setAttribute('data-action', 'in');
        zoomIn.textContent = '+';
        var zoomOut = document.createElement('button');
        zoomOut.type = 'button';
        zoomOut.className = 'booking-map-zoom__btn';
        zoomOut.setAttribute('data-action', 'out');
        zoomOut.textContent = '\u2212';
        zoomWrap.appendChild(zoomIn);
        zoomWrap.appendChild(zoomOut);
        dom.mapCanvas.appendChild(zoomWrap);

        zoomWrap.addEventListener('click', function (e) {
          var btn = e.target.closest('[data-action]');
          if (!btn) return;
          var z = mapInstance.getZoom();
          mapInstance.setZoom(btn.dataset.action === 'in' ? z + 1 : z - 1);
        });

        if (dom.mapSearch) {
          setupMapSearchAutocomplete(dom.mapSearch);
        }

        setTimeout(function () {
          google.maps.event.trigger(mapInstance, 'resize');
        }, 50);
      } else {
        google.maps.event.trigger(mapInstance, 'resize');
      }

      var addr = mapTargetInput ? mapTargetInput.value.trim() : '';
      if (addr && mapGeocoder) {
        mapPinnedAddress = addr;
        dom.mapAddr.textContent = addr;
        dom.mapAddr.dataset.addrState = 'ok';
        mapGeocoder.geocode({ address: addr }, function (results, status) {
          if (status === 'OK' && results[0]) {
            mapInstance.setCenter(results[0].geometry.location);
            mapGeocodedCountryCode = extractCountryCodeFromGeocoderResult(results[0]);
          }
        });
      } else {
        dom.mapAddr.dataset.addrState = 'empty';
      }
    }

    if (!mapsReady) {
      loadGoogleMaps().then(finishOpenMapPicker);
      return;
    }
    finishOpenMapPicker();
  }

  function setupMapSearchAutocomplete(searchInput) {
    var dropdown = document.createElement('ul');
    dropdown.className = 'ipro-ac-dropdown ipro-ac-dropdown--map';
    searchInput.parentNode.style.position = 'relative';
    searchInput.parentNode.appendChild(dropdown);
    var timer = null;

    searchInput.addEventListener('input', function () {
      clearTimeout(timer);
      var q = searchInput.value.trim();
      if (q.length < 2) {
        dropdown.style.display = 'none';
        while (dropdown.firstChild) dropdown.removeChild(dropdown.firstChild);
        return;
      }
      timer = setTimeout(async function () {
        try {
          var res = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: q,
            includedRegionCodes: SERVICE_REGION_CODES,
            sessionToken: acSessionToken
          });
          var sug = res.suggestions || [];
          while (dropdown.firstChild) dropdown.removeChild(dropdown.firstChild);
          if (!sug.length) { dropdown.style.display = 'none'; return; }
          for (var i = 0; i < sug.length; i++) {
            (function (s) {
              var pred = s.placePrediction;
              if (!pred) return;
              var li = document.createElement('li');
              li.className = 'ipro-ac-item';
              li.textContent = pred.text.toString();
              li.addEventListener('mousedown', async function (e) {
                e.preventDefault();
                var place = pred.toPlace();
                await place.fetchFields({ fields: ['location', 'addressComponents'] });
                if (!place.location) return;
                mapGeocodedCountryCode = extractCountryCodeFromComponents(place.addressComponents);
                mapInstance.setCenter(place.location);
                mapInstance.setZoom(15);
                if (mapMarker && !window.matchMedia('(max-width: 1024px)').matches) {
                  mapMarker.position = place.location;
                  mapMarker.map = mapInstance;
                }
                mapPinnedAddress = pred.text.toString();
                searchInput.value = mapPinnedAddress;
                dom.mapAddr.textContent = mapPinnedAddress;
                dom.mapAddr.dataset.addrState = 'ok';
                dropdown.style.display = 'none';
                acSessionToken = new google.maps.places.AutocompleteSessionToken();
              });
              dropdown.appendChild(li);
            })(sug[i]);
          }
          dropdown.style.display = 'block';
        } catch (err) {
          dropdown.style.display = 'none';
        }
      }, AC_DEBOUNCE_MS);
    });

    searchInput.addEventListener('blur', function () {
      setTimeout(function () { dropdown.style.display = 'none'; }, 200);
    });
  }

  function geocodePosition(latLng) {
    if (!mapGeocoder || !latLng) return;
    mapGeocoder.geocode({ location: latLng }, function (results, status) {
      if (status === 'OK' && results[0]) {
        dom.mapAddr.textContent = results[0].formatted_address;
        dom.mapAddr.dataset.addrState = 'ok';
        mapGeocodedCountryCode = extractCountryCodeFromGeocoderResult(results[0]);
      } else {
        mapGeocodedCountryCode = '';
        dom.mapAddr.textContent = (typeof iproBookingL10n !== 'undefined' && iproBookingL10n.addressNotFound) ? iproBookingL10n.addressNotFound : 'Address not found';
        dom.mapAddr.dataset.addrState = 'error';
      }
    });
  }

  function confirmMapLocation() {
    var addr = (mapPinnedAddress && mapPinnedAddress.trim()) || dom.mapAddr.textContent;
    var addrState = dom.mapAddr.dataset.addrState;
    if (!addr || addrState === 'error' || addrState === 'empty') return;
    var pos = mapInstance ? mapInstance.getCenter() : null;
    if (mapTargetInput) mapTargetInput.value = addr;
    if (mapTargetKey && pos) {
      setLocationState(mapTargetKey, addr, '', pos.lat(), pos.lng(), mapGeocodedCountryCode || '');
    }
    if (mapTargetKey === 'pickup' || mapTargetKey === 'dropoff') {
      var isAirport = checkIsAirport([], addr);
      if (mapTargetKey === 'pickup') state.pickupIsAirport = isAirport;
      if (mapTargetKey === 'dropoff') state.dropoffIsAirport = isAirport;
    }
    syncAirportRouteUi();
    if (mapTargetKey) showConfirmedOverlay(mapTargetKey, addr);
    closeMapModal();
    triggerPriceUpdate();
  }

  function closeMapModal() {
    mapPinnedAddress = '';
    dom.mapModal.classList.remove('booking-map-modal--open');
    var scrollY = parseInt(document.body.dataset.scrollY || '0', 10);
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    delete document.body.dataset.scrollY;
    window.scrollTo(0, scrollY);
  }

  /* ─── Route Preview ─── */

  function isDesktop() { return window.innerWidth >= 1025; }

  var routeMap = null;
  var routePolyline = null;
  var routeService = null;
  var routeMarkers = [];
  var lastRouteBounds = null;
  var lastRouteSignature = null;

  function getRouteSignature() {
    var pickup = (state.pickup && state.pickup.address) || (dom.pickup ? dom.pickup.value.trim() : '');
    var dropoff = (state.dropoff && state.dropoff.address) || (dom.dropoff ? dom.dropoff.value.trim() : '');
    var stops = [];
    for (var i = 0; i < (state.stopsVisible || 0); i++) {
      var addr = state.stops[i] && state.stops[i].address ? state.stops[i].address.trim() : '';
      if (addr) stops.push(addr);
    }
    return pickup + '||' + dropoff + '||' + stops.join('|');
  }

  function initRouteMapBase() {
    if (!dom.routeMap || routeMap) return;
    routeMap = new google.maps.Map(dom.routeMap, {
      mapId: '34c0ddf9b2d8fd598ca3a19e',
      center: { lat: 51.5074, lng: -0.1278 },
      zoom: 10,
      mapTypeId: 'roadmap',
      disableDefaultUI: true,
      gestureHandling: 'none',
      draggable: false,
      scrollwheel: false,
      disableDoubleClickZoom: true,
      keyboardShortcuts: false
    });
    dom.routeMap.style.filter = 'grayscale(100%)';
    routeService = new google.maps.DirectionsService();
  }

  function clearRouteMapState() {
    routeMarkers.forEach(function (m) { m.map = null; });
    routeMarkers = [];
    if (routePolyline) { routePolyline.setMap(null); routePolyline = null; }
    if (dom.routeInfo) {
      while (dom.routeInfo.firstChild) dom.routeInfo.removeChild(dom.routeInfo.firstChild);
    }
  }

  function applyRouteBounds(bounds) {
    if (!routeMap || !bounds) return;
    lastRouteBounds = bounds;
    routeMap.fitBounds(bounds);
  }

  function restoreRouteMapView() {
    if (!routeMap || !isDesktop()) return;
    if (typeof google === 'undefined' || !google.maps) return;
    try {
      google.maps.event.trigger(routeMap, 'resize');
    } catch (e) {}
    if (!lastRouteBounds) return;
    requestAnimationFrame(function () {
      setTimeout(function () {
        if (!routeMap || !lastRouteBounds) return;
        try {
          routeMap.fitBounds(lastRouteBounds);
        } catch (e2) {}
      }, 50);
    });
  }

  function showPickupMarkerOnly(pickupLat, pickupLng) {
    clearRouteMapState();
    lastRouteBounds = null;
    lastRouteSignature = null;
    if (!routeMap || !pickupLat || !pickupLng) return;
    var center = new google.maps.LatLng(pickupLat, pickupLng);
    routeMap.setCenter(center);
    routeMap.setZoom(13);
    var pin = createRoutePin('#000', 'A');
    pin.position = center;
    pin.map = routeMap;
    routeMarkers.push(pin);
  }

  function updateRoutePreview() {
    if (!dom.routeWrap || !dom.routeMap) return;

    var desktop = isDesktop();

    if (!mapsReady) {
      if (desktop) initRouteMapBase();
      return;
    }

    var pickupLat = state.pickup.lat;
    var pickupLng = state.pickup.lng;
    var dropLat = state.dropoff.lat;
    var dropLng = state.dropoff.lng;

    var pickupAddr = state.pickup.address || (dom.pickup ? dom.pickup.value.trim() : '');
    var dropAddr = state.dropoff.address || (dom.dropoff ? dom.dropoff.value.trim() : '');

    var hasPickup = (pickupLat && pickupLng) || pickupAddr.length > 3;
    var hasDrop = (dropLat && dropLng) || dropAddr.length > 3;

    if (state.serviceType === 'hourly') {
      if (!desktop) { dom.routeWrap.style.display = 'none'; return; }
      // Fall through to full route when dropoff is present
      if (!hasDrop) {
        initRouteMapBase();
        if (hasPickup && pickupLat && pickupLng) {
          showPickupMarkerOnly(pickupLat, pickupLng);
        } else {
          clearRouteMapState();
          lastRouteBounds = null;
          lastRouteSignature = null;
          routeMap.setCenter({ lat: 51.5074, lng: -0.1278 });
          routeMap.setZoom(10);
        }
        return;
      }
    }

    if (!hasPickup || !hasDrop) {
      if (!desktop) { dom.routeWrap.style.display = 'none'; return; }
      initRouteMapBase();
      if (hasPickup && pickupLat && pickupLng) {
        showPickupMarkerOnly(pickupLat, pickupLng);
      } else {
        clearRouteMapState();
        lastRouteBounds = null;
        lastRouteSignature = null;
        routeMap.setCenter({ lat: 51.5074, lng: -0.1278 });
        routeMap.setZoom(10);
      }
      return;
    }

    var routeSig = getRouteSignature();
    if (routeSig && routeSig === lastRouteSignature && routePolyline) {
      return;
    }

    initRouteMapBase();
    google.maps.event.trigger(routeMap, 'resize');

    clearRouteMapState();

    var waypoints = [];
    for (var i = 0; i < state.stopsVisible; i++) {
      var addr = state.stops[i].address;
      if (addr) waypoints.push({ location: addr, stopover: true });
    }

    var origin = (pickupLat && pickupLng)
      ? new google.maps.LatLng(pickupLat, pickupLng)
      : pickupAddr;
    var destination = (dropLat && dropLng)
      ? new google.maps.LatLng(dropLat, dropLng)
      : dropAddr;

    var request = {
      origin: origin,
      destination: destination,
      waypoints: waypoints,
      travelMode: google.maps.TravelMode.DRIVING,
      provideRouteAlternatives: true
    };

    routeService.route(request, function (result, status) {
      if (status !== 'OK') {
        lastRouteSignature = null;
        if (!desktop) {
          dom.routeWrap.style.display = 'none';
          return;
        }
        var pinA = createRoutePin('#000', 'A');
        var pinB = createRoutePin('#000', 'B');
        if (pickupLat && pickupLng) {
          pinA.position = new google.maps.LatLng(pickupLat, pickupLng);
          pinA.map = routeMap;
          routeMarkers.push(pinA);
        }
        if (dropLat && dropLng) {
          pinB.position = new google.maps.LatLng(dropLat, dropLng);
          pinB.map = routeMap;
          routeMarkers.push(pinB);
        }
        if (routeMarkers.length > 0) {
          var bounds = new google.maps.LatLngBounds();
          routeMarkers.forEach(function (m) { if (m.position) bounds.extend(m.position); });
          applyRouteBounds(bounds);
          lastRouteSignature = routeSig;
        }
        return;
      }

      if (!desktop) dom.routeWrap.style.display = '';

      // Mirror the server-side pricing logic (report 22.07.2026 bug #3): pick the
      // route with the smallest total distance among alternatives, not routes[0]
      // (Google's default pick, which can be a faster-but-longer M25 detour).
      var routeIndex = 0;
      var shortestMeters = null;
      for (var r = 0; r < result.routes.length; r++) {
        var routeMeters = 0;
        for (var rl = 0; rl < result.routes[r].legs.length; rl++) {
          routeMeters += result.routes[r].legs[rl].distance.value;
        }
        if (shortestMeters === null || routeMeters < shortestMeters) {
          shortestMeters = routeMeters;
          routeIndex = r;
        }
      }
      var chosenRoute = result.routes[routeIndex];

      routePolyline = new google.maps.Polyline({
        path: chosenRoute.overview_path,
        strokeColor: '#000',
        strokeWeight: 4,
        strokeOpacity: 0.8,
        map: routeMap
      });
      lastRouteSignature = routeSig;

      var pinA = createRoutePin('#000', 'A');
      var pinB = createRoutePin('#000', 'B');
      var legs = chosenRoute.legs;

      pinA.position = legs[0].start_location;
      pinA.map = routeMap;
      routeMarkers.push(pinA);

      pinB.position = legs[legs.length - 1].end_location;
      pinB.map = routeMap;
      routeMarkers.push(pinB);

      for (var w = 0; w < waypoints.length; w++) {
        var wPin = createRoutePin('#555', String(w + 1));
        wPin.position = legs[w].end_location;
        wPin.map = routeMap;
        routeMarkers.push(wPin);
      }

      var bounds = new google.maps.LatLngBounds();
      chosenRoute.overview_path.forEach(function (p) { bounds.extend(p); });
      applyRouteBounds(bounds);

      var totalDist = 0;
      var totalDur = 0;
      for (var l = 0; l < legs.length; l++) {
        totalDist += legs[l].distance.value;
        totalDur += legs[l].duration.value;
      }

      var km = (totalDist / 1000).toFixed(1);
      var miles = (totalDist / 1609.34).toFixed(1);
      var durMin = Math.round(totalDur / 60);
      var L10n = (typeof iproBookingL10n !== 'undefined') ? iproBookingL10n : {};
      var durText = durMin >= 60
        ? (L10n.routeDurationHFmt || '%1$sh %2$smin').replace('%1$s', Math.floor(durMin / 60)).replace('%2$s', durMin % 60)
        : (L10n.routeDurationMFmt || '%1$s min').replace('%1$s', durMin);

      while (dom.routeInfo.firstChild) dom.routeInfo.removeChild(dom.routeInfo.firstChild);

      var ns = 'http://www.w3.org/2000/svg';
      function svgEl(tag) { return document.createElementNS(ns, tag); }

      var badge1 = document.createElement('span');
      badge1.className = 'booking-route__badge';
      var svg1 = svgEl('svg');
      svg1.setAttribute('width', '16');
      svg1.setAttribute('height', '16');
      svg1.setAttribute('viewBox', '0 0 24 24');
      svg1.setAttribute('fill', 'none');
      svg1.setAttribute('stroke', 'currentColor');
      svg1.setAttribute('stroke-width', '2');
      var path1 = svgEl('path');
      path1.setAttribute('d', 'M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z');
      var circle1 = svgEl('circle');
      circle1.setAttribute('cx', '12');
      circle1.setAttribute('cy', '10');
      circle1.setAttribute('r', '3');
      svg1.appendChild(path1);
      svg1.appendChild(circle1);
      badge1.appendChild(svg1);
      badge1.appendChild(document.createTextNode((L10n.routeDistanceFmt || '%1$s mi (%2$s km)').replace('%1$s', miles).replace('%2$s', km)));

      var badge2 = document.createElement('span');
      badge2.className = 'booking-route__badge';
      var svg2 = svgEl('svg');
      svg2.setAttribute('width', '16');
      svg2.setAttribute('height', '16');
      svg2.setAttribute('viewBox', '0 0 24 24');
      svg2.setAttribute('fill', 'none');
      svg2.setAttribute('stroke', 'currentColor');
      svg2.setAttribute('stroke-width', '2');
      var circle2 = svgEl('circle');
      circle2.setAttribute('cx', '12');
      circle2.setAttribute('cy', '12');
      circle2.setAttribute('r', '10');
      var poly2 = svgEl('polyline');
      poly2.setAttribute('points', '12 6 12 12 16 14');
      svg2.appendChild(circle2);
      svg2.appendChild(poly2);
      badge2.appendChild(svg2);
      badge2.appendChild(document.createTextNode('~ ' + durText));

      dom.routeInfo.appendChild(badge1);
      dom.routeInfo.appendChild(badge2);
    });
  }

  function createRoutePin(color, label) {
    var pin = new google.maps.marker.PinElement({
      background: color,
      glyphColor: '#fff',
      borderColor: '#fff',
      glyphText: label
    });
    return new google.maps.marker.AdvancedMarkerElement({
      content: pin
    });
  }

  /* ─── Price Calculation ─── */

  var priceTimer = null;
  var routeTimer = null;

  function triggerPriceUpdate(opts) {
    opts = opts || {};
    var refreshRoute = opts.refreshRoute !== false;
    clearTimeout(priceTimer);
    priceTimer = setTimeout(calculatePrice, 500);
    if (!refreshRoute) return;
    clearTimeout(routeTimer);
    routeTimer = setTimeout(updateRoutePreview, 800);
  }

  function triggerPriceOnly() {
    triggerPriceUpdate({ refreshRoute: false });
  }

  function calculatePrice() {
    var veh = state.vehicle;
    var pickup = getEffectivePickupAddress();
    var dropoff = getEffectiveDropoffAddress();

    updateStep1NextEnabled();

    if (!pickup || !dropoff) {
      finishPriceUpdate(null);
      return;
    }

    var duration = null;
    if (state.serviceType === 'hourly') {
      duration = dom.duration ? parseInt(dom.duration.value, 10) || 3 : 3;
      state.duration = duration;
    }

    var svcType = detectServiceType(pickup, dropoff);
    var routeMeta = getRouteMeta();

    // Step 1: show minimum across fleet for this route ("From £ X")
    if (state.currentStep === 1) {
      fetchMinRoutePrice(svcType, pickup, dropoff, duration, routeMeta).then(finishPriceUpdate);
      return;
    }

    if (!veh) {
      finishPriceUpdate(null);
      return;
    }

    Engine.getPrice(svcType, veh, pickup, dropoff, duration, routeMeta).then(finishPriceUpdate);
  }

  function detectServiceType(pickup, dropoff) {
    if (state.serviceType === 'hourly') return '2';
    var routeTexts = getRouteAddressTexts();
    for (var r = 0; r < routeTexts.length; r++) {
      if (Engine.findStadium && Engine.findStadium(routeTexts[r])) return '5';
      if (Engine.findFestival && Engine.findFestival(routeTexts[r])) return '7';
      if (Engine.findPolo && Engine.findPolo(routeTexts[r])) return '6';
    }
    if (Engine.findStadium && (Engine.findStadium(pickup) || Engine.findStadium(dropoff))) return '5';
    if (Engine.findFestival && (Engine.findFestival(pickup) || Engine.findFestival(dropoff))) return '7';
    if (Engine.findPolo && (Engine.findPolo(pickup) || Engine.findPolo(dropoff))) return '6';
    return 'p2p';
  }

  function buildPriceBreakdownRowsHtml() {
    return '';
  }

  function setPriceBreakdownElement(el, html, visible) {
    if (!el) return;
    el.hidden = true;
    el.innerHTML = '';
  }

  function renderPriceBreakdown() {
    var desktopEl = document.getElementById('booking-price-breakdown');
    var mobileEl = dom.mobilePriceBreakdown || document.getElementById('booking-mobile-price-breakdown');
    setPriceBreakdownElement(desktopEl, '', false);
    setPriceBreakdownElement(mobileEl, '', false);
  }

  function updatePriceDisplay(result) {
    state.priceResult = result;
    var priceText = '--';
    var summaryText = '--';
    var isContact = isInternationalPriceActive(result);
    var step1Text = formatStep1FromPrice();

    if (isContact) {
      priceText = getInternationalContactMessage();
      summaryText = priceText;
      step1Text = priceText;
      state.estimatedPrice = null;
      renderPriceBreakdown(null);
    } else if (result && result.price != null) {
      var displayAmt = result.priceDisplay != null ? result.priceDisplay : String(result.price);
      var amt = '\u00a3 ' + displayAmt;
      priceText = amt;
      summaryText = priceText;
      state.estimatedPrice = result.price;
      if (state.currentStep === 1 || result.isRouteMinimum) {
        step1Text = formatStep1RouteFromPrice(result.price);
      }
      renderPriceBreakdown(result);
    } else {
      state.estimatedPrice = null;
      renderPriceBreakdown(null);
    }

    if (dom.sidebarPrice) {
      if (isContact) {
        setInternationalPriceElement(dom.sidebarPrice, true, priceText);
      } else {
        dom.sidebarPrice.textContent = priceText;
      }
      dom.sidebarPrice.classList.toggle('booking-sidebar__price-amount--contact', isContact);
    }
    if (dom.mobilePriceAmount) {
      if (state.currentStep === 1) {
        setInternationalPriceElement(dom.mobilePriceAmount, isContact, step1Text);
        dom.mobilePriceAmount.classList.toggle('booking-mobile-price__amount--contact', isContact);
        applyMobilePriceStep1Label();
        if (dom.mobilePrice) dom.mobilePrice.classList.add('booking-mobile-price--step1');
        setPriceBreakdownElement(dom.mobilePriceBreakdown, '', false);
      } else if (isContact) {
        setInternationalPriceElement(dom.mobilePriceAmount, true, priceText);
        dom.mobilePriceAmount.classList.toggle('booking-mobile-price__amount--contact', true);
        applyMobilePriceEstimatedLabel();
        if (dom.mobilePrice) dom.mobilePrice.classList.remove('booking-mobile-price--step1');
      } else {
        dom.mobilePriceAmount.textContent = priceText;
        dom.mobilePriceAmount.classList.toggle('booking-mobile-price__amount--contact', false);
        applyMobilePriceEstimatedLabel();
        if (dom.mobilePrice) dom.mobilePrice.classList.remove('booking-mobile-price--step1');
      }
    }
    if (dom.step1PriceHint && state.currentStep === 1) {
      setInternationalPriceElement(dom.step1PriceHint, isContact, step1Text);
      dom.step1PriceHint.classList.toggle('booking-step1-hint--contact', isContact);
    }
    document.querySelectorAll('#booking-step-2 .booking-summary-price-value--step2-desktop').forEach(function (el) {
      if (isContact) {
        setInternationalPriceElement(el, true, summaryText);
      } else {
        el.textContent = summaryText;
      }
      el.classList.toggle('booking-summary-price-value--contact', isContact);
    });
  }

  function finishPriceUpdate(result) {
    if (result && result.isRouteMinimum) {
      state.step1MinPriceResult = result;
    } else if (!result && state.currentStep === 1) {
      state.step1MinPriceResult = null;
      clearVehiclePriceCache();
    }
    updatePriceDisplay(result);
    if (state.currentStep === 2) {
      if (result && result.contactRequired) {
        applyContactMessageToVehicleCards();
      } else if (result) {
        updateAllVehiclePrices();
      }
    }
  }

  function formatHourlyVehicleCardPrice(vehicleKey) {
    var hr = (P.vehicleRates && P.vehicleRates[vehicleKey]) || (P.hourlyRates && P.hourlyRates[vehicleKey]);
    if (!hr) return '--';
    var L10n = (typeof iproBookingL10n !== 'undefined') ? iproBookingL10n : {};
    var fmt = L10n.vehiclePricePerHourFmt || '\u00a3 %d/h';
    return fmt.replace('%d', String(hr.hourly));
  }

  function syncSelectedVehiclePriceFromCard(vehicleId) {
    if (state.currentStep !== 2 || !vehicleId) return;

    var cached = getCachedVehiclePrice(vehicleId);
    if (cached) {
      updatePriceDisplay(cached);
      return;
    }

    var pickup = getEffectivePickupAddress();
    var dropoff = getEffectiveDropoffAddress();
    if (!pickup || !dropoff) return;

    var duration = null;
    if (state.serviceType === 'hourly') {
      duration = dom.duration ? parseInt(dom.duration.value, 10) || 3 : 3;
      state.duration = duration;
    }
    var svcType = detectServiceType(pickup, dropoff);
    var routeMeta = getRouteMeta();
    Engine.getPrice(svcType, vehicleId, pickup, dropoff, duration, routeMeta).then(function (r) {
      if (r) state.vehiclePriceById[String(vehicleId)] = r;
      updatePriceDisplay(r);
    });
  }

  function formatVehiclePriceText(price, method) {
    return '\u00a3 ' + price;
  }

  function setVehicleCardsPrice(vehicleId, text, isContact) {
    document.querySelectorAll('#booking-vehicles-step2 .booking-vehicle[data-vehicle="' + vehicleId + '"] .booking-vehicle__price-text').forEach(function (el) {
      el.textContent = text;
      el.classList.toggle('booking-vehicle__price-text--contact', !!isContact);
    });
  }

  function applyContactMessageToVehicleCards() {
    var msg = getInternationalContactCardMessage();
    var cards = document.querySelectorAll('#booking-vehicles-step2 .booking-vehicle[data-vehicle]');
    var seen = {};
    cards.forEach(function (card) {
      var vid = card.getAttribute('data-vehicle');
      if (!vid || seen[vid]) return;
      seen[vid] = true;
      setVehicleCardsPrice(vid, msg, true);
    });
  }

  function updateAllVehiclePrices() {
    if (applyCachedVehiclePrices()) {
      var minResult = null;
      var ids = Object.keys(state.vehiclePriceById);
      for (var i = 0; i < ids.length; i++) {
        var cached = state.vehiclePriceById[ids[i]];
        if (!cached || cached.contactRequired || cached.price == null) continue;
        if (!minResult || cached.price < minResult.price) minResult = cached;
      }
      if (minResult) {
        state.step1MinPriceResult = Object.assign({}, minResult, { isRouteMinimum: true });
      }
      return;
    }

    var pickup = getEffectivePickupAddress();
    var dropoff = getEffectiveDropoffAddress();
    var cards = document.querySelectorAll('#booking-vehicles-step2 .booking-vehicle[data-vehicle]');
    if (!cards.length) return;
    if (!pickup || !dropoff) return;

    if (isInternationalRouteActive()) {
      applyContactMessageToVehicleCards();
      return;
    }

    var duration = null;
    if (state.serviceType === 'hourly') {
      duration = dom.duration ? parseInt(dom.duration.value, 10) || 3 : 3;
    }
    var svcType = detectServiceType(pickup, dropoff);
    var routeMeta = getRouteMeta();
    var seen = {};
    var pendingIds = [];
    var pending = [];

    cards.forEach(function (card) {
      var vid = card.getAttribute('data-vehicle');
      if (!vid || seen[vid]) return;
      seen[vid] = true;
      pendingIds.push(vid);
      pending.push(Engine.getPrice(svcType, vid, pickup, dropoff, duration, routeMeta).then(function (r) {
        applyVehiclePriceResultToCard(vid, r);
        return r;
      }));
    });

    Promise.all(pending).then(function (results) {
      storeVehiclePriceCache(pendingIds, results);
      var minResult = null;
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        if (!r || r.contactRequired || r.price == null) continue;
        if (!minResult || r.price < minResult.price) minResult = r;
      }
      if (minResult) {
        state.step1MinPriceResult = Object.assign({}, minResult, { isRouteMinimum: true });
      }
    });
  }

  function applyStep2PricesFromCacheOrFetch() {
    var cachedSelected = getCachedVehiclePrice(state.vehicle);
    if (cachedSelected) {
      updatePriceDisplay(cachedSelected);
      applyCachedVehiclePrices();
      return true;
    }
    if (applyCachedVehiclePrices()) {
      return false;
    }
    return false;
  }

  function turnstileRequired() {
    return !iproBooking || iproBooking.turnstileEnabled !== false;
  }

  function syncCheckoutDisabledForTurnstile() {
    if (!dom.checkoutBtn) return;
    dom.checkoutBtn.disabled = turnstileRequired() && state.turnstileToken === '';
    scheduleTopnavForwardUpdate();
  }

  /* ─── Step Navigation ─── */

  function scrollBookingToTop() {
    var opts = { top: 0, left: 0, behavior: 'smooth' };
    window.scrollTo(opts);
    requestAnimationFrame(function () {
      window.scrollTo(opts);
    });
  }

  function goToStep(step) {
    var prevStep = state.currentStep;
    if (prevStep === 3 && step !== 3) {
      if (state._turnstileFallbackTimer) {
        clearTimeout(state._turnstileFallbackTimer);
        state._turnstileFallbackTimer = null;
      }
      state.turnstileFallback = false;
    }
    state.currentStep = step;

    logEvent('goToStep', { from: prevStep, to: step });

    if (typeof window.iproBATrack === 'function') {
      window.iproBATrack('step_change', { from: prevStep, to: step });
    }

    if (dom.step1) dom.step1.classList.toggle('booking-panel--active', step === 1);
    if (dom.step2) dom.step2.classList.toggle('booking-panel--active', step === 2);
    if (dom.step3) dom.step3.classList.toggle('booking-panel--active', step === 3);
    if (dom.step4) dom.step4.classList.toggle('booking-panel--active', step === 4);

    var steps = document.querySelectorAll('.booking-step');
    steps.forEach(function (el) {
      var s = parseInt(el.getAttribute('data-step'), 10);
      el.classList.toggle('booking-step--active', s === step);
      el.classList.toggle('booking-step--done', s < step);

      var icon = el.querySelector('.booking-step__icon');
      if (icon) {
        if (s === step) {
          icon.classList.add('booking-step__icon--filled');
          icon.classList.remove('booking-step__icon--outline');
        } else {
          icon.classList.remove('booking-step__icon--filled');
          icon.classList.add('booking-step__icon--outline');
        }
      }
    });

    var topnavSteps = document.querySelectorAll('.booking-topnav__step[data-step]');
    topnavSteps.forEach(function (el) {
      var s = parseInt(el.getAttribute('data-step'), 10);
      if (!s) return;

      el.classList.toggle('booking-topnav__step--active', s === step);
      el.classList.toggle('booking-topnav__step--done', s < step);

      var icon = el.querySelector('.booking-topnav__icon');
      if (!icon) return;

      if (s <= step) {
        icon.classList.add('booking-topnav__icon--filled');
        icon.classList.remove('booking-topnav__icon--outline');
      } else {
        icon.classList.remove('booking-topnav__icon--filled');
        icon.classList.add('booking-topnav__icon--outline');
      }
    });

    if (step === 1) {
      applyPickupDateToPicker();
      if (prevStep > 1) {
        if (state.step1MinPriceResult) {
          updatePriceDisplay(state.step1MinPriceResult);
        } else {
          updateStep1FromPrice();
          if (getEffectivePickupAddress() && getEffectiveDropoffAddress()) {
            triggerPriceUpdate();
          }
        }
        restoreRouteMapView();
      } else {
        updateStep1FromPrice();
        if (state.pickup.address || state.serviceType === 'hourly') triggerPriceUpdate();
      }
    } else {
      applyMobilePriceEstimatedLabel();
      if (dom.mobilePrice) dom.mobilePrice.classList.remove('booking-mobile-price--step1');
      if (step >= 2 && step <= 3) {
        var usedCache = applyStep2PricesFromCacheOrFetch();
        if (!usedCache) {
          triggerPriceUpdate();
          updateAllVehiclePrices();
        } else if (step === 3 && !getCachedVehiclePrice(state.vehicle)) {
          triggerPriceUpdate();
        }
      }
    }

    if (step === 2) {
      if (!hasVehiclePriceCache()) {
        updateAllVehiclePrices();
      } else {
        applyCachedVehiclePrices();
      }
      updateSummary();
      updateTripbar();
      updatePassengerOptions();
      updateSuitcaseOptions();
      updateTimeOptions();
      syncMobileVehicleSliderForViewport();
      scheduleMobileVehicleSliderLayoutSync();
      if (state.priceResult) {
        updatePriceDisplay(state.priceResult);
      } else {
        renderPriceBreakdown(null);
      }
    }

    if (step === 3) {
      ensureCountrySelectsPopulated();
      updateSummary();
      if (state.priceResult) {
        updatePriceDisplay(state.priceResult);
      }
      syncCheckoutDisabledForTurnstile();
    }

    if (dom.mobilePrice) {
      dom.mobilePrice.style.display = (step === 1 || step === 2 || step === 3) ? '' : 'none';
    }

    scrollBookingToTop();

    if (dom.topnavMobileTitle) {
      var titleEl = document.querySelector(
        '.booking-topnav__step[data-step="' + step + '"] .booking-topnav__label'
      );
      if (titleEl) dom.topnavMobileTitle.textContent = titleEl.textContent.trim();
    }
    if (dom.topnavBackBtn) {
      var backInactive = step <= 1;
      dom.topnavBackBtn.disabled = backInactive;
      if (backInactive) {
        dom.topnavBackBtn.setAttribute('tabindex', '-1');
      } else {
        dom.topnavBackBtn.removeAttribute('tabindex');
      }
    }

    scheduleTopnavForwardUpdate();
    updateTopnavStepInteractable();

    scheduleSaveState();
  }

  function isDesktopTopnav() {
    return window.matchMedia('(min-width: 901px)').matches;
  }

  function resetStep4Ui() {
    if (dom.step4Message) {
      while (dom.step4Message.firstChild) dom.step4Message.removeChild(dom.step4Message.firstChild);
      dom.step4Message.setAttribute('hidden', '');
    }
    if (dom.step4Intro) dom.step4Intro.style.display = '';
    if (dom.step4Placeholder) dom.step4Placeholder.style.display = '';
    if (dom.step4Actions) dom.step4Actions.style.display = '';
    if (dom.step4BackBtn) dom.step4BackBtn.style.display = '';
  }

  function updateTopnavStepInteractable() {
    var steps = document.querySelectorAll('.booking-topnav__step[data-step]');
    var current = state.currentStep;

    steps.forEach(function (el) {
      var s = parseInt(el.getAttribute('data-step'), 10);
      if (!s) return;

      var isActive = s === current;
      var isDisabled = !isActive && s === 4 && current < 4;
      var isClickable = !isActive && !isDisabled;

      el.classList.toggle('booking-topnav__step--disabled', isDisabled);
      el.classList.toggle('booking-topnav__step--clickable', isClickable);

      if (isDisabled) {
        el.setAttribute('aria-disabled', 'true');
        el.setAttribute('tabindex', '-1');
        el.removeAttribute('role');
      } else if (isClickable) {
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-disabled', 'false');
      } else {
        el.removeAttribute('role');
        el.removeAttribute('tabindex');
        el.removeAttribute('aria-disabled');
      }
    });
  }

  function requestTopnavStep(targetStep) {
    if (!isDesktopTopnav()) return;
    if (!targetStep || targetStep < 1 || targetStep > 4) return;

    var current = state.currentStep;
    if (targetStep === current) return;
    if (targetStep > current && targetStep === 4 && current < 4) return;

    logEvent('clickTopnavStep', { from: current, to: targetStep });

    if (current === 4 && targetStep < 4) {
      resetStep4Ui();
      goToStep(targetStep);
      return;
    }

    if (targetStep < current) {
      goToStep(targetStep);
      return;
    }

    if (current === 1 && (targetStep === 2 || targetStep === 3)) {
      if (validateStep1()) goToStep(targetStep);
      else scrollToFirstError(1);
      return;
    }

    if (current === 2 && targetStep === 3) {
      goToStep(3);
    }
  }

  function updateSummary() {
    var svcLabel;
    if (state.serviceType === 'hourly') {
      svcLabel = iproBookingL10n.hourly || 'Hourly/As directed';
    } else if (routeMentionsAirport()) {
      svcLabel = iproBookingL10n.airportTransfer || 'Airport Transfer';
    } else {
      svcLabel = iproBookingL10n.singleTrip || 'Single Trip';
    }
    var vName = P.vehicleNames[state.vehicleKey] || '';
    var dtLabel = (iproBookingL10n.dateTime || 'DATE & TIME');
    var dtValue = formatTripbarDatetime();
    var baseIconPath = '/wp-content/themes/hello-elementor/assets/icons/booking-summary';

    if (!dom.summaryRows) return;
    while (dom.summaryRows.firstChild) dom.summaryRows.removeChild(dom.summaryRows.firstChild);

    var rows = [];
    rows.push({
      key: (iproBookingL10n.typeOfService || 'TYPE OF SERVICE'),
      val: svcLabel,
      icon: baseIconPath + '/service.svg'
    });
    rows.push({
      key: (iproBookingL10n.pickupLocation || 'PICKUP LOCATION'),
      val: state.pickup.address || '\u2014',
      icon: baseIconPath + '/location.svg'
    });

    rows.push({
      key: (iproBookingL10n.dropoffLocation || 'FINAL DESTINATION'),
      val: state.dropoff.address || '\u2014',
      icon: baseIconPath + '/location.svg'
    });
    if (state.serviceType === 'hourly') {
      rows.push({
        key: (iproBookingL10n.duration || 'DURATION'),
        val: state.duration + ' ' + (iproBookingL10n.hours || 'hours'),
        icon: baseIconPath + '/datetime.svg'
      });
    }

    // Stops (STOP 1..3) — only filled
    var stopLabel = (iproBookingL10n.stop || 'STOP');
    (state.stops || []).forEach(function (s, idx) {
      var addr = (s && s.address) ? s.address.trim() : '';
      if (!addr) return;
      rows.push({
        key: stopLabel + ' ' + (idx + 1),
        val: addr,
        icon: baseIconPath + '/location.svg'
      });
    });

    rows.push({
      key: dtLabel,
      val: dtValue,
      icon: baseIconPath + '/datetime.svg'
    });

    rows.push({
      key: (iproBookingL10n.vehicle || 'VEHICLE'),
      val: vName,
      icon: baseIconPath + '/vehicle.svg'
    });

    if (rows.length) dom.summaryRows.appendChild(summaryDividerEl());
    rows.forEach(function (r, i) {
      dom.summaryRows.appendChild(summaryRowElWithIcon(r.key, r.val, r.icon));
      if (i !== rows.length - 1) dom.summaryRows.appendChild(summaryDividerEl());
    });
  }

  function summaryRowElWithIcon(key, val, iconSrc) {
    var row = document.createElement('div');
    row.className = 'booking-summary__row booking-summary__row--v3';

    var text = document.createElement('span');
    text.className = 'booking-summary__text';

    var k = document.createElement('span');
    k.className = 'booking-summary__key';
    k.textContent = key || '';

    var v = document.createElement('span');
    v.className = 'booking-summary__val';
    v.textContent = val || '';

    text.appendChild(k);
    text.appendChild(v);
    row.appendChild(text);
    return row;
  }

  function summaryDividerEl() {
    var d = document.createElement('div');
    d.className = 'booking-summary__divider';
    return d;
  }

  /* ─── Validation ─── */

  function validateStep1() {
    var valid = true;

    if (!state.pickup.address) {
      showError('booking-pickup', iproBookingL10n.errorPickup || 'Please enter a pickup location');
      valid = false;
    } else {
      clearError('booking-pickup');
    }

    if (!state.dropoff.address) {
      showError('booking-dropoff', iproBookingL10n.errorDropoff || 'Please enter a final destination');
      valid = false;
    } else {
      clearError('booking-dropoff');
    }

    var vehiclesEl = document.querySelector('.booking-vehicles');
    if (!state.vehicle) {
      if (vehiclesEl) vehiclesEl.classList.add('booking-vehicles--error');
      valid = false;
    } else {
      if (vehiclesEl) vehiclesEl.classList.remove('booking-vehicles--error');
    }

    if (!state.pickupDate && (!dom.date || !dom.date.value)) {
      showError('booking-date', iproBookingL10n.errorDate || 'Please select a date');
      valid = false;
    } else {
      clearError('booking-date');
    }

    var timeH = dom.hours ? dom.hours.value : '';
    var timeM = dom.minutes ? dom.minutes.value : '';
    if (timeH === '' || timeM === '') {
      showError('booking-time', iproBookingL10n.errorTime || 'Please select a pickup time');
      valid = false;
    } else if (!isPickupTimeAllowed(timeH, timeM, state.pickupDate)) {
      showError('booking-time', iproBookingL10n.errorTimeMinLead || 'Pickup must be at least 3 hours from now (London time)');
      valid = false;
    } else {
      clearError('booking-time');
    }

    if (!valid && typeof window.iproBATrack === 'function') {
      var errFields = [];
      if (!state.pickup.address) errFields.push('pickup');
      if (!state.dropoff.address) errFields.push('dropoff');
      if (!state.vehicle) errFields.push('vehicle');
      if (!state.pickupDate && (!dom.date || !dom.date.value)) errFields.push('date');
      if (timeH === '' || timeM === '' || !isPickupTimeAllowed(timeH, timeM, state.pickupDate)) errFields.push('pickup_time');
      window.iproBATrack('form_error', { step: 1, fields: errFields });
    }

    return valid;
  }

  function validateStep2() {
    var valid = true;

    if (!dom.firstName || !dom.firstName.value.trim()) {
      showError('booking-first-name', iproBookingL10n.errorFirstName || iproBookingL10n.errorName || 'Please enter your first name');
      valid = false;
    } else { clearError('booking-first-name'); }

    if (!dom.lastName || !dom.lastName.value.trim()) {
      showError('booking-last-name', iproBookingL10n.errorLastName || iproBookingL10n.errorName || 'Please enter your last name');
      valid = false;
    } else { clearError('booking-last-name'); }

    if (!dom.phoneNumber.value.trim()) {
      showError('booking-phone', iproBookingL10n.errorPhone || 'Please enter your phone number');
      valid = false;
    } else if (dom.phoneNumber.value.trim().length < 8) {
      showError('booking-phone', iproBookingL10n.errorPhoneMin || 'Min 8 characters required');
      valid = false;
    } else { clearError('booking-phone'); }

    if (dom.email) {
      var emailVal = dom.email.value.trim();
      var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailVal) {
        showError('booking-email', iproBookingL10n.errorEmail || 'Please enter your email');
        valid = false;
      } else if (!emailRe.test(emailVal)) {
        showError('booking-email', iproBookingL10n.errorEmailInvalid || 'Please enter a valid email');
        valid = false;
      } else { clearError('booking-email'); }
    }

    if (dom.passengers) {
      if (!dom.passengers.value) {
        showError('booking-passengers', iproBookingL10n.errorPassengers || 'Please select number of passengers');
        valid = false;
      } else { clearError('booking-passengers'); }
    }

    if (dom.largeBags) {
      if (!dom.largeBags.value) {
        showError('booking-large-bags', iproBookingL10n.errorLargeBags || 'Please select number of large suitcases');
        valid = false;
      } else { clearError('booking-large-bags'); }
    }

    if (!dom.terms.checked) {
      valid = false;
      showForwardToast(iproBookingL10n.errorTerms || 'Please accept the Terms and conditions');
      dom.terms.closest('.booking-check').style.outline = '1px solid rgba(154, 89, 64, 0.4)';
    } else {
      dom.terms.closest('.booking-check').style.outline = '';
    }

    if (!valid && typeof window.iproBATrack === 'function') {
      var errFields = [];
      if (!dom.firstName || !dom.firstName.value.trim()) errFields.push('first_name');
      if (!dom.lastName || !dom.lastName.value.trim()) errFields.push('last_name');
      if (!dom.phoneNumber.value.trim() || dom.phoneNumber.value.trim().length < 8) errFields.push('phone');
      if (dom.email && (!dom.email.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dom.email.value.trim()))) errFields.push('email');
      if (!dom.date.value) errFields.push('date');
      if (dom.passengers && !dom.passengers.value) errFields.push('passengers');
      if (dom.largeBags && !dom.largeBags.value) errFields.push('large_bags');
      if (!dom.terms.checked) errFields.push('terms');
      window.iproBATrack('form_error', { step: 2, fields: errFields });
    }

    return valid;
  }

  function step1FieldsComplete() {
    if (!state.pickup.address) return false;
    if (!state.dropoff.address) return false;
    if (!state.vehicle) return false;
    if (!state.pickupDate && (!dom.date || !dom.date.value)) return false;
    var timeH = dom.hours ? dom.hours.value : '';
    var timeM = dom.minutes ? dom.minutes.value : '';
    if (timeH === '' || timeM === '') return false;
    if (!isPickupTimeAllowed(timeH, timeM, state.pickupDate)) return false;
    return true;
  }

  function canUseTopnavForward() {
    var s = state.currentStep;
    if (s === 1) return step1FieldsComplete();
    if (s === 2) return true;
    return false;
  }

  function scheduleTopnavForwardUpdate() {
    if (topnavForwardRaf !== null) return;
    topnavForwardRaf = requestAnimationFrame(function () {
      topnavForwardRaf = null;
      updateTopnavForwardState();
    });
  }

  function updateTopnavForwardState() {
    if (!dom.topnavForwardBtn) return;
    if (state.currentStep >= 4 || state.currentStep === 3) {
      dom.topnavForwardBtn.hidden = true;
      if (dom.topnavForwardSlot) dom.topnavForwardSlot.hidden = true;
      return;
    }
    if (dom.topnavForwardSlot) dom.topnavForwardSlot.hidden = false;
    dom.topnavForwardBtn.hidden = false;
    var ok = canUseTopnavForward();
    dom.topnavForwardBtn.disabled = !ok;
  }

  function showError(fieldId, message) {
    var field = document.getElementById(fieldId);
    if (!field) return;
    var wrap = field.closest('.booking-field');
    if (wrap) wrap.classList.add('booking-field--error');
    var errEl = document.getElementById(fieldId + '-error');
    if (errEl) errEl.textContent = message;
  }

  function clearError(fieldId) {
    var field = document.getElementById(fieldId);
    if (!field) return;
    var wrap = field.closest('.booking-field');
    if (wrap) wrap.classList.remove('booking-field--error');
    var errEl = document.getElementById(fieldId + '-error');
    if (errEl) errEl.textContent = '';
  }

  function scrollToFirstError(stepNum) {
    var panel = document.getElementById('booking-step-' + stepNum);
    if (!panel) return;
    var firstError = panel.querySelector('.booking-field--error');
    if (!firstError) return;
    firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function showForwardToast(message) {
    var toast = document.querySelector('.booking-forward-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'booking-forward-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 3000);
  }

  /* ─── Country / Phone Sync ─── */

  function flagEmojiToIso2(flag) {
    if (!flag || typeof flag !== 'string') return '';
    // Convert flag emoji (regional indicators) to ISO2 (e.g. 🇬🇧 -> GB)
    var cps = Array.from(flag);
    if (cps.length < 2) return '';
    var a = cps[0].codePointAt(0);
    var b = cps[1].codePointAt(0);
    if (!a || !b) return '';
    var A = a - 0x1F1E6 + 65;
    var B = b - 0x1F1E6 + 65;
    if (A < 65 || A > 90 || B < 65 || B > 90) return '';
    return String.fromCharCode(A) + String.fromCharCode(B);
  }

  function getCountryShortCodeFromOption(opt) {
    if (!opt) return '';
    var flag = opt.getAttribute('data-flag') || '';
    var iso2 = flagEmojiToIso2(flag);
    if (iso2 === 'GB') return 'UK';
    return iso2 || '';
  }

  function ensureCountrySelectsPopulated() {
    if (countriesListPopulated) return;
    var pack = typeof iproBooking !== 'undefined' ? iproBooking : null;
    var list = pack && pack.countries;
    var defaultCountry = (pack && pack.defaultCountry) ? pack.defaultCountry : 'United Kingdom';
    if (!list || !Array.isArray(list) || !dom.country || !dom.phoneCode) return;

    while (dom.country.firstChild) dom.country.removeChild(dom.country.firstChild);
    var i;
    for (i = 0; i < list.length; i++) {
      var c = list[i];
      var countryValue = c.value || c.name;
      var opt = document.createElement('option');
      opt.value = countryValue;
      opt.setAttribute('data-code', c.code);
      opt.setAttribute('data-flag', c.flag);
      opt.textContent = c.name;
      if (countryValue === defaultCountry) opt.selected = true;
      dom.country.appendChild(opt);
    }

    while (dom.phoneCode.firstChild) dom.phoneCode.removeChild(dom.phoneCode.firstChild);
    for (i = 0; i < list.length; i++) {
      var c2 = list[i];
      var countryValue2 = c2.value || c2.name;
      var opt2 = document.createElement('option');
      opt2.value = c2.code;
      opt2.setAttribute('data-flag', c2.flag);
      opt2.setAttribute('data-country', countryValue2);
      opt2.textContent = c2.code;
      if (countryValue2 === defaultCountry) opt2.selected = true;
      dom.phoneCode.appendChild(opt2);
    }

    countriesListPopulated = true;
    syncCountryDisplay();
    syncPhoneFlagFromPhoneCodeDropdown();
  }

  function syncCountryDisplay() {
    if (!dom.country || !dom.countryDisplay) return;
    var opt = dom.country.options[dom.country.selectedIndex];
    dom.countryDisplay.textContent = getCountryShortCodeFromOption(opt) || '';
  }

  function syncPhoneFlagFromPhoneCodeDropdown() {
    if (!dom.phoneCode || !dom.phoneFlag) return;
    var pcOpt = dom.phoneCode.options[dom.phoneCode.selectedIndex];
    dom.phoneFlag.textContent = (pcOpt && pcOpt.getAttribute('data-flag')) ? pcOpt.getAttribute('data-flag') : '';
  }

  function initCountryPhoneSync() {
    syncCountryDisplay();

    $(dom.country).on('change', function () {
      var opt = dom.country.options[dom.country.selectedIndex];
      var code = opt.getAttribute('data-code');
      syncCountryDisplay();
      if (code) {
        state.country = opt.value;
        state.phoneCode = code;
        dom.phoneCode.value = code;
        syncPhoneFlagFromPhoneCodeDropdown();
      }
    });

    $(dom.phoneCode).on('change', function () {
      var opt = dom.phoneCode.options[dom.phoneCode.selectedIndex];
      var country = opt.getAttribute('data-country');
      state.phoneCode = opt.value;
      syncPhoneFlagFromPhoneCodeDropdown();
      if (country) {
        state.country = country;
        for (var i = 0; i < dom.country.options.length; i++) {
          if (dom.country.options[i].value === country) {
            dom.country.selectedIndex = i;
            break;
          }
        }
      }
    });
  }

  /* ─── Date Picker ─── */

  var datePicker = null;

  function applyPickupDateToPicker() {
    if (!datePicker) return;
    if (!state.pickupDate) {
      datePicker.clear();
      return;
    }
    var parts = state.pickupDate.split('-');
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    // setDate(date, false) — suppresses the onChange callback to avoid re-writing state already set
    datePicker.setDate(d, false);
  }

  var FLATPICKR_LOCALE_MAP = {
    'ru': 'ru', 'de': 'de', 'fr': 'fr', 'es': 'es',
    'it': 'it', 'zh': 'zh', 'ar': 'ar'
  };

  function initDatePicker() {
    if (typeof flatpickr === 'undefined') {
      setTimeout(initDatePicker, 300);
      return;
    }

    var fpLang = (typeof iproBooking !== 'undefined' && iproBooking.lang) ? iproBooking.lang : 'en';
    var fpLocaleKey = FLATPICKR_LOCALE_MAP[fpLang] || null;
    var fpLocale = (fpLocaleKey && typeof flatpickr.l10ns !== 'undefined' && flatpickr.l10ns[fpLocaleKey])
      ? flatpickr.l10ns[fpLocaleKey]
      : null;

    datePicker = flatpickr(dom.date, {
      dateFormat: 'j F Y',
      minDate: 'today',
      disableMobile: true,
      locale: fpLocale || undefined,
      onOpen: function () {
        closeAllAutocompleteDropdowns();
        var savedScrollY = window.scrollY;
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            if (Math.abs(window.scrollY - savedScrollY) > 2) {
              window.scrollTo({ top: savedScrollY, behavior: 'instant' });
            }
          });
        });
      },
      onChange: function (selectedDates) {
        if (selectedDates.length) {
          var _d = selectedDates[0];
          state.pickupDate = _d.getFullYear() + '-'
            + String(_d.getMonth() + 1).padStart(2, '0') + '-'
            + String(_d.getDate()).padStart(2, '0');
          clearError('booking-date');
          logEvent('dateChange', { pickupDate: state.pickupDate });
          updateTimeOptions();
          updateTripbar();
          refreshSummaryIfPresent();
          state.step1MinPriceResult = null;
          clearVehiclePriceCache();
          triggerPriceOnly();
          scheduleSaveState();
        }
      }
    });

    dom.date.addEventListener('click', function () {
      if (datePicker) datePicker.open();
    });

    var dateBtn = document.getElementById('booking-date-btn');
    if (dateBtn) {
      dateBtn.addEventListener('click', function () {
        if (datePicker) datePicker.open();
      });
    }

    syncDatePickerConstraints();
  }

  /* ─── Time Options ─── */

  function syncPickupTimeDisplays() {
    if (dom.hours && dom.hoursDisplay) {
      var oh = dom.hours.options[dom.hours.selectedIndex];
      dom.hoursDisplay.textContent = oh ? oh.textContent : '';
    }
    if (dom.minutes && dom.minutesDisplay) {
      var om = dom.minutes.options[dom.minutes.selectedIndex];
      dom.minutesDisplay.textContent = om ? om.textContent : '';
    }
  }

  var PICKUP_LEAD_MINUTES = 180;

  function getLondonTimeParts() {
    var now = new Date();
    var p = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(now);
    var r = {};
    p.forEach(function(part) { r[part.type] = parseInt(part.value, 10); });
    return r;
  }

  function roundUpTo5(totalMinutes) {
    return Math.ceil(totalMinutes / 5) * 5;
  }

  function getMinPickupMinutesFromMidnight(london) {
    if (!london) london = getLondonTimeParts();
    return roundUpTo5(london.hour * 60 + london.minute + PICKUP_LEAD_MINUTES);
  }

  function isPickupDateToday(pickupDate, london) {
    if (!pickupDate) return false;
    if (!london) london = getLondonTimeParts();
    var parts = pickupDate.split('-');
    return parseInt(parts[0], 10) === london.year
      && parseInt(parts[1], 10) === london.month
      && parseInt(parts[2], 10) === london.day;
  }

  function londonHasNoSlotsToday(london) {
    if (!london) london = getLondonTimeParts();
    return getMinPickupMinutesFromMidnight(london) >= 1440;
  }

  function isPickupTimeAllowed(h, m, pickupDate) {
    if (!pickupDate || h === '' || m === '') return false;
    var london = getLondonTimeParts();
    if (!isPickupDateToday(pickupDate, london)) return true;
    var minMinutes = getMinPickupMinutesFromMidnight(london);
    if (minMinutes >= 1440) return false;
    return (parseInt(h, 10) * 60 + parseInt(m, 10)) >= minMinutes;
  }

  function getLondonTodayDate(london) {
    if (!london) london = getLondonTimeParts();
    return new Date(london.year, london.month - 1, london.day);
  }

  function syncDatePickerConstraints() {
    if (!datePicker) return;

    var london = getLondonTimeParts();
    var todayLondon = getLondonTodayDate(london);

    if (londonHasNoSlotsToday(london)) {
      var tomorrow = new Date(todayLondon);
      tomorrow.setDate(tomorrow.getDate() + 1);
      datePicker.set('minDate', tomorrow);
      datePicker.set('disable', []);

      if (state.pickupDate && isPickupDateToday(state.pickupDate, london)) {
        state.pickupDate = '';
        datePicker.clear();
        if (dom.hours) dom.hours.value = '';
        if (dom.minutes) dom.minutes.value = '';
      }
    } else {
      datePicker.set('minDate', todayLondon);
      datePicker.set('disable', []);
    }
  }

  function updateTimeOptions() {
    if (!dom.hours || !dom.minutes) return;

    syncDatePickerConstraints();

    var london = getLondonTimeParts();
    var isToday = state.pickupDate && isPickupDateToday(state.pickupDate, london);

    if (isToday) {
      var minMinutes = getMinPickupMinutesFromMidnight(london);

      Array.from(dom.hours.options).forEach(function(opt) {
        var hv = opt.value;
        if (hv === '') {
          opt.disabled = false;
        } else {
          opt.disabled = (parseInt(hv, 10) * 60 + 55) < minMinutes;
        }
      });

      if (dom.hours.value !== '') {
        var hi = dom.hours.selectedIndex;
        if (hi >= 0 && dom.hours.options[hi].disabled) {
          var firstValidHour = Array.from(dom.hours.options).find(function(o) { return o.value !== '' && !o.disabled; });
          if (firstValidHour) dom.hours.value = firstValidHour.value;
        }
      }

      var selHour = parseInt(dom.hours.value, 10);
      if (dom.hours.value !== '') {
        Array.from(dom.minutes.options).forEach(function(opt) {
          if (opt.value === '') {
            opt.disabled = false;
          } else {
            opt.disabled = (selHour * 60 + parseInt(opt.value, 10)) < minMinutes;
          }
        });
      } else {
        Array.from(dom.minutes.options).forEach(function(opt) { opt.disabled = false; });
      }

      if (dom.minutes.value !== '') {
        var mi = dom.minutes.selectedIndex;
        if (mi >= 0 && dom.minutes.options[mi].disabled) {
          var firstValidMin = Array.from(dom.minutes.options).find(function(o) { return o.value !== '' && !o.disabled; });
          if (firstValidMin) dom.minutes.value = firstValidMin.value;
        }
      }

    } else {
      Array.from(dom.hours.options).forEach(function(opt) { opt.disabled = false; });
      Array.from(dom.minutes.options).forEach(function(opt) { opt.disabled = false; });
    }

    syncPickupTimeDisplays();
    logEvent('timeOptionsUpdate', { pickupDate: state.pickupDate, hours: dom.hours.value, minutes: dom.minutes.value });
    updateTripbar();
    refreshSummaryIfPresent();
    state.pickupTimeHours = dom.hours ? dom.hours.value : state.pickupTimeHours;
    state.pickupTimeMinutes = dom.minutes ? dom.minutes.value : state.pickupTimeMinutes;
    scheduleSaveState();
  }

  /* ─── Passengers & Suitcase Logic ─── */

  function updatePassengerOptions() {
    if (!dom.passengers) return;
    var cap = P.vehicleCapacity[state.vehicleKey];
    if (!cap) return;
    var max = cap.passengers;
    var currentVal = dom.passengers.value;

    while (dom.passengers.firstChild) dom.passengers.removeChild(dom.passengers.firstChild);
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '\u2014';
    dom.passengers.appendChild(placeholder);
    for (var i = 1; i <= max; i++) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = i;
      dom.passengers.appendChild(opt);
    }
    if (parseInt(currentVal) <= max) dom.passengers.value = currentVal;
  }

  function updateSuitcaseOptions() {
    if (!dom.largeBags || !dom.smallBags) return;
    var cap = P.vehicleCapacity[state.vehicleKey];
    var matrix = P.luggageMatrix[state.vehicleKey];
    if (!cap || !matrix) return;

    var largeMax = cap.largeMax;
    var currentLarge = parseInt(dom.largeBags.value) || 0;

    while (dom.largeBags.firstChild) dom.largeBags.removeChild(dom.largeBags.firstChild);
    var largePlaceholder = document.createElement('option');
    largePlaceholder.value = '';
    largePlaceholder.textContent = '\u2013';
    dom.largeBags.appendChild(largePlaceholder);
    for (var i = 1; i <= largeMax; i++) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = i;
      dom.largeBags.appendChild(opt);
    }
    if (currentLarge <= largeMax) dom.largeBags.value = currentLarge || '';

    updateSmallBagsFromLarge();
  }

  function updateSmallBagsFromLarge() {
    var matrix = P.luggageMatrix[state.vehicleKey];
    if (!matrix || !dom.smallBags) return;

    var largeVal = parseInt(dom.largeBags.value) || 0;
    var maxSmall = matrix[largeVal];
    if (maxSmall === undefined) maxSmall = 0;

    var currentSmall = parseInt(dom.smallBags.value) || 0;
    while (dom.smallBags.firstChild) dom.smallBags.removeChild(dom.smallBags.firstChild);
    var smallPlaceholder = document.createElement('option');
    smallPlaceholder.value = '';
    smallPlaceholder.textContent = '\u2013';
    dom.smallBags.appendChild(smallPlaceholder);
    for (var i = 1; i <= maxSmall; i++) {
      var opt = document.createElement('option');
      opt.value = i;
      opt.textContent = i;
      dom.smallBags.appendChild(opt);
    }
    if (currentSmall <= maxSmall) dom.smallBags.value = currentSmall || '';
  }

  function applyRestoredStep3Payload(t3) {
    if (!t3 || typeof t3 !== 'object') return;

    if (dom.country && t3.country) {
      var foundCi = false;
      var k;
      for (k = 0; k < dom.country.options.length; k++) {
        if (dom.country.options[k].value === t3.country) {
          dom.country.selectedIndex = k;
          foundCi = true;
          break;
        }
      }
      if (!foundCi) dom.country.value = t3.country;
    }
    syncCountryDisplay();

    if (dom.phoneCode && t3.phoneCode != null && t3.phoneCode !== '') dom.phoneCode.value = t3.phoneCode;
    syncPhoneFlagFromPhoneCodeDropdown();

    if (dom.phoneNumber && t3.phoneNumberLocal != null) dom.phoneNumber.value = String(t3.phoneNumberLocal);
    if (dom.firstName && t3.firstName != null) dom.firstName.value = t3.firstName;
    if (dom.lastName && t3.lastName != null) dom.lastName.value = t3.lastName;
    if (dom.email && t3.email != null) dom.email.value = t3.email;
    if (dom.comments && t3.comments != null) dom.comments.value = t3.comments;

    if (dom.addonBooster && t3.addonBooster != null) dom.addonBooster.checked = !!t3.addonBooster;
    if (dom.addonChildseat && t3.addonChildseat != null) dom.addonChildseat.checked = !!t3.addonChildseat;
    if (dom.addonFlowers && t3.addonFlowers != null) dom.addonFlowers.checked = !!t3.addonFlowers;
    if (dom.addonChampagne && t3.addonChampagne != null) dom.addonChampagne.checked = !!t3.addonChampagne;
    if (dom.addonPet && t3.addonPet != null) dom.addonPet.checked = !!t3.addonPet;

    if (dom.terms && t3.termsAccepted != null) dom.terms.checked = !!t3.termsAccepted;
    if (dom.newsletter && t3.newsletterOptIn != null) dom.newsletter.checked = !!t3.newsletterOptIn;

    if (dom.passengers && t3.passengers != null && t3.passengers !== '') dom.passengers.value = t3.passengers;

    var largeSv = (t3.largeBags !== undefined && t3.largeBags !== null && t3.largeBags !== '')
      ? String(t3.largeBags) : '';
    var smallSv = (t3.smallBags !== undefined && t3.smallBags !== null && t3.smallBags !== '')
      ? String(t3.smallBags) : '';
    var hasMatchingOption = function (sel, val) {
      if (!sel || val === '') return false;
      for (var ix = 0; ix < sel.options.length; ix++) {
        if (String(sel.options[ix].value) === val) return true;
      }
      return false;
    };
    if (dom.largeBags && largeSv && hasMatchingOption(dom.largeBags, largeSv)) {
      dom.largeBags.value = largeSv;
      updateSmallBagsFromLarge();
      if (dom.smallBags && smallSv && hasMatchingOption(dom.smallBags, smallSv)) dom.smallBags.value = smallSv;
    }

    state.turnstileToken = '';
    state.turnstileFallback = false;
    if (state._turnstileFallbackTimer) {
      clearTimeout(state._turnstileFallbackTimer);
      state._turnstileFallbackTimer = null;
    }
    syncCheckoutDisabledForTurnstile();
  }

  /* ─── Cloudflare Turnstile ─── */

  window.iproTurnstileSuccess = function (token) {
    if (state._turnstileFallbackTimer) {
      clearTimeout(state._turnstileFallbackTimer);
      state._turnstileFallbackTimer = null;
    }
    state.turnstileFallback = false;
    state.turnstileToken = token;
    if (dom.checkoutBtn) dom.checkoutBtn.disabled = false;
    scheduleTopnavForwardUpdate();
  };

  window.iproTurnstileExpired = function () {
    state.turnstileToken = '';
    if (dom.checkoutBtn && turnstileRequired()) {
      dom.checkoutBtn.disabled = true;
    }
    scheduleTopnavForwardUpdate();
  };

  function syncTurnstileTokenFromDomIfEmpty() {
    if (state.turnstileToken !== '') return;
    var input = document.querySelector('#cf-turnstile input[name="cf-turnstile-response"], input[name="cf-turnstile-response"]');
    if (!input || !input.value) return;
    var v = String(input.value).trim();
    if (!v) return;
    state.turnstileToken = v;
    state.turnstileFallback = false;
  }

  /* ─── Form Submission ─── */

  function initSubmission() {
    if (!dom.checkoutBtn) return;
    dom.checkoutBtn.addEventListener('click', function () {
      if (typeof window.iproBATrack === 'function') {
        window.iproBATrack('checkout_attempt', {});
      }

      if (!validateStep2()) { scrollToFirstError(3); return; }

      if (typeof window.iproBATrack === 'function') {
        var addonsTrack = [];
        if (dom.addonBooster && dom.addonBooster.checked) addonsTrack.push(dom.addonBooster.value);
        if (dom.addonChildseat && dom.addonChildseat.checked) addonsTrack.push(dom.addonChildseat.value);
        if (dom.addonFlowers && dom.addonFlowers.checked) addonsTrack.push(dom.addonFlowers.value);
        if (dom.addonChampagne && dom.addonChampagne.checked) addonsTrack.push(dom.addonChampagne.value);
        if (dom.addonPet && dom.addonPet.checked) addonsTrack.push(dom.addonPet.value);
        window.iproBATrack('checkout_validated', {
          vehicle_key:      state.vehicleKey,
          service_type:     state.serviceType,
          estimated_price:  state.estimatedPrice || 0,
          has_flight:       !!(dom.flight && dom.flight.value.trim()),
          addons:           addonsTrack,
          passengers:       dom.passengers ? dom.passengers.value : '',
          large_bags:       dom.largeBags ? dom.largeBags.value : '',
          small_bags:       dom.smallBags ? dom.smallBags.value : ''
        });
      }

      collectStep2Data();
      submitBooking();
    });
  }

  function collectStep2Data() {
    var fn = dom.firstName ? dom.firstName.value.trim() : '';
    var ln = dom.lastName ? dom.lastName.value.trim() : '';
    state.name = (fn + ' ' + ln).trim();
    state.country = dom.country.value;
    state.phoneCode = dom.phoneCode.value;
    state.phone = dom.phoneCode.value + dom.phoneNumber.value.trim();
    state.email = dom.email ? dom.email.value.trim() : '';
    state.flightNumber = dom.flight ? dom.flight.value.trim() : '';

    var addons = [];
    if (dom.addonBooster && dom.addonBooster.checked) addons.push(dom.addonBooster.value);
    if (dom.addonChildseat && dom.addonChildseat.checked) addons.push(dom.addonChildseat.value);
    if (dom.addonFlowers && dom.addonFlowers.checked) addons.push(dom.addonFlowers.value);
    if (dom.addonChampagne && dom.addonChampagne.checked) addons.push(dom.addonChampagne.value);
    if (dom.addonPet && dom.addonPet.checked) addons.push(dom.addonPet.value);
    state.addons = addons.join(' | ');

    state.pickupTimeHours = dom.hours.value;
    state.pickupTimeMinutes = dom.minutes.value;
    state.passengers = dom.passengers.value;
    state.smallSuitcases = dom.smallBags.value;
    state.largeSuitcases = dom.largeBags.value;
    state.comments = dom.comments.value.trim();
    state.termsAccepted = dom.terms.checked;
    state.newsletterOptIn = dom.newsletter.checked;
  }

  function ensureCheckoutButtonLayers(btn) {
    if (btn.querySelector('.booking-btn__label')) return;
    var text = btn.textContent.trim();
    while (btn.firstChild) btn.removeChild(btn.firstChild);
    var progress = document.createElement('span');
    progress.className = 'booking-btn__progress';
    progress.setAttribute('aria-hidden', 'true');
    var label = document.createElement('span');
    label.className = 'booking-btn__label';
    label.textContent = text || (iproBookingL10n.checkout || 'CHECKOUT');
    btn.appendChild(progress);
    btn.appendChild(label);
  }

  function resetCheckoutButtonAfterError(btn) {
    btn.classList.remove('is-checkout-submitting', 'is-checkout-success');
    btn.removeAttribute('aria-busy');
    btn.disabled = false;
    var label = btn.querySelector('.booking-btn__label');
    if (label) {
      label.textContent = iproBookingL10n.checkout || 'CHECKOUT';
    } else {
      btn.textContent = iproBookingL10n.checkout || 'CHECKOUT';
    }
    scheduleTopnavForwardUpdate();
  }

  function submitBooking() {
    var btn = dom.checkoutBtn;

    ensureCheckoutButtonLayers(btn);

    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.classList.add('is-checkout-submitting');
    scheduleTopnavForwardUpdate();

    var stops = [];
    state.stops.forEach(function (s) {
      if (s.address) stops.push(s.address);
    });

    syncTurnstileTokenFromDomIfEmpty();

    var data = {
      action: 'ipro_submit_booking',
      formVersion: 'v3',
      nonce: iproBooking.nonce,
      serviceType: state.serviceType,
      pickup: state.pickup.address,
      pickupPlaceId: state.pickup.placeId,
      dropoff: state.dropoff.address,
      dropoffPlaceId: state.dropoff.placeId,
      stops: stops.join(' | '),
      vehicle: P.vehicleNames[state.vehicleKey] || state.vehicleKey,
      vehicleKey: state.vehicleKey,
      estimatedPrice: state.estimatedPrice || 0,
      internationalRoute: (state.priceResult && state.priceResult.contactRequired) ? '1' : '0',
      duration: state.serviceType === 'hourly' ? state.duration : '',
      name: state.name,
      country: state.country,
      phone: state.phone,
      email: state.email,
      flightNumber: state.flightNumber,
      addons: state.addons || '',
      pickupDate: state.pickupDate,
      pickupTime: state.pickupTimeHours + ':' + state.pickupTimeMinutes,
      passengers: state.passengers,
      smallSuitcases: state.smallSuitcases,
      largeSuitcases: state.largeSuitcases,
      comments: state.comments,
      newsletter: state.newsletterOptIn ? 'yes' : 'no',
      locale: (iproBooking && iproBooking.lang) ? iproBooking.lang : 'en',
      turnstileToken: state.turnstileToken || ''
    };

    $.post(iproBooking.ajaxUrl, data)
      .done(function (res) {
        if (res.success) {
          if (typeof window.iproBATrack === 'function') {
            var pickupCity = state.pickup.address.split(',')[0] || '';
            var dropoffCity = state.dropoff.address.split(',')[0] || '';
            var addonsList = (state.addons || '').split(/\s*\|\s*/).map(function (s) { return s.trim(); }).filter(Boolean);
            window.iproBATrack('form_submit', {
              vehicle: (P.vehicleNames && P.vehicleNames[state.vehicleKey]) || state.vehicleKey,
              vehicle_key: state.vehicleKey,
              service_type: state.serviceType,
              pickup_time: state.pickupTimeHours + ':' + state.pickupTimeMinutes,
              price: state.estimatedPrice || 0,
              pickup_city: pickupCity,
              dropoff_city: dropoffCity,
              passengers: state.passengers,
              country: state.country,
              has_flight: !!(state.flightNumber && String(state.flightNumber).trim()),
              addons: addonsList,
              addons_count: addonsList.length
            });
          }
          btn.classList.remove('is-checkout-submitting');
          btn.classList.add('is-checkout-success');
          var label = btn.querySelector('.booking-btn__label');
          if (label) label.textContent = iproBookingL10n.checkoutDone || 'DONE';
          setTimeout(function () {
            showConfirmation(res.data && res.data.bookingRef ? res.data.bookingRef : '');
          }, 480);
        } else {
          if (typeof window.iproBATrack === 'function') {
            window.iproBATrack('form_submit_failed', { reason: 'server_error' });
          }
          alert(res.data || (iproBookingL10n.errorSubmissionFailed || 'Submission failed. Please try again.'));
          resetCheckoutButtonAfterError(btn);
        }
      })
      .fail(function () {
        if (typeof window.iproBATrack === 'function') {
          window.iproBATrack('form_submit_failed', { reason: 'network_error' });
        }
        alert(iproBookingL10n.errorNetwork || 'Network error. Please try again.');
        resetCheckoutButtonAfterError(btn);
      });
  }

  function showConfirmation(bookingRef) {
    clearSavedState();

    if (dom.step4Intro) dom.step4Intro.style.display = 'none';
    if (dom.step4Placeholder) dom.step4Placeholder.style.display = 'none';
    if (dom.step4Actions) dom.step4Actions.style.display = 'none';
    if (dom.step4BackBtn) dom.step4BackBtn.style.display = 'none';

    var mount = dom.step4Message;
    if (!mount) return;

    while (mount.firstChild) mount.removeChild(mount.firstChild);
    mount.removeAttribute('hidden');
    mount.style.textAlign = 'center';
    mount.style.padding = '60px 20px';

    var ns = 'http://www.w3.org/2000/svg';
    function svgEl(tag) { return document.createElementNS(ns, tag); }

    var svg = svgEl('svg');
    svg.setAttribute('width', '64');
    svg.setAttribute('height', '64');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', '#2e7d32');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.style.marginBottom = '20px';
    var path = svgEl('path');
    path.setAttribute('d', 'M20 6L9 17l-5-5');
    svg.appendChild(path);
    mount.appendChild(svg);

    var h2 = document.createElement('h2');
    h2.className = 'booking-content__title';
    h2.style.fontSize = '32px';
    h2.textContent = (iproBookingL10n.thankYou || 'Thank you!');
    mount.appendChild(h2);

    if (bookingRef) {
      var ref = document.createElement('p');
      ref.style.fontSize = '18px';
      ref.style.color = '#333';
      ref.style.marginTop = '16px';
      ref.style.fontWeight = 'bold';
      ref.textContent = ((typeof iproBookingL10n !== 'undefined' && iproBookingL10n.bookingReference) ? iproBookingL10n.bookingReference : 'Booking Reference:') + ' ' + bookingRef;
      mount.appendChild(ref);
    }

    var p = document.createElement('p');
    p.style.fontSize = '16px';
    p.style.color = '#666';
    p.style.marginTop = '12px';
    p.textContent = (iproBookingL10n.confirmationMsg || 'Your booking request has been submitted. We will contact you shortly.');
    mount.appendChild(p);

    goToStep(4);
  }

  /* ─── Event Binding ─── */

  function bindEvents() {
    if (dom.topnavStepsContainer) {
      dom.topnavStepsContainer.addEventListener('click', function (e) {
        var stepEl = e.target.closest('.booking-topnav__step[data-step]');
        if (!stepEl || !dom.topnavStepsContainer.contains(stepEl)) return;
        requestTopnavStep(parseInt(stepEl.getAttribute('data-step'), 10));
      });

      dom.topnavStepsContainer.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var stepEl = e.target.closest('.booking-topnav__step[data-step]');
        if (!stepEl || !dom.topnavStepsContainer.contains(stepEl)) return;
        if (!stepEl.classList.contains('booking-topnav__step--clickable')) return;
        e.preventDefault();
        requestTopnavStep(parseInt(stepEl.getAttribute('data-step'), 10));
      });
    }

    if (dom.topnavBackBtn) {
      dom.topnavBackBtn.addEventListener('click', function () {
        if (state.currentStep <= 1 || dom.topnavBackBtn.disabled) return;
        logEvent('clickMobileBack', { step: state.currentStep });
        goToStep(state.currentStep - 1);
      });
    }

    if (dom.topnavForwardBtn) {
      dom.topnavForwardBtn.addEventListener('click', function () {
        if (dom.topnavForwardBtn.disabled) return;
        logEvent('clickTopnavForward', { step: state.currentStep });
        if (state.currentStep === 1) {
          if (validateStep1()) goToStep(2); else scrollToFirstError(1);
        } else if (state.currentStep === 2) {
          goToStep(3);
        }
      });
    }

    if (dom.topnavForwardSlot) {
      dom.topnavForwardSlot.addEventListener('click', function () {
        if (state.currentStep === 3) return;
        if (!dom.topnavForwardBtn || !dom.topnavForwardBtn.disabled) return;
        if (state.currentStep === 1) {
          validateStep1();
          scrollToFirstError(1);
          showForwardToast(
            (typeof iproBookingL10n !== 'undefined' && iproBookingL10n.errorFillRequired) ||
              'Please fill in all required fields'
          );
        }
      });
    }

    dom.nextBtn.addEventListener('click', function () {
      logEvent('clickNext', { step: state.currentStep });
      if (validateStep1()) goToStep(2); else scrollToFirstError(1);
    });

    if (dom.mobileNextBtn) {
      dom.mobileNextBtn.addEventListener('click', function () {
        if (validateStep1()) goToStep(2); else scrollToFirstError(1);
      });
    }

    if (dom.tripBarEditBtn) {
      dom.tripBarEditBtn.addEventListener('click', function () {
        logEvent('clickTripBarEdit', { step: state.currentStep });
        goToStep(1);
      });
    }

    if (dom.summaryEditBtn) {
      dom.summaryEditBtn.addEventListener('click', function () {
        logEvent('clickSummaryEdit', { step: state.currentStep });
        goToStep(2);
      });
    }

    if (dom.step2BackBtn) {
      dom.step2BackBtn.addEventListener('click', function () {
        logEvent('clickBack', { step: state.currentStep });
        goToStep(1);
      });
    }

    if (dom.step2BackTopBtn) {
      dom.step2BackTopBtn.addEventListener('click', function () {
        logEvent('clickBack', { step: state.currentStep });
        goToStep(1);
      });
    }

    if (dom.step3BackTopBtn) {
      dom.step3BackTopBtn.addEventListener('click', function () {
        logEvent('clickBack', { step: state.currentStep });
        goToStep(2);
      });
    }

    if (dom.step3BackBtn) {
      dom.step3BackBtn.addEventListener('click', function () {
        logEvent('clickBack', { step: state.currentStep });
        goToStep(2);
      });
    }

    if (dom.step2NextBtn) {
      dom.step2NextBtn.addEventListener('click', function () {
        logEvent('clickNext', { step: state.currentStep });
        goToStep(3);
      });
    }

    if (dom.step4BackBtn) {
      dom.step4BackBtn.addEventListener('click', function () {
        resetStep4Ui();
        goToStep(3);
      });
    }

    if (dom.duration) {
      dom.duration.addEventListener('change', function () {
        state.duration = parseInt(dom.duration.value, 10) || 3;
        state.step1MinPriceResult = null;
        clearVehiclePriceCache();
        if (
          state.currentStep === 1 &&
          state.serviceType === 'hourly' &&
          (!getEffectivePickupAddress() || !getEffectiveDropoffAddress())
        ) {
          updateStep1FromPrice();
        }
        triggerPriceOnly();
        refreshSummaryIfPresent();
        scheduleSaveState();
      });
    }

    if (dom.largeBags) {
      dom.largeBags.addEventListener('change', updateSmallBagsFromLarge);
    }

    if (dom.hours) dom.hours.addEventListener('change', function () {
      logEvent('timeChange', { hours: dom.hours.value, minutes: dom.minutes ? dom.minutes.value : null });
      state.step1MinPriceResult = null;
      clearVehiclePriceCache();
      updateTimeOptions();
      updateTripbar();
      refreshSummaryIfPresent();
      triggerPriceOnly();
      scheduleSaveState();
    });
    if (dom.minutes) dom.minutes.addEventListener('change', function () {
      logEvent('timeChange', { hours: dom.hours ? dom.hours.value : null, minutes: dom.minutes.value });
      state.step1MinPriceResult = null;
      clearVehiclePriceCache();
      updateTimeOptions();
      updateTripbar();
      refreshSummaryIfPresent();
      triggerPriceOnly();
      scheduleSaveState();
    });

    dom.pickup.addEventListener('blur', triggerPriceUpdate);
    dom.dropoff.addEventListener('blur', triggerPriceUpdate);

    if (dom.form) {
      dom.form.addEventListener('input', function () { scheduleSaveState(); }, true);
      dom.form.addEventListener('change', function () { scheduleSaveState(); }, true);
      dom.form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (state.currentStep !== 3) return;
        if (!dom.checkoutBtn) return;
        if (!validateStep2()) { scrollToFirstError(3); return; }
        if (dom.checkoutBtn.disabled) return;
        collectStep2Data();
        submitBooking();
      });
    }

    initFlightValidation();
  }

  /* ─── Utilities ─── */

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  /* ─── Initialization ─── */

  function preloadStep2VehicleImages() {
    var imgs = document.querySelectorAll('#booking-vehicles-step2 img');
    for (var i = 0; i < imgs.length; i++) {
      var src = imgs[i].getAttribute('src');
      if (!src) continue;
      var pre = new Image();
      pre.src = src;
    }
  }

  function init() {
    cacheDom();
    if (!dom.step1) return;

    logEvent('init', { hasTripbar: !!dom.tripbarItems, hasPickupInput: !!dom.pickup, hasDropoffInput: !!dom.dropoff });
    preloadStep2VehicleImages();

    setInterval(function () {
      var banner = document.querySelector('iframe.goog-te-banner-frame');
      if (banner) banner.remove();
    }, 1000);
    setInterval(updateTimeOptions, 60000);

    // Restore session state before wiring UI.
    var saved = loadSavedState();
    if (saved) {
      var restoredStep = saved.currentStep || 1;
      state.currentStep = restoredStep > 3 ? 3 : restoredStep;
      state.serviceType = saved.serviceType || 'single';
      state.pickup = saved.pickup || state.pickup;
      state.dropoff = saved.dropoff || state.dropoff;
      state.stops = Array.isArray(saved.stops) ? saved.stops : state.stops;
      state.stopsVisible = saved.stopsVisible || 0;
      state.vehicle = saved.vehicle || state.vehicle;
      state.vehicleKey = saved.vehicleKey || state.vehicleKey;
      state.duration = saved.duration || state.duration;
      state.pickupDate = saved.pickupDate || '';
      var th = saved.pickupTimeHours;
      var tm = saved.pickupTimeMinutes;
      if (th !== undefined && th !== null && th !== '') state.pickupTimeHours = th;
      if (tm !== undefined && tm !== null && tm !== '') state.pickupTimeMinutes = tm;
      state.pickupIsAirport = !!saved.pickupIsAirport;
      state.dropoffIsAirport = !!saved.dropoffIsAirport;
      state.flightNumber = saved.flightNumber || '';
    }

    initServiceToggle();
    updateTripbar();
    initVehicleSelection();
    syncMobileVehicleSliderForViewport();
    initStops();
    initMapPicker();
    initCountryPhoneSync();
    initDatePicker();
    initSubmission();
    bindEvents();
    scheduleTopnavForwardUpdate();

    var routeResizeDebounce;
    window.addEventListener('resize', function () {
      clearTimeout(routeResizeDebounce);
      routeResizeDebounce = setTimeout(function () {
        syncMobileVehicleSliderForViewport();
        try {
          if (typeof google !== 'undefined' && google.maps && routeMap && isDesktop() && dom.routeMap) {
            google.maps.event.trigger(routeMap, 'resize');
          }
        } catch (e) {}
      }, 150);
    });

    window.matchMedia('(max-width: 1024px)').addEventListener('change', syncMobileVehicleSliderForViewport);

    // Apply restored state to UI after listeners are set up.
    try {
      var btns = document.querySelectorAll('.booking-toggle__btn');
      btns.forEach(function (b) {
        b.classList.toggle('booking-toggle__btn--active', b.getAttribute('data-service') === state.serviceType);
      });
      handleServiceTypeChange();

      if (dom.pickup && state.pickup && state.pickup.address) dom.pickup.value = state.pickup.address;
      if (dom.dropoff && state.dropoff && state.dropoff.address) dom.dropoff.value = state.dropoff.address;

      for (var i = 1; i <= 3; i++) {
        var wrap = document.getElementById('booking-stop-' + i);
        var input = document.getElementById('booking-stop-' + i + '-input');
        var addr = (state.stops && state.stops[i - 1] && state.stops[i - 1].address) ? state.stops[i - 1].address : '';
        if (wrap && input) {
          wrap.classList.add('booking-stop--instant');
          if (addr) {
            wrap.classList.add('booking-stop--open');
            input.value = addr;
          } else {
            wrap.classList.remove('booking-stop--open');
            input.value = '';
          }
        }
      }
      requestAnimationFrame(function () {
        for (var ri = 1; ri <= 3; ri++) {
          var w = document.getElementById('booking-stop-' + ri);
          if (w) w.classList.remove('booking-stop--instant');
        }
      });
      state.stopsVisible = (state.stops || []).filter(function (s) { return s && s.address; }).length;
      if (dom.addStopBtn) dom.addStopBtn.style.display = (state.stopsVisible >= 3) ? 'none' : '';

      if (dom.duration && state.duration) dom.duration.value = String(state.duration);
      if (dom.flight && state.flightNumber) dom.flight.value = state.flightNumber;
      if (state.pickup && state.pickup.address) {
        state.pickupIsAirport = state.pickupIsAirport || checkIsAirport([], state.pickup.address);
      }
      if (state.dropoff && state.dropoff.address) {
        state.dropoffIsAirport = state.dropoffIsAirport || checkIsAirport([], state.dropoff.address);
      }
      syncAirportRouteUi();

      function padTimeSelect(v) {
        if (v === '' || v == null) return '';
        return String(v).padStart(2, '0');
      }
      if (dom.hours) dom.hours.value = padTimeSelect(state.pickupTimeHours);
      if (dom.minutes) dom.minutes.value = padTimeSelect(state.pickupTimeMinutes);
      syncPickupTimeDisplays();

      // Vehicle selection UI
      if (state.vehicle) {
        document.querySelectorAll('.booking-vehicle').forEach(function (c) {
          c.classList.toggle('booking-vehicle--selected', c.getAttribute('data-vehicle') === String(state.vehicle));
        });
      }

      updatePassengerOptions();
      updateSuitcaseOptions();
      if (saved && saved.step3) {
        ensureCountrySelectsPopulated();
        applyRestoredStep3Payload(saved.step3);
      }

      refreshSummaryIfPresent();
      updateTripbar();
      applyPickupDateToPicker();
    } catch (e) {}

    function scheduleLazyInitAutocomplete() {
      if (scheduleLazyInitAutocomplete.done) return;
      scheduleLazyInitAutocomplete.done = true;
      initAutocomplete();
    }
    scheduleLazyInitAutocomplete.done = false;

    var lazyAcIds = ['booking-pickup', 'booking-dropoff', 'booking-stop-1-input', 'booking-stop-2-input', 'booking-stop-3-input'];
    for (var lac = 0; lac < lazyAcIds.length; lac++) {
      var lacEl = document.getElementById(lazyAcIds[lac]);
      if (lacEl) {
        lacEl.addEventListener('focus', scheduleLazyInitAutocomplete);
      }
    }

    function prefetchMaps() {
      loadGoogleMaps()
        .then(function () {
          if (isDesktop()) {
            initRouteMapBase();
            updateRoutePreview();
          } else if (state.pickup && state.pickup.lat && state.dropoff && state.dropoff.lat) {
            triggerPriceUpdate();
          }
        })
        .catch(function () {});
    }
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(prefetchMaps, { timeout: 2500 });
    } else {
      setTimeout(prefetchMaps, 1);
    }

    updateTimeOptions();
    updateStep1NextEnabled();

    // If step was saved beyond 1, respect it.
    if (state.currentStep && state.currentStep !== 1) {
      goToStep(state.currentStep);
    } else {
      updateTopnavStepInteractable();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.IproBookingSteps = {
    goToStep: goToStep,
    triggerPriceUpdate: triggerPriceUpdate,
    getState: function () { return state; }
  };

})(jQuery);
