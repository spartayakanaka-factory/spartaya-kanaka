# Owner dashboard proposal

The dashboard is a future Arabic-first product design, not an operational screen in this release. It should work comfortably on an ordinary phone and keep routine tasks visible before advanced configuration.

## Daily home

1. A large “طلبات جديدة” count and a single “افتح الطلبات” action.
2. Today’s orders and sales using verified payment records only.
3. Orders waiting for confirmation, production, shipment, or remaining balance.
4. A prominent telephone action on each order.

## Main navigation

- الرئيسية — today's queue and a short sales summary.
- الطلبات — new, confirmed, in production, ready, shipped, delivered, cancelled.
- المنتجات — add/edit product, upload photos, set price, choose ready-made or made-to-order, set availability.
- المخزون — simple quantity and availability controls for ready-made items.
- التصنيع — made-to-order queue with approved specs and lead-time window.
- العملاء — order-linked customer history and phone actions.
- التقارير — daily sales, payment reconciliation, unpaid balances.
- الإعدادات — payment, shipping, and advanced permissions, hidden behind an explicit advanced section.

## Order detail

Show the customer’s name and phone first, then line items and approved options, delivery details, payment state, manufacturing state, shipment state, and amount still due. A single tap should call the customer. Status changes require a clear confirmation and an audit entry. A payment is not marked paid from a screenshot alone.

## Product creation

Use a short Arabic wizard: name and category; photos; ready-made or made-to-order; price; stock or deposit; preview and save. Keep a visible save confirmation. Do not require SKU knowledge, HTML, or technical settings in the basic path.

No mock dashboard is shipped as though it persisted data. Implement this screen only after identity, database permissions, audit rules, and the actual owner workflow have been agreed.
