Enable debug tooling for fast battle testing — cap each player's party to a small size so battles end in one or two hits.

## Step 1: Check Server is Running

```powershell
Test-NetConnection -ComputerName localhost -Port 8082 -InformationLevel Quiet
```

If not running, tell the user to start it with `start-server.bat` first.

## Step 2: Set Party Limit

Ask the user: "How many units per player? (1 = fastest, default is all units)"

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:8082/debug/party-limit" -ContentType "application/json" -Body '{"limit": 1}'
```

Replace `1` with the user's chosen limit. Pass `{"limit": null}` to remove the cap.

## Step 3: Shrink Test Account Parties in DB (optional)

If the test accounts (user_ids 123456 and 293850) have more units in their party than the new limit, matchmaking power calculations may be off. Run this SQL to trim both parties to 1 unit:

```sql
UPDATE accounts
SET party_ids_json = JSON_ARRAY(JSON_VALUE(party_ids_json, '$[0]'))
WHERE user_id IN (123456, 293850);
```

Run via: `mysql -u root -p bsf -e "<query>"`

## Step 4: Confirm and Remind

Print a summary:
- Party limit: N units
- Takes effect: next battle (not current active battles)

Remind the user: these flags reset to defaults when the server restarts. Re-run `/debug-battle` after `start-server.bat`.

## Turning Off

To restore normal gameplay:
```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:8082/debug/party-limit" -ContentType "application/json" -Body '{"limit": null}'
```
