# QuoteFlow — Quote Request and B2B Pricing

Adds "Request a Quote" buttons to product and collection pages. Customers submit quote requests, merchants review and respond via admin dashboard, accepted quotes convert to Shopify draft orders.

## Architecture

- **Theme Extension** (`extensions/quoteflow-block/`) — Quote button, form modal, collection quote basket
- **Quote Engine** (`web/lib/quoteEngine.js`) — Quote creation, draft order conversion, rate limiting
- **Admin Dashboard** (`web/frontend/`) — Quote manager, detail view with response panel, settings
- **Backend** (`web/index.js`) — Express API with GDPR compliance and rate limiting

## Billing

| Plan | Price | Quotes/month | Features |
|------|-------|-------------|----------|
| Free | $0 | 10 | Basic notifications |
| Starter | $14.99/mo | Unlimited | Email notifications, CSV export, auto-reply |
| Pro | $24.99/mo | Unlimited | PDF quotes, custom branding, draft order conversion |

## App Store Listing

**Name:** QuoteFlow — Quote Request and B2B Pricing
**Tagline:** Turn browsers into B2B buyers with professional quote requests.

**Key Benefits:**
- Add a Request a Quote button to any product in minutes
- Manage all quotes in one place — respond, negotiate, convert to orders
- Perfect for B2B, wholesale, trade, and high-ticket merchants
