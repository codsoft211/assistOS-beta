-- Subscription plans catalog for Base / Pro / Ultra / Enterprise
CREATE TABLE IF NOT EXISTS "subscription_plans" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "price_monthly_euros" numeric(10, 2),
  "price_model" text NOT NULL DEFAULT 'fixed',
  "paying_users_included" integer,
  "free_users_included" integer,
  "credits_included" integer,
  "description" text,
  "metadata" jsonb,
  "is_enterprise" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "subscription_plans_fixed_plan_check" CHECK (
    price_model != 'fixed'
    OR (
      price_monthly_euros IS NOT NULL
      AND paying_users_included IS NOT NULL
      AND free_users_included IS NOT NULL
      AND credits_included IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_plans_name_idx" ON "subscription_plans" ("name");

INSERT INTO "subscription_plans"
  ("name", "price_monthly_euros", "price_model", "paying_users_included", "free_users_included", "credits_included", "metadata", "is_enterprise")
VALUES
  ('Base', 19.90, 'fixed', 1, 0, 200, NULL, false),
  ('Pro', 49.90, 'fixed', 1, 2, 500, NULL, false),
  ('Ultra', 89.90, 'fixed', 1, 4, 1000, NULL, false),
  ('Enterprise', NULL, 'quote', NULL, NULL, NULL, '{"notes":"Negotiated pricing and limits"}', true)
ON CONFLICT ("name") DO UPDATE
SET
  "price_monthly_euros" = EXCLUDED."price_monthly_euros",
  "price_model" = EXCLUDED."price_model",
  "paying_users_included" = EXCLUDED."paying_users_included",
  "free_users_included" = EXCLUDED."free_users_included",
  "credits_included" = EXCLUDED."credits_included",
  "metadata" = EXCLUDED."metadata",
  "is_enterprise" = EXCLUDED."is_enterprise",
  "updated_at" = now();

