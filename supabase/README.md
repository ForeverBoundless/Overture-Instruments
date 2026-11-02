# Supabase setup for the Overture Community Library

1. Create a Supabase project.
2. Open **SQL Editor** and run the complete migration in `migrations/20261102000000_community_patches.sql`.
3. In **Project Settings → API**, copy the Project URL and the publishable/anon public key. Do not copy a secret or service-role key.
4. Edit `js/shared/supabase-config.js` and set `url` and `anonKey`. The publishable/anon key is intended for browser use; Row Level Security is the security boundary.
5. In **Authentication → URL Configuration**, set the Site URL to your deployed Overture domain and add your Vercel preview/development origins to the allowed Redirect URLs. For example:
   - `https://overture-instruments.vercel.app/**`
   - `https://*.vercel.app/**` only if you are comfortable allowing all Vercel preview origins; otherwise add the exact preview URL.
   - `http://localhost:3000/**` for local testing.
6. In **Authentication → Providers**, enable Email sign-in. Configure SMTP for reliable email delivery before public launch; Supabase's default mail service is rate-limited.
7. Deploy the site. Visit `/community`, request an email sign-in link, and verify that a signed-in user can publish, edit/delete only their own patches, and that a signed-out visitor can discover and download public patches.

The browser only uses the publishable/anon key. Never place a service-role key in a page, JavaScript file, Vercel public variable, or repository. The migration creates RLS policies for public patch reads, owner-only publishing/editing/deletion, and owner-scoped audio uploads. Public audio preview URLs are readable by anyone because the bucket is intentionally public; do not upload private recordings.
