import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
export async function verifyRequest(req, res, next) {
  const shop = req.query.shop || req.headers["x-shopify-shop-domain"] || req.body?.shop;
  if (!shop) return res.status(401).json({ error: "Missing shop" });
  try {
    const session = await prisma.session.findFirst({ where: { shop, isOnline: false }, orderBy: { updatedAt: "desc" } });
    if (!session?.accessToken) return res.status(401).json({ error: "No session" });
    req.shopSession = session;
    next();
  } catch { res.status(500).json({ error: "Auth failed" }); }
}
