/**
 * Curated commerce taxonomy for Postify sellers.
 * Inspired by Google Product Taxonomy top levels + common marketplace leaves
 * (electronics, apparel, phones, gift cards, etc.) — searchable flat labels.
 */

export type CategoryGroup = {
  group: string;
  categories: string[];
};

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    group: "Electronics",
    categories: [
      "Electronics",
      "Electronics > Audio",
      "Electronics > Audio > Headphones",
      "Electronics > Audio > Speakers",
      "Electronics > Cameras",
      "Electronics > Computers",
      "Electronics > Computers > Laptops",
      "Electronics > Computers > Desktops",
      "Electronics > Computers > Tablets",
      "Electronics > Computers > Computer Components",
      "Electronics > Computers > Monitors",
      "Electronics > Computers > Networking",
      "Electronics > Computers > Storage",
      "Electronics > Gaming Consoles",
      "Electronics > Gaming Accessories",
      "Electronics > Smart Home",
      "Electronics > TVs & Home Theater",
      "Electronics > Wearables",
      "Electronics > Wearables > Smartwatches",
      "Electronics > Power Banks & Chargers",
      "Electronics > Cables & Adapters",
    ],
  },
  {
    group: "Phones & Mobile",
    categories: [
      "Phones & Mobile",
      "Phones & Mobile > Smartphones",
      "Phones & Mobile > Feature Phones",
      "Phones & Mobile > Phone Cases",
      "Phones & Mobile > Screen Protectors",
      "Phones & Mobile > Chargers & Cables",
      "Phones & Mobile > Power Banks",
      "Phones & Mobile > Earphones & Earbuds",
      "Phones & Mobile > Phone Parts",
      "Phones & Mobile > SIM Cards",
      "Phones & Mobile > Smartwatches",
    ],
  },
  {
    group: "Cards & Digital",
    categories: [
      "Cards & Digital",
      "Cards & Digital > Gift Cards",
      "Cards & Digital > Game Cards",
      "Cards & Digital > Steam / Gaming Credits",
      "Cards & Digital > Mobile Top-up",
      "Cards & Digital > Subscription Cards",
      "Cards & Digital > Streaming Gift Cards",
      "Cards & Digital > App Store Credits",
      "Cards & Digital > Softwares & Licenses",
      "Cards & Digital > E-books",
      "Cards & Digital > Digital Accounts",
    ],
  },
  {
    group: "Apparel & Fashion",
    categories: [
      "Apparel & Fashion",
      "Apparel & Fashion > Men's Clothing",
      "Apparel & Fashion > Women's Clothing",
      "Apparel & Fashion > Kids' Clothing",
      "Apparel & Fashion > T-Shirts & Tops",
      "Apparel & Fashion > Hoodies & Sweatshirts",
      "Apparel & Fashion > Jackets & Coats",
      "Apparel & Fashion > Dresses",
      "Apparel & Fashion > Jeans & Pants",
      "Apparel & Fashion > Shorts",
      "Apparel & Fashion > Activewear",
      "Apparel & Fashion > Underwear & Socks",
      "Apparel & Fashion > Traditional Wear",
      "Apparel & Fashion > Uniforms",
    ],
  },
  {
    group: "Shoes & Footwear",
    categories: [
      "Shoes & Footwear",
      "Shoes & Footwear > Sneakers",
      "Shoes & Footwear > Running Shoes",
      "Shoes & Footwear > Casual Shoes",
      "Shoes & Footwear > Formal Shoes",
      "Shoes & Footwear > Boots",
      "Shoes & Footwear > Sandals & Flip-Flops",
      "Shoes & Footwear > Heels",
      "Shoes & Footwear > Kids' Shoes",
      "Shoes & Footwear > Sports Cleats",
      "Shoes & Footwear > Slippers",
    ],
  },
  {
    group: "Bags & Accessories",
    categories: [
      "Bags & Accessories",
      "Bags & Accessories > Backpacks",
      "Bags & Accessories > Handbags",
      "Bags & Accessories > Wallets",
      "Bags & Accessories > Belts",
      "Bags & Accessories > Hats & Caps",
      "Bags & Accessories > Scarves",
      "Bags & Accessories > Sunglasses",
      "Bags & Accessories > Jewelry",
      "Bags & Accessories > Watches",
      "Bags & Accessories > Luggage",
      "Bags & Accessories > Crossbody Bags",
    ],
  },
  {
    group: "Beauty & Personal Care",
    categories: [
      "Beauty & Personal Care",
      "Beauty & Personal Care > Skincare",
      "Beauty & Personal Care > Makeup",
      "Beauty & Personal Care > Hair Care",
      "Beauty & Personal Care > Fragrance",
      "Beauty & Personal Care > Bath & Body",
      "Beauty & Personal Care > Men's Grooming",
      "Beauty & Personal Care > Nail Care",
      "Beauty & Personal Care > Oral Care",
      "Beauty & Personal Care > Tools & Brushes",
    ],
  },
  {
    group: "Health & Wellness",
    categories: [
      "Health & Wellness",
      "Health & Wellness > Vitamins & Supplements",
      "Health & Wellness > Medical Supplies",
      "Health & Wellness > Fitness Equipment",
      "Health & Wellness > Massage & Relaxation",
      "Health & Wellness > First Aid",
    ],
  },
  {
    group: "Home & Living",
    categories: [
      "Home & Living",
      "Home & Living > Furniture",
      "Home & Living > Bedding",
      "Home & Living > Kitchen & Dining",
      "Home & Living > Cookware",
      "Home & Living > Home Decor",
      "Home & Living > Lighting",
      "Home & Living > Storage & Organization",
      "Home & Living > Cleaning Supplies",
      "Home & Living > Bathroom",
      "Home & Living > Curtains & Rugs",
    ],
  },
  {
    group: "Appliances",
    categories: [
      "Appliances",
      "Appliances > Kitchen Appliances",
      "Appliances > Refrigerators",
      "Appliances > Washers & Dryers",
      "Appliances > Vacuums",
      "Appliances > Fans & Air Conditioning",
      "Appliances > Heaters",
      "Appliances > Irons & Steamers",
      "Appliances > Small Appliances",
    ],
  },
  {
    group: "Food & Grocery",
    categories: [
      "Food & Grocery",
      "Food & Grocery > Snacks",
      "Food & Grocery > Beverages",
      "Food & Grocery > Coffee & Tea",
      "Food & Grocery > Spices & Seasoning",
      "Food & Grocery > Packaged Foods",
      "Food & Grocery > Fresh Produce",
      "Food & Grocery > Bakery",
      "Food & Grocery > Honey & Spreads",
      "Food & Grocery > Organic & Specialty",
    ],
  },
  {
    group: "Baby & Kids",
    categories: [
      "Baby & Kids",
      "Baby & Kids > Baby Clothing",
      "Baby & Kids > Diapers & Wipes",
      "Baby & Kids > Strollers & Carriers",
      "Baby & Kids > Feeding",
      "Baby & Kids > Toys",
      "Baby & Kids > Nursery",
      "Baby & Kids > School Supplies",
    ],
  },
  {
    group: "Toys & Games",
    categories: [
      "Toys & Games",
      "Toys & Games > Action Figures",
      "Toys & Games > Board Games",
      "Toys & Games > Building Sets",
      "Toys & Games > Dolls",
      "Toys & Games > Educational Toys",
      "Toys & Games > Outdoor Play",
      "Toys & Games > Puzzles",
      "Toys & Games > Video Games",
    ],
  },
  {
    group: "Sports & Outdoors",
    categories: [
      "Sports & Outdoors",
      "Sports & Outdoors > Football / Soccer",
      "Sports & Outdoors > Basketball",
      "Sports & Outdoors > Fitness & Gym",
      "Sports & Outdoors > Cycling",
      "Sports & Outdoors > Camping & Hiking",
      "Sports & Outdoors > Swimming",
      "Sports & Outdoors > Yoga",
      "Sports & Outdoors > Sports Apparel",
      "Sports & Outdoors > Sports Equipment",
    ],
  },
  {
    group: "Automotive",
    categories: [
      "Automotive",
      "Automotive > Car Accessories",
      "Automotive > Car Electronics",
      "Automotive > Oils & Fluids",
      "Automotive > Parts",
      "Automotive > Motorbike Accessories",
      "Automotive > Tools",
      "Automotive > Tires & Wheels",
    ],
  },
  {
    group: "Office & Stationery",
    categories: [
      "Office & Stationery",
      "Office & Stationery > Notebooks",
      "Office & Stationery > Pens & Writing",
      "Office & Stationery > Printers & Ink",
      "Office & Stationery > Desk Accessories",
      "Office & Stationery > Paper Products",
      "Office & Stationery > Office Electronics",
    ],
  },
  {
    group: "Books & Media",
    categories: [
      "Books & Media",
      "Books & Media > Books",
      "Books & Media > Magazines",
      "Books & Media > Music",
      "Books & Media > Movies",
      "Books & Media > Educational Materials",
    ],
  },
  {
    group: "Pets",
    categories: [
      "Pets",
      "Pets > Dog Supplies",
      "Pets > Cat Supplies",
      "Pets > Pet Food",
      "Pets > Pet Toys",
      "Pets > Aquariums",
      "Pets > Pet Accessories",
    ],
  },
  {
    group: "Tools & Hardware",
    categories: [
      "Tools & Hardware",
      "Tools & Hardware > Hand Tools",
      "Tools & Hardware > Power Tools",
      "Tools & Hardware > Measuring Tools",
      "Tools & Hardware > Safety Gear",
      "Tools & Hardware > Building Materials",
    ],
  },
  {
    group: "Garden & Outdoor",
    categories: [
      "Garden & Outdoor",
      "Garden & Outdoor > Plants & Seeds",
      "Garden & Outdoor > Garden Tools",
      "Garden & Outdoor > Outdoor Furniture",
      "Garden & Outdoor > Grills",
      "Garden & Outdoor > Watering",
    ],
  },
  {
    group: "Art & Crafts",
    categories: [
      "Art & Crafts",
      "Art & Crafts > Art Supplies",
      "Art & Crafts > Sewing",
      "Art & Crafts > Handmade Goods",
      "Art & Crafts > Prints & Posters",
      "Art & Crafts > Framing",
    ],
  },
  {
    group: "Jewelry & Watches",
    categories: [
      "Jewelry & Watches",
      "Jewelry & Watches > Necklaces",
      "Jewelry & Watches > Earrings",
      "Jewelry & Watches > Rings",
      "Jewelry & Watches > Bracelets",
      "Jewelry & Watches > Fashion Watches",
      "Jewelry & Watches > Luxury Watches",
    ],
  },
  {
    group: "Services & Other",
    categories: [
      "Services & Other",
      "Services & Other > Custom Orders",
      "Services & Other > Repair Services",
      "Services & Other > Delivery Only",
      "Services & Other > Bundles & Combos",
      "Services & Other > Uncategorized",
    ],
  },
];

/** Flat list for search / validation. */
export const ALL_CATEGORIES: string[] = CATEGORY_GROUPS.flatMap(
  (g) => g.categories,
);

export function searchCategories(query: string, limit = 40): string[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return ALL_CATEGORIES.slice(0, limit);
  }
  const scored = ALL_CATEGORIES.map((label) => {
    const lower = label.toLowerCase();
    let score = 0;
    if (lower === q) score = 100;
    else if (lower.startsWith(q)) score = 80;
    else if (lower.includes(`> ${q}`)) score = 70;
    else if (lower.includes(q)) score = 50;
    else {
      const tokens = q.split(/\s+/).filter(Boolean);
      if (tokens.every((t) => lower.includes(t))) score = 40;
    }
    return { label, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

  return scored.slice(0, limit).map((x) => x.label);
}

export function categoryGroupOf(label: string): string | null {
  for (const group of CATEGORY_GROUPS) {
    if (group.categories.includes(label)) return group.group;
  }
  return null;
}
