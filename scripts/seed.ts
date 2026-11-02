/**
 * Seed a demo shop for local development.
 *
 *   npx tsx --conditions=react-server scripts/seed.ts [telegramUserId]
 *
 * Creates (idempotently) a user, the shop "demo" with a handful of published
 * products with generated images, and prints a session cookie you can paste
 * into the browser to open the dashboard without Telegram.
 * Refuses to run when NODE_ENV=production.
 */
import "./load-env";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production");
  const telegramId = BigInt(process.argv[2] ?? "100000001");

  const { eq } = await import("drizzle-orm");
  const sharp = (await import("sharp")).default;
  const { db } = await import("@/server/db");
  const { users, shops } = await import("@/server/db/schema");
  const { createShop, getShopByHandle } = await import("@/server/domain/shops");
  const { createManualProduct, createProductSchema } = await import("@/server/domain/products");
  const { processImage } = await import("@/server/domain/media");
  const { putObject } = await import("@/server/services/storage");
  const { sealSession } = await import("@/server/auth/session");
  const { uuidv7 } = await import("@/server/ids");

  let user = await db.query.users.findFirst({ where: eq(users.telegramId, telegramId) });
  if (!user) {
    [user] = await db.insert(users).values({ telegramId, firstName: "Demo", lastName: "Seller", username: "demo_seller" }).returning();
  }

  let shop = await getShopByHandle("demo");
  if (!shop) {
    shop = await createShop({ ownerUserId: user.id, name: "Demo Shop", handle: "demo", description: "Phones, shoes and home goods — delivered in Addis." });
    await db.update(shops).set({ settings: { ...shop.settings, delivery: { ...shop.settings.delivery, deliveryFeeMinor: "15000", deliveryNote: "Same-day delivery inside Addis Ababa" } } }).where(eq(shops.id, shop.id));
    shop = (await getShopByHandle("demo"))!;

    const items = [
      { title: "iPhone 13 Pro 128GB", price: "45000", category: "Electronics > Mobile Phones", brand: "Apple", condition: "Used", color: "#3b5b7a", qty: 2 },
      { title: "Samsung Galaxy A54", price: "28500", category: "Electronics > Mobile Phones", brand: "Samsung", condition: "Brand New", color: "#4b6b4f", qty: 5 },
      { title: "Nike Air Force 1 — size 42", price: "4200", category: "Fashion > Shoes", brand: "Nike", condition: "Brand New", color: "#a3462f", qty: 3 },
      { title: "Handwoven Habesha Kemis", price: "6800", category: "Fashion > Clothing", brand: null, condition: "Brand New", color: "#8a6d2f", qty: 1 },
      { title: "Jebena coffee set (6 cups)", price: "1500", category: "Home > Kitchen", brand: null, condition: "Brand New", color: "#5a3a2a", qty: 10 },
      { title: "Office chair, ergonomic", price: null, category: "Home > Furniture", brand: null, condition: "Used", color: "#444a55", qty: 1 },
    ];

    for (const item of items) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${item.color}"/><stop offset="1" stop-color="#111"/></linearGradient></defs><rect width="1200" height="1200" fill="url(#g)"/><text x="80" y="1100" font-family="sans-serif" font-size="72" fill="#fff" opacity=".85">${item.title.replace(/&/g, "&amp;")}</text></svg>`;
      const png = await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
      const key = `originals/shops/${shop.id}/${uuidv7()}.jpg`;
      await putObject(key, png, "image/jpeg", "private");
      const input = createProductSchema.parse({
        title: item.title,
        price: item.price,
        category: item.category,
        brand: item.brand,
        condition: item.condition,
        status: "published",
        inventoryQty: item.qty,
        imageKeys: [key],
        description: `${item.title}. Delivered in Addis Ababa, pay on delivery.`,
      });
      const product = await createManualProduct(shop, input);
      for (const img of product.images) await processImage(img.id);
    }
    console.log(`seeded shop "${shop.handle}" with ${items.length} products`);
  } else {
    console.log(`shop "${shop.handle}" already exists`);
  }

  const token = await sealSession({ userId: user.id, telegramId: telegramId.toString() });
  console.log(`\nStorefront: ${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/s/demo`);
  console.log(`Dashboard:  ${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/dashboard/demo`);
  console.log(`\nSession cookie (dev only) — set in devtools as goods_session:\n${token}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
