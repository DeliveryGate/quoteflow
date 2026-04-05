import { PrismaClient } from "@prisma/client";
import { shopifyGraphQL } from "../shopify.js";

const prisma = new PrismaClient();

export async function createQuote(data, shop) {
  const year = new Date().getFullYear();
  const count = await prisma.quote.count({ where: { shop } });
  const reference = `QF-${year}-${String(count + 1).padStart(5, "0")}`;

  const quote = await prisma.quote.create({
    data: {
      shop,
      reference,
      firstName: data.firstName,
      lastName: data.lastName,
      company: data.company || null,
      email: data.email,
      phone: data.phone || null,
      products: data.products || "[]",
      quantity: data.quantity ? parseInt(data.quantity) : null,
      targetBudget: data.targetBudget || null,
      notes: data.notes || null,
      source: data.source || null,
    },
  });

  return { quoteId: quote.id, reference: quote.reference };
}

export async function convertQuoteToOrder(quoteId, quotedPrice, accessToken, shop) {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new Error("Quote not found");

  let products;
  try { products = JSON.parse(quote.products); } catch { products = []; }

  const lineItems = products.map(p => ({
    title: p.title || "Quote item",
    quantity: parseInt(p.quantity) || 1,
    originalUnitPrice: quotedPrice / products.length,
  }));

  const mutation = `
    mutation DraftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id invoiceUrl }
        userErrors { field message }
      }
    }
  `;

  const result = await shopifyGraphQL(shop, accessToken, mutation, {
    input: {
      lineItems,
      email: quote.email,
      note: `Quote reference: ${quote.reference}`,
      tags: ["quoteflow", quote.reference],
    },
  });

  const errors = result.data.draftOrderCreate.userErrors;
  if (errors.length > 0) throw new Error(errors.map(e => e.message).join(", "));

  const draftOrder = result.data.draftOrderCreate.draftOrder;

  await prisma.quote.update({
    where: { id: quoteId },
    data: { status: "converted", draftOrderId: draftOrder.id, draftOrderUrl: draftOrder.invoiceUrl, convertedAt: new Date() },
  });

  // Send invoice to customer
  await shopifyGraphQL(shop, accessToken, `mutation($id: ID!) { draftOrderInvoiceSend(id: $id) { userErrors { message } } }`, { id: draftOrder.id }).catch(() => {});

  return { draftOrderId: draftOrder.id, invoiceUrl: draftOrder.invoiceUrl };
}

export async function checkRateLimit(key, maxCount, windowMinutes) {
  const now = new Date();
  const existing = await prisma.rateLimit.findUnique({ where: { key } });

  if (!existing || existing.windowEnd < now) {
    await prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, windowEnd: new Date(now.getTime() + windowMinutes * 60000) },
      update: { count: 1, windowEnd: new Date(now.getTime() + windowMinutes * 60000) },
    });
    return true;
  }

  if (existing.count >= maxCount) return false;
  await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
  return true;
}
