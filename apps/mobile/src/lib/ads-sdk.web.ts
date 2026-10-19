// Web: sem anúncios (o AdMob é só para apps). Mesma forma do ads-sdk.ts, sem carregar o SDK.
export function nativeAdUnitId(): string | null {
  return null;
}
export const FEED_AD_REQUEST = {};
export const VIBE_AD_REQUEST = {};
export async function initAds(_: { minor: boolean }): Promise<boolean> {
  return false;
}
