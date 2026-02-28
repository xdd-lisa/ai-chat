import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";

export async function GET() {
  const docsDir = join(process.cwd(), "Docs");

  if (!existsSync(docsDir)) {
    return NextResponse.json({ files: [] });
  }

  const files = readdirSync(docsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const stat = statSync(join(docsDir, f));
      return {
        name: f,
        displayName: f.replace(/\.md$/, ""),
        updatedAt: stat.mtime.toISOString(),
      };
    })
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  return NextResponse.json({ files });
}
