import { syncPermissions } from "../src/auth/permission-sync.ts";

// Sync manual (mis. di CI) tanpa start server. Jalur utama tetap otomatis di
// src/index.ts sebelum app.listen.
syncPermissions()
  .then(() => {
    console.log("permissions synced");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
