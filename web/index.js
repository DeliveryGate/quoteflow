import express from "express";
import compression from "compression";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";
import serveStatic from "serve-static";
import { verifyWebhookHmac, shopifyGraphQL, PLANS, CREATE_SUBSCRIPTION } from "./shopify.js";
import { verifyRequest } from "./middleware/verify-request.js";
import { createQuote, convertQuoteToOrder, checkRateLimit } from "./lib/quoteEngine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();
const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const IS_PROD = process.env.NODE_ENV === "production";

app.use(compression());
app.use("/api/webhooks", express.raw({ type: "application/json" }));
app.use(express.json());
app.get("/health", (req, res) => res.json({ status: "ok", app: "quoteflow" }));

// --- Webhooks ---
app.post("/api/webhooks/:topic", async (req, res) => {
  const hmac = req.headers["x-shopify-hmac-sha256"];
  if (!hmac || !verifyWebhookHmac(req.body.toString(), hmac, process.env.SHOPIFY_API_SECRET)) return res.status(401).send("Unauthorized");
  const shop = req.headers["x-shopify-shop-domain"];
  const topic = req.params.topic;
  if (topic === "app-uninstalled" || topic === "shop-redact") {
    await prisma.quote.deleteMany({ where: { shop } });
    await prisma.merchantSettings.deleteMany({ where: { shop } });
    await prisma.merchantPlan.deleteMany({ where: { shop } });
    await prisma.session.deleteMany({ where: { shop } });
  } else if (topic === "customers-redact") {
    const body = JSON.parse(req.body.toString());
    if (body.customer?.email) {
      await prisma.quote.updateMany({ where: { email: body.customer.email }, data: { firstName: "REDACTED", lastName: "REDACTED", email: "redacted@redacted.com", phone: null, company: null } });
    }
  } else if (topic === "customers-data-request") {
    const body = JSON.parse(req.body.toString());
    const quotes = body.customer?.email ? await prisma.quote.findMany({ where: { email: body.customer.email } }) : [];
    // In production, send this data to the data_request webhook URL
    console.log(`[gdpr] Data request for customer, found ${quotes.length} quotes`);
  }
  res.status(200).send("OK");
});

// --- Public: Submit Quote (from storefront) ---
app.post("/api/quotes", async (req, res) => {
  const { firstName, lastName, email, shop } = req.body;
  if (!firstName || !lastName || !email || !shop) return res.status(400).json({ error: "Required fields missing" });

  // Rate limiting: 5 per IP/hour, 3 per email/day
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  const ipOk = await checkRateLimit(`ip:${ip}`, 5, 60);
  if (!ipOk) return res.status(429).json({ error: "Too many requests. Please try again later." });
  const emailOk = await checkRateLimit(`email:${email}:${new Date().toISOString().slice(0, 10)}`, 3, 1440);
  if (!emailOk) return res.status(429).json({ error: "Maximum quote requests reached for today. Please try again tomorrow." });

  // Check plan limit
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  let merchant = await prisma.merchantPlan.findUnique({ where: { shop } });
  if (!merchant) merchant = await prisma.merchantPlan.create({ data: { shop, monthReset: monthStart } });

  if (merchant.monthReset < monthStart) {
    await prisma.merchantPlan.update({ where: { shop }, data: { quoteCount: 0, monthReset: monthStart } });
    merchant.quoteCount = 0;
  }

  const plan = merchant.plan || "free";
  const limit = PLANS[plan]?.quoteLimit || 10;
  if (limit !== Infinity && merchant.quoteCount >= limit) {
    return res.status(403).json({ error: "Quote requests temporarily unavailable. Please contact us directly." });
  }

  try {
    const result = await createQuote(req.body, shop);
    await prisma.merchantPlan.update({ where: { shop }, data: { quoteCount: { increment: 1 } } });
    res.json({ success: true, ...result, message: "Quote request submitted successfully" });
  } catch (err) { res.status(500).json({ error: "Failed to submit quote" }); }
});

// --- Admin: Quote Management ---
app.get("/api/quotes", verifyRequest, async (req, res) => {
  const { shop } = req.shopSession;
  const { status, page = "1", search } = req.query;
  const where = { shop };
  if (status) where.status = status;
  if (search) where.OR = [{ firstName: { contains: search, mode: "insensitive" } }, { lastName: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }, { reference: { contains: search, mode: "insensitive" } }];

  const [quotes, total] = await Promise.all([
    prisma.quote.findMany({ where, orderBy: { createdAt: "desc" }, skip: (parseInt(page) - 1) * 20, take: 20 }),
    prisma.quote.count({ where }),
  ]);
  res.json({ quotes, total, page: parseInt(page), pages: Math.ceil(total / 20) });
});

