// ---------------------------------------------------------------------------
// Experiment statistics. Pure functions, no database - so the numbers on the
// dashboard can be unit-tested against known values.
//
// Confidence is a two-proportion z-test (two-tailed): "how sure are we that
// these two conversion rates differ at all". It is NOT a claim that the winner
// is the variant; with small samples it stays low on purpose.
// ---------------------------------------------------------------------------

export interface VariantCounts {
  users: number;
  converted: number;
}

/** Abramowitz & Stegun 7.1.26 - max error 1.5e-7, far below anything we display. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z);
  return sign * y;
}

/** P(Z <= z) for the standard normal distribution. */
export const normalCdf = (z: number): number => 0.5 * (1 + erf(z / Math.SQRT2));

export const conversionRate = (c: VariantCounts): number | null => (c.users === 0 ? null : (c.converted / c.users) * 100);

/**
 * Relative lift of `variant` over `control`, in percent. Null when the control
 * has no users or never converted - dividing by a zero baseline would report an
 * infinite lift from a single conversion.
 */
export function relativeLift(control: VariantCounts, variant: VariantCounts): number | null {
  if (control.users === 0 || variant.users === 0 || control.converted === 0) return null;
  const a = control.converted / control.users;
  const b = variant.converted / variant.users;
  return Math.round(((b - a) / a) * 1000) / 10;
}

/**
 * Two-tailed confidence that the two conversion rates differ, in percent.
 * Null when either arm is empty or the pooled rate is degenerate (0% or 100%
 * everywhere), where the test is undefined.
 */
export function confidence(control: VariantCounts, variant: VariantCounts): number | null {
  if (control.users === 0 || variant.users === 0) return null;
  const pooled = (control.converted + variant.converted) / (control.users + variant.users);
  if (pooled <= 0 || pooled >= 1) return null;
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / control.users + 1 / variant.users));
  if (se === 0) return null;
  const z = (variant.converted / variant.users - control.converted / control.users) / se;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return Math.round((1 - p) * 1000) / 10;
}
