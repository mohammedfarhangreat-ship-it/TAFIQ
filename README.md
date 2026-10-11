# TAFIQ — AI-Powered Quotation Automation

TAFIQ is a business automation platform designed to help businesses create, manage, and download professional quotations efficiently.

## Features

- **Customer Management:** Organize customer information and records.
- **Product Management:** Maintain a structured product catalogue.
- **Quotation Generation:** Create professional quotations with multiple items.
- **Automated Calculations:** Calculate quantities, prices, discounts, taxes, and totals.
- **PDF Export:** Generate downloadable quotation documents.
- **Quotation History:** Store and review previous quotations.
- **Status Tracking:** Track quotations through draft, sent, accepted, and rejected statuses.
- **Secure Authentication:** Protect access to business accounts.
- **Database Integration:** Store records persistently using Supabase.
- **Responsive Dashboard:** Manage quotations through a modern web interface.

## Technology Stack

- Next.js
- TypeScript
- React
- Supabase
- PostgreSQL
- Tailwind CSS

The final technology stack depends on the actual project implementation.

## Getting Started

### Prerequisites

- Node.js
- npm
- A Supabase account
- Git

### Installation

Clone the repository:

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/tafiq.git
cd tafiq
```

Install dependencies:

```bash
npm install
```

Configure your environment variables in `.env.local` using your Supabase project credentials and the variable names required by your application.

Start the development server:

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## Environment Variables

Configure the variables required by your Supabase integration. For example:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Never commit `.env.local`, passwords, API secrets, or service-role keys to GitHub.

## Tafiq Voice Assistant (ChromeOS)

This repository also contains **Tafiq Voice Assistant**, an always-on personal voice assistant for
ChromeOS that opens apps, manages tabs, sets reminders and answers questions. See
[`assistant-extension/README.md`](assistant-extension/README.md) for install steps.

## Project Vision

TAFIQ aims to simplify quotation management, reduce repetitive administrative work, improve accuracy, and help businesses streamline their sales operations.

## Project Status

Under development.

## Contact

For questions, business inquiries, or collaboration opportunities, contact the project maintainer.

**TAFIQ — Simplifying Business Quotations.**
