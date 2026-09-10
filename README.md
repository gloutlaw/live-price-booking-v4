# Client booking wizard

Source snapshot of a multi-step chauffeur booking wizard (template **Booking V4**). Developed in this folder only — not a deploy back to any live site.

This is not a standalone app. The JS pricing engine can be read and changed on its own; the PHP layer still expects WordPress (`admin-ajax.php`, `wp_mail`, transients, Polylang).

## Layout

```
booking-v4/
  README.md
  .env.example
  src/
    page-booking-v4.php          # 4-step wizard markup
    assets/js/
      ipro-pricing-data-v4.js    # tariffs, airport floors, keywords
      ipro-pricing-engine-v4.js  # calculatePrice() in pence + route AJAX
      ipro-booking-steps-v4.js   # UI, Places, validation, checkout
      booking-analytics.js       # funnel tracker client
    assets/css/                  # booking-v3 base + v4 overrides
    assets/images/               # step icons
    assets/icons/booking-form/
    uploads/2025/05/             # vehicle photos used by the template
    includes/                    # i18n, countries, Directions helpers
    php/functions-booking-v4.php # enqueue + AJAX + mail (from functions.php)
    plugins/ipro-booking-analytics/
```

Original theme paths (for orientation only):

- Template: `wp-content/themes/hello-elementor/page-booking-v4.php`
- Enqueue / AJAX: `wp-content/themes/hello-elementor/functions.php`
- Plugin: `wp-content/plugins/ipro-booking-analytics/`

## How it works

```
page-booking-v4.php
        │
        ▼
ipro-booking-steps-v4.js  ──►  ipro-pricing-engine-v4.js
                                      │
                                      ▼
                            ipro-pricing-data-v4.js
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
         ipro_get_route_distance  ipro_validate_flight  ipro_submit_booking
         (Google Directions /     (AeroDataBox)         (wp_mail + Turnstile)
          Distance Matrix)
```

Steps:

1. Ride info — pickup, stops, destination, One Way / Hourly, date & time, map
2. Vehicle — live quote per class (VAT included)
3. Contact details — passenger, add-ons, terms, checkout
4. Confirmation placeholder / thank-you after submit

Pricing is integer pence. Airport P2P uses floor + extra-mile tables; hourly uses included miles per hour. Multi-leg distance picks the **shortest** Directions alternative (not the fastest).

## AJAX actions

| Action | Role |
| --- | --- |
| `ipro_get_route_distance` | Miles + duration for pickup → stops → destination |
| `ipro_get_distance` | Legacy single-leg Distance Matrix (kept in the extract) |
| `ipro_validate_flight` | Optional flight lookup |
| `ipro_submit_booking` | Turnstile, validation, operator + customer emails |

Nonce: `ipro_distance_nonce`. Localized objects: `iproBooking`, `iproBookingL10n`.

## Config

See `.env.example`. On WordPress these are PHP constants (historically in `wp-config.php`), not a committed `.env`.

Mail recipients in this snapshot are **not** hardcoded: `BOOKING_MAIL_TO` / `BOOKING_MAIL_BCC`.

Phone, WhatsApp, Instagram and Telegram in the template and emails are placeholders (`+44 0000 000 000`, `@client-booking`), not live client contacts.

## What was left out

- Theme header/footer and global `style.css`
- Booking V2 / V3 wizards and their pricing JS
- Plugin `ipro-booking-ajax` (v4 calls `functions.php`, not that plugin)
- API keys, Turnstile secrets, real mailbox addresses

## Working on it here

Change tariffs in `src/assets/js/ipro-pricing-data-v4.js`. Change formulas in `src/assets/js/ipro-pricing-engine-v4.js`. Change the wizard in `src/assets/js/ipro-booking-steps-v4.js` and `src/page-booking-v4.php`.

To run it as a page you still need a WordPress theme that loads the template, CSS/JS enqueue from `src/php/functions-booking-v4.php`, and the includes. That port is a separate step — this folder is the source of truth for the wizard from now on.
