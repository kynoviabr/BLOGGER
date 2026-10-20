import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const pathname = request.nextUrl.pathname;
  const isLoginPage = pathname === '/login';
  const isCronRoute = pathname.startsWith('/api/cron');
  const isAuthCallback = pathname === '/auth/callback';

  // Rotas de Cron validam a autenticação via Bearer CRON_SECRET no próprio endpoint
  if (isCronRoute || isAuthCallback) {
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Se as variáveis essenciais não estiverem definidas, redireciona para login seguro
  if (!supabaseUrl || !supabaseAnonKey) {
    if (!isLoginPage) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Validação segura com o backend do Supabase Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Usuário não autenticado tentando acessar qualquer rota protegida
  if (!user && !isLoginPage) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json(
        { success: false, error: 'Acesso não autorizado. Faça login para continuar.' },
        { status: 401 }
      );
    }
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(redirectUrl);
  }

  // Usuário autenticado acessando /login
  if (user && isLoginPage) {
    const redirectUrl = new URL('/', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static images / assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
