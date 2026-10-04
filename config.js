/* White-label settings. A firm deploying Money Planner changes these values only. */
window.MP_CONFIG = {
  brand: 'Your Bank',            // institution name shown in the header
  product: 'Money Planner',
  logoText: 'MP',                // 1–3 letters in the logo square
  supportText: 'Questions? Contact your bank using the details on its official website or app.',
  autoLockMinutes: 15,           // sign the customer out after this much inactivity
  pbkdf2Iterations: 310000       // OWASP 2023 guidance for PBKDF2-HMAC-SHA256
};
