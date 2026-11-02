import { z } from "zod";
import { json, readJson } from "@/server/http";
import { shopRoute } from "@/server/shop-route";
import { discardDraft, draftDesign, publishDraft, publishedDesign, saveDraft } from "@/server/domain/store-design";

export const dynamic = "force-dynamic";

export const GET = shopRoute("shop.settings", async (_req, { shop }) => {
  const { design, hasDraft } = draftDesign(shop);
  return json({ draft: design, hasDraft, published: publishedDesign(shop) });
});

/** Autosave the draft. Buyers keep seeing the published design. */
export const PUT = shopRoute("shop.settings", async (request, { shop }) => {
  const { design } = await readJson(request, z.object({ design: z.unknown() }).parse);
  return json({ draft: await saveDraft(shop, design) });
});

export const POST = shopRoute("shop.settings", async (request, { shop }) => {
  const { action } = await readJson(request, z.object({ action: z.enum(["publish", "discard"]) }).parse);
  const updated = action === "publish" ? await publishDraft(shop) : await discardDraft(shop);
  return json({ ok: true, published: publishedDesign(updated) });
});
