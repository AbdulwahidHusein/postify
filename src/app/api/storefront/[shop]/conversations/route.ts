import { z } from "zod";
import { json, readJson } from "@/server/http";
import { storefrontRoute } from "@/server/storefront-route";
import { requireViewer } from "@/server/request";
import { startConversation } from "@/server/domain/chat";

const body = z.object({
  productId: z.string().uuid().nullable().optional(),
  sourceCode: z.string().regex(/^[A-Za-z0-9]{4,16}$/).nullable().optional(),
});

export const POST = storefrontRoute(async (request, shop) => {
  const user = await requireViewer();
  const input = await readJson(request, body.parse);
  const conv = await startConversation({
    shopId: shop.id,
    productId: input.productId ?? null,
    buyerUserId: user.id,
    sourceCode: input.sourceCode ?? null,
  });
  return json({ conversationId: conv.id });
});