app.get("/api/quotes/:id", verifyRequest, async (req, res) => {
  const quote = await prisma.quote.findFirst({ where: { id: req.params.id, shop: req.shopSession.shop } });
  if (!quote) return res.status(404).json({ error: "Not found" });
  res.json(quote);
});

app.put("/api/quotes/:id/status", verifyRequest, async (req, res) => {
  const { status } = req.body;
  const quote = await prisma.quote.update({ where: { id: req.params.id }, data: { status } });
  res.json(quote);
});

app.post("/api/quotes/:id/respond", verifyRequest, async (req, res) => {
  const { quotedPrice, message, validDays = 14 } = req.body;
  const validUntil = new Date(Date.now() + validDays * 86400000);
  const quote = await prisma.quote.update({
    where: { id: req.params.id },
    data: { status: "responded", quotedPrice, quotedMessage: message, validUntil, respondedAt: new Date() },
  });
  // Email would be sent here via SMTP
  res.json(quote);
});

app.post("/api/quotes/:id/convert", verifyRequest, async (req, res) => {
  const { shop, accessToken } = req.shopSession;
  const quote = await prisma.quote.findFirst({ where: { id: req.params.id, shop } });
  if (!quote) return res.status(404).json({ error: "Not found" });
  try {
    const result = await convertQuoteToOrder(quote.id, parseFloat(quote.quotedPrice) || 0, accessToken, shop);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/quotes/:id", verifyRequest, async (req, res) => {
  await prisma.quote.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// --- Settings ---
app.get("/api/settings", verifyRequest, async (req, res) => {
  let settings = await prisma.merchantSettings.findUnique({ where: { shop: req.shopSession.shop } });
  if (!settings) settings = await prisma.merchantSettings.create({ data: { shop: req.shopSession.shop } });
  res.json(settings);
});

app.post("/api/settings", verifyRequest, async (req, res) => {
  const data = {};
  const allowed = ["notificationsEnabled", "autoReplyEnabled", "autoReplyMessage", "responseTimeHours", "requireCompany", "requirePhone", "showBudgetField", "customTerms", "logoUrl", "accentColour"];
  for (const key of allowed) { if (req.body[key] !== undefined) data[key] = req.body[key]; }
  const settings = await prisma.merchantSettings.upsert({ where: { shop: req.shopSession.shop }, create: { shop: req.shopSession.shop, ...data }, update: data });
  res.json(settings);
});

// --- Billing ---
app.get("/api/billing/status", verifyRequest, async (req, res) => {
  const merchant = await prisma.merchantPlan.findUnique({ where: { shop: req.shopSession.shop } });
  const plan = merchant?.plan || "free";
  res.json({ plan, quoteCount: merchant?.quoteCount || 0, quoteLimit: PLANS[plan]?.quoteLimit === Infinity ? "unlimited" : PLANS[plan]?.quoteLimit, price: PLANS[plan]?.price });
});

app.post("/api/billing/subscribe", verifyRequest, async (req, res) => {
  const { shop, accessToken } = req.shopSession;
  const { plan } = req.body;
  if (!plan || !PLANS[plan] || plan === "free") return res.status(400).json({ error: "Invalid plan" });
  const returnUrl = `${process.env.SHOPIFY_APP_URL}/api/billing/callback?shop=${shop}&plan=${plan}`;
  try {
    const result = await shopifyGraphQL(shop, accessToken, CREATE_SUBSCRIPTION, { name: `QuoteFlow ${PLANS[plan].name}`, returnUrl, test: !IS_PROD, lineItems: [{ plan: { appRecurringPricingDetails: { price: { amount: PLANS[plan].price, currencyCode: "USD" }, interval: "EVERY_30_DAYS" } } }] });
    res.json({ confirmationUrl: result.data.appSubscriptionCreate.confirmationUrl });
  } catch { res.status(500).json({ error: "Subscription failed" }); }
});

app.get("/api/billing/callback", async (req, res) => {
  const { shop, plan, charge_id } = req.query;
  if (charge_id && plan) await prisma.merchantPlan.upsert({ where: { shop }, create: { shop, plan, subscriptionId: charge_id }, update: { plan, subscriptionId: charge_id } });
  res.redirect(`/?shop=${shop}`);
});

app.get("/api/usage", verifyRequest, async (req, res) => {
  const merchant = await prisma.merchantPlan.findUnique({ where: { shop: req.shopSession.shop } });
  const plan = merchant?.plan || "free";
  res.json({ used: merchant?.quoteCount || 0, limit: PLANS[plan]?.quoteLimit === Infinity ? "unlimited" : PLANS[plan]?.quoteLimit, plan });
});

// --- Static ---
if (IS_PROD) { app.use(serveStatic(path.join(__dirname, "frontend", "dist"))); app.get("*", (req, res) => res.sendFile(path.join(__dirname, "frontend", "dist", "index.html"))); }
app.listen(PORT, () => console.log(`QuoteFlow backend running on port ${PORT}`));
