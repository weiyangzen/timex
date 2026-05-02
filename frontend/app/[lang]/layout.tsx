import { notFound } from "next/navigation";
import { AppShell } from "../../components/app-shell";
import { I18nProvider } from "../../components/i18n-provider";
import { isLang, type Lang } from "../../lib/i18n";

export default async function LangLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }> | { lang: string };
}>) {
  const resolvedParams = await params;
  if (!isLang(resolvedParams.lang)) notFound();
  const lang = resolvedParams.lang as Lang;

  return (
    <I18nProvider lang={lang}>
      <AppShell>{children}</AppShell>
    </I18nProvider>
  );
}
