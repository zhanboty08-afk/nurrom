# Security before launch

## Values shipped to the browser

The storefront is a static client, so every value in `supabase.js` is public. The `sb_publishable_` key is intended for browser apps and is safe only with the database policies in the SQL setup files. Never put an `sb_secret_` or `service_role` key, account password, or private email into this repository.

`WHATSAPP_ORDER_NUMBER` is configured as the store's public contact. It is necessarily visible in the page source and in the WhatsApp link. Use only a number intended for customers; this value is not a secret.

`supabase-grant-admin.sql` contains the placeholder `admin@example.com`. Replace it with the exact Supabase Auth account email only when running the statement in the Supabase SQL Editor. Keep the real address out of the repository.

## Supabase project setup

1. Run `supabase-admin-setup.sql` and `supabase-setup.sql` in the intended Supabase project. They replace policies on the shop's `products` and `orders` tables, restrict order reads to admins, and constrain product image uploads.
2. Create one administrator account, replace the placeholder email in `supabase-grant-admin.sql` locally or in the SQL Editor, and grant that account the admin role. Disable public sign-ups after the account is ready.
3. Protect the Supabase account with MFA and review the project's Security Advisor. Confirm that every exposed table has RLS enabled and that no secret/service-role key is present in client files.
4. Configure the production Site URL and exact admin redirect URL in Supabase Auth.

## Remaining abuse risk

Anonymous visitors must be able to submit orders, so `create_order` is intentionally callable with the publishable key. The function validates and caps submitted data, but this alone cannot stop automated order spam. Before accepting real customer orders, place a CAPTCHA check and rate limit in a server-side Edge Function, then remove anonymous execute permission from the database function. Do not try to hide a secret in the browser to solve this.

The admin UI is public to load, but its data and write access must remain protected by the database RLS policies. A hidden page or client-side login check is not a security boundary.

`server.py` is a separate, unused SQLite demo backend; the current storefront talks to Supabase. GitHub Pages will not run that Python file. Do not expose it through a public server without a separate production security review.
