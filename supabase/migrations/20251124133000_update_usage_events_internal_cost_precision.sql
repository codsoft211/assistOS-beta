-- Expand precision for usage_events.internal_cost to keep provider cost exact
ALTER TABLE public.usage_events
  ALTER COLUMN internal_cost TYPE numeric(15,8)
  USING internal_cost::numeric(15,8);

