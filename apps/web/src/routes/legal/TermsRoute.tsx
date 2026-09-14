/**
 * Placeholder Terms of Service. Real legal drafting is explicitly out of
 * scope for the PoC (REQUIREMENTS.md §5.4, §11 A-5) — this stands in so the
 * consent checkbox (FR-006) has something real to link to.
 */
export function TermsRoute() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">
        Conditions d&apos;utilisation / Terms of Service
      </h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Version de test — texte juridique définitif à venir. / Placeholder — final legal text to
        follow.
      </p>
      <section className="mb-6">
        <h2 className="mb-2 text-lg font-medium">Français</h2>
        <p>
          Ce document sera remplacé par les Conditions d&apos;utilisation définitives avant toute
          exploitation commerciale. Pendant cette phase de test (preuve de concept), seules des
          données de test sont utilisées.
        </p>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-medium">English</h2>
        <p>
          This document will be replaced by the final Terms of Service before any commercial use.
          During this test phase (proof of concept), only test data is used.
        </p>
      </section>
    </main>
  );
}
