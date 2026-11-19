import { type NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const url = new URL(request.url);

  return Response.json({
    userId,
    href: url.href,
    rawQuery: url.search,
    limit: url.searchParams.get("limit"),
    injectedQuery: {
      admin: url.searchParams.get("admin"),
      expand: url.searchParams.getAll("expand[]"),
    },
  });
}
