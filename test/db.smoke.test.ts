import { describe, expect, it } from "vitest";
import { createTestDb } from "./db";
import { users } from "@/server/db/schema";

describe("test database", () => {
  it("applies migrations and round-trips bigint", async () => {
    const db = await createTestDb();
    const [u] = await db.insert(users).values({ telegramId: 9007199254740993n, firstName: "A" }).returning();
    expect(u.telegramId).toBe(9007199254740993n);
    expect(u.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(u.id[14]).toBe("7");
  });
});
