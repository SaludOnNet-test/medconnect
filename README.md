This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deployment (READ BEFORE PUSHING)

This project deploys EXCLUSIVELY to:

- **Production:** Vercel project `medconnect` under SaludOnNet Team
  - https://medconnect-bay.vercel.app
  - https://medconnect.es (custom domain — DNS pending)
- **Rollback:** Vercel project `prioritamed` under SaludOnNet Team (manual only, emergencies)

PROHIBITED: cuenta `francisco-4148s-projects`, project `rentguard`, any other Vercel account.

Auto-deploy triggers on every push to `main`. See [`docs/DEPLOYMENT_RULES.md`](docs/DEPLOYMENT_RULES.md) for the full process, rollback procedure, and branch protection.

## Slot Generation Rules

The site always invents available appointment slots per clinic, but follows two rules:

- **Clinics with Doctoralia data** (`clinic_schedules` rows): slots only on imported days/hours, ±15 min tolerance
- **Clinics without Doctoralia data**: 4 fallback slots distributed across the next 5 business days (Mon–Fri)

Implementation: [`src/lib/slot-validation.js`](src/lib/slot-validation.js). Full spec: [`docs/SLOT_GENERATION_RULES.md`](docs/SLOT_GENERATION_RULES.md).

## Database

Azure SQL (`saludonai.database.windows.net` / database `saludonai`). Source of truth for the clinic catalog is the SON marketplace Excel — `scripts/import_son_from_excel.py` filters `PublicadoMarketplace = SI` and upserts. Audit with `node scripts/audit_database.js`. See [`docs/CLINICS_AUDIT_REPORT.md`](docs/CLINICS_AUDIT_REPORT.md).

## Local Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
