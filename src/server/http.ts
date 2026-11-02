import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/server/auth/session";
import { log } from "@/server/log";

/** An expected failure with a user-safe message. */
export class AppError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "bad_request") {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export const notFound = (what = "Not found") => new AppError(what, 404, "not_found");
export const forbidden = (what = "You don't have access to this") =>
  new AppError(what, 403, "forbidden");

/** JSON.stringify that turns bigint into strings (money stays exact). */
export function toJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

export function json(data: unknown, init?: ResponseInit) {
  return new NextResponse(toJson(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init?.headers ?? {}) },
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof AuthError) {
    return json({ error: error.message, code: "unauthorized" }, { status: error.status });
  }
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const where = issue?.path?.length ? `${issue.path.join(".")}: ` : "";
    return json(
      { error: `${where}${issue?.message ?? "Invalid request"}`, code: "invalid" },
      { status: 400 },
    );
  }
  if (error instanceof SyntaxError) {
    return json({ error: "Malformed JSON body", code: "invalid" }, { status: 400 });
  }
  log.error("unhandled route error", { err: error });
  return json({ error: "Something went wrong. Please try again.", code: "internal" }, { status: 500 });
}

type Handler<C> = (request: Request, ctx: C) => Promise<Response>;

/** Wrap a route handler: consistent errors, origin check on writes. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (request, ctx) => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertSameOrigin(request);
      return await handler(request, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/**
 * CSRF defence for cookie-authenticated writes: browsers always send Origin on
 * cross-site POSTs, so reject a write whose Origin host differs from Host.
 * Requests without Origin (server-to-server, curl) are allowed; they carry no
 * ambient browser cookies an attacker could ride.
 */
function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    if (host && new URL(origin).host !== host) {
      throw new AppError("Cross-site request blocked", 403, "csrf");
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("Invalid origin", 403, "csrf");
  }
}

export async function readJson<T>(request: Request, parse: (v: unknown) => T): Promise<T> {
  const text = await request.text();
  const body: unknown = text ? JSON.parse(text) : {};
  return parse(body);
}
