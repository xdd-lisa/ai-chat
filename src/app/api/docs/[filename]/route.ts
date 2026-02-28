import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";

function docsDir() {
  return join(process.cwd(), "Docs");
}

function safePath(filename: string): string | null {
  const decoded = decodeURIComponent(filename);
  if (
    decoded.includes("..") ||
    decoded.includes("/") ||
    decoded.includes("\\")
  ) {
    return null;
  }
  const name = decoded.endsWith(".md") ? decoded : `${decoded}.md`;
  return join(docsDir(), name);
}

export async function GET(
  _req: Request,
  { params }: { params: { filename: string } },
) {
  const filePath = safePath(params.filename);
  if (!filePath) {
    return NextResponse.json({ error: "非法文件名" }, { status: 400 });
  }

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  const content = readFileSync(filePath, "utf-8");
  return NextResponse.json({ content, filename: params.filename });
}

export async function PUT(
  req: Request,
  { params }: { params: { filename: string } },
) {
  const filePath = safePath(params.filename);
  if (!filePath) {
    return NextResponse.json({ error: "非法文件名" }, { status: 400 });
  }

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  const { content } = await req.json();
  if (typeof content !== "string") {
    return NextResponse.json(
      { error: "content 必须是字符串" },
      { status: 400 },
    );
  }

  writeFileSync(filePath, content, "utf-8");
  return NextResponse.json({ success: true });
}
