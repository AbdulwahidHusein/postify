import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./db";
import { FakeTelegram } from "./fake-telegram";
import { makeUser } from "./helpers";
import { db } from "@/server/db";
import { customers, payments, productVariants, products, shops, type Shop } from "@/server/db/schema";
import { createShop, updateShopSettings } from "@/server/domain/shops";
import { insertProduct } from "@/server/domain/products";
import { addToCart, readCart } from "@/server/domain/cart";
import { applyOrderAction, placeOrder, type CheckoutInput } from "@/server/domain/orders";
import { authorizeUser } from "@/server/auth/authorize";
import { drainInlineTasks, resetInlineTasks } from "@/server/services/tasks";
import { AppError } from "@/server/http";

let fake: FakeTelegram;
beforeAll(async () => {
  await createTestDb();
});
beforeEach(() => {
  resetInlineTasks();
  fake = new FakeTelegram().install();
});

async function shopWithProduct(qty = 1, price = 250000n) {
  const owner = await makeUser("Owner");
  const shop = await createShop({ ownerUserId: owner.id, name: `Shop ${Math.random().toString(36).slice(2, 7)}` });
  const product = await insertProduct(db, {
    shopId: shop.id,
    title: "Leather bag",
    status: "published",
    variant: { priceMinor: price, currency: "ETB", inventoryQty: qty, trackInventory: true },
  });
  return { owner, shop, product, variantId: product.variants[0].id };
}

const checkout = (over: Partial<CheckoutInput> = {}): CheckoutInput => ({
  contactName: "Hana",
  contactPhone: "0911 223 344",
  fulfillment: "delivery",
  address: "Bole, near Edna Mall",
  notes: null,
  paymentMethod: "on_delivery",
  ...over,
});

async function expectAppError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(AppError);
  await p.catch((e: AppError) => expect(e.code).toBe(code));
}

