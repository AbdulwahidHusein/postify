import { NextResponse } from "next/server";
import { requireBotToken } from "@/lib/env.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Props = {
  params: Promise<{ fileId: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const { fileId } = await params;
  if (!fileId) {
    return NextResponse.json({ error: "Missing file id" }, { status: 400 });
  }

  try {
    const token = requireBotToken();
    const metaRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
    );
    const meta = (await metaRes.json()) as {
      ok: boolean;
      result?: { file_path?: string };
      description?: string;
    };

    if (!meta.ok || !meta.result?.file_path) {
      return NextResponse.json(
        { error: meta.description ?? "File not found" },
        { status: 404 },
      );
    }

    const fileUrl = `https://api.telegram.org/file/bot${token}/${meta.result.file_path}`;
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok || !fileRes.body) {
      return NextResponse.json(
        { error: "Could not download file" },
        { status: 502 },
      );
    }

    const contentType =
      fileRes.headers.get("content-type") ?? "application/octet-stream";

    return new NextResponse(fileRes.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load media";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
