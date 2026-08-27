/**
 * Kept byte-stable because the deployment CSP authorizes this one inline initializer by hash.
 * `apps/api/tests/vercel-config.test.ts` fails if this text and the deployed hash diverge.
 */
export const VARIANT_LAUNCH_INITIALIZER =
  "window.addEventListener('vlaunch-initialized',function(event){window.__exoraVariantLaunchDetail=event.detail;window.dispatchEvent(new Event('exora:variant-launch-ready'))})";
