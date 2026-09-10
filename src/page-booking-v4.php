<?php
/*
 Template Name: Booking V4
*/

$lang_slug   = function_exists('pll_current_language') ? pll_current_language() : 'en';
$lang_locale = function_exists('pll_current_language') ? pll_current_language('locale') : get_locale();
$dir_attr    = ($lang_slug === 'ar') ? 'rtl' : 'ltr';

$vehicles = [
  [
    'key'        => 'sclass',
    'value'      => '1',
    'name'       => __('Mercedes-Benz S-Class', 'hello-elementor'),
    'tagline'    => __('Luxury sedan', 'hello-elementor'),
    'passengers' => 3,
    'large_bags' => 2,
    'small_bags' => 3,
    'image'      => '/wp-content/uploads/2025/05/s-class.webp',
    'min_price'  => 115,
  ],
  [
    'key'        => 'vclass',
    'value'      => '2',
    'name'       => __('Mercedes-Benz V-Class', 'hello-elementor'),
    'tagline'    => __('XL class van', 'hello-elementor'),
    'passengers' => 8,
    'large_bags' => 7,
    'small_bags' => 12,
    'image'      => '/wp-content/uploads/2025/05/v-class.webp',
    'min_price'  => 70,
  ],
  [
    'key'        => 'eclass',
    'value'      => '3',
    'name'       => __('Mercedes-Benz E-Class', 'hello-elementor'),
    'tagline'    => __('Business class', 'hello-elementor'),
    'passengers' => 3,
    'large_bags' => 3,
    'small_bags' => 4,
    'image'      => '/wp-content/uploads/2025/05/e-class.webp',
    'min_price'  => 55,
  ],
  [
    'key'        => 'rangerover',
    'value'      => '4',
    'name'       => __('Range Rover Autobiography', 'hello-elementor'),
    'tagline'    => __('Luxury SUV', 'hello-elementor'),
    'passengers' => 4,
    'large_bags' => 4,
    'small_bags' => 4,
    'image'      => '/wp-content/uploads/2025/05/range-rover.webp',
    'min_price'  => 100,
  ],
  [
    'key'        => 'bmw7',
    'value'      => '5',
    'name'       => __('BMW 7 Series', 'hello-elementor'),
    'tagline'    => __('Luxury sedan', 'hello-elementor'),
    'passengers' => 3,
    'large_bags' => 3,
    'small_bags' => 4,
    'image'      => '/wp-content/uploads/2025/05/bmw.webp',
    'min_price'  => 65,
  ],
];

$step1_from_oneway = 55;
$step1_from_hourly = 55;

$terms_url = home_url('/terms-and-conditions/');
$terms_page = get_page_by_path('terms-and-conditions');
if ($terms_page) {
  $terms_page_id = $terms_page->ID;
  if (function_exists('pll_get_post')) {
    $translated_id = pll_get_post($terms_page_id, $lang_slug);
    if ($translated_id) {
      $terms_page_id = (int) $translated_id;
    }
  }
  $terms_url = get_permalink($terms_page_id);
}
if (function_exists('pll_translate_url') && $lang_slug !== 'en') {
  $terms_url = pll_translate_url($terms_url, $lang_slug);
}

?>
<!DOCTYPE html>
<html <?php language_attributes(); ?> data-lang="<?php echo esc_attr($lang_slug); ?>" data-locale="<?php echo esc_attr($lang_locale); ?>" dir="<?php echo esc_attr($dir_attr); ?>">

<head>
  <meta charset="<?php bloginfo('charset'); ?>">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <link rel="preconnect" href="https://maps.googleapis.com">
  <link rel="preconnect" href="https://maps.gstatic.com" crossorigin>
  <meta name="google" content="notranslate">
  <script>
    document.addEventListener('touchmove', function(_e) {}, {
      passive: true
    });
  </script>
  <link rel="stylesheet" href="<?php echo esc_url(get_template_directory_uri() . '/assets/css/style.css'); ?>">
  <?php wp_head(); ?>
</head>

