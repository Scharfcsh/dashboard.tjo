import { Badge } from "@/components/ui/Badge";
import { INTENT_META } from "@/lib/live-intelligence/derive";
import type { PricingIntent } from "@/lib/live-intelligence/types";

export function PurchaseIntentBadge({ intent }: { intent: PricingIntent }) {
  const meta = INTENT_META[intent];
  return (
    <Badge tone={meta.tone} size="sm" className={meta.rank >= 2 ? "max-w-full truncate font-semibold" : "max-w-full truncate"}>
      <span title={meta.label}>{meta.short}</span>
    </Badge>
  );
}