describe("checkout", () => {
  it("places a pay-on-delivery order, snapshots lines and creates the customer", async () => {
    const { shop, variantId } = await shopWithProduct(3);
    await addToCart({ shopId: shop.id, ownerKey: "anon:a", variantId, quantity: 2, sourceCode: "SRC1" });
    const cart = await readCart(shop.id, "anon:a");
    expect(cart.subtotalMinor).toBe("500000");

    const order = await placeOrder({ shop, ownerKey: "anon:a", buyerUserId: null, checkout: checkout() });
    expect(order.number).toBe(1001);
    expect(order.status).toBe("placed");
    expect(order.paymentMethod).toBe("on_delivery");
    expect(order.totalMinor).toBe(500000n);
    expect(order.contactPhone).toBe("+251911223344");
    expect(order.sourceCode).toBe("SRC1");

    const [v] = await db.select().from(productVariants).where(eq(productVariants.id, variantId));
    expect(v.inventoryQty).toBe(1);
    const [c] = await db.select().from(customers).where(eq(customers.shopId, shop.id));
    expect(c).toMatchObject({ name: "Hana", phone: "+251911223344", orderCount: 1 });
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, order.id));
    expect(pay).toMatchObject({ method: "on_delivery", status: "pending", amountMinor: 500000n });
    expect((await readCart(shop.id, "anon:a")).lines).toHaveLength(0);

    const second = await (async () => {
      await addToCart({ shopId: shop.id, ownerKey: "anon:z", variantId, quantity: 1 });
      return placeOrder({ shop, ownerKey: "anon:z", buyerUserId: null, checkout: checkout({ contactPhone: "0922000111" }) });
    })();
    expect(second.number).toBe(1002);
  });

  it("adds the delivery fee and rejects online payment while it's coming soon", async () => {
    const { shop, variantId } = await shopWithProduct(5);
    const updated = await updateShopSettings(shop, { delivery: { deliveryFeeMinor: "15000" } });
    await addToCart({ shopId: shop.id, ownerKey: "anon:b", variantId, quantity: 1 });
    await expectAppError(
      placeOrder({ shop: updated, ownerKey: "anon:b", buyerUserId: null, checkout: checkout({ paymentMethod: "online" }) }),
      "online_unavailable",
    );
    const order = await placeOrder({ shop: updated, ownerKey: "anon:b", buyerUserId: null, checkout: checkout() });
    expect(order.deliveryFeeMinor).toBe(15000n);
    expect(order.totalMinor).toBe(265000n);
  });

  it("never sells the last item twice", async () => {
    const { shop, variantId } = await shopWithProduct(1);
    await addToCart({ shopId: shop.id, ownerKey: "anon:x", variantId, quantity: 1 });
    await addToCart({ shopId: shop.id, ownerKey: "anon:y", variantId, quantity: 1 });
    const results = await Promise.allSettled([
      placeOrder({ shop, ownerKey: "anon:x", buyerUserId: null, checkout: checkout({ contactPhone: "0911000001" }) }),
      placeOrder({ shop, ownerKey: "anon:y", buyerUserId: null, checkout: checkout({ contactPhone: "0911000002" }) }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as AppError).code).toBe("sold_out");
    const [v] = await db.select().from(productVariants).where(eq(productVariants.id, variantId));
    expect(v.inventoryQty).toBe(0);
  });

  it("validates phone and address", async () => {
    const { shop, variantId } = await shopWithProduct(2);
    await addToCart({ shopId: shop.id, ownerKey: "anon:p", variantId, quantity: 1 });
    await expectAppError(placeOrder({ shop, ownerKey: "anon:p", buyerUserId: null, checkout: checkout({ contactPhone: "12345" }) }), "invalid_phone");
    await expectAppError(placeOrder({ shop, ownerKey: "anon:p", buyerUserId: null, checkout: checkout({ address: "" }) }), "address_required");
  });

  it("blocks buyers the seller blocked, and order bursts", async () => {
    const { shop, variantId } = await shopWithProduct(50, 1000n);
    for (let i = 0; i < 5; i += 1) {
      await addToCart({ shopId: shop.id, ownerKey: "anon:burst", variantId, quantity: 1 });
      await placeOrder({ shop, ownerKey: "anon:burst", buyerUserId: null, checkout: checkout({ contactPhone: "0933000000" }) });
    }
    await addToCart({ shopId: shop.id, ownerKey: "anon:burst", variantId, quantity: 1 });
    await expectAppError(
      placeOrder({ shop, ownerKey: "anon:burst", buyerUserId: null, checkout: checkout({ contactPhone: "0933000000" }) }),
      "rate_limited",
    );
    await db.update(customers).set({ blocked: true }).where(eq(customers.phone, "+251933000000"));
    await expectAppError(
      placeOrder({ shop, ownerKey: "anon:burst", buyerUserId: null, checkout: checkout({ contactPhone: "0933000000" }) }),
      "blocked",
    );
  });
});

