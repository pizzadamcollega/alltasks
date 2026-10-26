import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Two jobs only, by design (heavier checks — branch membership, role
 * redirects — belong in `(app)/layout.tsx` where a friendly DB-backed
 * decision can be made; see docs/ARCHITECTURE.md §4):
 *  1. Refresh the Supabase session cookie on every request.
 *  2. Redirect signed-out visitors away from a branch's protected routes to
 *     its login page, and remember the last branch in `pz_branch`.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims verifies the JWT locally against the project's signing keys (and
  // refreshes an expired session) — no Auth round trip on every request, unlike getUser.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims.sub ?? null;

  const { pathname } = request.nextUrl;
  const [branchSlug, second] = pathname.split("/").filter(Boolean);
  const isBranchRoute = Boolean(branchSlug) && branchSlug !== "api";
  const isGiris = second === "giris";

  if (isBranchRoute) {
    response.cookies.set("pz_branch", branchSlug, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  if (isBranchRoute && !isGiris && !user) {
    const url = request.nextUrl.clone();
    url.pathname = `/${branchSlug}/giris`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
