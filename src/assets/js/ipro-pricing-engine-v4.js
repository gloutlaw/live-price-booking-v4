/**
 * Client booking wizard — Pricing engine V4
 * Depends on: ipro-pricing-data-v4.js (window.IPRO_PRICING_V4)
 *
 * Pure calculatePrice() works in integer pence. getPrice() wraps AJAX distance
 * + fixed stadium/polo/festival tables.
 */
(function () {
  'use strict';

  var P = window.IPRO_PRICING_V4;
  if (!P) {
    console.error('[IproPricingEngineV4] IPRO_PRICING_V4 not loaded');
    return;
  }

  var londonKeywords = [
    'london', 'heathrow', 'hayes', 'uxbridge', 'west drayton',
    'staines', 'slough', 'windsor', 'richmond', 'kingston',
    'croydon', 'wimbledon', 'hammersmith', 'canary wharf',
    'stratford', 'wembley', 'harrow', 'watford', 'epsom',
    'surbiton', 'twickenham', 'hounslow', 'feltham', 'brentford',
    'ealing', 'acton', 'finchley', 'barnet', 'enfield', 'romford',
    'ilford', 'barking', 'greenwich', 'lewisham', 'bromley', 'sutton',
    'morden', 'mitcham', 'tooting', 'streatham', 'brixton',
    'stockwell', 'clapham', 'battersea', 'chelsea', 'kensington',
    'westminster', 'paddington', 'marylebone', 'islington', 'hackney',
    'shoreditch', 'bethnal green', 'whitechapel', 'bow', 'poplar',
    'docklands', 'woolwich', 'eltham', 'dartford', 'covent garden',
    'buckingham palace', 'big ben', 'oxford'
  ];

  function poundsToPence(pounds) {
    return Math.round(Number(pounds) * 100);
  }

  function penceToPounds(pence) {
    return Math.round(pence) / 100;
  }

  function formatPounds(pence) {
    return penceToPounds(pence).toFixed(2);
  }

  function normalize(str) {
    return (str || '').toLowerCase().trim()
      .replace(/['']/g, "'")
      .replace(/\s+/g, ' ');
  }

  function isLondonArea(address) {
    var addr = normalize(address);
    for (var i = 0; i < londonKeywords.length; i++) {
      if (addr.indexOf(londonKeywords[i]) !== -1) return true;
    }
    return false;
  }

  /**
   * A keyword entry is either a plain string (matches if that single substring is
   * present) or an array of strings (AND group — matches only if ALL substrings in
   * the group are present, in any order). AND groups exist to disambiguate venue
   * names that collide with ordinary London place names, e.g. 'st james' alone
   * matches both St James' Park (Newcastle stadium) and St James's Square
   * (a normal Westminster address) — report 22.07.2026 bug: LHR -> St James's
   * Square was priced as a Newcastle stadium transfer (£830 instead of ~£135).
   */
  function keywordMatches(addr, keyword) {
    if (Array.isArray(keyword)) {
      for (var k = 0; k < keyword.length; k++) {
        if (addr.indexOf(keyword[k]) === -1) return false;
      }
      return keyword.length > 0;
    }
    return addr.indexOf(keyword) !== -1;
  }

  function findInKeywords(address, keywordsMap) {
    var addr = normalize(address);
    var keys = Object.keys(keywordsMap);
    for (var i = 0; i < keys.length; i++) {
      var kws = keywordsMap[keys[i]];
      for (var j = 0; j < kws.length; j++) {
        if (keywordMatches(addr, kws[j])) return keys[i];
      }
    }
    return null;
  }

  function extractPostcodes(address) {
    var text = String(address || '').toUpperCase();
    var matches = text.match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}\b/g) || [];
    var out = [];
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i].replace(/\s+/g, ' ').trim();
      var outward = m.split(/\s+/)[0];
      if (outward) out.push(outward);
    }
    // Also catch outward-only fragments like "TW6" or "SW1A"
    var loose = text.match(/\b([A-Z]{1,2}\d[A-Z\d]?)\b/g) || [];
    for (var j = 0; j < loose.length; j++) {
      if (out.indexOf(loose[j]) === -1) out.push(loose[j]);
    }
    return out;
  }

  function findAirportByPostcode(address) {
    var codes = extractPostcodes(address);
    var keys = Object.keys(P.airportPostcodes);
    for (var i = 0; i < codes.length; i++) {
      var code = codes[i];
      for (var k = 0; k < keys.length; k++) {
        var prefixes = P.airportPostcodes[keys[k]];
        for (var p = 0; p < prefixes.length; p++) {
          if (code === prefixes[p] || code.indexOf(prefixes[p]) === 0) {
            return keys[k];
          }
        }
      }
    }
    return null;
  }

  function findAirport(address) {
    return findInKeywords(address, P.airportKeywords) || findAirportByPostcode(address);
  }

  function findStadium(address) {
    return findInKeywords(address, P.stadiumKeywords);
  }

  function findPolo(address) {
    return findInKeywords(address, P.poloKeywords);
  }

  function findFestival(address) {
    if (!P.festivalKeywords) return null;
    return findInKeywords(address, P.festivalKeywords);
  }

  function isNonUkCountryCode(countryCode) {
    return !!(countryCode && countryCode !== 'GB');
  }

  function isInternationalLondonRoute(pickup, dropoff, meta) {
    meta = meta || {};
    var pickupLondon = isLondonArea(pickup);
    var dropoffLondon = isLondonArea(dropoff);
    if (!pickupLondon && !dropoffLondon) return false;

    var pickupCc = meta.pickupCountryCode || '';
    var dropoffCc = meta.dropoffCountryCode || '';

    if (pickupLondon && isNonUkCountryCode(dropoffCc)) return true;
    if (dropoffLondon && isNonUkCountryCode(pickupCc)) return true;
    return false;
  }

  function getVehicleKey(formValue) {
    return P.vehicleMap[String(formValue)] || null;
  }

  /**
   * Detect CCZ by postcode only — exclusions take priority over prefixes.
   * No landmark keyword fallback (client: strict TfL postcode list).
   */
  function detectCCZ(addresses) {
    var list = Array.isArray(addresses) ? addresses : [addresses];
    var prefixes = P.cczPostcodePrefixes || [];
    var exclusions = P.cczPostcodeExclusions || [];

    function matchesList(code, listArr) {
      for (var i = 0; i < listArr.length; i++) {
        var pref = listArr[i];
        if (code === pref) return true;
        if (code.indexOf(pref) !== 0) continue;
        // Next char must be a letter (e.g. W1A) — not a digit (W11 ≠ W1)
        var next = code.charAt(pref.length);
        if (!next || /[A-Z]/.test(next)) return true;
      }
      return false;
    }

    var hasInclusion = false;
    for (var a = 0; a < list.length; a++) {
      var codes = extractPostcodes(list[a]);
      for (var c = 0; c < codes.length; c++) {
        var code = codes[c];
        if (matchesList(code, exclusions)) continue;
        if (matchesList(code, prefixes)) hasInclusion = true;
      }
    }
    return hasInclusion;
  }

  function isAirportTransferAirport(airportCode) {
    var atp = P.airportTransferPricing;
    if (!atp || !atp.airports || !airportCode) return false;
    return atp.airports.indexOf(airportCode) !== -1;
  }

  /**
   * Collapse airport terminals to a single Distance Matrix reference point.
   */
  function normalizeAirportForDistance(address) {
    if (!address) return address;
    var code = findAirport(address);
    if (!isAirportTransferAirport(code)) return address;
    var atp = P.airportTransferPricing;
    var ref = atp.referencePoints && atp.referencePoints[code];
    return ref || address;
  }

  /**
   * Airport Transfer V4-fix price (report 22.07.2026 / ipro-chauffeur-calculator-v4-fix.mdc §3.1),
   * in pence incl. VAT:
   *   final_price = floorPrice[point][class] + max(0, miles - includedMiles[point][class]) × ratePerMile[class]
   * Pick-up === Drop-off — no separate drop-off branch, no CCZ, no Meet & Greet on this formula.
   * Returns null when the airport/vehicle combination is missing from the tables — callers must
   * treat this as an explicit error, never silently fall back to a generic vehicle minimum.
   */
  function calcAirportFloorPrice(airportCode, vehicle, distanceMiles) {
    var atp = P.airportTransferPricing;
    if (!atp) return null;
    var floorTable = atp.floorPrice && atp.floorPrice[airportCode];
    var includedTable = atp.includedMiles && atp.includedMiles[airportCode];
    var floor = floorTable ? floorTable[vehicle] : null;
    var included = includedTable ? includedTable[vehicle] : null;
    var rate = atp.ratePerMile ? atp.ratePerMile[vehicle] : null;
    if (floor == null || included == null || rate == null) return null;

    var miles = Math.max(0, Number(distanceMiles) || 0);
    var overageMiles = Math.max(0, miles - included);
    var pricePounds = floor + overageMiles * rate;

    return {
      pricePence: poundsToPence(pricePounds),
      floorPrice: floor,
      includedMiles: included,
      overageMiles: overageMiles,
      ratePerMile: rate
    };
  }

  function isNightPickup(pickupDateTime) {
    if (!pickupDateTime) return false;
    var d = pickupDateTime instanceof Date ? pickupDateTime : new Date(pickupDateTime);
    if (isNaN(d.getTime())) {
      // Accept "HH:mm" or "YYYY-MM-DD HH:mm"
      var m = String(pickupDateTime).match(/(\d{1,2}):(\d{2})/);
      if (!m) return false;
      var hour = parseInt(m[1], 10);
      return hour >= 23 || hour < 6;
    }
    var h = d.getHours();
    return h >= 23 || h < 6;
  }

  function calcP2PBasePence(distanceMiles, ratePence) {
    var remaining = Math.max(0, Number(distanceMiles) || 0);
    var tiers = [
      { max: 20, mult: 1.5 },
      { max: 30, mult: 1.2 },
      { max: 100, mult: 1.0 },
      { max: Infinity, mult: 0.85 }
    ];
    var total = 0;
    var breakdown = [];
    for (var i = 0; i < tiers.length && remaining > 0; i++) {
      var take = Math.min(remaining, tiers[i].max);
      var segment = Math.round(take * ratePence * tiers[i].mult);
      breakdown.push({ miles: take, multiplier: tiers[i].mult, pence: segment });
      total += segment;
      remaining -= take;
    }
    return { base: total, tierBreakdown: breakdown };
  }

  function calcHourlyBasePence(distanceMiles, durationHours, rates) {
    var hours = Math.max(1, parseInt(durationHours, 10) || 3);
    var hourlyPence = poundsToPence(rates.hourly);
    var extraMilePence = poundsToPence(rates.extraMile);
    var included = hours * (rates.includedMilesPerHour || 10);
    var miles = Math.max(0, Number(distanceMiles) || 0);
    var baseHours = hours * hourlyPence;
    var extraMiles = Math.max(0, miles - included);
    var extraMilesCharge = Math.round(extraMiles * extraMilePence);
    return {
      base: baseHours + extraMilesCharge,
      hours: hours,
      includedMiles: included,
      extraMiles: extraMiles,
      extraMilesCharge: extraMilesCharge,
      hoursCharge: baseHours
    };
  }

  /**
   * Pure pricing function (no Google Maps).
   *
   * @param {object} input
   * @param {number} input.distanceMiles
   * @param {string} input.vehicle - eclass|sclass|vclass|rangerover|bmw7
   * @param {string} input.serviceType - P2P|Hourly
   * @param {number} [input.durationHours]
   * @param {string|Date} [input.pickupDateTime]
   * @param {boolean} [input.isAirportPickup]
   * @param {boolean} [input.isAirportDropoff]
   * @param {string|null} [input.airportCode]
   * @param {boolean} [input.isCCZ]
   * @returns {object}
   */
  function calculatePrice(input) {
    input = input || {};
    var vehicle = input.vehicle;
    var rates = P.vehicleRates[vehicle];
    if (!rates) {
      return null;
    }

    var serviceType = input.serviceType === 'Hourly' ? 'Hourly' : 'P2P';
    var distanceMiles = Number(input.distanceMiles) || 0;
    var tierBreakdown = [];
    var extraMilesCharge = 0;
    var base = 0;
    var meetAndGreet = 0;
    var dropOff = 0;
    var minimumApplied = false;
    var airportCode = input.airportCode || null;
    // Gate on the pickup/dropoff flags only — NOT on isAirportTransferAirport(airportCode) —
    // so that a keyword-matched airport missing from the floor-price table (typo, future
    // addition, etc.) falls through to calcAirportFloorPrice's explicit null/error instead of
    // silently landing in the generic vehicle-minimum branch below (mdc §Фаза2, the "£55
    // default" hypothesis).
    var isAirportTransferP2P = serviceType === 'P2P'
      && (input.isAirportPickup || input.isAirportDropoff)
      && !!P.airportTransferPricing;

    if (isAirportTransferP2P) {
      // final_price is already the full retail price incl. VAT (report formula); split it back
      // into ex-VAT base + VAT for the shared pipeline below so subtotal/vat/total stay pence-exact.
      var floorCalc = calcAirportFloorPrice(airportCode, vehicle, distanceMiles);
      if (!floorCalc) return null;
      var floorVatPence = Math.round(floorCalc.pricePence * P.surcharges.vatPercent / (100 + P.surcharges.vatPercent));
      base = floorCalc.pricePence - floorVatPence;
      minimumApplied = floorCalc.overageMiles <= 0;
      tierBreakdown = [{
        type: 'airport_floor_plus_overage',
        miles: distanceMiles,
        includedMiles: floorCalc.includedMiles,
        overageMiles: floorCalc.overageMiles,
        floorPricePounds: floorCalc.floorPrice,
        ratePerMile: floorCalc.ratePerMile,
        pence: floorCalc.pricePence
      }];
    } else if (serviceType === 'Hourly') {
      var hourly = calcHourlyBasePence(distanceMiles, input.durationHours, rates);
      base = hourly.base;
      extraMilesCharge = hourly.extraMilesCharge;
      tierBreakdown = [
        { type: 'hours', hours: hourly.hours, pence: hourly.hoursCharge },
        { type: 'extraMiles', miles: hourly.extraMiles, pence: hourly.extraMilesCharge }
      ];
    } else {
      var p2p = calcP2PBasePence(distanceMiles, poundsToPence(rates.perMileP2P));
      base = p2p.base;
      tierBreakdown = p2p.tierBreakdown;
    }

    if (!isAirportTransferP2P) {
      var minimumPence = poundsToPence(rates.minimum);
      if ((input.isAirportPickup || input.isAirportDropoff) && airportCode && P.airportMinima[airportCode]) {
        var apMin = P.airportMinima[airportCode][vehicle];
        if (apMin != null) {
          minimumPence = poundsToPence(apMin);
        }
      }

      if (base < minimumPence) {
        base = minimumPence;
        minimumApplied = true;
      }

      if (input.isAirportPickup) {
        meetAndGreet = poundsToPence(P.surcharges.meetAndGreet);
      } else if (input.isAirportDropoff) {
        dropOff = poundsToPence(P.surcharges.dropOff);
      }
    }

    // CCZ removed entirely from the P2P airport-transfer formula (report 22.07.2026 item 1) —
    // it still applies to Hourly/As-Directed and City-to-City routes, which are out of scope here.
    var congestionCharge = (!isAirportTransferP2P && input.isCCZ) ? poundsToPence(P.surcharges.congestionCharge) : 0;

    var subtotalBeforeNight = base + meetAndGreet + dropOff + congestionCharge;
    var nightSurcharge = 0;
    if (isNightPickup(input.pickupDateTime)) {
      nightSurcharge = Math.round(subtotalBeforeNight * P.surcharges.nightPercent / 100);
    }

    var subtotalExVat = subtotalBeforeNight + nightSurcharge;
    var vat = Math.round(subtotalExVat * P.surcharges.vatPercent / 100);
    var total = subtotalExVat + vat;

    return {
      base: base,
      tierBreakdown: tierBreakdown,
      extraMilesCharge: extraMilesCharge,
      minimumApplied: minimumApplied,
      meetAndGreet: meetAndGreet,
      dropOff: dropOff,
      congestionCharge: congestionCharge,
      nightSurcharge: nightSurcharge,
      subtotalExVat: subtotalExVat,
      vat: vat,
      total: total,
      basePounds: penceToPounds(base),
      subtotalExVatPounds: penceToPounds(subtotalExVat),
      vatPounds: penceToPounds(vat),
      totalPounds: penceToPounds(total),
      formatted: {
        subtotal: formatPounds(subtotalExVat),
        vat: formatPounds(vat),
        total: formatPounds(total)
      }
    };
  }

  function getRouteDistanceMiles(origin, destination, stops) {
    if (!window.iproBooking || !window.iproBooking.ajaxUrl || !origin || !destination) {
      return Promise.resolve({ ok: false, error: 'missing_params' });
    }

    var normOrigin = normalizeAirportForDistance(origin);
    var normDest = normalizeAirportForDistance(destination);
    var normStops = (stops || []).map(function (s) {
      return normalizeAirportForDistance(s);
    });

    var formData = new FormData();
    formData.append('action', 'ipro_get_route_distance');
    formData.append('nonce', window.iproBooking.nonce);
    formData.append('origin', normOrigin);
    formData.append('destination', normDest);
    if (normStops.length) {
      formData.append('stops', normStops.join(' | '));
    }

    return fetch(window.iproBooking.ajaxUrl, {
      method: 'POST',
      body: formData
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json.success || !json.data) {
          return { ok: false, error: (json.data && json.data.message) || json.data || 'no_route' };
        }
        return {
          ok: true,
          distance_miles: json.data.distance_miles,
          duration_text: json.data.duration_text || '',
          cached: !!json.data.cached
        };
      })
      .catch(function (err) {
        console.error('[IproPricingEngineV4] Route distance error:', err);
        return { ok: false, error: 'network' };
      });
  }

  // Legacy single-leg helper kept for map UI compatibility
  function getDistanceMiles(origin, destination) {
    return getRouteDistanceMiles(origin, destination, []).then(function (r) {
      return r.ok ? r.distance_miles : null;
    });
  }

  function resolveAirportCode(pickup, dropoff, stops) {
    var points = [pickup].concat(stops || []).concat([dropoff]);
    for (var i = 0; i < points.length; i++) {
      var key = findAirport(points[i]);
      if (key && P.airportMinima[key]) return key;
      if (key) return key;
    }
    return findAirport(pickup) || findAirport(dropoff) || null;
  }

  function buildFormulaResult(calc, miles, method, details) {
    return {
      price: Math.round(calc.totalPounds * 100) / 100,
      priceDisplay: calc.formatted.total,
      method: method,
      contactRequired: false,
      routeNotFound: false,
      breakdown: calc,
      details: Object.assign({ miles: miles }, details || {})
    };
  }

  /**
   * Main pricing entry for booking UI.
   *
   * @param {string} serviceType - '2' hourly, '5' stadium, '6' polo, '7' festival, else P2P formula
   * @param {string} vehicleFormValue
   * @param {string} pickup
   * @param {string} dropoff
   * @param {number|null} duration
   * @param {object} [routeMeta]
   * @returns {Promise<object|null>}
   */
  function getPrice(serviceType, vehicleFormValue, pickup, dropoff, duration, routeMeta) {
    var vk = getVehicleKey(vehicleFormValue);
    if (!vk) return Promise.resolve(null);

    routeMeta = routeMeta || {};
    var stops = routeMeta.stops || [];
    var svc = String(serviceType);

    if (pickup && dropoff && isInternationalLondonRoute(pickup, dropoff, routeMeta)) {
      return Promise.resolve({
        contactRequired: true,
        method: 'international'
      });
    }

    // Stadium fixed
    if (svc === '5') {
      var stKey = findStadium(pickup) || findStadium(dropoff);
      if (stKey && P.stadiumPrices[stKey] && (isLondonArea(pickup) || isLondonArea(dropoff))) {
        var stData = P.stadiumPrices[stKey][vk];
        if (stData) {
          return Promise.resolve({
            price: stData.ow,
            priceReturn: stData.rt,
            method: 'stadium',
            details: { stadium: stKey }
          });
        }
      }
    }

    // Polo fixed
    if (svc === '6') {
      var plKey = findPolo(pickup) || findPolo(dropoff);
      if (plKey && P.poloPrices[plKey] && (isLondonArea(pickup) || isLondonArea(dropoff))) {
        var plPrice = P.poloPrices[plKey][vk];
        if (plPrice) {
          return Promise.resolve({
            price: plPrice,
            method: 'polo',
            details: { event: plKey }
          });
        }
      }
    }

    // Festival fixed
    if (svc === '7') {
      var fvKey = findFestival(pickup) || findFestival(dropoff);
      if (fvKey && P.festivalPrices[fvKey] && (isLondonArea(pickup) || isLondonArea(dropoff))) {
        var fvPrice = P.festivalPrices[fvKey][vk];
        if (fvPrice) {
          return Promise.resolve({
            price: fvPrice,
            method: 'festival',
            details: { festival: fvKey }
          });
        }
      }
    }

    // Hourly + P2P (and fallbacks for stadium/polo/festival without fixed match)
    if (!pickup || !dropoff) {
      return Promise.resolve(null);
    }

    var isHourly = svc === '2' || routeMeta.serviceType === 'hourly';
    return getRouteDistanceMiles(pickup, dropoff, stops).then(function (route) {
      if (!route.ok) {
        return {
          contactRequired: true,
          routeNotFound: true,
          method: 'no_route',
          error: route.error
        };
      }

      var airportPickup = !!findAirport(pickup);
      var airportDropoff = !!findAirport(dropoff);
      var airportCode = resolveAirportCode(pickup, dropoff, stops);
      // Prefer pickup airport for minima when present
      if (airportPickup) {
        airportCode = findAirport(pickup) || airportCode;
      } else if (airportDropoff) {
        airportCode = findAirport(dropoff) || airportCode;
      }

      var routeAddresses = [pickup].concat(stops).concat([dropoff]);
      var isCCZ = typeof routeMeta.isCCZ === 'boolean'
        ? routeMeta.isCCZ
        : detectCCZ(routeAddresses);

      var calc = calculatePrice({
        distanceMiles: route.distance_miles,
        vehicle: vk,
        serviceType: isHourly ? 'Hourly' : 'P2P',
        durationHours: duration,
        pickupDateTime: routeMeta.pickupDateTime || routeMeta.pickupTime || null,
        isAirportPickup: airportPickup,
        isAirportDropoff: airportDropoff,
        airportCode: airportCode && P.airportMinima[airportCode] ? airportCode : (airportPickup || airportDropoff ? airportCode : null),
        isCCZ: isCCZ
      });

      if (!calc) {
        // Explicit error surface (e.g. unrecognised airport/vehicle combination) — never
        // silently fall back to a generic minimum (mdc §Фаза2 / the "£55 default" hypothesis).
        return {
          contactRequired: true,
          routeNotFound: false,
          method: 'calculation_error',
          error: 'unsupported_vehicle_or_airport'
        };
      }
      return buildFormulaResult(calc, route.distance_miles, isHourly ? 'hourly_formula' : 'p2p_formula', {
        airportCode: airportCode,
        durationText: route.duration_text
      });
    });
  }

  window.IproPricingEngineV4 = {
    calculatePrice: calculatePrice,
    getPrice: getPrice,
    getDistanceMiles: getDistanceMiles,
    getRouteDistanceMiles: getRouteDistanceMiles,
    getVehicleKey: getVehicleKey,
    findAirport: findAirport,
    findStadium: findStadium,
    findPolo: findPolo,
    findFestival: findFestival,
    detectCCZ: detectCCZ,
    normalizeAirportForDistance: normalizeAirportForDistance,
    calcAirportFloorPrice: calcAirportFloorPrice,
    isAirportTransferAirport: isAirportTransferAirport,
    isNightPickup: isNightPickup,
    isInternationalLondonRoute: isInternationalLondonRoute,
    isLondonArea: isLondonArea,
    normalize: normalize,
    poundsToPence: poundsToPence,
    penceToPounds: penceToPounds
  };

  // Alias so booking steps can keep Engine = window.IproPricingEngine pattern
  window.IproPricingEngine = window.IproPricingEngineV4;
})();
