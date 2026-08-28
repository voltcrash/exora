export const VARIANT_LAUNCH_INITIALIZER =
  "window.addEventListener('vlaunch-initialized',function(event){window.__exoraVariantLaunchDetail=event.detail;window.dispatchEvent(new Event('exora:variant-launch-ready'))})";
