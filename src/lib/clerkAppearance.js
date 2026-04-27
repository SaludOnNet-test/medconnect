// Brand appearance overrides for Clerk's <SignIn /> / <SignUp /> widgets.
// Clerk renders its own form; we can't fully replicate the kit's input
// styling, but we can re-tint the widget so it sits naturally on Bone with
// Brass primary actions and Inter Tight body text.
//
// Reference: https://clerk.com/docs/customization/overview

export const brandClerkAppearance = {
  variables: {
    // Brand surfaces
    colorBackground: '#FAF6EE',         // bone-100
    colorInputBackground: '#FBF8F2',    // bone-50
    colorPrimary: '#C9A24B',            // brass-500 — primary CTA
    colorText: '#0E1A2B',               // ink-1000
    colorTextSecondary: '#4F5E74',      // ink-500
    colorInputText: '#0E1A2B',
    colorDanger: '#C85A4B',             // coral-500
    colorSuccess: '#7A8C6E',            // sage-500
    colorWarning: '#A4843A',            // brass-600
    colorNeutral: '#0E1A2B',
    fontFamily: 'var(--font-body), Inter Tight, system-ui, -apple-system, sans-serif',
    fontFamilyButtons: 'var(--font-body), Inter Tight, system-ui, sans-serif',
    fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
    borderRadius: '8px',
    spacingUnit: '0.95rem',
  },
  elements: {
    // Strip Clerk's outer card so the widget feels native to our layout.
    card: {
      boxShadow: 'none',
      border: '1px solid rgba(31, 26, 18, 0.10)',
      background: '#FAF6EE',
    },
    // Hide the Clerk header — our AuthLayout renders the brand title.
    header: { display: 'none' },
    // Primary action: Brass with Ink text (our on-accent rule).
    formButtonPrimary: {
      background: '#C9A24B',
      color: '#0E1A2B',
      fontWeight: 600,
      textTransform: 'none',
      '&:hover': { background: '#A4843A' },
      '&:active': { background: '#8A6C2E' },
    },
    formFieldLabel: {
      fontFamily: 'var(--font-body), Inter Tight, sans-serif',
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: '#4F5E74',
    },
    formFieldInput: {
      background: '#FBF8F2',
      border: '1px solid rgba(31, 26, 18, 0.10)',
      color: '#0E1A2B',
      borderRadius: 8,
      '&:focus': {
        borderColor: '#C9A24B',
        boxShadow: '0 0 0 3px rgba(201, 162, 75, 0.35)',
      },
    },
    socialButtonsBlockButton: {
      background: 'transparent',
      border: '1px solid rgba(31, 26, 18, 0.18)',
      color: '#0E1A2B',
      '&:hover': {
        borderColor: '#C9A24B',
        color: '#A4843A',
      },
    },
    footerActionLink: {
      color: '#0E1A2B',
      fontWeight: 600,
      '&:hover': { color: '#A4843A' },
    },
    // Hide Clerk's "Secured by Clerk" branding for a cleaner brand look.
    footer: {
      '& > div:last-child': { display: 'none' },
    },
  },
};
