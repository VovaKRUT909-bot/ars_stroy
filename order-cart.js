(function initOrderCart() {
  'use strict';

  var TILE_IMG_BASE = 'img/tiles';
  var TILE_FALLBACK = 'assets/bruschatka-1.png';

  var orderSection = document.getElementById('order');
  var orderSelected = document.getElementById('order-selected');
  var orderCart = document.getElementById('order-cart');
  var cartItemsEl = document.getElementById('cart-items');
  var cartGrandTotal = document.getElementById('cart-grand-total');
  var cartCountEl = document.getElementById('cart-count');
  var cartClearBtn = document.getElementById('cart-clear');
  var orderForm = document.getElementById('order-form');
  var ukladkaForm = document.getElementById('ukladka-form');
  var orderAddressEl = document.getElementById('order-address');
  var cartSubtotalEl = document.getElementById('cart-subtotal');
  var cartDeliveryLine = document.getElementById('cart-delivery-line');
  var cartDeliveryTotalEl = document.getElementById('cart-delivery-total');
  var cartDeliveryKmEl = document.getElementById('cart-delivery-km');
  var cartDeliveryTariffEl = document.getElementById('cart-delivery-tariff');

  var cart = [];

  /**
   * Производство (координаты Яндекс.Карт): М-1 Беларусь, 68-й км, вл1с3.
   * Тариф: до 10 км в одну сторону — 5 000 ₽; далее +100 ₽/км (манипулятор до 4 т).
   * Ключ в index.html → ARS_STROY_YANDEX_MAPS_KEY (маршрут как в навигаторе).
   */
  var YANDEX_MAPS_API_KEY =
    typeof window !== 'undefined' && window.ARS_STROY_YANDEX_MAPS_KEY
      ? String(window.ARS_STROY_YANDEX_MAPS_KEY).trim()
      : '';
  var DELIVERY_ORIGIN = {
    lat: 55.565621,
    lon: 36.635938,
    label: 'М-1 Беларусь, 68-й км, вл1с3 (Арс Строй)'
  };
  var DELIVERY_ORIGIN_ADDRESS =
    'Московская обл., Одинцовский г.о., М-1 Беларусь, 68-й километр, вл1с3';
  var NOMINATIM_VIEWBOX = '34.8,56.2,39.8,54.8';
  var DELIVERY_MIN_ADDRESS_LEN = 3;
  var YMAPS_LOAD_TIMEOUT_MS = 12000;
  var YMAPS_ROUTE_TIMEOUT_MS = 12000;
  var ymapsLoadPromise = null;
  var ymapsApiUnavailable = false;
  var deliveryUsedFallback = false;

  window.addEventListener(
    'error',
    function (ev) {
      var src = (ev && ev.filename) || '';
      if (/yandex|api-maps/i.test(src)) {
        ymapsApiUnavailable = true;
      }
    },
    true
  );
  var DELIVERY_INCLUDED_KM = 10;
  var DELIVERY_BASE_RUB = 5000;
  var DELIVERY_EXTRA_RUB_PER_KM = 100;
  var DELIVERY_GEO_HEADERS = {
    Accept: 'application/json',
    'Accept-Language': 'ru',
    'User-Agent': 'ArsStroySite/1.0 (oooarsstroy.ru; delivery-estimate)'
  };
  var deliveryState = {
    status: 'idle',
    km: null,
    cost: null,
    address: '',
    message: ''
  };
  var deliveryCalcToken = 0;
  var deliveryDebounceTimer = null;

  var BLOCK_CONFIG = {
    'prices-b1': {
      productKey: 'bruschatka',
      productName: 'Брусчатка',
      size: '200×100×60 мм',
      sizeCode: '200-100-60',
      articlePrefix: 'BRUSCHATKA'
    },
    'prices-b2': {
      productKey: 'bruschatka',
      productName: 'Брусчатка',
      size: '200×100×40 мм',
      sizeCode: '200-100-40',
      articlePrefix: 'BRUSCHATKA'
    },
    'prices-city': {
      productKey: 'novyi-gorod',
      productName: '«Новый город»',
      size: '240×160×60 мм',
      sizeCode: '240-160-60',
      articlePrefix: 'NOVYI-GOROD'
    },
    'prices-cast': {
      productKey: 'lito',
      productName: 'Вибропрессованное литьё',
      articlePrefix: 'LITO'
    },
    'prices-curb': {
      productKey: 'bordyur',
      productName: 'Бордюр',
      articlePrefix: 'BORDYUR'
    },
    'prices-block': {
      productKey: 'blok',
      productName: 'Строительный блок',
      articlePrefix: 'BLOK'
    }
  };

  var COLOR_SLUG_MAP = {
    gray: 'GRAY',
    'dark-gray': 'DARK-GRAY',
    red: 'RED',
    brown: 'BROWN',
    yellow: 'YELLOW',
    'yellow-white': 'YELLOW-WHITE',
    'yellow-cement': 'YELLOW-CEMENT',
    black: 'BLACK',
    white: 'WHITE',
    colorful: 'COLOR'
  };

  var COLOR_RU_BY_SLUG = {
    gray: 'Серый',
    'dark-gray': 'Тёмно-серый',
    red: 'Красный',
    brown: 'Коричневый',
    yellow: 'Жёлтый',
    'yellow-white': 'Жёлтый на белом цементе',
    'yellow-cement': 'Жёлтый на обычном цементе',
    black: 'Чёрный',
    white: 'Белый',
    colorful: 'Цветной'
  };

  function formatMoney(n) {
    return n.toLocaleString('ru-RU');
  }

  function formatKm(km) {
    if (km == null || isNaN(km)) return '—';
    return Math.round(km).toLocaleString('ru-RU');
  }

  function deliveryKmRounded(oneWayKm) {
    if (oneWayKm == null || isNaN(oneWayKm)) return null;
    return Math.round(oneWayKm);
  }

  function cartDeliveryKmLabel() {
    if (deliveryState.km == null) return '';
    return '(' + formatKm(deliveryState.km) + ' км до объекта)';
  }

  /** До 10 км в одну сторону — 5 000 ₽; каждый км сверх — +100 ₽ (км округляются). */
  function deliveryCostFromKm(oneWayKm) {
    var km = deliveryKmRounded(oneWayKm);
    if (km == null || km <= 0) return 0;
    if (km <= DELIVERY_INCLUDED_KM) return DELIVERY_BASE_RUB;
    return DELIVERY_BASE_RUB + (km - DELIVERY_INCLUDED_KM) * DELIVERY_EXTRA_RUB_PER_KM;
  }

  /** Расшифровка для клиента — можно пересчитать в калькуляторе. */
  function deliveryCostBreakdownText(oneWayKm) {
    var km = deliveryKmRounded(oneWayKm);
    if (km == null) return '';
    var total = deliveryCostFromKm(oneWayKm);
    if (km <= DELIVERY_INCLUDED_KM) {
      return (
        'Как мы посчитали: ' +
        formatKm(km) +
        ' км до объекта → ' +
        formatMoney(DELIVERY_BASE_RUB) +
        ' ₽ (фиксированно до ' +
        DELIVERY_INCLUDED_KM +
        ' км включительно). Итого доставка: ' +
        formatMoney(total) +
        ' ₽ — пересчитайте сами, цифры совпадут.'
      );
    }
    var extraKm = km - DELIVERY_INCLUDED_KM;
    var extraRub = extraKm * DELIVERY_EXTRA_RUB_PER_KM;
    return (
      'Как мы посчитали: ' +
      formatMoney(DELIVERY_BASE_RUB) +
      ' ₽ (первые ' +
      DELIVERY_INCLUDED_KM +
      ' км) + ' +
      extraKm +
      ' км × ' +
      formatMoney(DELIVERY_EXTRA_RUB_PER_KM) +
      ' ₽ = ' +
      formatMoney(extraRub) +
      ' ₽ → всего ' +
      formatMoney(total) +
      ' ₽. Откройте калькулятор и сложите — сумма будет такой же, без сюрпризов.'
    );
  }

  function haversineKm(from, to) {
    var R = 6371;
    var dLat = ((to.lat - from.lat) * Math.PI) / 180;
    var dLon = ((to.lon - from.lon) * Math.PI) / 180;
    var lat1 = (from.lat * Math.PI) / 180;
    var lat2 = (to.lat * Math.PI) / 180;
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function promiseTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) {
          done = true;
          reject(new Error(label || 'timeout'));
        }
      }, ms);
      Promise.resolve(promise).then(
        function (val) {
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve(val);
          }
        },
        function (err) {
          if (!done) {
            done = true;
            clearTimeout(timer);
            reject(err);
          }
        }
      );
    });
  }

  function fetchGeoJson(url) {
    return fetch(url, { method: 'GET', headers: DELIVERY_GEO_HEADERS }).then(function (res) {
      if (!res.ok) throw new Error('geo_http');
      return res.json();
    });
  }

  function markYmapsUnavailable(err) {
    ymapsApiUnavailable = true;
    if (err) console.warn('ymaps_skip', err);
  }

  function loadYmapsApi() {
    if (!YANDEX_MAPS_API_KEY || ymapsApiUnavailable) {
      return Promise.reject(new Error('no_yandex_key'));
    }
    if (window.ymaps) return Promise.resolve(window.ymaps);
    if (ymapsLoadPromise) return ymapsLoadPromise;

    var loadCore = function () {
      return new Promise(function (resolve, reject) {
        var existing = document.getElementById('yandex-maps-api-script');
        if (existing) {
          if (window.ymaps) {
            resolve(window.ymaps);
            return;
          }
          existing.addEventListener('load', function () {
            if (window.ymaps) resolve(window.ymaps);
            else reject(new Error('ymaps_missing'));
          });
          existing.addEventListener('error', function () {
            reject(new Error('ymaps_load_fail'));
          });
          return;
        }
        var script = document.createElement('script');
        script.id = 'yandex-maps-api-script';
        script.async = true;
        script.src =
          'https://api-maps.yandex.ru/2.1/?apikey=' +
          encodeURIComponent(YANDEX_MAPS_API_KEY) +
          '&lang=ru_RU';
        script.onload = function () {
          if (window.ymaps) resolve(window.ymaps);
          else reject(new Error('ymaps_missing'));
        };
        script.onerror = function () {
          reject(new Error('ymaps_load_fail'));
        };
        document.head.appendChild(script);
      });
    };

    ymapsLoadPromise = promiseTimeout(loadCore(), YMAPS_LOAD_TIMEOUT_MS, 'ymaps_load_timeout').catch(
      function (err) {
        ymapsLoadPromise = null;
        markYmapsUnavailable(err);
        throw err;
      }
    );
    return ymapsLoadPromise;
  }

  function ymapsReady(run) {
    return loadYmapsApi().then(function () {
      return promiseTimeout(
        new Promise(function (resolve, reject) {
          try {
            window.ymaps.ready(function () {
              try {
                Promise.resolve(run(window.ymaps)).then(resolve, reject);
              } catch (runErr) {
                reject(runErr);
              }
            });
          } catch (readyErr) {
            reject(readyErr);
          }
        }),
        YMAPS_ROUTE_TIMEOUT_MS,
        'ymaps_ready_timeout'
      );
    });
  }

  /** Маршрут через JS API Яндекс.Карт (как в навигаторе). */
  function ymapsRouteOneWayKm(customerAddress) {
    var destination = customerAddress + ', Московская область, Россия';
    return ymapsReady(function (ymaps) {
      return ymaps
        .route([DELIVERY_ORIGIN_ADDRESS, destination], {
          routingMode: 'auto',
          mapStateAutoApply: false
        })
        .then(function (route) {
          if (!route) throw new Error('no_route');
          var meters = route.getLength ? route.getLength() : 0;
          if (!meters || meters <= 0) throw new Error('no_length');
          return meters / 1000;
        });
    });
  }

  function geocodeAddressOsm(address) {
    var q = address + ', Московская область, Россия';
    var nominatim =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ru&viewbox=' +
      NOMINATIM_VIEWBOX +
      '&bounded=0&q=' +
      encodeURIComponent(q);
    var photon =
      'https://photon.komoot.io/api/?limit=1&lang=ru&lat=55.565621&lon=36.635938&q=' +
      encodeURIComponent(q);

    return fetchGeoJson(nominatim).then(function (data) {
      if (data && data[0]) {
        return {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon)
        };
      }
      return fetchGeoJson(photon).then(function (ph) {
        if (!ph.features || !ph.features[0]) throw new Error('not_found');
        var c = ph.features[0].geometry.coordinates;
        return { lat: c[1], lon: c[0] };
      });
    });
  }

  function geocodeAddress(address) {
    return geocodeAddressOsm(address);
  }

  function routeDistanceKmOsrm(from, to) {
    var url =
      'https://router.project-osrm.org/route/v1/driving/' +
      from.lon +
      ',' +
      from.lat +
      ';' +
      to.lon +
      ',' +
      to.lat +
      '?overview=false';
    return fetchGeoJson(url).then(function (data) {
      if (!data.routes || !data.routes[0] || data.routes[0].distance == null) {
        throw new Error('no_route');
      }
      return data.routes[0].distance / 1000;
    });
  }

  function estimateDistanceKmOsm(dest) {
    return routeDistanceKmOsrm(DELIVERY_ORIGIN, dest).catch(function () {
      return haversineKm(DELIVERY_ORIGIN, dest) * 1.35;
    });
  }

  function deliveryDistanceViaOsm(customerAddress) {
    return geocodeAddress(customerAddress).then(function (point) {
      return estimateDistanceKmOsm(point).then(function (km) {
        return { km: km, source: 'osm' };
      });
    });
  }

  function deliveryDistanceKm(customerAddress) {
    if (!YANDEX_MAPS_API_KEY || ymapsApiUnavailable) {
      return deliveryDistanceViaOsm(customerAddress);
    }
    return promiseTimeout(
      ymapsRouteOneWayKm(customerAddress),
      YMAPS_ROUTE_TIMEOUT_MS,
      'ymaps_route_timeout'
    )
      .then(function (km) {
        return { km: km, source: 'yandex' };
      })
      .catch(function (err) {
        markYmapsUnavailable(err);
        return deliveryDistanceViaOsm(customerAddress);
      });
  }

  function resetDeliveryState() {
    deliveryState.status = 'idle';
    deliveryState.km = null;
    deliveryState.cost = null;
    deliveryState.address = '';
    deliveryState.message = '';
    renderDeliveryUi();
    updateOrderTotals();
  }

  function renderDeliveryUi() {
    if (!cartDeliveryLine) return;

    if (deliveryState.status === 'ok' && deliveryState.cost != null) {
      cartDeliveryLine.hidden = false;
      if (cartDeliveryTotalEl) {
        cartDeliveryTotalEl.textContent = formatMoney(deliveryState.cost);
      }
      if (cartDeliveryKmEl) {
        cartDeliveryKmEl.textContent = cartDeliveryKmLabel();
      }
      if (cartDeliveryTariffEl) cartDeliveryTariffEl.hidden = false;
      return;
    }

    if (deliveryState.status === 'loading' && deliveryState.address) {
      cartDeliveryLine.hidden = false;
      if (cartDeliveryTotalEl) cartDeliveryTotalEl.textContent = '…';
      if (cartDeliveryKmEl) {
        cartDeliveryKmEl.textContent = ' (считаем доставку)';
      }
      if (cartDeliveryTariffEl) cartDeliveryTariffEl.hidden = true;
      return;
    }

    cartDeliveryLine.hidden = true;
    if (cartDeliveryKmEl) cartDeliveryKmEl.textContent = '';
    if (cartDeliveryTariffEl) cartDeliveryTariffEl.hidden = true;
  }

  function getCartProductsTotal() {
    return cart.reduce(function (sum, item) {
      if (item.qty == null || item.qty <= 0) return sum;
      return sum + item.price * item.qty;
    }, 0);
  }

  function getCartGrandTotal() {
    var total = getCartProductsTotal();
    if (deliveryState.status === 'ok' && deliveryState.cost != null) {
      total += deliveryState.cost;
    }
    return total;
  }

  function updateOrderTotals() {
    if (cartSubtotalEl) {
      cartSubtotalEl.textContent = formatMoney(getCartProductsTotal());
    }
    if (cartGrandTotal) {
      cartGrandTotal.textContent = formatMoney(getCartGrandTotal());
    }
    renderDeliveryUi();
  }

  function calculateDelivery(address) {
    var token = ++deliveryCalcToken;
    deliveryState.status = 'loading';
    deliveryState.message = '';
    deliveryState.km = null;
    deliveryState.cost = null;
    deliveryState.address = address;
    deliveryUsedFallback = false;
    renderDeliveryUi();

    return deliveryDistanceKm(address)
      .then(function (result) {
        if (token !== deliveryCalcToken) return;
        var km = result.km;
        deliveryUsedFallback = result.source !== 'yandex';
        deliveryState.km = km;
        deliveryState.cost = deliveryCostFromKm(km);
        deliveryState.status = 'ok';
        deliveryState.message = '';
      })
      .catch(function (err) {
        if (token !== deliveryCalcToken) return;
        console.warn('delivery_calc', err);
        deliveryState.status = 'error';
        deliveryState.km = null;
        deliveryState.cost = null;
        deliveryState.message = 'delivery_error';
      })
      .then(function () {
        if (token !== deliveryCalcToken) return;
        updateOrderTotals();
      });
  }

  function scheduleDeliveryCalc() {
    if (!orderAddressEl) return;
    var address = orderAddressEl.value.trim();
    if (deliveryDebounceTimer) clearTimeout(deliveryDebounceTimer);
    if (address.length < DELIVERY_MIN_ADDRESS_LEN) {
      deliveryCalcToken++;
      resetDeliveryState();
      return;
    }
    deliveryDebounceTimer = setTimeout(function () {
      if (orderAddressEl.value.trim() !== address) return;
      try {
        calculateDelivery(address);
      } catch (syncErr) {
        console.warn('delivery_calc_sync', syncErr);
        markYmapsUnavailable(syncErr);
        deliveryState.status = 'error';
        deliveryState.message = 'delivery_error';
        renderDeliveryUi();
      }
    }, 700);
  }

  function formatCartLinesForForm() {
    return cart
      .map(function (item, index) {
        var measure = item.qtyMeasure || 'шт.';
        return (
          (index + 1) +
          '. ' +
          item.productName +
          ' — ' +
          (item.colorRu || item.color) +
          ', ' +
          item.size +
          ' — ' +
          item.qty +
          ' ' +
          measure
        );
      })
      .join('\n');
  }

  function clearOrderAfterSubmit() {
    cart = [];
    deliveryCalcToken++;
    resetDeliveryState();
    renderCart();
    if (orderForm) {
      orderForm.reset();
    }
  }

  function clearCart() {
    clearOrderAfterSubmit();
  }

  var PAY_PHONE_COPY = '+79258387248';
  var orderPaymentModalEl = null;
  var orderPaymentModalPrevOverflow = '';
  var orderPaymentAmountRub = 0;

  var orderPayCopyPhoneBtn = null;
  var orderPayCopySumBtn = null;
  var PAY_MODAL_VERSION = '3';

  function safeCopy(text) {
    var el = document.createElement('textarea');
    el.value = String(text);
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      /* ignore */
    }
    document.body.removeChild(el);
  }

  function flashPayCopyButton(btn, defaultLabel) {
    if (!btn) return;
    btn.textContent = 'Скопировано! ✓';
    window.setTimeout(function () {
      btn.textContent = defaultLabel;
    }, 1600);
  }

  function stylePayEl(el, styles) {
    Object.keys(styles).forEach(function (key) {
      el.style[key] = styles[key];
    });
  }

  function createPayActionButton(label, variant) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    stylePayEl(btn, {
      width: '100%',
      boxSizing: 'border-box',
      display: 'block',
      margin: '0 0 12px',
      padding: '16px 14px',
      border: 'none',
      borderRadius: '12px',
      fontSize: '16px',
      fontWeight: '700',
      lineHeight: '1.35',
      cursor: 'pointer',
      fontFamily: 'inherit',
      WebkitTapHighlightColor: 'transparent',
      touchAction: 'manipulation',
      pointerEvents: 'auto'
    });
    if (variant === 'close') {
      stylePayEl(btn, {
        marginBottom: '0',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        color: '#e8ecff',
        background: 'rgba(255, 255, 255, 0.08)'
      });
    } else if (variant === 'sum') {
      stylePayEl(btn, {
        color: '#0f1524',
        background: 'linear-gradient(135deg, #ffd76a 0%, #f5b942 100%)',
        boxShadow: '0 8px 20px rgba(245, 185, 66, 0.28)'
      });
    } else {
      stylePayEl(btn, {
        color: '#ffffff',
        background: 'linear-gradient(135deg, #3d7cff 0%, #2b5fd9 100%)',
        boxShadow: '0 8px 20px rgba(61, 124, 255, 0.28)'
      });
    }
    return btn;
  }

  function destroyOrderPaymentModal() {
    if (orderPaymentModalEl) {
      orderPaymentModalEl.remove();
      orderPaymentModalEl = null;
    }
    orderPayCopyPhoneBtn = null;
    orderPayCopySumBtn = null;
  }

  function createOrderPaymentModal() {
    if (orderPaymentModalEl && orderPaymentModalEl.getAttribute('data-pay-modal-v') !== PAY_MODAL_VERSION) {
      destroyOrderPaymentModal();
    }
    if (orderPaymentModalEl) {
      return orderPaymentModalEl;
    }

    var overlay = document.createElement('div');
    overlay.id = 'order-pay-overlay';
    overlay.setAttribute('data-pay-modal-v', PAY_MODAL_VERSION);
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'order-pay-modal-title');
    stylePayEl(overlay, {
      position: 'fixed',
      inset: '0',
      zIndex: '999999',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      boxSizing: 'border-box',
      background: 'rgba(6, 10, 20, 0.78)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      pointerEvents: 'auto'
    });

    var panel = document.createElement('div');
    panel.id = 'order-pay-panel';
    stylePayEl(panel, {
      position: 'relative',
      zIndex: '1000000',
      width: '100%',
      maxWidth: '420px',
      maxHeight: 'min(92vh, 680px)',
      overflowY: 'auto',
      boxSizing: 'border-box',
      padding: '26px 20px 20px',
      borderRadius: '15px',
      background: 'linear-gradient(165deg, #1e2740 0%, #111827 100%)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      boxShadow: '0 32px 80px rgba(0, 0, 0, 0.62)',
      color: '#f4f7ff',
      fontFamily: 'inherit',
      pointerEvents: 'auto'
    });

    var title = document.createElement('h2');
    title.id = 'order-pay-modal-title';
    title.textContent = 'Арс Строй';
    stylePayEl(title, {
      margin: '0 0 10px',
      fontSize: 'clamp(1.7rem, 5vw, 2rem)',
      fontWeight: '800',
      lineHeight: '1.15',
      textAlign: 'center',
      color: '#ffffff'
    });

    var lead = document.createElement('p');
    lead.textContent = 'Ваш заказ успешно принят! Скопируйте реквизиты для оплаты:';
    stylePayEl(lead, {
      margin: '0 0 18px',
      fontSize: '15px',
      lineHeight: '1.5',
      textAlign: 'center',
      color: 'rgba(244, 247, 255, 0.9)'
    });

    orderPayCopyPhoneBtn = createPayActionButton('Скопировать номер телефона', 'phone');
    orderPayCopyPhoneBtn.id = 'order-pay-copy-phone-btn';
    orderPayCopyPhoneBtn.addEventListener('click', function () {
      safeCopy(PAY_PHONE_COPY);
      flashPayCopyButton(orderPayCopyPhoneBtn, 'Скопировать номер телефона');
    });

    orderPayCopySumBtn = createPayActionButton('Скопировать сумму заказа', 'sum');
    orderPayCopySumBtn.id = 'order-pay-copy-sum-btn';
    orderPayCopySumBtn.addEventListener('click', function () {
      safeCopy(formatMoney(Math.max(0, Math.round(orderPaymentAmountRub))));
      flashPayCopyButton(orderPayCopySumBtn, 'Скопировать сумму заказа');
    });

    var guide = document.createElement('div');
    guide.textContent =
      'Как оплатить заказ:\n' +
      '1. Скопируйте номер телефона и сумму кнопками выше.\n' +
      '2. Откройте приложение вашего любимого банка (Сбербанк, Альфа-Банк, Т-Банк и др.).\n' +
      '3. Сделайте перевод по номеру телефона через СБП.';
    stylePayEl(guide, {
      margin: '4px 0 16px',
      padding: '14px 12px',
      borderRadius: '12px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      background: 'rgba(255, 255, 255, 0.05)',
      fontSize: '14px',
      fontWeight: '600',
      lineHeight: '1.6',
      color: 'rgba(244, 247, 255, 0.92)',
      whiteSpace: 'pre-line'
    });

    var closeBtn = createPayActionButton('Закрыть и очистить корзину', 'close');
    closeBtn.id = 'order-pay-close-btn';
    closeBtn.addEventListener('click', function () {
      hideOrderPaymentModal();
      clearCart();
    });

    if (!window.__orderPayEscBound) {
      window.__orderPayEscBound = true;
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && orderPaymentModalEl && orderPaymentModalEl.style.display === 'flex') {
          hideOrderPaymentModal();
          clearCart();
        }
      });
    }

    panel.appendChild(title);
    panel.appendChild(lead);
    panel.appendChild(orderPayCopyPhoneBtn);
    panel.appendChild(orderPayCopySumBtn);
    panel.appendChild(guide);
    panel.appendChild(closeBtn);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    orderPaymentModalEl = overlay;
    return orderPaymentModalEl;
  }

  function showOrderPaymentModal(totalRub) {
    orderPaymentAmountRub = Math.max(0, Math.round(Number(totalRub) || 0));
    var modal = createOrderPaymentModal();
    orderPaymentModalPrevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modal.style.display = 'flex';
    if (orderPayCopyPhoneBtn) {
      orderPayCopyPhoneBtn.focus();
    }
  }

  function hideOrderPaymentModal() {
    if (!orderPaymentModalEl) {
      return;
    }
    orderPaymentModalEl.style.display = 'none';
    document.body.style.overflow = orderPaymentModalPrevOverflow;
    if (typeof closeCartModal === 'function') {
      closeCartModal();
    }
  }

  /** Отправка заказа плитки (корзины) → Formspree. */
  async function sendFormspreeOrder(orderData) {
    try {
      var domain = 'https://formspree.io';
      var path = '/f/xgoqzaey';
      var response = await fetch(domain + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(orderData)
      });
      if (response.ok) {
        var totalRub = 0;
        if (orderData && orderData.total) {
          var parsed = parseInt(String(orderData.total).replace(/\D/g, ''), 10);
          if (!isNaN(parsed)) {
            totalRub = parsed;
          }
        }
        if (!totalRub) {
          totalRub = getCartGrandTotal();
        }
        showOrderPaymentModal(totalRub);
        return true;
      }
      alert('Ошибка при отправке заказа.');
      return false;
    } catch (error) {
      console.error('Error:', error);
      alert('Произошла ошибка соединения.');
      return false;
    }
  }

  /** Отправка заявки на замерщика → Formspree. */
  async function sendFormspreeZamershik(zamershikData) {
    try {
      var domain = 'https://formspree.io';
      var path = '/f/xjgzoybd';
      var response = await fetch(domain + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(zamershikData)
      });
      if (response.ok) {
        alert('Заявка на замерщика успешно отправлена!');
        if (ukladkaForm) {
          ukladkaForm.reset();
        }
        var successEl = document.getElementById('ukladka-success');
        if (successEl) {
          successEl.hidden = false;
        }
        if (typeof closeZamershikModal === 'function') {
          closeZamershikModal();
        }
        return true;
      }
      alert('Ошибка при отправке заявки.');
      return false;
    } catch (error) {
      console.error('Error:', error);
      alert('Произошла ошибка соединения.');
      return false;
    }
  }

  function slugifyAscii(text) {
    return String(text)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function getLabelFromEl(el) {
    var labelRoot =
      el.querySelector('.price-cell__row') ||
      el.querySelector('.subprices__row-main') ||
      el;
    var clone = labelRoot.cloneNode(true);
    clone.querySelectorAll('b, .unit, .btn--buy, .tile-preview').forEach(function (n) {
      n.remove();
    });
    return clone.textContent.replace(/\s+/g, ' ').trim();
  }

  function getColorDotSlug(el) {
    var dot = el.querySelector('[class*="color-dot--"]');
    if (!dot) return 'gray';
    var match = dot.className.match(/color-dot--([a-z0-9-]+)/);
    return match ? match[1] : 'gray';
  }

  function getColorVariantKey(el, colorLabel) {
    var label = (colorLabel || '').toLowerCase();
    if (/белом\s+цемент/i.test(label)) return 'yellow-white';
    if (/обычн\w*\s+цемент/i.test(label)) return 'yellow-cement';
    var slug = getColorDotSlug(el);
    if (slug === 'yellow' && !/белом/i.test(label)) return 'yellow-cement';
    return slug;
  }

  /** Одна миниатюра на цвет — для 60 и 40 мм фото одинаковые */
  function bruschatkaTileSrc(colorVariantKey) {
    return TILE_IMG_BASE + '/bruschatka-60-' + colorVariantKey + '.jpg';
  }

  function bruschatkaTileAltSrc(src) {
    if (src.indexOf('bruschatka-60-') === -1) return null;
    return src.replace('bruschatka-60-', 'bruschatka-40-');
  }

  /** Одна миниатюра на цвет для всех размеров литья */
  function litoTileSrc(colorVariantKey) {
    return TILE_IMG_BASE + '/lito-' + colorVariantKey + '.jpg';
  }

  var BORDYUR_PREVIEW_SIZES = ['1000-200-80', '500-200-60', '1000-300-150'];

  function bordyurTileSrc(sizeCode, colorVariantKey) {
    return TILE_IMG_BASE + '/bordyur-' + sizeCode + '-' + colorVariantKey + '.jpg';
  }

  function isBlokBlock(meta, productKey) {
    return meta.blockId === 'prices-block' || productKey === 'blok';
  }

  function assetSrcFromImg(imgEl) {
    if (!imgEl) return '';
    var attr = imgEl.getAttribute('src');
    if (attr) return attr;
    var abs = imgEl.src || '';
    var idx = abs.indexOf('/assets/');
    return idx !== -1 ? abs.slice(idx + 1) : abs;
  }

  function isAssetCatalogSrc(src) {
    return /(?:^|\/)(assets\/(?:blok-|lito-|bordyur-|novyi-gorod|zavod))/i.test(src || '');
  }

  function isTileCatalogSrc(src) {
    return (src || '').indexOf(TILE_IMG_BASE + '/') !== -1;
  }

  function blokTileSrc(kindOrSizeCode) {
    if (
      kindOrSizeCode === 'solid' ||
      kindOrSizeCode === '390-190-188' ||
      /полнотел/i.test(kindOrSizeCode || '')
    ) {
      return 'assets/blok-polnotelnyi.png';
    }
    if (
      kindOrSizeCode === 'hollow' ||
      kindOrSizeCode === '390-188-190' ||
      /пустотел/i.test(kindOrSizeCode || '')
    ) {
      return 'assets/blok-pustotelniy.png';
    }
    return 'assets/blok-polnotelnyi.png';
  }

  function resolveBlokImage(el, meta) {
    var blockCard = el.closest('.subprices__card');
    var blockPhoto = blockCard ? blockCard.querySelector('.subprices__photo') : null;
    var photoSrc = assetSrcFromImg(blockPhoto);
    if (photoSrc && /blok-(polnotelnyi|pustotelniy)\.png/i.test(photoSrc)) {
      return photoSrc;
    }
    var blockKind =
      meta.blockType || blockTypeFromCard(el) || blockTypeCode(meta.subTitle || '');
    return blokTileSrc(blockKind);
  }

  function bordyurTileAltSrcs(sizeCode, colorVariantKey) {
    var out = [];
    BORDYUR_PREVIEW_SIZES.forEach(function (code) {
      if (code === sizeCode) return;
      out.push(bordyurTileSrc(code, colorVariantKey));
    });
    return out;
  }

  function normalizeColorName(label) {
    return label
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function colorRuFromEl(el, colorLabel) {
    var name = normalizeColorName(colorLabel);
    if (name) return name;
    var key = getColorVariantKey(el, colorLabel || '');
    return COLOR_RU_BY_SLUG[key] || '—';
  }

  function defaultQtyForMeasure(measure) {
    return measure === 'м²' ? null : 1;
  }

  function parseQtyInput(raw) {
    var n = parseInt(String(raw).replace(/\s/g, ''), 10);
    return n > 0 ? n : null;
  }

  function getBlockMeta(el) {
    var block = el.closest('.price-block');
    var blockId = block ? block.id : '';
    var blockTitle = block ? (block.querySelector('.price-block__title') || {}).textContent || '' : '';
    blockTitle = blockTitle.trim();
    var subCard = el.closest('.subprices__card');
    var subTitle = subCard ? (subCard.querySelector('.subprices__title') || {}).textContent || '' : '';
    subTitle = subTitle.trim();
    var subDims = subCard ? (subCard.querySelector('.subprices__dims') || {}).textContent || '' : '';
    subDims = subDims.trim();
    var blockType = subCard ? subCard.getAttribute('data-block-type') || '' : '';
    return {
      blockId: blockId,
      blockTitle: blockTitle,
      subTitle: subTitle,
      subDims: subDims,
      blockType: blockType
    };
  }

  function parsePrice(el) {
    var b = el.querySelector('b');
    if (!b) return 0;
    return parseInt(b.textContent.replace(/\s/g, ''), 10) || 0;
  }

  function parseUnit(el) {
    var unit = el.querySelector('.unit');
    return unit ? unit.textContent.trim() : 'руб.';
  }

  function qtyMeasureFromUnit(unit) {
    if (/м²|м2/i.test(unit)) return 'м²';
    if (/шт/i.test(unit)) return 'шт.';
    return 'шт.';
  }

  function sizeCodeFromTitle(title) {
    return slugifyAscii(title.replace(/×/g, '-').replace(/мм/g, ''));
  }

  var BLOCK_BY_TYPE = {
    solid: { size: '390×190×188 мм', sizeCode: '390-190-188' },
    hollow: { size: '390×188×190 мм', sizeCode: '390-188-190' }
  };

  function blockTypeFromCard(el) {
    var card = el.closest('.subprices__card');
    if (card && card.getAttribute('data-block-type')) {
      return card.getAttribute('data-block-type');
    }
    var subTitle = card
      ? ((card.querySelector('.subprices__title') || {}).textContent || '')
      : '';
    return blockTypeCode(subTitle.trim());
  }

  function blockTypeCode(subTitle) {
    if (/пустотел/i.test(subTitle)) return 'hollow';
    if (/полнотел/i.test(subTitle)) return 'solid';
    return slugifyAscii(subTitle);
  }

  function resolveVariantConfig(el) {
    var meta = getBlockMeta(el);
    var cfg = BLOCK_CONFIG[meta.blockId] || {
      productKey: 'product',
      productName: meta.blockTitle || 'Товар',
      size: meta.subTitle || '',
      sizeCode: sizeCodeFromTitle(meta.subTitle || meta.blockTitle),
      articlePrefix: 'ITEM'
    };

    var colorLabelRaw = getLabelFromEl(el);
    var colorLabel = colorLabelRaw;
    var colorVariantKey = getColorVariantKey(el, colorLabelRaw);
    var colorArticle = COLOR_SLUG_MAP[colorVariantKey] || slugifyAscii(colorVariantKey);

    var productKey = cfg.productKey;
    var productName = cfg.productName;
    var size = cfg.size || meta.subTitle || '';
    var sizeCode = cfg.sizeCode || sizeCodeFromTitle(size || meta.subTitle);

    if (meta.blockId === 'prices-cast' && meta.subTitle) {
      size = meta.subTitle;
      sizeCode = sizeCodeFromTitle(meta.subTitle);
      productKey = 'lito-' + meta.subTitle.replace(/×/g, '-');
    }

    if (meta.blockId === 'prices-curb' && meta.subTitle) {
      size = meta.subTitle;
      sizeCode = sizeCodeFromTitle(meta.subTitle);
      productKey = 'bordyur';
    }

    if (meta.blockId === 'prices-block' && meta.subTitle) {
      var blockKind = meta.blockType || blockTypeFromCard(el);
      var blockInfo = BLOCK_BY_TYPE[blockKind] || {};
      productName = meta.subTitle;
      size = meta.subDims || blockInfo.size || '';
      sizeCode = blockInfo.sizeCode || blockKind;
      productKey = 'blok';
    }

    var image;
    if (isBlokBlock(meta, productKey)) {
      image = resolveBlokImage(el, meta);
    } else if (productKey === 'bruschatka') {
      image = bruschatkaTileSrc(colorVariantKey);
    } else if (meta.blockId === 'prices-cast') {
      image = litoTileSrc(colorVariantKey);
    } else if (meta.blockId === 'prices-curb') {
      image = bordyurTileSrc(sizeCode, colorVariantKey);
    } else {
      image = TILE_IMG_BASE + '/' + productKey + '-' + colorVariantKey + '.jpg';
    }

    var variantId = [meta.blockId, sizeCode, colorVariantKey].join('|');
    var article = 'ARS-' + cfg.articlePrefix + '-' + sizeCode + '-' + colorArticle;
    var unit = parseUnit(el);
    var qtyMeasure = qtyMeasureFromUnit(unit);
    var colorRu = colorRuFromEl(el, colorLabel);

    return {
      id: variantId,
      productName: productName || cfg.productName,
      color: colorRu,
      colorRu: colorRu,
      size: size,
      article: article,
      price: parsePrice(el),
      unit: unit,
      qtyMeasure: qtyMeasure,
      image: image,
      qty: defaultQtyForMeasure(qtyMeasure)
    };
  }

  function tileFallback(el) {
    var meta = getBlockMeta(el);
    if (meta.blockId === 'prices-curb') return 'assets/bordyur-1.png';
    if (meta.blockId === 'prices-block') {
      return blokTileSrc(meta.blockType || blockTypeCode(meta.subTitle || ''));
    }
    if (meta.blockId === 'prices-cast') return 'assets/lito-1.png';
    if (meta.blockId === 'prices-city') return 'assets/novyi-gorod-1.png';
    return TILE_FALLBACK;
  }

  function blokFallbackFromItem(item) {
    if (!item || !item.id) return 'assets/blok-polnotelnyi.png';
    var sizePart = (item.id || '').split('|')[1] || '';
    return blokTileSrc(sizePart);
  }

  function bindTileImgError(img, el, src, altSrcs, options) {
    options = options || {};
    var curbAlts = altSrcs && altSrcs.length ? altSrcs.slice() : null;
    img.addEventListener('error', function onTileError() {
      if (curbAlts && curbAlts.length) {
        img.src = curbAlts.shift();
        return;
      }
      if (options.blokFallback) {
        img.removeEventListener('error', onTileError);
        img.src = options.blokFallback;
        return;
      }
      if (isAssetCatalogSrc(src) || isAssetCatalogSrc(img.src)) {
        img.removeEventListener('error', onTileError);
        if (el) {
          img.src = tileFallback(el);
        }
        return;
      }
      if (!isTileCatalogSrc(src)) {
        img.removeEventListener('error', onTileError);
        return;
      }
      var alt = bruschatkaTileAltSrc(src);
      if (alt && img.src.indexOf('bruschatka-40-') === -1) {
        img.src = alt;
        return;
      }
      img.removeEventListener('error', onTileError);
      img.src = el ? tileFallback(el) : TILE_FALLBACK;
    });
  }

  function bindCartItemImage(img, item) {
    var src = item.image || '';
    img.src = src;
    if (isBlokBlock({ blockId: (item.id || '').split('|')[0] }, 'blok') || isAssetCatalogSrc(src)) {
      bindTileImgError(img, null, src, null, {
        blokFallback: blokFallbackFromItem(item)
      });
      return;
    }
    var cartTileAlts = /bordyur/i.test(src)
      ? bordyurTileAltSrcs(
          (item.id || '').split('|')[1] || '',
          (item.id || '').split('|')[2] || 'gray'
        )
      : null;
    bindTileImgError(img, null, src, cartTileAlts);
  }

  function injectTilePreview(el) {
    if (el.querySelector('.tile-preview')) return;
    var variant = resolveVariantConfig(el);
    var meta = getBlockMeta(el);
    var img = document.createElement('img');
    img.className = 'tile-preview';
    img.src = variant.image;
    img.alt = variant.color;
    img.width = 256;
    img.height = 256;
    img.decoding = 'async';
    img.loading = 'lazy';
    var tileAlts =
      meta.blockId === 'prices-curb'
        ? bordyurTileAltSrcs(
            sizeCodeFromTitle(meta.subTitle || ''),
            getColorVariantKey(el, getLabelFromEl(el))
          )
        : null;
    bindTileImgError(img, el, variant.image, tileAlts);

    el.setAttribute('data-variant-id', variant.id);
    el.setAttribute('data-tile-src', variant.image);

    var dot = el.querySelector('.color-dot');
    if (dot) {
      dot.after(img);
    } else {
      el.insertBefore(img, el.firstChild);
    }
  }

  function enrichCatalogCells() {
    document.querySelectorAll('.price-cell, .subprices__row').forEach(function (el) {
      if (el.closest('#prices-block')) return;
      injectTilePreview(el);
    });
  }

  function buildProductFromEl(el) {
    return resolveVariantConfig(el);
  }

  function getCartCount() {
    return cart.length;
  }

  function cartHasMissingQty() {
    return cart.some(function (item) {
      return item.qty == null || item.qty <= 0;
    });
  }

  function updateCartBadge() {
    if (cartCountEl) cartCountEl.textContent = String(getCartCount());
  }

  function cartSpecRow(label, valueHtml, extraClass) {
    var cls = 'cart-item__spec' + (extraClass ? ' ' + extraClass : '');
    return (
      '<div class="' + cls + '"><dt>' + label + '</dt><dd>' + valueHtml + '</dd></div>'
    );
  }

  function renderCartRows(container, item, isSqm) {
    var qtyLabel = isSqm ? 'Количество, м²' : 'Количество, шт.';
    container.innerHTML =
      '<dl class="cart-item__specs">' +
      cartSpecRow('Наименование', item.productName) +
      cartSpecRow('Цвет', item.colorRu || item.color) +
      (item.size ? cartSpecRow('Размер и толщина', item.size) : '') +
      cartSpecRow('Артикул', '<code>' + item.article + '</code>') +
      cartSpecRow(
        'Цена',
        formatMoney(item.price) + ' ' + item.unit,
        'cart-item__spec--price'
      ) +
      '<div class="cart-item__spec cart-item__spec--qty">' +
      '<dt>' + qtyLabel + '</dt>' +
      '<dd class="cart-item__qty-dd"></dd></div>' +
      cartSpecRow('Сумма', '<span class="cart-item__sum">—</span>', 'cart-item__spec--sum') +
      '</dl>';
  }

  function renderCart() {
    if (!cartItemsEl) return;

    if (cart.length === 0) {
      cartItemsEl.innerHTML = '';
      if (orderCart) orderCart.hidden = true;
      if (orderSelected) orderSelected.hidden = false;
      resetDeliveryState();
      updateCartBadge();
      return;
    }

    if (orderCart) orderCart.hidden = false;
    if (orderSelected) orderSelected.hidden = true;

    cartItemsEl.innerHTML = '';
    cart.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'cart-item';
      var isSqm = item.qtyMeasure === 'м²';
      row.innerHTML =
        '<img class="cart-item__img" src="" alt="" width="256" height="256" />' +
        '<div class="cart-item__body">' +
        '<div class="cart-item__details"></div>' +
        '</div>' +
        '<button type="button" class="cart-item__remove" aria-label="Удалить">×</button>';

      var img = row.querySelector('.cart-item__img');
      img.alt = item.productName + ' — ' + item.color;
      bindCartItemImage(img, item);

      renderCartRows(row.querySelector('.cart-item__details'), item, isSqm);

      var qtyDd = row.querySelector('.cart-item__qty-dd');
      var sumEl = row.querySelector('.cart-item__sum');

      var minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'qty-control__btn';
      minus.textContent = '−';
      var input = document.createElement('input');
      input.type = 'number';
      input.className = 'qty-control__input';
      input.min = '1';
      input.step = '1';
      input.inputMode = 'numeric';
      input.required = true;
      if (isSqm) {
        input.placeholder = 'м²';
        input.value = item.qty != null ? String(item.qty) : '';
      } else {
        input.value = String(item.qty != null ? item.qty : 1);
      }
      var plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'qty-control__btn';
      plus.textContent = '+';
      var qtyControl = document.createElement('div');
      qtyControl.className = 'qty-control';
      qtyControl.appendChild(minus);
      qtyControl.appendChild(input);
      qtyControl.appendChild(plus);
      qtyDd.appendChild(qtyControl);

      function syncLine() {
        item.qty = parseQtyInput(input.value);
        if (item.qty == null) {
          sumEl.textContent = isSqm
            ? 'Укажите м²'
            : 'Укажите количество';
          updateOrderTotals();
          updateCartBadge();
          return;
        }
        input.value = String(item.qty);
        sumEl.textContent = formatMoney(item.price * item.qty) + ' руб.';
        updateOrderTotals();
        updateCartBadge();
      }
      minus.addEventListener('click', function () {
        var cur = item.qty != null ? item.qty : 1;
        input.value = String(Math.max(1, cur - 1));
        syncLine();
      });
      plus.addEventListener('click', function () {
        var cur = item.qty != null ? item.qty : 0;
        input.value = String(cur + 1);
        syncLine();
      });
      input.addEventListener('input', syncLine);
      syncLine();

      row.querySelector('.cart-item__remove').addEventListener('click', function () {
        cart = cart.filter(function (c) {
          return c.lineUid !== item.lineUid;
        });
        renderCart();
      });

      cartItemsEl.appendChild(row);
    });

    updateOrderTotals();
    updateCartBadge();
  }

  function addToCart(product) {
    var existing = cart.find(function (item) {
      return item.id === product.id;
    });
    if (existing) {
      if (product.qty != null) {
        existing.qty =
          existing.qty != null ? existing.qty + product.qty : product.qty;
      }
      if (product.image) {
        existing.image = product.image;
      }
    } else {
      product.lineUid = product.id + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      cart.push(product);
    }
    renderCart();
  }

  function scrollToOrder() {
    if (orderSection) {
      orderSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function createCartButton(getProduct) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--primary btn--buy';
    btn.textContent = 'В корзину';
    btn.addEventListener('click', function () {
      addToCart(getProduct());
      scrollToOrder();
    });
    return btn;
  }

  function wrapPriceCell(cell) {
    if (cell.querySelector('.btn--buy')) return;
    var row = document.createElement('div');
    row.className = 'price-cell__row';
    while (cell.firstChild) {
      row.appendChild(cell.firstChild);
    }
    cell.appendChild(row);
    cell.appendChild(
      createCartButton(function () {
        return buildProductFromEl(cell);
      })
    );
  }

  function wrapSubpriceRow(rowEl) {
    if (rowEl.querySelector('.btn--buy')) return;
    var main = document.createElement('div');
    main.className = 'subprices__row-main';
    while (rowEl.firstChild) {
      main.appendChild(rowEl.firstChild);
    }
    rowEl.appendChild(main);
    rowEl.appendChild(
      createCartButton(function () {
        return buildProductFromEl(rowEl);
      })
    );
  }

  function initBlockCards() {
    var blockSection = document.getElementById('prices-block');
    if (!blockSection) return;
    blockSection.querySelectorAll('.tile-preview').forEach(function (img) {
      img.remove();
    });
    blockSection.querySelectorAll('.subprices__card').forEach(function (card) {
      var row = card.querySelector('.subprices__row');
      if (!row) return;
      if (!row.querySelector('.btn--buy')) {
        wrapSubpriceRow(row);
      }
      var btn = row.querySelector('.btn--buy');
      if (!btn) return;
      btn.classList.add('btn--buy-block');
      card.appendChild(btn);
    });
  }

  enrichCatalogCells();
  document.querySelectorAll('.price-cell').forEach(wrapPriceCell);
  document.querySelectorAll('.subprices__row').forEach(wrapSubpriceRow);
  initBlockCards();

  if (cartClearBtn) {
    cartClearBtn.addEventListener('click', function () {
      cart = [];
      deliveryCalcToken++;
      renderCart();
    });
  }

  if (orderAddressEl) {
    orderAddressEl.addEventListener('input', scheduleDeliveryCalc);
    orderAddressEl.addEventListener('change', scheduleDeliveryCalc);
    orderAddressEl.addEventListener('blur', function () {
      var address = orderAddressEl.value.trim();
      if (address.length >= DELIVERY_MIN_ADDRESS_LEN) calculateDelivery(address);
    });
  }

  if (orderForm) {
    orderForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      if (!orderForm.checkValidity()) {
        orderForm.reportValidity();
        return;
      }

      if (cart.length === 0) {
        alert('Корзина пуста. В разделе «Прайс» выберите размер и цвет и нажмите «В корзину».');
        return;
      }
      if (cartHasMissingQty()) {
        alert('Укажите количество для каждой позиции (м² или шт.).');
        return;
      }

      var nameEl = document.getElementById('order-name');
      var companyEl = document.getElementById('order-company');
      var phoneEl = document.getElementById('order-phone');
      var emailEl = document.getElementById('order-email');
      var addressEl = document.getElementById('order-address');
      var commentEl = document.getElementById('order-comment');
      var phone = phoneEl ? phoneEl.value.trim() : '';

      if (!phone) {
        if (phoneEl) {
          phoneEl.focus();
          phoneEl.reportValidity();
        }
        return;
      }

      var submitBtn = orderForm.querySelector('.order-form__submit');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('order-form__submit--loading');
      }

      var orderData = {
        name: nameEl ? nameEl.value.trim() : '',
        company: companyEl ? companyEl.value.trim() : '',
        phone: phone,
        email: emailEl ? emailEl.value.trim() : '',
        address: addressEl ? addressEl.value.trim() : '',
        comment: commentEl ? commentEl.value.trim() : '',
        cart: formatCartLinesForForm(),
        total: formatMoney(getCartGrandTotal()) + ' руб.'
      };

      await sendFormspreeOrder(orderData);

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('order-form__submit--loading');
      }
    });
  }

  if (ukladkaForm) {
    var ukladkaSuccessEl = document.getElementById('ukladka-success');
    var ukladkaNameEl = document.getElementById('ukladka-name');
    var ukladkaPhoneEl = document.getElementById('ukladka-phone');
    var ukladkaAddressEl = document.getElementById('ukladka-address');
    var ukladkaSubmitBtn = document.getElementById('ukladka-submit');
    var ukladkaSending = false;

    ukladkaForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (ukladkaSending) return;
      if (ukladkaSuccessEl) ukladkaSuccessEl.hidden = true;

      if (!ukladkaForm.checkValidity()) {
        ukladkaForm.reportValidity();
        return;
      }

      var name = ukladkaNameEl ? ukladkaNameEl.value.trim() : '';
      var phone = ukladkaPhoneEl ? ukladkaPhoneEl.value.trim() : '';
      var address = ukladkaAddressEl ? ukladkaAddressEl.value.trim() : '';

      if (!phone) {
        if (ukladkaPhoneEl) {
          ukladkaPhoneEl.focus();
          ukladkaPhoneEl.reportValidity();
        }
        return;
      }
      if (!address) {
        if (ukladkaAddressEl) {
          ukladkaAddressEl.focus();
          ukladkaAddressEl.reportValidity();
        }
        return;
      }

      ukladkaSending = true;
      if (ukladkaSubmitBtn) {
        ukladkaSubmitBtn.disabled = true;
        ukladkaSubmitBtn.textContent = 'Отправляем…';
      }

      var zamershikData = {
        name: name,
        phone: phone,
        address: address
      };

      await sendFormspreeZamershik(zamershikData);

      ukladkaSending = false;
      if (ukladkaSubmitBtn) {
        ukladkaSubmitBtn.disabled = false;
        ukladkaSubmitBtn.textContent = 'Отправить заявку';
      }
    });
  }

  resetDeliveryState();
  renderCart();
})();
