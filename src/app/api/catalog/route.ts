import { json, route } from "@/server/http";
import { searchCategories } from "@/lib/catalog/categories";
import { suggestBrands, suggestModels } from "@/lib/catalog/resolve";
import { searchRegions } from "@/lib/catalog/regions-data";
import { formFieldsForCategory } from "@/lib/catalog/form-fields";
import { COMMON_CONDITIONS } from "@/lib/catalog/field-options";

export const GET = route(async (request) => {
  const sp = new URL(request.url).searchParams;
  const kind = sp.get("kind");
  const q = sp.get("q") ?? "";
  const category = sp.get("category") ?? "";
  switch (kind) {
    case "categories":
      return json({ items: searchCategories(q, 30) });
    case "brands":
      return json({ items: category ? suggestBrands(category, q).map((h) => h.value) : [] });
    case "models":
      return json({ items: category && sp.get("brand") ? suggestModels(category, sp.get("brand")!, q).map((h) => h.value) : [] });
    case "regions":
      return json({ items: searchRegions(q, 20).map((r) => r.name) });
    case "conditions": {
      const form = category ? formFieldsForCategory(category) : null;
      const field = form?.fields.find((f) => f.name === "Condition");
      return json({ items: [...new Set([...(field?.values ?? []), ...COMMON_CONDITIONS])] });
    }
    default:
      return json({ error: "Unknown kind" }, { status: 400 });
  }
});
