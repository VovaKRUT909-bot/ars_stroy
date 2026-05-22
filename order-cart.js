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

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  var TELEGRAM_CHAT_ID = '7667524051';
  var TOKEN_ZAMERSHIK = '8393208986:AAHAHR9EYg_CbntUgT7E8wJdKZ75rFo-miM';
  var TOKEN_ZAKAZ = '8659364210:AAFEzSO8hxk3ZBs3k0tJQAbkXF5p2FQcHhI';
  var FORM_SEND_FAIL_MSG =
    'Не удалось отправить заявку. Позвоните: +7 (925) 805-63-08';

  function sendToTelegram(botToken, htmlText) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: htmlText,
        parse_mode: 'HTML'
      })
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || !data.ok) {
          throw new Error(data.description || 'telegram_send_failed');
        }
        return data;
      });
    });
  }

  /** Заявка на замер → бот замерщика. */
  function sendZamershikForm(name, phone, address) {
    var text =
      '📏 <b>Заявка на замер тротуарной плитки</b>\n\n' +
      '<b>Имя:</b> ' +
      escapeHtml(name || '—') +
      '\n<b>Телефон:</b> ' +
      escapeHtml(phone) +
      '\n<b>Адрес:</b> ' +
      escapeHtml(address);
    return sendToTelegram(TOKEN_ZAMERSHIK, text);
  }

  function formatCartLinesForTelegram() {
    return cart
      .map(function (item, index) {
        var measure = item.qtyMeasure || 'шт.';
        return (
          (index + 1) +
          '. ' +
          escapeHtml(item.productName) +
          ' — ' +
          escapeHtml(item.colorRu || item.color) +
          ', ' +
          escapeHtml(item.size) +
          '\n   <b>Количество:</b> ' +
          item.qty +
          ' ' +
          escapeHtml(measure)
        );
      })
      .join('\n');
  }

  /** Заказ из корзины → бот заказов. */
  function sendZakazForm(phone) {
    var text =
      '🛒 <b>Новый заказ брусчатки</b>\n\n' +
      '<b>Выбранная брусчатка:</b>\n' +
      formatCartLinesForTelegram() +
      '\n\n<b>Телефон:</b> ' +
      escapeHtml(phone);
    return sendToTelegram(TOKEN_ZAKAZ, text);
  }

  var PAY_PHONE_DISPLAY = '+7 (925) 838-72-48';
  var PAY_NSPK_URL = 'https://nspk.ru';
  var sbpPayModalEl = null;
  var sbpPayPrevBodyOverflow = '';

  function getPayQrImageUrl(dataUrl) {
    return (
      'https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=14&data=' +
      encodeURIComponent(dataUrl)
    );
  }

  function ensureSbpPayModal() {
    if (sbpPayModalEl && document.getElementById('sbp-pay-cash')) {
      return sbpPayModalEl;
    }
    if (sbpPayModalEl) {
      sbpPayModalEl.remove();
      sbpPayModalEl = null;
    }

    var root = document.createElement('div');
    root.id = 'sbp-pay-modal';
    root.className = 'sbp-pay';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'sbp-pay-title');

    root.innerHTML =
      '<div class="sbp-pay__backdrop" data-sbp-close tabindex="-1" aria-hidden="true"></div>' +
      '<div class="sbp-pay__panel">' +
      '<button type="button" class="sbp-pay__close-x" data-sbp-close aria-label="Закрыть">×</button>' +
      '<h2 class="sbp-pay__title" id="sbp-pay-title">⚡ Оформление заказа — АРС Строй</h2>' +
      '<p class="sbp-pay__intro" id="sbp-pay-intro"></p>' +
      '<div class="sbp-pay__qr-block sbp-pay__desktop-only">' +
      '<p class="sbp-pay__qr-caption">Отсканируйте QR-код в приложении банка (СБП), укажите сумму и номер получателя вручную</p>' +
      '<div class="sbp-pay__qr-wrap">' +
      '<img class="sbp-pay__qr" id="sbp-pay-qr" width="240" height="240" alt="QR-код для оплаты через СБП" decoding="async" />' +
      '</div>' +
      '</div>' +
      '<div class="sbp-pay__methods sbp-pay__mobile-only">' +
      '<a class="sbp-pay__method sbp-pay__method--sber" href="' +
      PAY_NSPK_URL +
      '" target="_blank" rel="noopener noreferrer">📲 Перевод через Сбербанк</a>' +
      '<a class="sbp-pay__method sbp-pay__method--alfa" href="' +
      PAY_NSPK_URL +
      '" target="_blank" rel="noopener noreferrer">📲 Перевод через Альфа-Банк</a>' +
      '</div>' +
      '<button type="button" class="sbp-pay__method sbp-pay__method--cash" id="sbp-pay-cash">💵 Оплата наличными водителю при доставке</button>' +
      '<p class="sbp-pay__reserve">Резервный номер телефона для перевода: <strong>' +
      PAY_PHONE_DISPLAY +
      '</strong></p>' +
      '<button type="button" class="btn btn--ghost sbp-pay__later" data-sbp-close>Закрыть</button>' +
      '</div>';

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-sbp-close]')) {
        closeSbpPayModalAndClearCart();
        return;
      }
      if (e.target.closest('#sbp-pay-cash')) {
        e.preventDefault();
        chooseCashPaymentAndClose();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sbpPayModalEl && !sbpPayModalEl.hidden) {
        closeSbpPayModalAndClearCart();
      }
    });

    document.body.appendChild(root);
    sbpPayModalEl = root;
    return sbpPayModalEl;
  }

  function chooseCashPaymentAndClose() {
    closeSbpPayModalAndClearCart();
    window.alert(
      "Способ оплаты 'Наличными' выбран. Менеджер свяжется с вами для подтверждения доставки!"
    );
  }

  function showSbpPayModal(sumRub) {
    var modal = ensureSbpPayModal();
    var sum = Math.max(1, Math.round(Number(sumRub) || 0));
    var introEl = document.getElementById('sbp-pay-intro');
    var qrImg = document.getElementById('sbp-pay-qr');

    if (introEl) {
      introEl.innerHTML =
        'Ваш заказ успешно сформирован! Сумма к оплате: <strong>' +
        formatMoney(sum) +
        ' руб.</strong><br>Выберите удобный способ оплаты ниже:';
    }
    if (qrImg) {
      qrImg.src = getPayQrImageUrl(PAY_NSPK_URL);
    }

    sbpPayPrevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modal.hidden = false;
    requestAnimationFrame(function () {
      modal.classList.add('sbp-pay--open');
    });

    var cashBtn = document.getElementById('sbp-pay-cash');
    if (cashBtn) {
      cashBtn.focus();
    }
  }

  function closeSbpPayModalAndClearCart() {
    if (!sbpPayModalEl) {
      return;
    }

    sbpPayModalEl.classList.remove('sbp-pay--open');
    sbpPayModalEl.hidden = true;
    document.body.style.overflow = sbpPayPrevBodyOverflow;

    cart = [];
    deliveryCalcToken++;
    resetDeliveryState();
    renderCart();
    if (orderForm) {
      orderForm.reset();
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

  document.querySelectorAll('[data-ukladka-scroll]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = document.getElementById('ukladka-request');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

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
    orderForm.addEventListener('submit', function (e) {
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

      var phoneEl = document.getElementById('order-phone');
      var phone = phoneEl ? phoneEl.value.trim() : '';

      if (!phone) {
        if (phoneEl) {
          phoneEl.focus();
          phoneEl.reportValidity();
        }
        return;
      }

      var orderTotalRub = getCartGrandTotal();

      sendZakazForm(phone)
        .then(function () {
          orderForm.reset();
          showSbpPayModal(orderTotalRub);
        })
        .catch(function (err) {
          console.error(err);
          alert(FORM_SEND_FAIL_MSG);
        });
    });
  }

  if (ukladkaForm) {
    var ukladkaSuccessEl = document.getElementById('ukladka-success');
    var ukladkaNameEl = document.getElementById('ukladka-name');
    var ukladkaPhoneEl = document.getElementById('ukladka-phone');
    var ukladkaAddressEl = document.getElementById('ukladka-address');
    var ukladkaSubmitBtn = document.getElementById('ukladka-submit');
    var ukladkaSending = false;

    ukladkaForm.addEventListener('submit', function (e) {
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

      sendZamershikForm(name, phone, address)
        .then(function () {
          ukladkaForm.reset();
          if (ukladkaSuccessEl) ukladkaSuccessEl.hidden = false;
          alert('Заявка отправлена!');
        })
        .catch(function (err) {
          console.error(err);
          alert(FORM_SEND_FAIL_MSG);
        })
        .then(function () {
          ukladkaSending = false;
          if (ukladkaSubmitBtn) {
            ukladkaSubmitBtn.disabled = false;
            ukladkaSubmitBtn.textContent = 'Отправить заявку';
          }
        });
    });
  }

  resetDeliveryState();
  renderCart();
})();
