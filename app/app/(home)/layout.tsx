import { OrganizationSchema, WebApplicationSchema, FAQPageSchema } from '@/app/components/StructuredData';

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <OrganizationSchema />
      <WebApplicationSchema />
      <FAQPageSchema />
      {children}
    </>
  );
}
