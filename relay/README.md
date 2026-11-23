# Orbit relay (optional)

Lets messages reach people whose app is closed. Messages are encrypted on the device; the relay stores only scrambled data and random inbox ids.

## Deploy (free Cloudflare account)
1. `npm i -g wrangler` then `wrangler login`
2. `wrangler kv namespace create KV` and paste the id into `wrangler.toml`
3. `wrangler deploy` -> note the URL (https://orbit-relay.<you>.workers.dev)
4. In Orbit: Settings > Network > Offline message relay, paste the URL. Everyone in a circle uses the same URL.

## iPhone push alerts (needs a paid Apple Developer account)
Create an APNs key (.p8) in the Apple Developer site, then:
```
wrangler secret put APNS_KEY      # paste the .p8 text
wrangler secret put APNS_KEY_ID
wrangler secret put APNS_TEAM_ID
wrangler secret put APNS_TOPIC    # the app's bundle id, app.orbitfamily.chat
```
The app must be signed with the Push Notifications capability (TestFlight/App Store build).
