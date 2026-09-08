export type AdminShop = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  settings: {
    defaultCurrency: string;
    autoPublishMinConfidence: number;
    linkMode: "reply" | "bot_owned";
    telegramChannel?: string | null;
    ownerUsername?: string | null;
    ownerPhone?: string | null;
    sellCategories?: string[];
    logoUrl?: string | null;
    logoSource?: "telegram" | "upload" | null;
  };
  createdAt: string;
  updatedAt: string;
};

export type AdminProductImage = {
  id: string;
  telegramFileId: string | null;
  url: string | null;
  alt: string | null;
  sortOrder: number;
  src: string | null;
};

export type AdminProduct = {
  id: string;
  shopId: string;
  channelId?: string | null;
  slug: string;
  title: string;
  description: string | null;
  price: number | null;
  compareAtPrice: number | null;
  currency: string;
  category: string | null;
  sku: string | null;
  stockQuantity: number | null;
  tags: string | null;
  status: "draft" | "published" | "sold" | "archived";
  confidence: number | null;
  rawCaption?: string | null;
  sourceChatId?: string | null;
  sourceMessageId?: number | null;
  telegramUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  images: AdminProductImage[];
};

export type AdminChannel = {
  id: string;
  shopId: string;
  title: string | null;
  username: string | null;
  status: string;
  lastPostAt: string | null;
};

export type ProductCounts = {
  draft: number;
  published: number;
  sold: number;
  archived: number;
  total: number;
};
