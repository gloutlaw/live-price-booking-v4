(function ($) {
  'use strict';

  var charts = {};
  var currentPeriod = '1m';
  var currentLang = localStorage.getItem('ipro_ba_lang') || 'en';
  var T = (iproBA.i18n && iproBA.i18n[currentLang]) ? iproBA.i18n[currentLang] : iproBA.i18n['en'];
  var COLORS = [
    '#ff9800', '#5c6bc0', '#26a69a', '#ef5350', '#ab47bc',
    '#42a5f5', '#66bb6a', '#ffa726', '#78909c', '#ec407a'
  ];

  function applyLang(lang) {
    currentLang = lang;
    T = (iproBA.i18n && iproBA.i18n[lang]) ? iproBA.i18n[lang] : iproBA.i18n['en'];
    localStorage.setItem('ipro_ba_lang', lang);

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (T[key] !== undefined) el.textContent = T[key];
    });

    document.querySelectorAll('.ipro-ba-lang-btn').forEach(function (btn) {
      btn.classList.toggle('ipro-ba-lang-btn--active', btn.getAttribute('data-lang') === lang);
    });
  }

  function fetchV2(params) {
    return $.ajax({
      url: iproBA.apiUrl + 'stats-v2?' + $.param(params),
      method: 'GET',
      beforeSend: function (xhr) {
        xhr.setRequestHeader('X-WP-Nonce', iproBA.nonce);
      }
    });
  }

  function formatDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    return String(d.getDate()).padStart(2, '0') + ' ' + d.toLocaleString('en-US', { month: 'short' });
  }

  function formatSeconds(s) {
    if (!s || s <= 0) return '\u2014';
    var m = Math.floor(s / 60);
    var sec = s % 60;
    if (m > 0) return m + 'm ' + sec + 's';
    return sec + 's';
  }

  function destroyChart(key) {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  }

  function buildTable(headers, rows) {
    var html = '<table class="ipro-ba-table"><thead><tr>';
    headers.forEach(function (h) { html += '<th>' + h + '</th>'; });
    html += '</tr></thead><tbody>';
    if (rows.length === 0) {
      html += '<tr><td colspan="' + headers.length + '" style="text-align:center;color:#999;">' + T.noData + '</td></tr>';
    } else {
      rows.forEach(function (row) {
        html += '<tr>';
        row.forEach(function (cell) { html += '<td>' + cell + '</td>'; });
        html += '</tr>';
      });
    }
    html += '</tbody></table>';
    return html;
  }

  function updateDashboard(data) {
    var f = data.funnel;

    // KPIs
    $('#kpi-views').text(f.views);
    $('#kpi-step2').text(f.step2);
    $('#kpi-submissions').text(f.submissions);
    $('#kpi-conversion').text(f.conversion + '%');
    $('#kpi-avg-time').text(formatSeconds(data.avg_time_seconds));
    $('#kpi-bounce').text(f.bounce_rate + '%');

    renderFunnel(f);
    renderDailyChart(data.daily);

    renderDoughnut('ipro-ba-devices-chart', 'devices',
      data.devices.map(function (d) { return d.device_type || 'unknown'; }),
      data.devices.map(function (d) { return parseInt(d.cnt); })
    );

    renderDoughnut('ipro-ba-browsers-chart', 'browsers',
      data.browsers.map(function (d) { return d.browser; }),
      data.browsers.map(function (d) { return parseInt(d.cnt); })
    );

    renderBarH('ipro-ba-vehicles-chart', 'vehicles',
      data.vehicles.map(function (d) { return d.vname || d.vkey; }),
      data.vehicles.map(function (d) { return parseInt(d.cnt); }),
      '#ff9800'
    );

    var stLabels = data.service_types.map(function (d) {
      return d.stype === 'hourly' ? T.hourly : T.singleTrip;
    });
    var stData = data.service_types.map(function (d) { return parseInt(d.cnt); });
    renderDoughnut('ipro-ba-service-chart', 'service', stLabels, stData);

    renderHoursChart(data.pickup_hours);

    renderDoughnut('ipro-ba-languages-chart', 'languages',
      data.languages.map(function (d) { return d.lang; }),
      data.languages.map(function (d) { return parseInt(d.cnt); })
    );

    var sourceRows = data.sources.map(function (s) {
      return [escapeHtml(s.source), s.sessions];
    });
    $('#ipro-ba-sources').html(buildTable([T.source, T.sessions], sourceRows));

    var campRows = data.campaigns.map(function (c) {
      var label = [c.utm_source, c.utm_medium, c.utm_campaign].filter(Boolean).join(' / ');
      return [escapeHtml(label), c.sessions];
    });
    $('#ipro-ba-campaigns').html(buildTable([T.campaign, T.sessions], campRows));

    var routeRows = data.routes.map(function (r) {
      return [escapeHtml(r.pickup_city || '\u2014'), escapeHtml(r.dropoff_city || '\u2014'), r.cnt];
    });
    $('#ipro-ba-routes').html(buildTable([T.pickup, T.dropoff, T.count], routeRows));

    renderFieldsChart(data.field_interactions, f.views);
    renderFormVersionSplit(data.form_versions || {});
  }

  function renderFormVersionSplit(versions) {
    var v2 = versions.v2 || { views: 0, submissions: 0 };
    var v3 = versions.v3 || { views: 0, submissions: 0 };
    var cards = [
      { label: T.formV2, data: v2, color: '#5c6bc0' },
      { label: T.formV3, data: v3, color: '#ff9800' }
    ];

    var html = '';
    cards.forEach(function (card) {
      html += '<div class="ipro-ba-version-card">' +
        '<div class="ipro-ba-version-card__label">' + escapeHtml(card.label) + '</div>' +
        '<div class="ipro-ba-version-card__metrics">' +
          '<span><strong>' + card.data.views + '</strong> ' + T.views + '</span>' +
          '<span><strong>' + card.data.submissions + '</strong> ' + T.submissions + '</span>' +
        '</div>' +
        '<div class="ipro-ba-version-card__bar"><span style="width:100%;background:' + card.color + '"></span></div>' +
      '</div>';
    });

    $('#ipro-ba-version-split').html(html);
  }

  /* ── Funnel ── */

  function renderFunnel(f) {
    var steps = [
      { label: T.funnelStepViews, value: f.views, pct: 100 },
      { label: T.funnelStep2, value: f.step2, pct: f.views > 0 ? Math.round(f.step2 / f.views * 100) : 0 },
      { label: T.funnelSubmitted, value: f.submissions, pct: f.views > 0 ? Math.round(f.submissions / f.views * 100) : 0 }
    ];

    var html = '';
    steps.forEach(function (s, i) {
      var width = Math.max(s.pct, 8);
      var dropoff = '';
      if (i > 0) {
        var prev = steps[i - 1].value;
        var lost = prev - s.value;
        var lostPct = prev > 0 ? Math.round(lost / prev * 100) : 0;
        dropoff = '<span class="ipro-ba-funnel__drop">\u2193 ' + lost + ' ' + T.lost + ' (' + lostPct + '%)</span>';
      }
      html += '<div class="ipro-ba-funnel__step">' +
        '<div class="ipro-ba-funnel__bar" style="width:' + width + '%;background:' + COLORS[i] + '">' +
          '<span class="ipro-ba-funnel__val">' + s.value + '</span>' +
        '</div>' +
        '<div class="ipro-ba-funnel__meta">' +
          '<span class="ipro-ba-funnel__label">' + s.label + ' (' + s.pct + '%)</span>' +
          dropoff +
        '</div>' +
      '</div>';
    });

    $('#ipro-ba-funnel').html(html);
  }

  /* ── Daily Chart ── */

  function renderDailyChart(daily) {
    var labels = daily.map(function (d) { return formatDate(d.date); });
    var views = daily.map(function (d) { return d.views; });
    var step2 = daily.map(function (d) { return d.step2; });
    var subs = daily.map(function (d) { return d.submissions; });

    destroyChart('daily');

    var ctx = document.getElementById('ipro-ba-chart').getContext('2d');
    charts.daily = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: T.views,
            data: views,
            borderColor: '#ff9800',
            backgroundColor: 'rgba(255, 152, 0, 0.10)',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
            pointHoverRadius: 5,
            borderWidth: 2
          },
          {
            label: T.step2Label,
            data: step2,
            borderColor: '#26a69a',
            backgroundColor: 'rgba(38, 166, 154, 0.10)',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
            pointHoverRadius: 5,
            borderWidth: 2
          },
          {
            label: T.submissions,
            data: subs,
            borderColor: '#5c6bc0',
            backgroundColor: 'rgba(92, 107, 192, 0.10)',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
            pointHoverRadius: 5,
            borderWidth: 2
          }
        ]
      },
      options: chartLineOptions()
    });
  }

  function chartLineOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'bottom', labels: { usePointStyle: true, padding: 20 } },
        tooltip: { backgroundColor: '#333', titleFont: { size: 13 }, bodyFont: { size: 12 }, padding: 10, cornerRadius: 4 }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 20, font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: '#f0f0f0' }, ticks: { precision: 0, font: { size: 11 } } }
      }
    };
  }

  /* ── Doughnut ── */

  function renderDoughnut(canvasId, key, labels, data) {
    destroyChart(key);
    var ctx = document.getElementById(canvasId);
    if (!ctx) return;

    var bgColors = labels.map(function (_, i) { return COLORS[i % COLORS.length]; });

    charts[key] = new Chart(ctx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: bgColors,
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '55%',
        plugins: {
          legend: { position: 'bottom', labels: { padding: 14, font: { size: 12 } } },
          tooltip: { backgroundColor: '#333', padding: 8, cornerRadius: 4 }
        }
      }
    });
  }

  /* ── Horizontal Bar ── */

  function renderBarH(canvasId, key, labels, data, color) {
    destroyChart(key);
    var ctx = document.getElementById(canvasId);
    if (!ctx) return;

    charts[key] = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: color || '#ff9800',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#333', padding: 8, cornerRadius: 4 } },
        scales: {
          x: { beginAtZero: true, grid: { color: '#f5f5f5' }, ticks: { precision: 0, font: { size: 11 } } },
          y: { grid: { display: false }, ticks: { font: { size: 12 } } }
        }
      }
    });
  }

  /* ── Pickup Hours ── */

  function renderHoursChart(hoursArr) {
    destroyChart('hours');
    var ctx = document.getElementById('ipro-ba-hours-chart');
    if (!ctx) return;

    var labels = [];
    for (var h = 0; h < 24; h++) labels.push(String(h).padStart(2, '0') + ':00');

    charts.hours = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: T.bookings,
          data: hoursArr,
          backgroundColor: '#42a5f5',
          borderRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#333', padding: 8, cornerRadius: 4 } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
          y: { beginAtZero: true, grid: { color: '#f5f5f5' }, ticks: { precision: 0, font: { size: 11 } } }
        }
      }
    });
  }

  /* ── Field Interactions (drop-off) ── */

  function renderFieldsChart(fields, totalViews) {
    destroyChart('fields');
    var ctx = document.getElementById('ipro-ba-fields-chart');
    if (!ctx || !fields || fields.length === 0) return;

    var fieldLabels = {
      'booking-pickup': 'Pickup',
      'booking-dropoff': 'Drop-off',
      'booking-name': 'Name',
      'booking-phone-number': 'Phone',
      'booking-email': 'Email',
      'booking-date': 'Date',
      'booking-hours': 'Hours',
      'booking-minutes': 'Minutes',
      'booking-passengers': 'Passengers',
      'booking-small-bags': 'Small Bags',
      'booking-large-bags': 'Large Bags',
      'booking-comments': 'Comments',
      'booking-country': 'Country',
      'booking-flight': 'Flight Number',
      'booking-duration': 'Duration'
    };

    var labels = fields.map(function (f) { return fieldLabels[f.field_id] || f.field_id; });
    var data = fields.map(function (f) { return parseInt(f.sessions); });

    charts.fields = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: T.sessionsInteracted,
          data: data,
          backgroundColor: '#26a69a',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#333', padding: 8, cornerRadius: 4 } },
        scales: {
          x: { beginAtZero: true, grid: { color: '#f5f5f5' }, ticks: { precision: 0, font: { size: 11 } } },
          y: { grid: { display: false }, ticks: { font: { size: 12 } } }
        }
      }
    });
  }

  /* ── Helpers ── */

  function escapeHtml(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  /* ── Load ── */

  function load(period, from, to) {
    var params = {};
    if (from && to) {
      params.from = from;
      params.to = to;
    } else {
      params.period = period;
    }

    fetchV2(params).done(updateDashboard).fail(function () {
      console.error('[BA] Failed to load analytics data');
    });
  }

  /* ── Init ── */

  $(function () {
    applyLang(currentLang);
    load(currentPeriod);

    $(document).on('click', '.ipro-ba-lang-btn', function () {
      applyLang($(this).data('lang'));
      load(currentPeriod);
    });

    $(document).on('click', '.ipro-ba-period', function () {
      var $btn = $(this);
      var period = $btn.data('period');

      $('.ipro-ba-period').removeClass('ipro-ba-period--active');
      $btn.addClass('ipro-ba-period--active');

      if (period === 'custom') {
        $('#ipro-ba-custom-range').show();
        return;
      }

      $('#ipro-ba-custom-range').hide();
      currentPeriod = period;
      load(period);
    });

    $('#ipro-ba-apply-range').on('click', function () {
      var from = $('#ipro-ba-from').val();
      var to = $('#ipro-ba-to').val();
      if (from && to) load('custom', from, to);
    });

    $('#ipro-ba-disable').on('change', function () {
      $.ajax({
        url: iproBA.apiUrl + 'toggle',
        method: 'POST',
        data: { disabled: this.checked ? 1 : 0 },
        beforeSend: function (xhr) { xhr.setRequestHeader('X-WP-Nonce', iproBA.nonce); }
      });
    });
  });

})(jQuery);
