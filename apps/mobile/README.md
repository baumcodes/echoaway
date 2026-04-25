# @echoaway/mobile

Expo React Native placeholder. The hackathon demo target is `apps/web`;
this workspace exists so the mobile-first Expo build can later import the
same `@echoaway/ui` components and `@echoaway/app` orchestration logic
without restructuring the repo.

To turn it into a real Expo app:

```bash
cd apps/mobile
npx create-expo-app@latest . --template blank-typescript
# then add @echoaway/ui, @echoaway/app, @echoaway/types via workspace:* refs
```

Until then, `yarn dev:mobile` prints a placeholder message.
