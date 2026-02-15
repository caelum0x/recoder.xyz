# Kortix Frontend

## Quick Setup

The easiest way to get your frontend configured is to use the setup wizard from the project root:

```bash
cd .. # Navigate to project root if you're in the frontend directory
python setup.py
```

This will configure all necessary environment variables automatically.

## Environment Configuration

The setup wizard automatically creates a `.env.local` file with the following configuration:

```sh
NEXT_PUBLIC_AUTH_PROVIDER_URL=https://recoder.xyz
NEXT_PUBLIC_AUTH_PROVIDER_ANON_KEY=
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000/v1
NEXT_PUBLIC_URL=http://localhost:3000
NEXT_PUBLIC_ENV_MODE=LOCAL
```

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Run the production server:

```bash
npm run start
```

## Development Notes

- The frontend connects to the backend API at `http://localhost:8000/v1`
- Auth provider URL/key should be exposed via `NEXT_PUBLIC_AUTH_PROVIDER_*`
- The app runs on `http://localhost:3000` by default
- Environment variables are automatically configured by the setup wizard
