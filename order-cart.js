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
  var FD_HOST = 'formdesigner.ru';
  var FD_ZAMERSHIK_FORM_ID = '245426';
  var FD_CHECKOUT_FORM_ID = '245438';
  var FD_IFRAME_FALLBACK_HEIGHT = 480;
  window.ARS_STROY_FD_OPTIONS = window.ARS_STROY_FD_OPTIONS || {
    host: FD_HOST,
    forms: {}
  };
  /** Текстовая область «Ваш заказ» в форме 245438 (ID меняется в конструкторе — держим запасные). */
  var FD_CHECKOUT_ORDER_FIELD = 'field3066355';
  var FD_CHECKOUT_ORDER_FIELD_FALLBACKS = ['field3066335', 'field3066332', 'field3065946'];
  var FD_CHECKOUT_ORDER_FIELD_MAX = 255;
  var checkoutFormRefreshTimer = null;
  var checkoutIframeMountedWithCart = false;
  var lastCheckoutWidgetText = '';
  var CHECKOUT_FORM_SRC_FALLBACK_MS = 80;
  var orderCheckoutFdEl = document.getElementById('order-checkout-fd');
  var orderAddressEl = document.getElementById('order-address');
  var cartSubtotalEl = document.getElementById('cart-subtotal');
  var cart = [];

  var addressInputDebounce = null;
  var FD_HEALTH_CHECK_MS = 7000;
  var FD_HINT_DELAY_MS = 3000;
  var fdOverlayEl = document.getElementById('ars-fd-overlay');
  var fdOverlayEmbedEl = document.getElementById('ars-fd-overlay-embed');
  var fdOverlayTitleEl = document.getElementById('ars-fd-overlay-title');
  var fdOverlayCloseEl = document.getElementById('ars-fd-overlay-close');
  var fdOverlayBackdropEl = document.getElementById('ars-fd-overlay-backdrop');

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
      productName: 'Вибро литая',
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

  /** Полный адрес доставки из поля #order-address. */
  function getClientDeliveryAddressText() {
    if (orderAddressEl && orderAddressEl.value.trim()) {
      return orderAddressEl.value.trim();
    }
    return '';
  }

  function onDeliveryAddressInput() {
    updateOrderTotals();
  }

  function scheduleDeliveryAddressUpdate() {
    if (!orderAddressEl) return;
    if (addressInputDebounce) clearTimeout(addressInputDebounce);
    addressInputDebounce = setTimeout(onDeliveryAddressInput, 30);
  }

  function getCartProductsTotal() {
    return cart.reduce(function (sum, item) {
      if (item.qty == null || item.qty <= 0) return sum;
      return sum + item.price * item.qty;
    }, 0);
  }

  function getCartGrandTotal() {
    return getCartProductsTotal();
  }

  function getOrderTotalText() {
    return formatMoney(getCartProductsTotal()) + ' руб.';
  }

  function updateOrderTotals() {
    if (cartSubtotalEl) {
      cartSubtotalEl.textContent = formatMoney(getCartProductsTotal());
    }
    if (cartGrandTotal) {
      cartGrandTotal.textContent = formatMoney(getCartGrandTotal());
    }
    refreshCheckoutOrderForm();
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

  function formatCartLinesDetailedForForm() {
    return cart
      .map(function (item, index) {
        var measure = item.qtyMeasure || 'шт.';
        var lineSum =
          item.qty != null && item.qty > 0 ? item.price * item.qty : null;
        var lines = [
          (index + 1) + '. ' + item.productName,
          '   Цвет: ' + (item.colorRu || item.color)
        ];
        if (item.size) {
          lines.push('   Размер и толщина: ' + item.size);
        }
        if (item.article) {
          lines.push('   Артикул: ' + item.article);
        }
        lines.push(
          '   Количество: ' +
            (item.qty != null ? item.qty : '—') +
            ' ' +
            measure
        );
        lines.push(
          '   Цена: ' + formatMoney(item.price) + ' ' + (item.unit || '').trim()
        );
        if (lineSum != null) {
          lines.push('   Сумма: ' + formatMoney(lineSum) + ' руб.');
        }
        return lines.join('\n');
      })
      .join('\n\n');
  }

  function scrollToOrderSection() {
    if (!orderSection) return;
    orderSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function scrollToOrderCart() {
    var target = null;
    if (orderCart && cart.length > 0 && !orderCart.hidden) {
      target = orderCart;
    } else if (orderSelected && !orderSelected.hidden) {
      target = orderSelected;
    } else if (orderSection) {
      target = orderSection;
    }
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetOrderCheckout() {
    if (orderCheckoutFdEl) orderCheckoutFdEl.hidden = true;
  }

  function refreshCheckoutDelivery() {
    scheduleDeliveryAddressUpdate();
  }

  function clearOrderAfterSubmit() {
    cart = [];
    resetOrderCheckout();
    renderCart();
  }

  function clearCart() {
    clearOrderAfterSubmit();
  }

  function formatItemQtyForOrder(item) {
    var measure = item.qtyMeasure || 'шт.';
    if (item.qty != null && item.qty > 0) {
      return item.qty + ' ' + measure;
    }
    if (measure === 'м²') {
      return 'м² не указано';
    }
    return '— ' + measure;
  }

  function formatCartLinesCompactForForm() {
    return cart
      .map(function (item, index) {
        var sum =
          item.qty != null && item.qty > 0
            ? formatMoney(item.price * item.qty) + ' руб.'
            : '—';
        var sizePart = item.size ? ', ' + item.size : '';
        return (
          index +
          1 +
          '. ' +
          item.productName +
          ' — ' +
          (item.colorRu || item.color) +
          sizePart +
          ' | ' +
          formatItemQtyForOrder(item) +
          ' | ' +
          sum
        );
      })
      .join('\n');
  }

  function getCheckoutWidgetCartText() {
    var productLines = formatCartLinesCompactForForm() || '—';
    var clientAddress = getClientDeliveryAddressText();
    var deliveryLine = clientAddress
      ? 'Доставка: ' + clientAddress
      : 'Доставка: самовывоз';
    var totalLine = 'Итого: ' + getOrderTotalText();
    var footer = deliveryLine + '\n' + totalLine;
    var maxProductLen = FD_CHECKOUT_ORDER_FIELD_MAX - footer.length - 1;
    if (maxProductLen > 0 && productLines.length > maxProductLen) {
      productLines = productLines.slice(0, Math.max(20, maxProductLen - 1)) + '…';
    }
    return productLines + '\n' + footer;
  }

  function getCheckoutOrderFieldIds() {
    var ids = [FD_CHECKOUT_ORDER_FIELD];
    FD_CHECKOUT_ORDER_FIELD_FALLBACKS.forEach(function (id) {
      if (ids.indexOf(id) === -1) {
        ids.push(id);
      }
    });
    return ids;
  }

  function buildCheckoutOrderFieldsPayload() {
    var orderText = getCheckoutWidgetCartText();
    var fields = {};
    getCheckoutOrderFieldIds().forEach(function (id) {
      fields[id] = orderText;
    });
    return { fields: fields };
  }

  function syncCheckoutFormFieldsToOptions() {
    if (!window.ARS_STROY_FD_OPTIONS) {
      return;
    }
    if (!window.ARS_STROY_FD_OPTIONS.forms) {
      window.ARS_STROY_FD_OPTIONS.forms = {};
    }
    if (!window.ARS_STROY_FD_OPTIONS.forms[FD_CHECKOUT_FORM_ID]) {
      window.ARS_STROY_FD_OPTIONS.forms[FD_CHECKOUT_FORM_ID] = {};
    }
    var formOpts = window.ARS_STROY_FD_OPTIONS.forms[FD_CHECKOUT_FORM_ID];
    formOpts.fields = buildCheckoutOrderFieldsPayload().fields;
  }

  function buildCheckoutIframeSrc() {
    var orderText = getCheckoutWidgetCartText();
    var parts = [];
    getCheckoutOrderFieldIds().forEach(function (id) {
      parts.push(encodeURIComponent(id) + '=' + encodeURIComponent(orderText));
    });
    return buildFormDesignerIframeSrc(FD_CHECKOUT_FORM_ID, parts);
  }

  function pushCheckoutWidgetFieldData() {
    var iframe = getCheckoutWidgetIframe();
    if (!iframe || !iframe.contentWindow) {
      return false;
    }
    syncCheckoutFormFieldsToOptions();
    var payload = buildCheckoutOrderFieldsPayload();
    try {
      iframe.contentWindow.postMessage(
        JSON.stringify({ type: 'setdata', data: payload }),
        'https://formdesigner.ru'
      );
    } catch (err) {
      return false;
    }
    return true;
  }

  function getFormDesignerHintEl(formId) {
    if (formId === FD_ZAMERSHIK_FORM_ID) {
      return document.getElementById('ukladka-fd-hint');
    }
    if (formId === FD_CHECKOUT_FORM_ID) {
      return document.getElementById('order-fd-hint');
    }
    return null;
  }

  function showFormDesignerHint(formId) {
    var hint = getFormDesignerHintEl(formId);
    if (hint) {
      hint.hidden = false;
    }
  }

  function hideFormDesignerHint(formId) {
    var hint = getFormDesignerHintEl(formId);
    if (hint) {
      hint.hidden = true;
    }
  }

  function getCheckoutQueryParts() {
    var parts = [];
    getCheckoutOrderFieldIds().forEach(function (id) {
      parts.push(
        encodeURIComponent(id) + '=' + encodeURIComponent(getCheckoutWidgetCartText())
      );
    });
    return parts;
  }

  function getCheckoutFieldsGetter() {
    return function () {
      return buildCheckoutOrderFieldsPayload().fields;
    };
  }

  function isCheckoutFormDesignerIframe(iframe) {
    return !!(
      iframe &&
      (iframe.closest('.order-checkout-widget') ||
        (fdOverlayEmbedEl && fdOverlayEmbedEl.contains(iframe) &&
          fdOverlayEmbedEl.dataset.id === FD_CHECKOUT_FORM_ID))
    );
  }

  function closeFormDesignerOverlay() {
    if (!fdOverlayEl) {
      return;
    }
    fdOverlayEl.hidden = true;
    fdOverlayEl.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('ars-fd-overlay-open');
    if (fdOverlayEmbedEl) {
      fdOverlayEmbedEl.innerHTML = '';
      fdOverlayEmbedEl.classList.remove('order-checkout-widget');
      delete fdOverlayEmbedEl.dataset.id;
    }
  }

  function openFormDesignerOverlay(formId) {
    if (!fdOverlayEl || !fdOverlayEmbedEl) {
      return;
    }
    if (formId === FD_CHECKOUT_FORM_ID && cart.length === 0) {
      return;
    }
    if (fdOverlayTitleEl) {
      fdOverlayTitleEl.textContent =
        formId === FD_CHECKOUT_FORM_ID ? 'Оформление заказа' : 'Заявка на замер';
    }
    fdOverlayEmbedEl.dataset.id = formId;
    if (formId === FD_CHECKOUT_FORM_ID) {
      fdOverlayEmbedEl.classList.add('order-checkout-widget');
      mountFormDesignerIframe(
        fdOverlayEmbedEl,
        formId,
        getCheckoutQueryParts(),
        getCheckoutFieldsGetter()
      );
    } else {
      fdOverlayEmbedEl.classList.remove('order-checkout-widget');
      mountFormDesignerIframe(fdOverlayEmbedEl, formId, null, function () {
        return {};
      });
    }
    fdOverlayEl.hidden = false;
    fdOverlayEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ars-fd-overlay-open');
  }

  function clearFormDesignerTimers(iframe) {
    if (!iframe) {
      return;
    }
    if (iframe._arsFdHealthTimer) {
      clearTimeout(iframe._arsFdHealthTimer);
      iframe._arsFdHealthTimer = null;
    }
    if (iframe._arsFdHintTimer) {
      clearTimeout(iframe._arsFdHintTimer);
      iframe._arsFdHintTimer = null;
    }
  }

  function remountFormDesignerInline(embedRoot, formId) {
    if (!embedRoot) {
      return null;
    }
    if (formId === FD_CHECKOUT_FORM_ID) {
      return mountFormDesignerIframe(
        embedRoot,
        formId,
        getCheckoutQueryParts(),
        getCheckoutFieldsGetter()
      );
    }
    return mountFormDesignerIframe(embedRoot, formId, null, function () {
      return {};
    });
  }

  function handleFormDesignerLoadFailure(embedRoot, formId) {
    if (!embedRoot || embedRoot.id === 'ars-fd-overlay-embed') {
      return;
    }
    var retries = parseInt(embedRoot.dataset.arsFdRetries || '0', 10);
    if (retries < 1) {
      embedRoot.dataset.arsFdRetries = String(retries + 1);
      remountFormDesignerInline(embedRoot, formId);
      return;
    }
    showFormDesignerHint(formId);
    openFormDesignerOverlay(formId);
  }

  function scheduleFormDesignerHealthCheck(embedRoot, formId) {
    var iframe = embedRoot ? embedRoot.querySelector('iframe') : null;
    if (!iframe) {
      return;
    }
    clearFormDesignerTimers(iframe);
    iframe._arsFdHintTimer = setTimeout(function () {
      if (iframe.dataset.arsFdHeightSet !== '1') {
        showFormDesignerHint(formId);
      }
    }, FD_HINT_DELAY_MS);
    iframe._arsFdHealthTimer = setTimeout(function () {
      if (iframe.dataset.arsFdHeightSet === '1') {
        return;
      }
      handleFormDesignerLoadFailure(embedRoot, formId);
    }, FD_HEALTH_CHECK_MS);
  }

  function bindFormDesignerOverlayControls() {
    if (fdOverlayCloseEl && !fdOverlayCloseEl.dataset.arsBound) {
      fdOverlayCloseEl.dataset.arsBound = '1';
      fdOverlayCloseEl.addEventListener('click', closeFormDesignerOverlay);
    }
    if (fdOverlayBackdropEl && !fdOverlayBackdropEl.dataset.arsBound) {
      fdOverlayBackdropEl.dataset.arsBound = '1';
      fdOverlayBackdropEl.addEventListener('click', closeFormDesignerOverlay);
    }
    document.querySelectorAll('.ars-fd-open-btn').forEach(function (btn) {
      if (btn.dataset.arsBound) {
        return;
      }
      btn.dataset.arsBound = '1';
      btn.addEventListener('click', function () {
        openFormDesignerOverlay(btn.getAttribute('data-fd-form'));
      });
    });
    if (!document.body.dataset.arsFdEscBound) {
      document.body.dataset.arsFdEscBound = '1';
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && fdOverlayEl && !fdOverlayEl.hidden) {
          closeFormDesignerOverlay();
        }
      });
    }
  }

  function readCookie(name) {
    var match = document.cookie.match(
      new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)')
    );
    return match ? decodeURIComponent(match[1]) : '';
  }

  function postToFormDesignerIframe(iframe, type, data) {
    if (!iframe || !iframe.contentWindow) {
      return false;
    }
    try {
      iframe.contentWindow.postMessage(
        JSON.stringify({ type: type, data: data }),
        'https://' + FD_HOST
      );
      return true;
    } catch (err) {
      return false;
    }
  }

  function buildFormDesignerIframeSrc(formId, queryParts) {
    var parts = ['center=1', 'universal=1', 'inline=1'];
    if (queryParts && queryParts.length) {
      queryParts.forEach(function (part) {
        if (parts.indexOf(part) === -1) {
          parts.push(part);
        }
      });
    }
    return (
      'https://' +
      FD_HOST +
      '/form/iframe/' +
      formId +
      '?' +
      parts.join('&')
    );
  }

  function bindFormDesignerIframeEvents(iframe, formId, getFields) {
    if (!iframe || iframe.dataset.arsFdBound === '1') {
      return;
    }
    iframe.dataset.arsFdBound = '1';
    var frameId = formId + '-' + Math.round(Math.random() * 100000);
    iframe.id = frameId;
    iframe.name = frameId;

    iframe.addEventListener('load', function () {
      iframe.dataset.arsFdLoaded = '1';
      var fields = typeof getFields === 'function' ? getFields() : {};
      postToFormDesignerIframe(iframe, 'register', {
        id: frameId,
        referrer: document.referrer,
        url: window.location.href,
        clientId: null,
        yaClientId: readCookie('_ym_uid'),
        cookie: document.cookie,
        fields: fields || {}
      });
      if (fields && Object.keys(fields).length) {
        postToFormDesignerIframe(iframe, 'setdata', { fields: fields });
      }
    });
  }

  function createFormDesignerIframeElement(title) {
    var iframe = document.createElement('iframe');
    iframe.setAttribute('title', title);
    iframe.setAttribute('allow', 'microphone;camera;local-network-access *');
    iframe.setAttribute('allowtransparency', 'true');
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.style.cssText =
      'width:100%;border:0;display:block;height:' +
      FD_IFRAME_FALLBACK_HEIGHT +
      'px;background:transparent;';
    return iframe;
  }

  function mountFormDesignerIframe(root, formId, queryParts, getFields) {
    if (!root) {
      return null;
    }
    root.innerHTML = '';
    var iframe = createFormDesignerIframeElement(
      formId === FD_ZAMERSHIK_FORM_ID ? 'Заявка на замер' : 'Форма заказа'
    );
    bindFormDesignerIframeEvents(iframe, formId, getFields);
    iframe.src = buildFormDesignerIframeSrc(formId, queryParts);
    root.appendChild(iframe);
    scheduleFormDesignerHealthCheck(root, formId);
    return iframe;
  }

  function getZamershikWidgetRoot() {
    return document.querySelector(
      '.ukladka-request__card .ars-fd-embed[data-id="' +
        FD_ZAMERSHIK_FORM_ID +
        '"]'
    );
  }

  function hasFormDesignerIframe(root) {
    var iframe = root ? root.querySelector('iframe') : null;
    return !!(
      iframe &&
      iframe.src &&
      iframe.src.indexOf(FD_HOST) !== -1
    );
  }

  function ensureZamershikFormWidget() {
    var root = getZamershikWidgetRoot();
    if (!root || hasFormDesignerIframe(root)) {
      return;
    }
    mountFormDesignerIframe(root, FD_ZAMERSHIK_FORM_ID, null, function () {
      return {};
    });
  }

  function ensureAllFormDesignerWidgets() {
    ensureZamershikFormWidget();
    if (cart.length > 0 && orderCheckoutFdEl && !orderCheckoutFdEl.hidden) {
      refreshCheckoutOrderForm();
    }
  }

  /** Первое появление формы в корзине. */
  function mountCheckoutIframeWithOrderInUrl() {
    var root = getCheckoutWidgetRoot();
    if (!root || cart.length === 0) {
      return;
    }
    syncCheckoutFormFieldsToOptions();
    var iframe = mountFormDesignerIframe(
      root,
      FD_CHECKOUT_FORM_ID,
      getCheckoutQueryParts(),
      getCheckoutFieldsGetter()
    );
    if (!iframe) {
      return;
    }
    iframe.addEventListener('load', function () {
      pushCheckoutWidgetFieldData();
    });
    checkoutIframeMountedWithCart = true;
  }

  /** Обновить текст заказа через URL — setData на ручном iframe не срабатывает. */
  function updateCheckoutIframeSrc() {
    var iframe = getCheckoutWidgetIframe();
    syncCheckoutFormFieldsToOptions();
    if (!iframe) {
      mountCheckoutIframeWithOrderInUrl();
      return;
    }
    iframe.src = buildCheckoutIframeSrc();
  }

  function refreshCheckoutOrderForm() {
    if (cart.length === 0) {
      checkoutIframeMountedWithCart = false;
      lastCheckoutWidgetText = '';
      if (checkoutFormRefreshTimer) {
        clearTimeout(checkoutFormRefreshTimer);
      }
      return;
    }

    try {
      if (!checkoutIframeMountedWithCart || !getCheckoutWidgetIframe()) {
        mountCheckoutIframeWithOrderInUrl();
        lastCheckoutWidgetText = getCheckoutWidgetCartText();
        return;
      }
      pushCheckoutWidgetFieldData();
    } catch (err) {
      /* не ломаем корзину */
    }

    if (checkoutFormRefreshTimer) {
      clearTimeout(checkoutFormRefreshTimer);
    }
    checkoutFormRefreshTimer = setTimeout(function () {
      try {
        var latestText = getCheckoutWidgetCartText();
        if (!getCheckoutWidgetIframe() || cart.length === 0) {
          return;
        }
        if (latestText === lastCheckoutWidgetText) {
          return;
        }
        updateCheckoutIframeSrc();
        lastCheckoutWidgetText = latestText;
      } catch (err) {
        /* не ломаем корзину */
      }
    }, CHECKOUT_FORM_SRC_FALLBACK_MS);
  }

  function getCheckoutWidgetRoot() {
    return document.querySelector(
      '.order-checkout-widget[data-id="' + FD_CHECKOUT_FORM_ID + '"]'
    );
  }

  function getCheckoutWidgetIframe() {
    var root = getCheckoutWidgetRoot();
    return root ? root.querySelector('iframe') : null;
  }

  function onCheckoutFormDesignerSuccess() {
    if (cart.length === 0) {
      return;
    }
    alert('Заявка отправлена! Менеджер свяжется с вами для уточнения деталей заказа.');
    clearCart();
  }

  function bindFormDesignerMessageBridge() {
    if (window.__arsFdMessageBound) {
      return;
    }
    window.__arsFdMessageBound = true;
    window.addEventListener('message', function (event) {
      if (!event.origin || event.origin.indexOf(FD_HOST) === -1) {
        return;
      }
      var payload;
      try {
        payload = JSON.parse(event.data);
      } catch (err) {
        return;
      }
      if (!payload || !payload.type) {
        return;
      }

      var iframe = document.querySelector(
        'iframe[id="' + payload.type + '"]'
      );
      if (!iframe || event.source !== iframe.contentWindow) {
        return;
      }

      if (payload.data && payload.data.height) {
        iframe.style.height = payload.data.height + 6 + 'px';
        iframe.dataset.arsFdHeightSet = '1';
        clearFormDesignerTimers(iframe);
        if (isCheckoutFormDesignerIframe(iframe)) {
          hideFormDesignerHint(FD_CHECKOUT_FORM_ID);
        } else {
          hideFormDesignerHint(FD_ZAMERSHIK_FORM_ID);
        }
      }

      if (payload.data && payload.data.success && isCheckoutFormDesignerIframe(iframe)) {
        closeFormDesignerOverlay();
        onCheckoutFormDesignerSuccess();
      }
    });
  }

  function watchCheckoutWidgetMount() {
    var root = getCheckoutWidgetRoot();
    if (!root || root.dataset.arsCheckoutWatchBound) {
      return;
    }
    root.dataset.arsCheckoutWatchBound = '1';
  }

  window.ARS_STROY_onCheckoutFormSuccess = onCheckoutFormDesignerSuccess;
  bindFormDesignerMessageBridge();
  watchCheckoutWidgetMount();

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

  /** Одна миниатюра на цвет для всех размеров вибро литой */
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
      if (orderCheckoutFdEl) orderCheckoutFdEl.hidden = true;
      checkoutIframeMountedWithCart = false;
      lastCheckoutWidgetText = '';
      updateCartBadge();
      return;
    }

    if (orderCart) orderCart.hidden = false;
    if (orderSelected) orderSelected.hidden = true;
    if (orderCheckoutFdEl) orderCheckoutFdEl.hidden = false;

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

  function goToOrderAfterAddToCart() {
    scrollToOrderSection();
    requestAnimationFrame(scrollToOrderCart);
  }

  function createCartButton(getProduct) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--primary btn--buy';
    btn.textContent = 'В корзину';
    btn.addEventListener('click', function () {
      addToCart(getProduct());
      goToOrderAfterAddToCart();
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
      renderCart();
    });
  }

  if (orderAddressEl) {
    orderAddressEl.addEventListener('input', scheduleDeliveryAddressUpdate);
    orderAddressEl.addEventListener('change', scheduleDeliveryAddressUpdate);
  }

  document.querySelectorAll('a[href="#order"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      scrollToOrderSection();
      requestAnimationFrame(scrollToOrderCart);
    });
  });

  bindFormDesignerOverlayControls();
  renderCart();
  ensureZamershikFormWidget();

  window.addEventListener('load', function () {
    ensureAllFormDesignerWidgets();
    setTimeout(ensureAllFormDesignerWidgets, 1500);
  });
  window.addEventListener('pageshow', function () {
    ensureAllFormDesignerWidgets();
  });
})();
