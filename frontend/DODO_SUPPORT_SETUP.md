# Dodo support payments

Emoggle is free to play. Visitors can open the optional support popup from the
home page or the Play Now mode picker and enter a one-time USD amount of at
least $1. Closing it does not restrict any game mode.

## Dodo dashboard

1. The live **Support Emoggle** product (`pdt_0No0OSEzJKDOmYzcHRrp5`) is a
   **One Time**, **Pay What You Want** product in **USD**.
2. Its **Minimum Price** is **$1.00**. This matches the $1 minimum enforced by
   the app and signaling server.
3. Set `DODO_PAYMENTS_PRODUCT_ID=pdt_0No0OSEzJKDOmYzcHRrp5` on the signaling server.
4. Configure the Dodo webhook URL as
   `https://<signaling-server-host>/api/webhooks/dodo` and subscribe to
   `payment.succeeded` and `refund.succeeded`.
5. Set `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_KEY`,
   `DODO_PAYMENTS_ENVIRONMENT`, and `DODO_PAYMENTS_RETURN_URL` on the signaling
   server. The return URL is the site's base URL.

The server accepts only decimal amounts of at least $1, converts them to cents,
and passes the amount in the Dodo checkout cart. Dodo requires the product to be
configured for Pay What You Want; otherwise its checkout ignores the amount.
Successful payment webhooks are verified and recorded in `support_payments`.
Contributions grant no game access because every mode is already available.

See [Dodo's Pay What You Want guide](https://docs.dodopayments.com/features/pay-what-you-want)
and [checkout session reference](https://docs.dodopayments.com/developer-resources/checkout-session).
