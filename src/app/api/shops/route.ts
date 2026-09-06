import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { AuthError, requireSession } from "@/lib/auth/session";
import {
  createShop,
  listShopsForOwner,
  serializeShop,
} from "@/lib/shops";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case")
    .optional(),
});

export async function GET() {
  try {
    const session = await requireSession();
    const rows = await listShopsForOwner(session.userId);
    return jsonOk({ shops: rows.map(serializeShop) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = createSchema.parse(await request.json());
    const shop = await createShop({
      ownerUserId: session.userId,
      name: body.name,
      description: body.description,
      slug: body.slug,
    });
    return jsonOk({ shop: serializeShop(shop) }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return jsonError(error);
    return jsonError(error);
  }
}
