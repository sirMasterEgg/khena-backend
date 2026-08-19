ALTER TABLE "auth_accounts" ADD COLUMN "issuer" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_accounts_issuer_accountId_uidx" ON "auth_accounts" USING btree ("issuer","account_id");