/**
 * Client booking wizard — Pricing tables for Booking V4
 * FormCraft radio values: 1=S-Class, 2=V-Class, 3=E-Class, 4=Range Rover, 5=BMW 7
 * Money in config is pounds; calculatePrice works in integer pence.
 */
(function () {
  'use strict';

  var vehicleMap = {
    '1': 'sclass',
    '2': 'vclass',
    '3': 'eclass',
    '4': 'rangerover',
    '5': 'bmw7'
  };

  var vehicleNames = {
    sclass:     'Mercedes-Benz S-Class',
    vclass:     'Mercedes-Benz V-Class',
    eclass:     'Mercedes-Benz E-Class',
    rangerover: 'Range Rover Autobiography',
    bmw7:       'BMW 7 Series'
  };

  var vehicleCapacity = {
    sclass:     { passengers: 4, largeMax: 2, smallMax: 3 },
    vclass:     { passengers: 8, largeMax: 7, smallMax: 12 },
    eclass:     { passengers: 4, largeMax: 3, smallMax: 4 },
    rangerover: { passengers: 4, largeMax: 3, smallMax: 4 },
    bmw7:       { passengers: 4, largeMax: 3, smallMax: 4 }
  };

  var luggageMatrix = {
    sclass: { 0: 3, 1: 2, 2: 0 },
    eclass: { 0: 4, 1: 4, 2: 2, 3: 0 },
    rangerover: { 0: 4, 1: 4, 2: 2, 3: 0 },
    bmw7: { 0: 4, 1: 4, 2: 2, 3: 0 },
    vclass: { 0: 12, 1: 10, 2: 8, 3: 6, 4: 4, 5: 4, 6: 4, 7: 2 }
  };

  // §6 — rates in pounds
  var vehicleRates = {
    eclass:     { hourly: 55,  includedMilesPerHour: 10, extraMile: 3.36, perMileP2P: 2.80, minimum: 55 },
    sclass:     { hourly: 70,  includedMilesPerHour: 10, extraMile: 4.20, perMileP2P: 3.50, minimum: 115 },
    vclass:     { hourly: 70,  includedMilesPerHour: 10, extraMile: 3.84, perMileP2P: 3.20, minimum: 70 },
    rangerover: { hourly: 100, includedMilesPerHour: 10, extraMile: 6.00, perMileP2P: 5.00, minimum: 100 },
    bmw7:       { hourly: 65,  includedMilesPerHour: 10, extraMile: 3.84, perMileP2P: 3.20, minimum: 65 }
  };

  // §4 — airport base minima (ex M&G, ex VAT) in pounds.
  // Used ONLY by the Hourly/As-Directed airport-pickup branch (calculatePrice's
  // generic fallback below) — NOT by the P2P airport-transfer formula, which
  // uses airportTransferPricing.floorPrice instead. Do not remove as "dead code".
  var airportMinima = {
    londoncity: { sclass: 115, eclass: 80,  vclass: 110, rangerover: 190, bmw7: 110 },
    heathrow:   { sclass: 115, eclass: 80,  vclass: 105, rangerover: 190, bmw7: 105 },
    gatwick:    { sclass: 183, eclass: 133, vclass: 183, rangerover: 255, bmw7: 175 },
    luton:      { sclass: 183, eclass: 133, vclass: 183, rangerover: 255, bmw7: 175 },
    stansted:   { sclass: 192, eclass: 143, vclass: 192, rangerover: 270, bmw7: 183 }
  };

  var airportKeywords = {
    heathrow:    ['heathrow', 'lhr'],
    gatwick:     ['gatwick', 'lgw'],
    stansted:    ['stansted', 'stn'],
    luton:       ['luton', 'ltn'],
    londoncity:  ['london city airport', 'lcy', 'london city'],
    southend:    ['southend', 'sen'],
    bigginhill:  ['biggin hill'],
    farnborough: ['farnborough'],
    rafnortholt: ['raf northolt', 'northolt']
  };

  // Postcode prefixes for airport auto-detect (§5)
  var airportPostcodes = {
    heathrow:   ['TW6'],
    gatwick:    ['RH6'],
    stansted:   ['CM24'],
    luton:      ['LU2'],
    londoncity: ['E16'],
    southend:   ['SS2'],
    bigginhill: ['TN16']
  };

  // CCZ — TfL congestion zone postcodes (SE1 whole district; E1 excluded per client)
  var cczPostcodePrefixes = [
    'W1', 'WC1', 'WC2',
    'EC1', 'EC2', 'EC3', 'EC4',
    'SW1A', 'SW1V', 'SW1W', 'SW1Y',
    'SE1'
  ];

  var cczPostcodeExclusions = [
    'SW1X', 'SW3', 'SW7', 'W8', 'W11', 'W2', 'E14'
  ];

  // Airport Transfer pricing V4-fix (report 22.07.2026 / ipro-chauffeur-calculator-v4-fix.mdc §3).
  // Formula: final_price = floorPrice[point][class] + max(0, miles - includedMiles[point][class]) × ratePerMile[class].
  // Pick-up === Drop-off (no separate drop-off logic). No CCZ, no Meet & Greet surcharge on this formula.
  var airportTransferPricing = {
    airports: [
      'heathrow', 'gatwick', 'bigginhill', 'londoncity', 'farnborough',
      'luton', 'rafnortholt', 'southend', 'stansted'
    ],
    referencePoints: {
      heathrow: 'Heathrow Airport, Longford, Hounslow TW6 1QG, UK',
      gatwick: 'Gatwick Airport, Horley, Gatwick RH6 0NP, UK',
      bigginhill: 'London Biggin Hill Airport, Bromley TN16 3BH, UK',
      londoncity: 'London City Airport, Royal Docks, London E16 2PX, UK',
      farnborough: 'Farnborough Airport, Farnborough GU14 6XA, United Kingdom',
      luton: 'London Luton Airport, Luton LU2 9LY, UK',
      // Verify against a live source before go-live — no confirmed address found in the codebase.
      rafnortholt: 'RAF Northolt, West End Road, Ruislip, London HA4 6NG, UK',
      southend: 'London Southend Airport, Southend-on-Sea SS2 6YF, UK',
      stansted: 'London Stansted Airport, Stansted CM24 1QW, UK'
    },
    floorPrice: {
      heathrow:    { sclass: 160, eclass: 120, vclass: 160, rangerover: 250, bmw7: 150 },
      gatwick:     { sclass: 240, eclass: 180, vclass: 240, rangerover: 330, bmw7: 230 },
      bigginhill:  { sclass: 240, eclass: 180, vclass: 240, rangerover: 330, bmw7: 230 },
      londoncity:  { sclass: 160, eclass: 120, vclass: 160, rangerover: 250, bmw7: 150 },
      farnborough: { sclass: 240, eclass: 180, vclass: 240, rangerover: 330, bmw7: 230 },
      luton:       { sclass: 240, eclass: 180, vclass: 240, rangerover: 330, bmw7: 230 },
      rafnortholt: { sclass: 160, eclass: 120, vclass: 160, rangerover: 250, bmw7: 150 },
      southend:    { sclass: 250, eclass: 190, vclass: 250, rangerover: 350, bmw7: 240 },
      stansted:    { sclass: 250, eclass: 190, vclass: 250, rangerover: 350, bmw7: 240 }
    },
    // Report gives one included-miles pair per airport (LHR 16/18, LGW 30/39) without a
    // per-class split. LHR E-Class=16 is confirmed by two worked examples in the report
    // (Ilford 18.5mi→£135, Romford ~22mi→£158); the other 4 classes take the higher number
    // by analogy. LGW follows the same pattern (unconfirmed by a worked example — flag for
    // client verification during QA). Single-value airports use one number for all classes.
    includedMiles: {
      heathrow:    { sclass: 18, eclass: 16, vclass: 18, rangerover: 18, bmw7: 18 },
      gatwick:     { sclass: 39, eclass: 30, vclass: 39, rangerover: 39, bmw7: 39 },
      bigginhill:  { sclass: 19, eclass: 19, vclass: 19, rangerover: 19, bmw7: 19 },
      londoncity:  { sclass: 11, eclass: 11, vclass: 11, rangerover: 11, bmw7: 11 },
      farnborough: { sclass: 34, eclass: 34, vclass: 34, rangerover: 34, bmw7: 34 },
      luton:       { sclass: 34, eclass: 34, vclass: 34, rangerover: 34, bmw7: 34 },
      rafnortholt: { sclass: 13, eclass: 13, vclass: 13, rangerover: 13, bmw7: 13 },
      southend:    { sclass: 44, eclass: 44, vclass: 44, rangerover: 44, bmw7: 44 },
      stansted:    { sclass: 41, eclass: 41, vclass: 41, rangerover: 41, bmw7: 41 }
    },
    ratePerMile: {
      eclass: 6.18,
      bmw7: 7.79,
      sclass: 9.39,
      vclass: 9.39,
      rangerover: 11.71
    }
  };

  // meetAndGreet/dropOff below are used ONLY by the Hourly/As-Directed airport-pickup
  // branch in calculatePrice() — the P2P airport-transfer formula never reads them.
  var surcharges = {
    meetAndGreet: 21,
    dropOff: 7,
    congestionCharge: 3.00,
    nightPercent: 25,
    vatPercent: 20
  };

  // Stadium / Polo / Festival — same fixed tables as v3 (out of TZ formula scope)
  var stadiumPrices = {
    wembley:        { sclass: {ow:170, rt:350},  vclass: {ow:170, rt:350},  eclass: {ow:120, rt:275},  rangerover: {ow:250, rt:500},  bmw7: {ow:150, rt:325} },
    anfield:        { sclass: {ow:880, rt:1320}, vclass: {ow:880, rt:1320}, eclass: {ow:680, rt:1020}, rangerover: {ow:1000,rt:1500}, bmw7: {ow:800, rt:1200} },
    oldtrafford:    { sclass: {ow:850, rt:1275}, vclass: {ow:850, rt:1275}, eclass: {ow:650, rt:975},  rangerover: {ow:990, rt:1485}, bmw7: {ow:790, rt:1185} },
    villapark:      { sclass: {ow:480, rt:720},  vclass: {ow:480, rt:720},  eclass: {ow:340, rt:510},  rangerover: {ow:650, rt:975},  bmw7: {ow:450, rt:675} },
    goodisonpark:   { sclass: {ow:880, rt:1320}, vclass: {ow:880, rt:1320}, eclass: {ow:680, rt:1020}, rangerover: {ow:1000,rt:1500}, bmw7: {ow:800, rt:1200} },
    tottenham:      { sclass: {ow:170, rt:350},  vclass: {ow:170, rt:350},  eclass: {ow:120, rt:275},  rangerover: {ow:250, rt:500},  bmw7: {ow:150, rt:325} },
    londonstadium:  { sclass: {ow:170, rt:350},  vclass: {ow:170, rt:350},  eclass: {ow:120, rt:275},  rangerover: {ow:250, rt:500},  bmw7: {ow:150, rt:325} },
    emirates:       { sclass: {ow:170, rt:350},  vclass: {ow:170, rt:350},  eclass: {ow:120, rt:275},  rangerover: {ow:250, rt:500},  bmw7: {ow:150, rt:325} },
    stjamespark:    { sclass: {ow:1010,rt:1515}, vclass: {ow:1010,rt:1515}, eclass: {ow:830, rt:1245}, rangerover: {ow:1350,rt:2025}, bmw7: {ow:920, rt:1380} },
    stamfordbridge: { sclass: {ow:170, rt:350},  vclass: {ow:170, rt:350},  eclass: {ow:120, rt:275},  rangerover: {ow:250, rt:500},  bmw7: {ow:150, rt:325} },
    loftusroad:     { sclass: {ow:1300,rt:1950}, vclass: {ow:1300,rt:1950}, eclass: {ow:985, rt:1477}, rangerover: {ow:1700,rt:2550}, bmw7: {ow:1200,rt:1800} },
    etihad:         { sclass: {ow:850, rt:1275}, vclass: {ow:850, rt:1275}, eclass: {ow:650, rt:975},  rangerover: {ow:990, rt:1485}, bmw7: {ow:790, rt:1185} },
    kingpower:      { sclass: {ow:470, rt:705},  vclass: {ow:470, rt:705},  eclass: {ow:330, rt:495},  rangerover: {ow:640, rt:960},  bmw7: {ow:440, rt:660} }
  };

  // Bare single-word aliases removed for venues whose team/stadium nickname collides
  // with an ordinary London place name (report 22.07.2026 bug: LHR -> St James's
  // Square, a normal Westminster address, was priced as a transfer to St James'
  // Park in Newcastle — £830 instead of ~£135). Array entries are AND groups (all
  // substrings must be present) so the venue can still be matched unambiguously
  // when the city name is present, without false-positiving on the London place
  // name alone. See findInKeywords()/keywordMatches() in ipro-pricing-engine-v4.js.
  var stadiumKeywords = {
    wembley:        ['wembley'],
    anfield:        ['anfield'],
    oldtrafford:    ['old trafford'],
    villapark:      ['villa park'],
    goodisonpark:   ['goodison park'],
    tottenham:      ['tottenham hotspur', 'tottenham stadium'],
    londonstadium:  ['london stadium', 'olympic stadium'],
    emirates:       ['emirates stadium', ['arsenal', 'stadium']],
    stjamespark:    [['st james', 'newcastle'], ['st. james', 'newcastle'], 'newcastle united', 'nufc'],
    stamfordbridge: ['stamford bridge', ['chelsea', 'stadium']],
    loftusroad:     ['loftus road', 'qpr'],
    etihad:         ['etihad', 'manchester city'],
    kingpower:      ['king power', 'leicester']
  };

  var poloPrices = {
    chestertonspark: { sclass: 170, vclass: 170, eclass: 120, rangerover: 250, bmw7: 150 },
    cartierqueens:   { sclass: 170, vclass: 170, eclass: 120, rangerover: 250, bmw7: 150 },
    royalwindsor:    { sclass: 170, vclass: 170, eclass: 120, rangerover: 250, bmw7: 150 },
    archiedavid:     { sclass: 170, vclass: 170, eclass: 120, rangerover: 250, bmw7: 150 },
    hampoloclub:     { sclass: 135, vclass: 135, eclass: 90,  rangerover: 220, bmw7: 130 },
    royalascot:      { sclass: 220, vclass: 220, eclass: 150, rangerover: 290, bmw7: 190 }
  };

  var poloKeywords = {
    chestertonspark: ['chestertons polo', 'polo in the park'],
    cartierqueens:   ['cartier', "queen's cup"],
    royalwindsor:    ['royal windsor cup'],
    archiedavid:     ['archie david'],
    hampoloclub:     ['ham polo'],
    royalascot:      ['royal ascot', 'ascot racecourse']
  };

  var festivalPrices = {
    'formula-1-silverstone':              { sclass: 450, vclass: 450, eclass: 365, rangerover: 620, bmw7: 425 },
    'goodwood-festival-of-speed':         { sclass: 320, vclass: 320, eclass: 260, rangerover: 440, bmw7: 300 },
    'cheltenham-festival':                { sclass: 420, vclass: 420, eclass: 340, rangerover: 580, bmw7: 395 },
    'royal-ascot':                        { sclass: 220, vclass: 220, eclass: 150, rangerover: 290, bmw7: 190 },
    'guards-polo-club-masters-polo':      { sclass: 200, vclass: 200, eclass: 160, rangerover: 275, bmw7: 185 },
    'farnborough-international-air-show': { sclass: 240, vclass: 240, eclass: 195, rangerover: 330, bmw7: 230 },
    'henley-festival':                    { sclass: 260, vclass: 260, eclass: 210, rangerover: 355, bmw7: 245 },
    'london-fashion-week':                { sclass: 95,  vclass: 95,  eclass: 85,  rangerover: 130, bmw7: 90  },
    'rhs-chelsea-flower-show':            { sclass: 110, vclass: 110, eclass: 95,  rangerover: 150, bmw7: 105 },
    'twickenham-stadium':                 { sclass: 130, vclass: 130, eclass: 110, rangerover: 175, bmw7: 125 },
    'wimbledon-tennis':                   { sclass: 125, vclass: 125, eclass: 105, rangerover: 170, bmw7: 120 }
  };

  var festivalKeywords = {
    'formula-1-silverstone':              ['silverstone circuit', 'silverstone grand prix', 'f1 silverstone', 'formula 1 silverstone', 'formula one silverstone', 'silverstone, northamptonshire'],
    'goodwood-festival-of-speed':         ['goodwood festival', 'goodwood festival of speed', 'goodwood revival', 'goodwood, chichester'],
    'cheltenham-festival':                ['cheltenham racecourse', 'cheltenham festival'],
    'royal-ascot':                        ['royal ascot racecourse', 'royal ascot festival', 'ascot races', 'royal ascot, berkshire'],
    'guards-polo-club-masters-polo':      ["guards polo club", "smith's lawn", 'masters polo windsor'],
    'farnborough-international-air-show': ['farnborough international airshow', 'farnborough air show', 'farnborough airshow'],
    'henley-festival':                    ['henley festival', 'henley on thames festival', 'henley arts festival'],
    'london-fashion-week':                ['london fashion week', 'fashion week london', 'lfw'],
    'rhs-chelsea-flower-show':            ['chelsea flower show', 'rhs chelsea', 'royal horticultural'],
    'twickenham-stadium':                 ['twickenham stadium', 'twickenham rugby', 'england rugby twickenham'],
    'wimbledon-tennis':                   ['wimbledon tennis', 'all england club', 'wimbledon championships', 'the championships wimbledon']
  };

  window.IPRO_PRICING_V4 = {
    vehicleMap: vehicleMap,
    vehicleNames: vehicleNames,
    vehicleCapacity: vehicleCapacity,
    luggageMatrix: luggageMatrix,
    vehicleRates: vehicleRates,
    airportMinima: airportMinima,
    airportKeywords: airportKeywords,
    airportPostcodes: airportPostcodes,
    cczPostcodePrefixes: cczPostcodePrefixes,
    cczPostcodeExclusions: cczPostcodeExclusions,
    airportTransferPricing: airportTransferPricing,
    surcharges: surcharges,
    stadiumPrices: stadiumPrices,
    stadiumKeywords: stadiumKeywords,
    poloPrices: poloPrices,
    poloKeywords: poloKeywords,
    festivalPrices: festivalPrices,
    festivalKeywords: festivalKeywords
  };
})();
