(function initSiteCatalog() {
  'use strict';

  var TILE_IMG_BASE = 'img/tiles';
  var TILE_FALLBACK = 'assets/bruschatka-1.png';

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

  enrichCatalogCells();
})();
