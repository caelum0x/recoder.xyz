import { Container } from "@repo/design-system/components/container";

export const Footer = () => (
  <Container className="py-4">
    <p className="text-muted-foreground text-sm">
      Powered by{" "}
      <a
        className="underline"
        href="https://pm.recoder.xyz/"
        rel="noreferrer"
        target="_blank"
      >
        Recoder PM
      </a>
    </p>
  </Container>
);
