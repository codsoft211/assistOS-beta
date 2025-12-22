-- Adds fractional cost accumulator so partial provider charges roll over
ALTER TABLE public.tenant_credits
  ADD COLUMN pending_cost_usd numeric(15,8) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.tenant_credits.pending_cost_usd IS
  'Stores fractional internal cost left over after the last credit deduction';

-- Keep default 0 to ensure future inserts initialize the column
ALTER TABLE public.tenant_credits
  ALTER COLUMN pending_cost_usd SET DEFAULT 0;

