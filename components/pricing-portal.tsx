"use client";

/**
 * Compatibility boundary for the public pricing portal.
 *
 * The pricing UI itself lives in PremiumLanding. AuthGate keeps this
 * component mounted so existing imports remain stable without rendering a
 * second pricing section on the landing page.
 */
export function PricingPortal(){
  return null;
}
