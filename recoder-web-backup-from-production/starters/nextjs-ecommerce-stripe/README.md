# Next.js E-commerce with Stripe

A production-ready e-commerce template with Stripe payment integration.

## Features

- ✅ Product catalog with images
- ✅ Shopping cart functionality
- ✅ Stripe checkout integration
- ✅ Order confirmation
- ✅ Responsive design with Tailwind CSS
- ✅ TypeScript for type safety
- ✅ State management with Zustand

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Add your Stripe keys to .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

Create `.env.local`:

```bash
# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Project Structure

```
app/
├── page.tsx           # Product catalog
├── cart/
│   └── page.tsx      # Shopping cart
├── api/
│   ├── checkout/
│   │   └── route.ts  # Create Stripe session
│   └── webhooks/
│       └── route.ts  # Handle Stripe events
components/
├── ProductCard.tsx
├── CartItem.tsx
└── Header.tsx
lib/
├── stripe.ts         # Stripe config
├── products.ts       # Product data
└── store.ts          # Cart state management
```

## Customization

### Add Products

Edit `lib/products.ts`:

```typescript
export const products = [
  {
    id: '1',
    name: 'Your Product',
    price: 2999, // $29.99 in cents
    image: '/products/product.jpg',
    description: 'Product description'
  }
];
```

### Styling

- Built with Tailwind CSS
- Modify `tailwind.config.ts` for theme
- Update colors in `app/globals.css`

## Deployment

### Vercel (Recommended)

```bash
vercel deploy
```

### Environment Variables

Add to Vercel:
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

### Stripe Webhooks

1. Go to Stripe Dashboard → Webhooks
2. Add endpoint: `https://yourdomain.com/api/webhooks`
3. Select events: `checkout.session.completed`
4. Copy webhook secret to environment variables

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Stripe Documentation](https://stripe.com/docs)
- [Tailwind CSS](https://tailwindcss.com)
