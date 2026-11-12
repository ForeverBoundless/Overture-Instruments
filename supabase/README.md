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
7. Apply the account migration at `migrations/20261103000000_overture_accounts.sql` after the Community migration. It creates public profile records, an Auth user trigger, and the public avatar bucket with owner-scoped write policies.
8. In **Authentication → Providers**, enable **Email** (password sign-in) and **Google**. For Google, create an OAuth client in Google Cloud, configure the Supabase callback URL shown in the Google provider settings, and enter the Google client ID and secret in Supabase. Add your production domain and local development URL to the allowed redirect URLs.
9. In **Authentication → URL Configuration**, set the Site URL to your deployed Overture domain and add exact preview/development redirect URLs. At minimum allow `https://overture-instruments.vercel.app/account` and `http://localhost:3000/account`. If testing Vercel previews, add the exact preview URL with `/account`; avoid a broad wildcard where possible.
10. Configure custom SMTP for reliable confirmation and password-reset email delivery before public launch; Supabase's default mail service is rate-limited.
11. Deploy the site. Visit `/account`, create an account with email/password or Google, then edit the username, optional name and profile picture. Visit `/community` and verify that the same account can publish, edit/delete only its own patches, and that signed-out visitors can discover and download public patches.

The browser only uses the publishable/anon key. Never place a service-role key in a page, JavaScript file, Vercel public variable, or repository. The migration creates RLS policies for public patch reads, owner-only publishing/editing/deletion, and owner-scoped audio uploads. Public audio preview URLs are readable by anyone because the bucket is intentionally public; do not upload private recordings.


## Supported shared content

The Community exchange supports patch and performance data for every emulator in the Overture instrument library: Little Phatty, Sub 37, Prophet-10, Nord C2D, DX7, Juno-106, TR-808, MS-20, Mellotron M400, Oberheim Eight Voice, Hohner Clavinet D6, OB-Xa, Sequential Pro 3 and UDO Super 8. OMNI patches use OMNI's validated graph schema. Every instrument import is passed through that emulator's own validator before the sound is applied.

Use the **COMMUNITY** control in an emulator to send its current patch or performance directly to the Community publishing form. Users can also upload the instrument's JSON preset export. Multi-layer and multi-voice instruments retain their complete supported patch state; the Prophet-10, Nord C2D, Sub 37 and pattern-based TR-808 use their native instrument-specific data structures.

Public items can be unlisted for direct-link sharing. Public audio preview URLs are intentionally readable by anyone with the item link. The database counter is updated through an RPC; authenticated users do not receive direct write permission to the `downloads` or `updated_at` columns.