<body <?php body_class('notranslate'); ?>>
  <div class="page page-booking-v3 page-booking-v4 notranslate">

    <?php get_template_part('components/header/header', null, []); ?>

    <main class="booking-page">
      <div class="booking-topnav" role="navigation" aria-label="<?php esc_attr_e('Booking steps', 'hello-elementor'); ?>">
        <div class="booking-topnav__inner">
          <div class="booking-topnav__mobile-bar">
            <div class="booking-topnav__mobile-slot booking-topnav__mobile-slot--start">
              <button class="booking-topnav__back-btn" id="booking-topnav-back-btn" type="button" aria-label="<?php esc_attr_e('Go back', 'hello-elementor'); ?>" disabled tabindex="-1">
                <img class="booking-topnav__back-btn-icon" src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/arrow-right-white.svg'); ?>" alt="" width="24" height="24" decoding="async" aria-hidden="true">
              </button>
            </div>
            <span class="booking-topnav__mobile-title" id="booking-topnav-mobile-title"><?php echo esc_html(__("LET'S START YOUR JOURNEY", 'hello-elementor')); ?></span>
            <div class="booking-topnav__mobile-slot booking-topnav__mobile-slot--end">
              <button class="booking-topnav__forward-btn" id="booking-topnav-forward-btn" type="button" aria-label="<?php esc_attr_e('Continue', 'hello-elementor'); ?>" disabled>
                <img class="booking-topnav__forward-btn-icon" src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/arrow-right-white.svg'); ?>" alt="" width="24" height="24" decoding="async" aria-hidden="true">
              </button>
            </div>
          </div>
          <div class="booking-container__inner">
            <div class="booking-topnav__step booking-topnav__step--active" data-step="1">
              <div class="booking-topnav__icon booking-topnav__icon--filled" aria-hidden="true">
                <img class="booking-topnav__img--no-filter" src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/ride-info.svg'); ?>" alt="" width="36" height="36" decoding="async" aria-hidden="true">
              </div>
              <span class="booking-topnav__label"><?php _e("LET'S START YOUR JOURNEY", 'hello-elementor'); ?></span>
            </div>
            <div class="booking-topnav__arrow" aria-hidden="true">
              <img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/arrow-right.svg'); ?>" alt="" width="32" height="32" decoding="async" aria-hidden="true">
            </div>
            <div class="booking-topnav__step" data-step="2">
              <div class="booking-topnav__icon booking-topnav__icon--outline" aria-hidden="true">
                <img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/vehicle-selection.svg'); ?>" alt="" width="36" height="36" decoding="async" aria-hidden="true">
              </div>
              <span class="booking-topnav__label"><?php _e('CHOOSE VEHICLE', 'hello-elementor'); ?></span>
            </div>
            <div class="booking-topnav__arrow" aria-hidden="true">
              <img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/arrow-right.svg'); ?>" alt="" width="32" height="32" decoding="async" aria-hidden="true">
            </div>
            <div class="booking-topnav__step" data-step="3">
              <div class="booking-topnav__icon booking-topnav__icon--outline" aria-hidden="true">
                <img src="<?php echo esc_url(get_template_directory_uri() . '/assets/icons/booking-form/contact-details.svg'); ?>" alt="" width="28" height="28" decoding="async" aria-hidden="true">
              </div>
              <span class="booking-topnav__label"><?php _e('Contact details', 'hello-elementor'); ?></span>
            </div>
            <div class="booking-topnav__arrow" aria-hidden="true">
              <img src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/arrow-right.svg'); ?>" alt="" width="32" height="32" decoding="async" aria-hidden="true">
            </div>
            <div class="booking-topnav__step" data-step="4">
              <div class="booking-topnav__icon booking-topnav__icon--outline" aria-hidden="true">
                <img src="<?php echo esc_url(get_template_directory_uri() . '/assets/icons/booking-form/checkout.svg'); ?>" alt="" width="28" height="28" decoding="async" aria-hidden="true">
              </div>
              <span class="booking-topnav__label"><?php _e('Checkout', 'hello-elementor'); ?></span>
            </div>
          </div>
        </div>
      </div>
      <div class="booking-container">

        <section class="booking-content">

          <!-- ===== STEP 1: RIDE INFORMATION ===== -->
          <div class="booking-panel booking-panel--active" id="booking-step-1">

            <div class="booking-step1-main">
              <div class="booking-field">
                <label class="booking-field__label" for="booking-pickup"><?php _e('PICKUP LOCATION', 'hello-elementor'); ?></label>
                <div class="booking-field__input-wrap">
                  <input type="text" class="booking-field__input" id="booking-pickup" placeholder="<?php esc_attr_e('Enter pickup location', 'hello-elementor'); ?>" autocomplete="off">
                  <button type="button" class="booking-field__pin-btn" data-target="booking-pickup" aria-label="<?php esc_attr_e('Choose on map', 'hello-elementor'); ?>">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
                    </svg>
                  </button>
                </div>
                <span class="booking-field__error" id="booking-pickup-error"></span>
              </div>

              <div class="booking-stops">
                <?php for ($i = 1; $i <= 3; $i++) : ?>
                  <div class="booking-stop" id="booking-stop-<?php echo $i; ?>">
                    <div class="booking-stop__inner">
                      <label class="booking-field__label"><?php printf(__('STOP %d', 'hello-elementor'), $i); ?></label>
                      <div class="booking-field__input-wrap">
                        <input type="text" class="booking-field__input" id="booking-stop-<?php echo $i; ?>-input" placeholder="<?php esc_attr_e('Enter a location', 'hello-elementor'); ?>" autocomplete="off">
                        <button type="button" class="booking-field__pin-btn" data-target="booking-stop-<?php echo $i; ?>-input" data-stop-key="stop<?php echo $i; ?>" aria-label="<?php esc_attr_e('Choose on map', 'hello-elementor'); ?>">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
                          </svg>
                        </button>
                        <button type="button" class="booking-stop__remove" data-stop="<?php echo $i; ?>" aria-label="<?php esc_attr_e('Remove stop', 'hello-elementor'); ?>">
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                            <path d="M4 4l8 8M12 4l-8 8" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                <?php endfor; ?>
                <button type="button" class="booking-stops__add" id="booking-add-stop">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                    <path d="M9 3v12M3 9h12" />
                  </svg>
                  <span><?php _e('Add a Stop', 'hello-elementor'); ?></span>
                </button>
              </div>

              <div class="booking-field" id="booking-dropoff-wrap">
                <label class="booking-field__label" for="booking-dropoff"><?php _e('FINAL DESTINATION', 'hello-elementor'); ?></label>
                <div class="booking-field__input-wrap">
                  <input type="text" class="booking-field__input" id="booking-dropoff" placeholder="<?php esc_attr_e('Enter final destination', 'hello-elementor'); ?>" autocomplete="off">
                  <button type="button" class="booking-field__pin-btn" data-target="booking-dropoff" aria-label="<?php esc_attr_e('Choose on map', 'hello-elementor'); ?>">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
                    </svg>
                  </button>
                </div>
                <span class="booking-field__error" id="booking-dropoff-error"></span>
              </div>

              <div class="booking-field">
                <label class="booking-field__label"><?php _e('TYPE OF SERVICE', 'hello-elementor'); ?></label>
                <div class="booking-toggle">
                  <button type="button" class="booking-toggle__btn booking-toggle__btn--active" data-service="single"><?php _e('One Way', 'hello-elementor'); ?></button>
                  <button type="button" class="booking-toggle__btn" data-service="hourly"><?php _e('Hourly/As directed', 'hello-elementor'); ?></button>
                </div>
              </div>

              <div class="booking-hourly-extras" id="booking-hourly-extras">
                <div class="booking-hourly-extras__inner">
                  <p class="booking-hourly-hint" id="booking-hourly-hint">
                    <?php _e('Please enter your final destination so we can calculate the accurate price for your journey, including all stops.', 'hello-elementor'); ?>
                  </p>
                  <div class="booking-field" id="booking-duration-wrap">
                    <label class="booking-field__label" for="booking-duration"><?php _e('DURATION', 'hello-elementor'); ?></label>
                    <select class="booking-field__select" id="booking-duration">
                      <?php for ($h = 3; $h <= 12; $h++) : ?>
                        <option value="<?php echo $h; ?>"><?php echo $h; ?> <?php _e('hours', 'hello-elementor'); ?></option>
                      <?php endfor; ?>
                    </select>
                  </div>
                </div>
              </div>

              <div class="booking-form__row">
                <div class="booking-field">
                  <label class="booking-field__label" for="booking-date"><?php _e('PICKUP DATE', 'hello-elementor'); ?></label>
                  <div class="booking-date">
                    <input type="text" class="booking-date__input" id="booking-date" placeholder="<?php esc_attr_e('Select date', 'hello-elementor'); ?>" readonly required>
                    <button type="button" class="booking-date__btn" id="booking-date-btn" aria-label="<?php esc_attr_e('Open calendar', 'hello-elementor'); ?>">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2">
                        <rect x="2.5" y="3.5" width="15" height="14" rx="1.5" />
                        <path d="M2.5 8h15" />
                        <path d="M6.5 2v3M13.5 2v3" stroke-linecap="round" />
                      </svg>
                    </button>
                  </div>
                  <span class="booking-field__error" id="booking-date-error"></span>
                </div>
                <div class="booking-field">
                  <label class="booking-field__label">
                    <?php _e('PICKUP TIME', 'hello-elementor'); ?>
                    <span class="booking-time__hint" aria-label="<?php esc_attr_e('Times are based on London (GMT) time', 'hello-elementor'); ?>">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
                        <circle cx="6.5" cy="6.5" r="5.75" />
                        <path d="M6.5 6v3.5" stroke-linecap="round" />
                        <circle cx="6.5" cy="3.8" r="0.6" fill="currentColor" stroke="none" />
                      </svg>
                    </span>
                  </label>
                  <div class="booking-time" id="booking-time">
                    <div class="booking-time__group">
                      <span class="booking-time__value" id="booking-hours-display" aria-hidden="true"></span>
                      <span class="booking-time__unit"><?php _e('Hours', 'hello-elementor'); ?></span>
                      <select class="booking-time__select" id="booking-hours">
                        <option value=""><?php echo esc_html(_x('—', 'booking time empty option', 'hello-elementor')); ?></option>
                        <?php for ($h = 0; $h <= 23; $h++) : ?>
                          <option value="<?php echo str_pad($h, 2, '0', STR_PAD_LEFT); ?>"><?php echo str_pad($h, 2, '0', STR_PAD_LEFT); ?></option>
                        <?php endfor; ?>
                      </select>
                    </div>
                    <div class="booking-time__group">
                      <span class="booking-time__value" id="booking-minutes-display" aria-hidden="true"></span>
                      <span class="booking-time__unit"><?php _e('Minutes', 'hello-elementor'); ?></span>
                      <select class="booking-time__select" id="booking-minutes">
                        <option value=""><?php echo esc_html(_x('—', 'booking time empty option', 'hello-elementor')); ?></option>
                        <?php for ($m = 0; $m < 60; $m += 5) : ?>
                          <option value="<?php echo str_pad($m, 2, '0', STR_PAD_LEFT); ?>"><?php echo str_pad($m, 2, '0', STR_PAD_LEFT); ?></option>
                        <?php endfor; ?>
                      </select>
                    </div>
                  </div>
                  <span class="booking-field__error" id="booking-time-error"></span>
                </div>
              </div>

              <div class="booking-step1-footer">
                <button type="button" class="booking-btn booking-btn--next" id="booking-next-btn" disabled><?php _e('NEXT STEP', 'hello-elementor'); ?></button>
                <span class="booking-step1-hint" id="booking-step1-price-hint"><?php printf(esc_html__('From £ %d', 'hello-elementor'), $step1_from_oneway); ?></span>
              </div>
            </div>

            <div class="booking-step1-aside">
              <div class="booking-route" id="booking-route-wrap">
                <div class="booking-route__map" id="booking-route-map"></div>
                <div class="booking-route__info" id="booking-route-info"></div>
              </div>
            </div>

          </div>

          <!-- ===== STEP 2: VEHICLE SELECTION ===== -->
          <div class="booking-panel" id="booking-step-2">

            <div class="booking-tripbar">
              <button type="button" class="booking-tripbar__back-btn booking-btn--back-top" id="booking-step2-back-top-btn" aria-label="<?php esc_attr_e('Go back', 'hello-elementor'); ?>">
                <img class="booking-tripbar__back-btn-icon" src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/arrow-right-white.svg'); ?>" alt="" width="24" height="24" decoding="async" aria-hidden="true">
              </button>
              <div class="booking-tripbar__main">
                <div class="booking-tripbar__items" id="booking-tripbar-items"></div>
              </div>
            </div>
            <div class="booking-step2-main">
              <div class="booking-step2-left-col">
                <div class="booking-step2-layout">
                  <div class="booking-vehicles booking-vehicles--step2" id="booking-vehicles-step2">
                    <?php foreach ($vehicles as $idx => $v) : ?>
                      <div class="booking-vehicle<?php echo $idx === 0 ? ' booking-vehicle--selected' : ''; ?>" data-vehicle="<?php echo esc_attr($v['value']); ?>" data-key="<?php echo esc_attr($v['key']); ?>" data-from-price="<?php echo (int) $v['min_price']; ?>">
                        <div class="booking-vehicle__img">
                          <img src="<?php echo esc_url($v['image']); ?>" alt="<?php echo esc_attr($v['name']); ?>" loading="eager" fetchpriority="low" width="189" height="84">
                        </div>
                        <div class="booking-vehicle__info">
                          <div class="booking-vehicle__titles">
                            <p class="booking-vehicle__name"><?php echo esc_html($v['name']); ?></p>
                            <?php if (!empty($v['tagline'])) : ?>
                              <p class="booking-vehicle__tagline"><?php echo esc_html($v['tagline']); ?></p>
                            <?php endif; ?>
                          </div>
                          <div class="booking-vehicle__specs">
                            <span class="booking-vehicle__spec">
                              <?php echo (int)$v['passengers']; ?>
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">
                                <circle cx="8" cy="4.5" r="2.5" />
                                <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" />
                              </svg>
                            </span>
                            <span class="booking-vehicle__spec">
                              <?php echo (int)$v['large_bags']; ?>
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2">
                                <rect x="2.5" y="5" width="11" height="9" rx="1.5" />
                                <path d="M5.5 5V3.5A1.5 1.5 0 017 2h2a1.5 1.5 0 011.5 1.5V5" />
                              </svg>
                            </span>
                            <span class="booking-vehicle__spec">
                              <?php echo (int)$v['small_bags']; ?>
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2">
                                <rect x="3" y="6" width="10" height="8" rx="1" />
                                <path d="M6 6V4.5A1.5 1.5 0 017.5 3h1A1.5 1.5 0 0110 4.5V6" />
                              </svg>
                            </span>
                          </div>
                        </div>
                        <div class="booking-vehicle__price">
                          <span class="booking-vehicle__price-text"><?php printf(__('From £ %d', 'hello-elementor'), $v['min_price']); ?></span>
                          <span class="booking-vehicle__price-radio">
                            <img src="<?php echo esc_url(get_template_directory_uri() . '/assets/icons/booking-form/check.svg'); ?>" alt="" width="16" height="16" decoding="async" aria-hidden="true">
                          </span>
                        </div>
                      </div>
                    <?php endforeach; ?>
                  </div>
                  <div class="booking-price-bar booking-price-bar--step2-desktop" role="status" aria-live="polite">
                    <div class="booking-price-breakdown" id="booking-price-breakdown" hidden></div>
                    <div class="booking-price-bar__total">
                      <span class="booking-price-bar__label"><?php _e('Estimated price:', 'hello-elementor'); ?></span>
                      <span class="booking-price-bar__value booking-summary-price-value booking-summary-price-value--step2-desktop">--</span>
                    </div>
                  </div>
                </div>

                <div class="booking-step2-actions">
                  <button type="button" class="booking-btn booking-btn--back" id="booking-step2-back-btn"><?php _e('BACK', 'hello-elementor'); ?></button>
                  <div class="booking-step2-next-block">
                    <button type="button" class="booking-btn booking-btn--next" id="booking-step2-next-btn"><?php _e('NEXT STEP', 'hello-elementor'); ?></button>
                  </div>
                </div>
              </div>

              <div class="booking-step2-sidebar">
                <aside class="booking-step2-features">
                  <div class="booking-step2-features__title">
                    <?php _e('FEATURES OF EVERY VEHICLE', 'hello-elementor'); ?><br><?php _e('IN THIS FLEET:', 'hello-elementor'); ?>
                  </div>
                  <div class="booking-step2-features__list" role="list">
                    <div class="booking-step2-features__row" role="listitem">
                      <div class="booking-step2-features__text"><?php _e('Fixed price - no hidden fees', 'hello-elementor'); ?></div>
                    </div>
                    <div class="booking-step2-features__divider" aria-hidden="true"></div>

                    <div class="booking-step2-features__row" role="listitem">
                      <div class="booking-step2-features__text"><?php _e('60 minutes free waiting time at airport', 'hello-elementor'); ?></div>
                    </div>
                    <div class="booking-step2-features__divider" aria-hidden="true"></div>

                    <div class="booking-step2-features__row" role="listitem">
                      <div class="booking-step2-features__text"><?php _e('Meet & Greet with name board + luggage assistance', 'hello-elementor'); ?></div>
                    </div>
                    <div class="booking-step2-features__divider" aria-hidden="true"></div>

                    <div class="booking-step2-features__row" role="listitem">
                      <div class="booking-step2-features__text"><?php _e('Professional uniformed chauffeur', 'hello-elementor'); ?></div>
                    </div>
                    <div class="booking-step2-features__divider" aria-hidden="true"></div>

                    <div class="booking-step2-features__row" role="listitem">
                      <div class="booking-step2-features__text"><?php _e('Complimentary bottled water, mints & WiFi', 'hello-elementor'); ?></div>
                    </div>
                    <div class="booking-step2-features__divider" aria-hidden="true"></div>

                    <div class="booking-step2-features__row" role="listitem">
                      <div class="booking-step2-features__text"><?php _e('Real-time flight monitoring & automatic adjustment', 'hello-elementor'); ?></div>
                    </div>
                    <div class="booking-step2-features__divider" aria-hidden="true"></div>

                    <div class="booking-step2-features__row" role="listitem">
                      <div class="booking-step2-features__text"><?php _e('Free cancellation up to 24 hours before pickup', 'hello-elementor'); ?></div>
                    </div>
                  </div>
                </aside>

                <aside class="booking-step2-contact" aria-label="<?php esc_attr_e('Need help?', 'hello-elementor'); ?>">
                  <div class="booking-step2-contact__header">
                    <span class="booking-step2-contact__icon" aria-hidden="true">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" />
                        <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.5" />
                        <path d="M12 3v2M12 19v2M3 12h2M19 12h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                      </svg>
                    </span>
                    <h3 class="booking-step2-contact__title"><?php _e('Need help?', 'hello-elementor'); ?></h3>
                  </div>
                  <p class="booking-step2-contact__desc"><?php _e('Our customer care team is ready to assist you.', 'hello-elementor'); ?></p>
                  <a href="https://wa.me/440000000000" class="booking-step2-contact__chat-btn" target="_blank" rel="noopener noreferrer"><?php _e('Start Chat', 'hello-elementor'); ?></a>
                  <div class="booking-step2-contact__divider" aria-hidden="true"></div>
                  <div class="booking-step2-contact__phone">
                    <div class="booking-step2-contact__phone-header">
                      <span class="booking-step2-contact__icon" aria-hidden="true">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                      </span>
                      <span class="booking-step2-contact__phone-label"><?php _e('Call Us', 'hello-elementor'); ?></span>
                    </div>
                    <a href="tel:+440000000000" class="booking-step2-contact__phone-number">+44 0000 000 000</a>
                  </div>
                </aside>
              </div>
            </div>
          </div>

          <!-- ===== STEP 3: CONTACT DETAILS ===== -->
          <div class="booking-panel" id="booking-step-3">


            <div class="booking-step3-layout">
              <div class="booking-step3-main">
                <form id="booking-form" class="booking-form booking-form--step3" novalidate>

                  <div class="booking-step3-form-fields">

                    <div class="booking-form__row booking-form__row--2cols booking-form__row--step3-names">
                      <div class="booking-field">
                        <label class="booking-field__label" for="booking-first-name"><?php _e('FIRST NAME', 'hello-elementor'); ?></label>
                        <input type="text" class="booking-field__input" id="booking-first-name" placeholder="<?php esc_attr_e('Michael', 'hello-elementor'); ?>" required>
                        <span class="booking-field__error" id="booking-first-name-error"></span>
                      </div>
                      <div class="booking-field">
                        <label class="booking-field__label" for="booking-last-name"><?php _e('LAST NAME', 'hello-elementor'); ?></label>
                        <input type="text" class="booking-field__input" id="booking-last-name" placeholder="<?php esc_attr_e('Dough', 'hello-elementor'); ?>" required>
                        <span class="booking-field__error" id="booking-last-name-error"></span>
                      </div>
                    </div>

                    <div class="booking-form__row booking-form__row--2cols booking-form__row--step3-country-phone">
                      <div class="booking-field">
                        <label class="booking-field__label" for="booking-country"><?php _e('Country', 'hello-elementor'); ?></label>
                        <div class="booking-field__select-wrap booking-field__select-wrap--display" data-display-for="booking-country">
                          <select class="booking-field__select" id="booking-country" required></select>
                          <span class="booking-field__select-display" id="booking-country-display" aria-hidden="true"></span>
                        </div>
                      </div>

                      <div class="booking-field booking-field--phone" id="booking-phone-field">
                        <label class="booking-field__label"><?php _e('Phone Number', 'hello-elementor'); ?></label>
                        <div class="booking-phone">
                          <div class="booking-phone__prefix">
                            <span class="booking-phone__flag" id="booking-phone-flag">🇬🇧</span>
                            <select class="booking-phone__code" id="booking-phone-code"></select>
                          </div>
                          <div class="booking-phone__divider"></div>
                          <input type="tel" class="booking-phone__number" id="booking-phone-number" placeholder="123456789" required>
                        </div>
                        <span class="booking-field__error" id="booking-phone-error"></span>
                      </div>
                    </div>

                    <div class="booking-form__row booking-form__row--contact booking-form__row--contact--no-flight booking-form__row--step3-email-flight" id="booking-contact-row">
                      <div class="booking-field booking-field--flight" id="booking-flight-wrap" style="display:none">
                        <label class="booking-field__label" for="booking-flight"><?php _e('Flight Number (Optional)', 'hello-elementor'); ?></label>
                        <input type="text" class="booking-field__input" id="booking-flight" placeholder="<?php esc_attr_e('e.g. BA0262', 'hello-elementor'); ?>">
                        <span class="booking-field__flight-status" id="booking-flight-status"></span>
                      </div>

                      <div class="booking-field booking-field--email">
                        <label class="booking-field__label" for="booking-email"><?php _e('Email', 'hello-elementor'); ?></label>
                        <input type="email" class="booking-field__input" id="booking-email" placeholder="<?php esc_attr_e('your@email.com', 'hello-elementor'); ?>" required>
                        <span class="booking-field__error" id="booking-email-error"></span>
                      </div>
                    </div>

                    <div class="booking-form__row booking-form__row--full booking-form__row--step3-passengers">
                      <div class="booking-field">
                        <label class="booking-field__label" for="booking-passengers"><?php _e('NUMBER OF PASSENGERS', 'hello-elementor'); ?></label>
                        <select class="booking-field__select" id="booking-passengers">
                          <option value="">&mdash;</option>
                          <?php for ($p = 1; $p <= 8; $p++) : ?>
                            <option value="<?php echo $p; ?>"><?php echo $p; ?></option>
                          <?php endfor; ?>
                        </select>
                        <span class="booking-field__error" id="booking-passengers-error"></span>
                      </div>
                    </div>

                    <div class="booking-form__row booking-form__row--suitcases booking-form__row--step3-suitcases">
                      <div class="booking-field">
                        <label class="booking-field__label" for="booking-large-bags"><?php _e('LARGE SUITCASES', 'hello-elementor'); ?></label>
                        <select class="booking-field__select" id="booking-large-bags">
                          <option value="">&ndash;</option>
                        </select>
                        <span class="booking-field__error" id="booking-large-bags-error"></span>
                      </div>
                      <div class="booking-field">
                        <label class="booking-field__label" for="booking-small-bags"><?php _e('SMALL SUITCASES', 'hello-elementor'); ?></label>
                        <select class="booking-field__select" id="booking-small-bags">
                          <option value="">&ndash;</option>
                        </select>
                      </div>
                    </div>

                    <div class="booking-field">
                      <label class="booking-field__label" for="booking-comments"><?php _e('Comments', 'hello-elementor'); ?></label>
                      <textarea class="booking-field__textarea" id="booking-comments" rows="4" placeholder="<?php esc_attr_e('More details', 'hello-elementor'); ?>"></textarea>
                    </div>

                    <section class="booking-addons" aria-label="<?php esc_attr_e('Additional services', 'hello-elementor'); ?>">
                      <header class="booking-addons__header">
                        <div class="booking-addons__title">
                          <span class="booking-addons__title-main"><?php _e('Additional Services', 'hello-elementor'); ?></span>
                          <span class="booking-addons__title-opt"><?php _e('(Optional)', 'hello-elementor'); ?></span>
                        </div>
                        <div class="booking-addons__subtitle"><?php _e('Enhance your journey with these premium extras.', 'hello-elementor'); ?></div>
                      </header>
                      <div class="booking-addons__list">
                        <label class="booking-addon">
                          <input type="checkbox" id="booking-addon-booster" value="Booster Seat">
                          <span class="booking-addon__box" aria-hidden="true"></span>
                          <span class="booking-addon__icon" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M6 18V10h12v8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
                              <path d="M5 10V7a2 2 0 012-2h10a2 2 0 012 2v3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                              <path d="M9 14h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                            </svg>
                          </span>
                          <span class="booking-addon__text"><?php _e('Booster Seat (Suitable for children 4 – 12 years)', 'hello-elementor'); ?></span>
                          <span class="booking-addon__hint"><?php _e('FREE OF CHARGE', 'hello-elementor'); ?></span>
                        </label>

                        <label class="booking-addon">
                          <input type="checkbox" id="booking-addon-childseat" value="Child Seat">
                          <span class="booking-addon__box" aria-hidden="true"></span>
                          <span class="booking-addon__icon" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M7 17V9l2-4h6l2 4v8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
                              <path d="M7 12h10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                            </svg>
                          </span>
                          <span class="booking-addon__text"><?php _e('Child Seat (Suitable for children up to 4 years)', 'hello-elementor'); ?></span>
                          <span class="booking-addon__hint"><?php _e('FREE OF CHARGE', 'hello-elementor'); ?></span>
                        </label>

                        <label class="booking-addon">
                          <input type="checkbox" id="booking-addon-flowers" value="Flower Elegant bouquet">
                          <span class="booking-addon__box" aria-hidden="true"></span>
                          <span class="booking-addon__icon" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <circle cx="12" cy="11" r="2.5" stroke="currentColor" stroke-width="1.2" />
                              <path d="M12 8.5v-2M12 13.5v2M9.5 11h-2M14.5 11h2M10.3 9.3l-1.4-1.4M13.7 12.7l1.4 1.4M13.7 9.3l1.4-1.4M10.3 12.7l-1.4 1.4M12 17v2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                            </svg>
                          </span>
                          <span class="booking-addon__text"><?php _e('Flower Elegant bouquet for your arrival', 'hello-elementor'); ?></span>
                          <span class="booking-addon__hint"><?php _e('Price depends on your request', 'hello-elementor'); ?></span>
                        </label>

                        <label class="booking-addon">
                          <input type="checkbox" id="booking-addon-champagne" value="Champagne">
                          <span class="booking-addon__box" aria-hidden="true"></span>
                          <span class="booking-addon__icon" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M9 4h6l-1 8H10L9 4z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
                              <path d="M12 12v5M9 19h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
                            </svg>
                          </span>
                          <span class="booking-addon__text"><?php _e('Champagne', 'hello-elementor'); ?></span>
                          <span class="booking-addon__hint"><?php _e('Price depends on your request', 'hello-elementor'); ?></span>
                        </label>

                        <label class="booking-addon">
                          <input type="checkbox" id="booking-addon-pet" value="Pet on board">
                          <span class="booking-addon__box" aria-hidden="true"></span>
                          <span class="booking-addon__icon" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <ellipse cx="12" cy="14" rx="3.5" ry="2.5" stroke="currentColor" stroke-width="1.2" />
                              <circle cx="8.5" cy="9.5" r="1.5" stroke="currentColor" stroke-width="1.2" />
                              <circle cx="12" cy="7.5" r="1.5" stroke="currentColor" stroke-width="1.2" />
                              <circle cx="15.5" cy="9.5" r="1.5" stroke="currentColor" stroke-width="1.2" />
                            </svg>
                          </span>
                          <span class="booking-addon__text"><?php _e('Pet on board', 'hello-elementor'); ?></span>
                          <span class="booking-addon__hint"><?php _e('pet-friendly vehicle with protective cover', 'hello-elementor'); ?></span>
                        </label>
                      </div>
                    </section>

                    <div class="booking-checks">
                      <label class="booking-check">
                        <input type="checkbox" id="booking-terms" required checked>
                        <span class="booking-check__box"></span>
                        <span><?php printf(__('I accept the %sTerms and conditions%s', 'hello-elementor'), '<a href="' . esc_url($terms_url) . '" class="booking-check__link" target="_blank">', '</a>'); ?></span>
                      </label>
                      <label class="booking-check">
                        <input type="checkbox" id="booking-newsletter" checked>
                        <span class="booking-check__box"></span>
                        <span><?php _e('I would like to receive news and updates about festivals, racing, football, and other events', 'hello-elementor'); ?></span>
                      </label>
                    </div>

                  </div>

                  <aside class="booking-step3-sidebar" aria-label="<?php esc_attr_e('Ride summary', 'hello-elementor'); ?>">
                    <div class="booking-summary booking-summary--sidebar" id="booking-summary">
                      <div class="booking-summary__header">
                        <button type="button" class="booking-tripbar__back-btn booking-btn--back-top" id="booking-step3-back-top-btn" aria-label="<?php esc_attr_e('Go back', 'hello-elementor'); ?>">
                          <img class="booking-tripbar__back-btn-icon" src="<?php echo esc_url(get_template_directory_uri() . '/assets/images/arrow-right-white.svg'); ?>" alt="" width="24" height="24" decoding="async" aria-hidden="true">
                        </button>
                        <div class="booking-summary__heading">
                          <span class="booking-summary__title"><?php _e('Ride Information', 'hello-elementor'); ?></span>
                          <span class="booking-summary__subtitle"><?php _e('Details are not right? Click here to change', 'hello-elementor'); ?></span>
                        </div>
                      </div>

                      <div class="booking-summary__rows" id="booking-summary-rows"></div>

                    </div>

                    <div class="booking-sidebar__price booking-sidebar__price--sidebar">
                      <p class="booking-sidebar__price-label"><?php _e('Estimated price', 'hello-elementor'); ?></p>
                      <p class="booking-sidebar__price-amount" id="booking-sidebar-price">--</p>
                    </div>
                  </aside>

                  <div class="booking-step3-form-trust">
                    <?php if (ipro_turnstile_enabled()) : ?>
                      <div id="cf-turnstile"
                        class="booking-recaptcha cf-turnstile"
                        data-sitekey="<?php echo esc_attr(IPRO_TURNSTILE_SITEKEY); ?>"
                        data-callback="iproTurnstileSuccess"
                        data-expired-callback="iproTurnstileExpired"
                        data-theme="light">
                      </div>
                    <?php endif; ?>

                    <div class="booking-step3-actions">
                      <div class="booking-step3-checkout-block">
                        <button type="button" class="booking-btn booking-btn--checkout" id="booking-checkout-btn" disabled>
                          <span class="booking-btn__progress" aria-hidden="true"></span>
                          <span class="booking-btn__label"><?php _e('CHECKOUT', 'hello-elementor'); ?></span>
                        </button>
                      </div>
                    </div>
                  </div>

                </form>
              </div>

            </div>
          </div>

          <!-- ===== STEP 4: CHECKOUT (confirmation / placeholder) ===== -->
          <div class="booking-panel" id="booking-step-4">
            <div class="booking-content__header" id="booking-step-4-intro">
              <h2 class="booking-content__title"><?php _e('Checkout', 'hello-elementor'); ?></h2>
              <?php if (false) : ?>
                <p class="booking-content__subtitle"><?php _e('GET A PRICE & BOOK', 'hello-elementor'); ?></p>
              <?php endif; ?>
            </div>
            <div class="booking-checkout-placeholder" id="booking-step-4-placeholder">
              <?php _e('Checkout step content will be added next.', 'hello-elementor'); ?>
            </div>
            <div id="booking-step-4-message" class="booking-step4-message" hidden></div>
            <div class="booking-step4-actions" id="booking-step-4-actions">
              <button type="button" class="booking-btn booking-btn--back" id="booking-step4-back-btn"><?php _e('BACK', 'hello-elementor'); ?></button>
            </div>
          </div>

        </section>



      </div><!-- /.booking-container -->

    </main>

    <div class="booking-mobile-price booking-mobile-price--step1" id="booking-mobile-price">
      <div class="booking-mobile-price__breakdown" id="booking-mobile-price-breakdown" hidden></div>
      <div class="booking-mobile-price__info">
        <span class="booking-mobile-price__amount" id="booking-mobile-price-amount"><?php printf(esc_html__('From £ %d', 'hello-elementor'), $step1_from_oneway); ?></span>
        <span class="booking-mobile-price__label" id="booking-mobile-price-label" hidden><?php _e('Estimated price', 'hello-elementor'); ?></span>
      </div>
      <button type="button" class="booking-btn booking-btn--next booking-mobile-price__btn" id="booking-mobile-next-btn"><?php _e('NEXT STEP', 'hello-elementor'); ?></button>
    </div>

    <div id="booking-map-modal" class="booking-map-modal">
      <div class="booking-map-modal__overlay"></div>
      <div class="booking-map-modal__content">
        <div class="booking-map-modal__header">
          <span><?php _e('Choose location on map', 'hello-elementor'); ?></span>
          <button type="button" class="booking-map-modal__close" aria-label="<?php esc_attr_e('Close', 'hello-elementor'); ?>">&times;</button>
        </div>
        <div class="booking-map-modal__search">
          <input type="text" id="booking-map-search" class="booking-map-modal__search-input" placeholder="<?php esc_attr_e('Search address…', 'hello-elementor'); ?>" autocomplete="off">
        </div>
        <div class="booking-map-modal__map-wrap">
          <div id="booking-map-canvas" class="booking-map-modal__canvas"></div>
          <div class="booking-map-modal__crosshair" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="56" viewBox="0 0 40 56">
              <ellipse cx="20" cy="54" rx="8" ry="3" fill="rgba(0,0,0,0.18)" />
              <path d="M20 2C11.163 2 4 9.163 4 18c0 11.25 16 34 16 34S36 29.25 36 18C36 9.163 28.837 2 20 2z" fill="#111" />
              <circle cx="20" cy="18" r="6" fill="#fff" />
            </svg>
          </div>
        </div>
        <div class="booking-map-modal__footer">
          <div class="booking-map-modal__addr" id="booking-map-addr"><?php _e('Move the map to position the pin', 'hello-elementor'); ?></div>
          <button type="button" class="booking-btn" id="booking-map-confirm"><?php _e('Confirm', 'hello-elementor'); ?></button>
        </div>
      </div>
    </div>

    <?php wp_footer(); ?>

  </div>
</body>

</html>