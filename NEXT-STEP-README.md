# VR GAMERzzz Ticket Bot — Next Files

These files add interview decisions, optional Staff-role assignment, ticket close permissions, and HTML transcript delivery to the configured logs channel.

## Apply
1. Replace `handlers.js` and `db.js` in your project with the versions in this ZIP.
2. In `index.js`, ensure the `application:decision:` route is checked before the general `application:` route. The included index.js already does this.
3. Ensure the project dependencies are installed with `npm install`.
4. Run the SQL in `supabase.sql` in your Supabase SQL Editor if you have not already done so.

## Environment
Set `DISCORD_TOKEN`, `SUPABASE_URL`, and `SUPABASE_KEY` in Render. Set `AUTO_GIVE_STAFF_ROLE=true` only if you want the bot to assign the Staff role after acceptance; otherwise omit it or set it to `false`.

## Discord permissions
The bot needs Manage Channels, View Channel, Send Messages, Read Message History, Attach Files, and (for automatic role assignment) Manage Roles. Its role must be above the Staff role. Make sure it can access the ticket category, queue, and logs channels.

Note: test with a private test server first. Transcript generation currently captures message text and a placeholder for embeds/attachments; it does not archive attachment files or fully render embed contents.
