(function initOrderCart() {
  'use strict';

  var TELEGRAM_SEND_URL =
    'https://api.telegram.org/bot8428755203:AAGdq1k0nsg_4EP-eDp2RUfJqi8UWVek78k/sendMessage';
  var TELEGRAM_CHAT_ID = '7667524051';

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

  var cart = [];

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

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function postToTelegramBot(text) {
    var body =
      'chat_id=' +
      encodeURIComponent(TELEGRAM_CHAT_ID) +
      '&text=' +
      encodeURIComponent(text) +
      '&parse_mode=' +
      encodeURIComponent('HTML');

    return fetch(TELEGRAM_SEND_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    })
      .then(function () {
        return { ok: true };
      })
      .catch(function (error) {
        console.error(error);
        throw error;
      });
  }

  function sendTelegram(text) {
    return postToTelegramBot(text);
  }

  function slugifyAscii(text) {
    return String(text)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function getLabelFromEl(el) {
    var clone = el.cloneNode(true);
    clone.querySelectorAll(
      'b, .unit, .btn--buy, .price-cell__row, .subprices__row-main, .tile-preview'
    ).forEach(function (n) {
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
    if (/белом цементе/i.test(colorLabel)) return 'yellow-white';
    if (/обычн\w*\s+цемент/i.test(colorLabel)) return 'yellow-cement';
    var slug = getColorDotSlug(el);
    if (slug === 'yellow') return 'yellow-cement';
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

  function blokTileSrc(sizeCode) {
    if (sizeCode === 'solid') return 'assets/blok-polnotelnyi.png';
    if (sizeCode === 'hollow') return 'assets/blok-pustotelniy.png';
    return TILE_FALLBACK;
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
    if (productKey === 'bruschatka') {
      image = bruschatkaTileSrc(colorVariantKey);
    } else if (meta.blockId === 'prices-cast') {
      image = litoTileSrc(colorVariantKey);
    } else if (meta.blockId === 'prices-curb') {
      image = bordyurTileSrc(sizeCode, colorVariantKey);
    } else if (meta.blockId === 'prices-block') {
      image = blokTileSrc(sizeCode);
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

  function bindTileImgError(img, el, src, altSrcs) {
    var curbAlts = altSrcs && altSrcs.length ? altSrcs.slice() : null;
    img.addEventListener('error', function onTileError() {
      if (curbAlts && curbAlts.length) {
        img.src = curbAlts.shift();
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

  function getCartGrandTotal() {
    return cart.reduce(function (sum, item) {
      if (item.qty == null || item.qty <= 0) return sum;
      return sum + item.price * item.qty;
    }, 0);
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
      if (cartGrandTotal) cartGrandTotal.textContent = '0';
      updateCartBadge();
      return;
    }

    if (orderCart) orderCart.hidden = false;
    if (orderSelected) orderSelected.hidden = true;
    if (cartGrandTotal) cartGrandTotal.textContent = formatMoney(getCartGrandTotal());

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
      img.src = item.image;
      img.alt = item.productName + ' — ' + item.color;
      var cartTileAlts = /bordyur/i.test(item.image || '')
        ? bordyurTileAltSrcs(
            (item.id || '').split('|')[1] || '',
            (item.id || '').split('|')[2] || 'gray'
          )
        : null;
      bindTileImgError(img, null, item.image, cartTileAlts);

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
          if (cartGrandTotal) cartGrandTotal.textContent = formatMoney(getCartGrandTotal());
          updateCartBadge();
          return;
        }
        input.value = String(item.qty);
        sumEl.textContent = formatMoney(item.price * item.qty) + ' руб.';
        if (cartGrandTotal) cartGrandTotal.textContent = formatMoney(getCartGrandTotal());
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
      renderCart();
    });
  }

  if (orderForm) {
    orderForm.addEventListener('submit', function (e) {
      e.preventDefault();

      if (cart.length === 0) {
        alert('Корзина пуста. В разделе «Прайс» выберите размер и цвет и нажмите «В корзину».');
        return;
      }
      if (cartHasMissingQty()) {
        alert('Укажите количество для каждой позиции (м² или шт.).');
        return;
      }

      var nameEl = document.getElementById('order-name');
      var phoneEl = document.getElementById('order-phone');
      var addressEl = document.getElementById('order-address');
      var companyEl = document.getElementById('order-company');
      var emailEl = document.getElementById('order-email');
      var commentEl = document.getElementById('order-comment');

      var name = nameEl ? nameEl.value.trim() : '';
      var phone = phoneEl ? phoneEl.value.trim() : '';
      var address = addressEl ? addressEl.value.trim() : '';
      var company = companyEl ? companyEl.value.trim() : '';
      var email = emailEl ? emailEl.value.trim() : '';
      var comment = commentEl ? commentEl.value.trim() : '';

      var productLines = cart.map(function (item, index) {
        var measure = item.qtyMeasure || 'шт.';
        return (
          '<b>' +
          (index + 1) +
          '. ' +
          escapeHtml(item.productName) +
          '</b>\n' +
          'Цвет: ' +
          escapeHtml(item.colorRu || item.color) +
          '\nРазмер: ' +
          escapeHtml(item.size) +
          '\nАртикул: ' +
          escapeHtml(item.article) +
          '\nКоличество: ' +
          item.qty +
          ' ' +
          escapeHtml(measure) +
          '\nЦена: ' +
          formatMoney(item.price) +
          ' ' +
          escapeHtml(item.unit) +
          '\nСумма: <b>' +
          formatMoney(item.price * item.qty) +
          ' руб.</b>'
        );
      });

      var message =
        '<b>Новый заказ с сайта</b>\n\n' +
        '<b>Данные клиента</b>\n' +
        'ФИО: ' +
        escapeHtml(name || '—') +
        '\nТелефон: ' +
        escapeHtml(phone || '—') +
        '\nАдрес: ' +
        escapeHtml(address || '—') +
        '\nКомпания: ' +
        escapeHtml(company || '—') +
        '\nEmail: ' +
        escapeHtml(email || '—') +
        '\nКомментарий: ' +
        escapeHtml(comment || '—') +
        '\n\n' +
        '<b>Товары</b>\n\n' +
        productLines.join('\n\n') +
        '\n\n<b>Итого:</b> ' +
        formatMoney(getCartGrandTotal()) +
        ' руб.';

      sendTelegram(message)
        .then(function () {
          orderForm.reset();
          cart = [];
          renderCart();
          alert('Спасибо! Ваш заказ успешно отправлен в обработку');
        })
        .catch(function (error) {
          console.error(error);
          alert('Ошибка отправки. Пожалуйста, попробуйте еще раз.');
        });
    });
  }

  if (ukladkaForm) {
    ukladkaForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var message =
        '<b>🔔 Заявка на укладку / бесплатный замер</b>\n\n' +
        'Имя: ' +
        escapeHtml(document.getElementById('ukladka-name').value.trim() || '—') +
        '\nТелефон: ' +
        escapeHtml(document.getElementById('ukladka-phone').value.trim() || '—');

      sendTelegram(message)
        .then(function () {
          ukladkaForm.reset();
          alert('Спасибо за заявку! Мы свяжемся с вами в ближайшее время.');
        })
        .catch(function (error) {
          console.error(error);
          alert('Ошибка отправки. Пожалуйста, попробуйте еще раз.');
        });
    });
  }

  renderCart();
})();
