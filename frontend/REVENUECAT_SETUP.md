# RevenueCat setup for Emoggle VIP

The app uses RevenueCat's Web SDK (`@revenuecat/purchases-js`) and treats the
RevenueCat entitlement as the source of truth for VIP access.

## Dashboard setup

1. Create or open the Emoggle project in RevenueCat.
2. Under **Web**, create a web billing configuration and connect a supported
   provider.
3. Create the VIP product and its price.
4. Create an entitlement with the identifier `vip`, then attach the VIP product
   to it.
5. Create an offering, add the VIP product as a package, and mark that offering
   as **Current**.
6. Recommended: publish a RevenueCat Paywall for that offering. If no paywall is
   attached, the app opens checkout for the first package in the current
   offering.
7. Copy the web public SDK key into `.env.local`:

   ```dotenv
   NEXT_PUBLIC_REVENUECAT_WEB_API_KEY=your_web_public_sdk_key
   NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID=vip
   ```

8. Restart the Next.js development server after changing environment variables.

## What is integrated

- The SDK is configured once with Emoggle's stable, random per-device ID.
- Customer information and the current offering are loaded at startup.
- The `vip` entitlement controls the VIP badge and Celebrity Face Mimic access.
- The RevenueCat Paywall is presented when available, with direct checkout as a
  fallback.
- Customers can refresh their entitlement and open the provider's subscription
  management page.
- Cancelled checkouts are ignored; actionable SDK errors are shown in the UI.

## Testing and launch

- Test the complete flow with the billing provider's sandbox before using a
  production web public key.
- Verify purchase, cancellation, renewal, expiration, and the management portal.
- If Apple Pay or Google Pay is enabled for checkout on your domain, register
  the production domain with the connected payment provider.
- RevenueCat Billing cannot currently be used for customers in India because it
  does not collect the full billing address required there. Use a compatible
  Stripe Billing or Paddle Billing configuration if India is a target market.

## Identity limitation

Emoggle currently has no sign-in flow, so RevenueCat is identified by the
random device ID already stored by the app. This is stable across normal visits,
but clearing browser storage or moving to another device creates a new customer
identity. Add authentication and configure RevenueCat with the authenticated,
non-guessable user ID before promising cross-device purchase recovery.

Client-side entitlement checks are appropriate for this browser-only UI. Any
future paid server API or private asset must also verify the entitlement on the
server before returning premium data.
