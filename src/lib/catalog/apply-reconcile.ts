import "server-only";

import { reconcileListing, type ReconcileResult } from "@/lib/catalog/resolve";

type ListingFields = {
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  condition?: string | null;
};

/** Apply catalog reconcile to free-text listing fields (AI or admin). */
export function reconcileProductFields(
  fields: ListingFields,
  preferredCategories?: string[],
): ReconcileResult {
  return reconcileListing({
    category: fields.category,
    brand: fields.brand,
    model: fields.model,
    condition: fields.condition,
    preferredCategories,
  });
}
