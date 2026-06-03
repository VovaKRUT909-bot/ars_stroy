# Архив корзины и форм (offline)

Сохранено для возможного восстановления. На основном сайте заказы только по телефону.

## Файлы

| Файл | Описание |
|------|----------|
| `order-cart.js` | Корзина, расчёт доставки, оплата Сбер, Formspree |
| `order-checkout.html` | Секция «Оформление заказа» + fullscreen checkout |
| `delivery-section.html` | Блок «Доставка» с тарифами |
| `ukladka-request.html` | Форма заявки замерщика |

## Как вернуть

1. Вставить HTML из `*-section.html` / `order-checkout.html` в `index.html` (после галереи, перед контактами).
2. Вернуть `order-cart.js` в корень: `git mv offline/order-cart.js .`
3. В `index.html` подключить `<script src="order-cart.js" defer></script>` вместо `site-catalog.js`.
4. Вернуть корзину в шапку и пункты меню «Заказ» / «Доставка».

Актуальный прайс с превью плитки: `site-catalog.js` (без корзины).
