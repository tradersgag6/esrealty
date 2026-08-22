# Admin Create Account

This Edge Function creates accounts through Supabase Auth's supported Admin API.
It replaces the old `admin_create_account` SQL function, which wrote directly to
private `auth` tables and could create users that appeared approved but could not
sign in.

Deploy it from the project root:

```powershell
supabase functions deploy admin-create-account --project-ref YOUR_PROJECT_REF
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically to
deployed Supabase Edge Functions. Never put the service-role key in browser code.

## Existing Broken Accounts

Accounts originally created by the SQL function should be recreated once:

1. In Supabase Dashboard, open **Authentication > Users**.
2. Delete the broken account.
3. In ES Realty, use **Users & Access > Add Account** to create it again.
4. Approve it in the **Pending** tab.
5. Sign in with the temporary password entered during account creation.