describe("order lifecycle", () => {
  it("confirm → deliver → payment received completes the order and marks the one-off sold", async () => {
    const { owner, shop, product, variantId } = await shopWithProduct(1);
    await addToCart({ shopId: shop.id, ownerKey: "anon:l", variantId, quantity: 1 });
    const order = await placeOrder({ shop, ownerKey: "anon:l", buyerUserId: null, checkout: checkout() });
    await applyOrderAction({ shopId: shop.id, orderId: order.id, action: "confirm", actorUserId: owner.id });
    const delivered = await applyOrderAction({ shopId: shop.id, orderId: order.id, action: "deliver", actorUserId: owner.id });
    expect(delivered.status).toBe("delivered");
    const [p] = await db.select().from(products).where(eq(products.id, product.id));
    expect(p.status).toBe("sold");
    const done = await applyOrderAction({ shopId: shop.id, orderId: order.id, action: "mark_paid", actorUserId: owner.id });
    expect(done).toMatchObject({ status: "completed", paymentStatus: "paid" });
    const [c] = await db.select().from(customers).where(eq(customers.id, order.customerId));
    expect(c.totalSpentMinor).toBe(250000n);
  });

  it("completing a delivered pay-on-delivery order records the cash as collected", async () => {
    const { owner, shop, variantId } = await shopWithProduct(3);
    await addToCart({ shopId: shop.id, ownerKey: "anon:cod", variantId, quantity: 1 });
    const order = await placeOrder({ shop, ownerKey: "anon:cod", buyerUserId: null, checkout: checkout({ contactPhone: "0944000001" }) });
    for (const action of ["confirm", "ship", "deliver"] as const) {
      await applyOrderAction({ shopId: shop.id, orderId: order.id, action, actorUserId: owner.id });
    }
    const done = await applyOrderAction({ shopId: shop.id, orderId: order.id, action: "complete", actorUserId: owner.id });
    expect(done).toMatchObject({ status: "completed", paymentStatus: "paid" });
    const [pay] = await db.select().from(payments).where(eq(payments.orderId, order.id));
    expect(pay.status).toBe("paid");
    const [c] = await db.select().from(customers).where(eq(customers.id, order.customerId));
    expect(c.totalSpentMinor).toBe(order.totalMinor);
  });

  it("cancelling restocks and voids the payment; invalid transitions are refused", async () => {
    const { owner, shop, variantId } = await shopWithProduct(2);
    await addToCart({ shopId: shop.id, ownerKey: "anon:c", variantId, quantity: 2 });
    const order = await placeOrder({ shop, ownerKey: "anon:c", buyerUserId: null, checkout: checkout() });
    let [v] = await db.select().from(productVariants).where(eq(productVariants.id, variantId));
    expect(v.inventoryQty).toBe(0);
    const cancelled = await applyOrderAction({ shopId: shop.id, orderId: order.id, action: "cancel", actorUserId: owner.id, reason: "Buyer asked" });
    expect(cancelled).toMatchObject({ status: "cancelled", paymentStatus: "voided", cancelReason: "Buyer asked" });
    [v] = await db.select().from(productVariants).where(eq(productVariants.id, variantId));
    expect(v.inventoryQty).toBe(2);
    await expectAppError(
      applyOrderAction({ shopId: shop.id, orderId: order.id, action: "confirm", actorUserId: owner.id }),
      "invalid_transition",
    );
    // Cancelling twice must not restock twice.
    await expect(applyOrderAction({ shopId: shop.id, orderId: order.id, action: "cancel", actorUserId: owner.id })).rejects.toBeTruthy();
    [v] = await db.select().from(productVariants).where(eq(productVariants.id, variantId));
    expect(v.inventoryQty).toBe(2);
  });

  it("notifies the seller about new orders", async () => {
    const { owner, shop, variantId } = await shopWithProduct(1);
    await addToCart({ shopId: shop.id, ownerKey: "anon:n", variantId, quantity: 1 });
    const order = await placeOrder({ shop, ownerKey: "anon:n", buyerUserId: null, checkout: checkout() });
    await drainInlineTasks();
    const msg = fake.callsTo("sendMessage").find((c) => c.args[0] === Number(owner.telegramId));
    expect(String(msg?.args[1])).toContain(`New order #${order.number}`);
    expect(String(msg?.args[1])).toContain("Pay on delivery");
  });
});

describe("tenant isolation", () => {
  it("members reach their shop; others get not found; staff can't change settings", async () => {
    const { owner, shop } = await shopWithProduct(1);
    const stranger = await makeUser("Stranger");
    const ok = await authorizeUser({ userId: owner.id, telegramId: "1" }, shop.handle, "shop.settings");
    expect(ok.shop.id).toBe(shop.id);
    await expect(
      authorizeUser({ userId: stranger.id, telegramId: "2" }, shop.handle, "products.manage"),
    ).rejects.toMatchObject({ status: 404 });

    const { shopMembers } = await import("@/server/db/schema");
    const staff = await makeUser("Staff");
    await db.insert(shopMembers).values({ shopId: shop.id, userId: staff.id, role: "staff" });
    await expect(authorizeUser({ userId: staff.id, telegramId: "3" }, shop.handle, "orders.manage")).resolves.toBeTruthy();
    await expect(authorizeUser({ userId: staff.id, telegramId: "3" }, shop.handle, "shop.settings")).rejects.toMatchObject({ status: 403 });
  });

  it("cart refuses another shop's variant", async () => {
    const a = await shopWithProduct(1);
    const b = await shopWithProduct(1);
    await expect(
      addToCart({ shopId: b.shop.id, ownerKey: "anon:t", variantId: a.variantId, quantity: 1 }),
    ).rejects.toMatchObject({ status: 404 });
    const s = (await db.select().from(shops).where(eq(shops.id, a.shop.id)))[0] as Shop;
    expect(s.nextOrderNumber).toBe(1001);
  });
});
